/**
 * @module QDR
 */
var QDR = (function(QDR) {

  QDR.SERVER = 'Server Messages';

  // The QDR service handles the connection to
  // the server in the background
  QDR.module.factory("QDRService", function(jolokia, $rootScope, $http, $resource) {
    var self = {

      connectActions: [],
      disconnectActions: [],

      addConnectAction: function(action) {
        if (angular.isFunction(action)) {
          self.connectActions.push(action);
        }
      },
      addDisconnectAction: function(action) {
        if (angular.isFunction(action)) {
          self.disconnectActions.push(action);
        }
      },

      executeConnectActions: function() {
        self.connectActions.forEach(function(action) {
          QDR.log.debug("executing connect action " + action);
          action.apply();
        });
        self.connectActions = [];
      },
      executeDisconnectActions: function() {
        self.disconnectActions.forEach(function(action) {
          action.apply();
        });
        self.disconnectActions = [];
      },

      channels: {
        'Server Messages': {
          messages: []
        }
      },
      /**
       * @property options
       * Holds a reference to the connection options when
       * a connection is started
       */
      options: undefined,
      /**
       * @property handle
       * Stores the jolokia handle after we've connected for
       * fetching updates from the backend
       */
      handle: undefined,


      /*
       * @property message
       * The proton message that is used to send commands
       * and receive responses
       */
      message: undefined,
      messenger: undefined,
      address: undefined,

      replyTo: undefined,
      subscription: undefined,
      subscribed: false,
      tracker: null,
      qdrSchema: null,

      isConnected: function() {
        return self.subscribed;
        //return self.handle !== undefined

      },
      onSubscription: function() {
        QDR.log.debug("We are subscribed!");
        self.subscribed = true;
        Core.$apply($rootScope);
        self.executeConnectActions();
     },

      pumpData: function() {
        if (self.tracker) {
          QDR.log.debug("status " + messenger.status(tracker));
        }
        if (!self.subscribed) {
          var subscriptionAddress = self.subscription.getAddress();
          if (subscriptionAddress) {
            var splitAddress = subscriptionAddress.split('/');
            self.replyTo = splitAddress[splitAddress.length - 1];
            QDR.log.debug("replyTo is " + self.replyTo);
            self.onSubscription();
          }
        }

        while (self.messenger.incoming()) {
          // The second parameter forces Binary payloads to be decoded as strings
          // this is useful because the broker QMF Agent encodes strings as AMQP
          // binary, which is a right pain from an interoperability perspective.
          var t = self.messenger.get(self.message, true);
          QDR.log.debug("message received. tracker handle is " + t);
          //  self.correlator.resolve();
          self.messenger.accept(t);
          self.messenger.settle(t);
        }

        if (self.messenger.isStopped()) {
          message.free();
          messenger.free();
          console.log("messenger stopped");
        }

      },
      initProton: function() {
        QDR.log.debug("*************QDR init proton called ************");
        self.message = new proton.Message();
        self.messenger = new proton.Messenger();
        self.messenger.on('error', function(error) {
          console.log(error);
          self.executeDisconnectActions();
        });
        self.messenger.on('work', self.pumpData);
        self.messenger.setOutgoingWindow(1024);
        self.messenger.start();
      },
      cleanUp: function() {
        if (self.subscribed === true) {
          self.messenger.stop();
          self.subscribed = false;
          QDR.log.debug("*************QDR closed ************");
        }
      },
      error: function(line) {
        if (line.num) {
          QDR.log.debug("error - num: ", line.num, " message: ", line.message);
        } else {
          QDR.log.debug("error - message: ", line.message);
        }
      },
      notice: function(line) {
        QDR.log.debug("notice, target: ", line.target, " user: ", line.user, " message: ", line.message);
        if (line.target === "*") {
          angular.forEach(self.channels, function(value, key) {
            QDR.log.debug("Pushing message to channel: ", key);
            value.messages.push(line);
          });
        } else {
          if (! (line.target in self.channels) ) {
            self.channels[line.target] = {
              messages: [line]
            }
          } else {
            self.channels[line.target].messages.push(line);
          }
        }

      },
      part: function(line) {
        QDR.log.debug("part - chan: ", line.chan, " user: ", line.user, " message: ", line.message);
        var channel = self.channels[line.chan];
        if (channel) {
          channel.messages.push(line);
          if (channel.names) {
            channel.names.remove(function(nick) {
              if (nick.startsWith("@") || nick.startsWith("+")) {
                var trimmed = nick.last(nick.length - 1);
                return trimmed === line.user.nick;
              } else {
                return nick === line.user.nick;
              }
            });
          }
        } else {
          self.channels[QDR.SERVER].messages.push(line);
        }
      },
      invite: function(line) {
        QDR.log.debug("invie - chan: ", line.chan, " user: ", line.user, " passiveNick: ", line.passiveNick);
      },
      join: function(line) {
        QDR.log.debug("join - chan: ", line.chan, " user: ", line.user);
        var channel = self.channels[line.chan];
        if (channel) {
          channel.messages.push(line);
          if (!channel.names) {
            channel.names = [line.user.nick];
          } else {
            channel.names = channel.names.union([line.user.nick]);
          }
        }
      },
      kick: function(line) {
        QDR.log.debug("kick - chan: ", line.chan, " user: ", line.user, " passiveNick: ", line.passiveNick, " message: ", line.message);
      },
      mode: function(line) {
        if (line.modeParser) {
          QDR.log.debug("mode - chan: ", line.chan, " user: ", line.user, " modeParser: ", line.modeParser);
        } else {
          QDR.log.debug("mode - chan: ", line.chan, " user: ", line.user, " mode: ", line.mode);
        }
      },
      nick: function(line) {
        QDR.log.debug("nick - user: ", line.user, " newNick: ", line.newNick);
      },
      privmsg: function(line) {
        QDR.log.debug("privmsg - target: ", line.target, " user: ", line.user, " message: ", line.message);
        var channel = undefined;

        if (line.target.startsWith("#") || line.fromSelf) {
          if (!(line.target in self.channels)) {
            self.channels[target] = {
              messages: []
            }
          }
          channel = self.channels[line.target];
        } else {
          if (!(line.user.nick in self.channels)) {
            self.channels[line.user.nick] = {
              messages: []
            }
          }
          channel = self.channels[line.user.nick];
        }
        channel.messages.push(line);
      },
      quit: function(line) {
        QDR.log.debug("quit - user: ", line.user, " message: ", line.message);
      },
      reply: function(line) {
        QDR.log.debug("reply, num: ", line.num, " value: ", line.value, " message: ", line.message);
        line.value = line.value.replace(self.options.nickname, "").trim();
        self.channels[QDR.SERVER].messages.push(line);
        switch (line.num) {
          case 332:
            self.topic({
              chan: line.value,
              user: undefined,
              topic: line.message
            });
            break;
          case 331:
            self.topic({
              chan: line.value,
              user: undefined,
              topic: ''
            });
            break;
          case 353:
            var channel = line.value.last(line.value.length - 1).trim();
            var names = line.message.split(' ');
            Core.pathSet(self.channels, [channel, 'names'], names);
            break;
          default:
            break;
        }
      },
      topic: function(line) {
        QDR.log.debug("topic - chan: ", line.chan, " user: ", line.user, " topic: ", line.topic);
        Core.pathSet(self.channels, [line.chan, 'topic'], {
          topic: line.topic,
          setBy: line.user
        });
      },
      unknown: function(line) {
        QDR.log.debug("unknown - prefix: ", line.prefix, " command: ", line.command, " middle: ", line.middle, " trailing: ", line.trailing);
      },

      partChannel: function (channel, onPart) {
        var trimmed = channel.trim();

        if (!trimmed.startsWith("#")) {
          // private chat
          delete self.channels[trimmed];
          if (onPart && angular.isFunction(onPart)) {
            onPart.apply();
          }
          return;
        }
        jolokia.request({
          type: 'exec',
          mbean: QDR.mbean,
          operation: "part(java.lang.String)",
          arguments: [trimmed]
        }, {
          method: 'POST',
          success: function (response) {
            QDR.log.debug("Parted channel: ", trimmed);
            delete self.channels[trimmed];
            if (onPart && angular.isFunction(onPart)) {
              onPart.apply();
            }
            Core.$apply($rootScope);
          },
          error: function (response) {
            log.info('Failed to part channel ', trimmed, ' error: ', response.error);
            Core.$apply($rootScope);
          }
        });

      },

      joinChannel: function (channel, onJoin) {
        var trimmed = channel.trim();

        if (!trimmed.startsWith("#")) {
          // this is a private chat
          if (trimmed.startsWith("@") || trimmed.startsWith("+")) {
            trimmed = trimmed.last(trimmed.length - 1);
          }
          Core.pathSet(self.channels, [trimmed, 'messages'], []);
          if (onJoin && angular.isFunction(onJoin)) {
            onJoin.apply();
          }
          return;
        }
        jolokia.request({
          type: 'exec',
          mbean: QDR.mbean,
          operation: "join(java.lang.String)",
          arguments: [trimmed]
        }, {
          method: 'POST',
          success: function (response) {
            QDR.log.debug("Joined channel: ", trimmed);
            Core.pathSet(self.channels, [trimmed, 'messages'], []);
            if (onJoin && angular.isFunction(onJoin)) {
              onJoin.apply();
            }
            Core.$apply($rootScope);
          },
          error: function (response) {
            log.info('Failed to join channel ', trimmed, ' error: ', response.error);
            Core.$apply($rootScope);
          }
        });

      },
      registered: function(line) {
        QDR.log.debug("Connected to QDR server");
        QDR.log.debug("Channel configuration: ", self.options.channels)
        if ( self.options.channels) {
          var channels = self.options.channels.split(' ');
          channels.forEach(function(channel) {
            self.joinChannel(channel);
          });
        }
        self.executeConnectActions();
      },
      disconnected: function(line) {
        QDR.log.debug("Disconnected from QDR server");
        jolokia.unregister(self.handle);
        self.handle = undefined;
        self.executeDisconnectActions();
      },

      ping: function(line) {

      },

      dispatch: function(response) {
        if (response.value && response.value.length > 0) {
          response.value.forEach(function(line) {
            line['timestamp'] = Date.now();
            if (!line['type']) {
              line['type'] = 'unknown';
            }
            QDR.log.debug("Calling handler: ", line['type']);
            self[line['type']](line);
          });
          Core.$apply($rootScope);
        }
      },

      disconnect: function() {
        jolokia.request({
          type: 'exec',
          mbean: QDR.mbean,
          operation: 'disconnect',
          arguments: []
        }, {
          method: 'POST',
          success: function(response) {
            QDR.log.debug("disconnected from QDR server");
            Core.$apply($rootScope);
          },
          error: function(response) {
            QDR.log.info("Error disconnecting: ", response.error);
            QDR.log.debug("stack trace: ", response.stacktrace);
            Core.$apply($rootScope);
          }
        });
      },

      connect: function(options) {
        self.options = options;
        QDR.log.debug("Subscribing to router: ", options.address);
        //self.messenger.subscribeTo('amqp://' + options.address + ':5673/$management');
        self.subscription = self.messenger.subscribe('amqp://' + options.address + ':5673/$management');
        //Core.$apply($rootScope);

        // wait for response messages to come in
        self.messenger.recv(); // Receive as many messages as messenger can buffer.
      }
    }
      return self;
  });

  return QDR;
}(QDR || {}));
