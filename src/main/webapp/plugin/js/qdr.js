/**
 * @module QDR
 */
var QDR = (function(QDR) {

  /**
   * @method MainController
   * @param $scope
   * @param QDRService
   *
   * Controller for the main interface
   */
  QDR.MainController = function($element, $scope, QDRService, localStorage, jolokia, $location, $rootScope) {

    $scope.showNewChannelDialog = new UI.Dialog();

    $scope.newMessage = '';

    $scope.selectedChannel = localStorage['QDRSelectedChannel'];

    $scope.channels = QDRService.channels;

    $scope.entity = {};

    if (!$scope.selectedChannel || !($scope.selectedChannel in $scope.channels)) {
      $scope.selectedChannel = QDR.SERVER;
    }

    $scope.selectedChannelObject = $scope.channels[$scope.selectedChannel];

    $scope.showChannelPrompt = function() {
      $scope.showNewChannelDialog.open();
    };

    $scope.newChannel = function(target) {
        QDRService.getNodeInfo();
    };

    $scope.partChannel = function(target) {
      QDRService.partChannel(target, function() {
        if ($scope.selectedChannel === target) {
          $scope.selectedChannel = QDR.SERVER;
        }
      });
    };

    $scope.openQuery = function(target) {
      QDRService.joinChannel(target, function() {
        $scope.selectedChannel = target;
      });
    };

    $scope.sortNick = function(nick) {
      //QDR.log.debug("nick: ", nick);
      if (nick.startsWith("@")) {
        return "1 - " + nick;
      } else if (nick.startsWith("+")) {
        return "2 - " + nick;
      } else {
        return "3 - " + nick;
      }
    };
    
    $scope.showTopology = function() {
    	alert("show topology requested");
    	
    };

    $scope.disconnect = function() {
      QDRService.addDisconnectAction(function() {
        if ($location.path().startsWith("/irc/topology")) {
          $location.path("/irc/connect");
          Core.$apply($scope);
        }
      });
      QDRService.disconnect();
    };

    $scope.getNames = function() {
      if (!$scope.selectedChannelObject || !$scope.selectedChannelObject.names) {
        return [];
      }
      var answer = $scope.selectedChannelObject.names.map(function(name) {
        if (name.startsWith("@") || name.startsWith("+")) {
          return name.last(name.length - 1);
        }
        return name;
      });
      return answer;
    };

    $scope.hasTopic = function() {
      if (!$scope.selectedChannelObject) {
        return "";
      }
      if (!$scope.selectedChannelObject.topic || Core.isBlank($scope.selectedChannelObject.topic.topic)) {
        return "no-topic";
      }
      return "";
    };

    $scope.sortChannel = function(channel) {
      //QDR.log.debug("channel: ", channel);
      if (channel === QDR.SERVER) {
        return "1 - " + channel;
      }
      if (channel.startsWith("#")) {
        return "2 - " + channel;
      }
      return "3 - " + channel;
    };

    $scope.selectChannel = function(channel) {
      $scope.selectedChannel =  channel;
    };

    $scope.isSelectedChannel = function(channel) {
      if (channel === $scope.selectedChannel) {
        return "selected-channel";
      }
      return "";
    };

    $scope.sendMessage = function() {
      if (Core.isBlank($scope.newMessage)) {
        return;
      }

      var target = $scope.selectedChannel;
      if (target.startsWith("@") || target.startsWith("+")) {
        target = target.last(target.length - 1);
      }
      jolokia.request({
        type: 'exec',
        mbean: QDR.mbean,
        operation: 'message',
        arguments: [target, $scope.newMessage]
      }, {
        method: 'POST',
        success: function(response) {
          QDRService.privmsg({
            timestamp: Date.now(),
            'type': 'privmsg',
            target: target,
            fromSelf: true,
            user: {
              nick: QDRService.options.nickname
            },
            message: $scope.newMessage
          });
          $scope.newMessage = '';
          Core.$apply($scope);
        },
        error: function(response) {
          QDR.log.warn("Failed to send message: ", response.error);
          QDR.log.info("Stack trace: ", response.stacktrace);
          Core.$apply($scope);
        }

      })

    };

    $rootScope.$on("$destroy", function() {
      QDRService.cleanUp();
    });

    $scope.$watch('selectedChannel', function(newValue, oldValue) {
      if (newValue !== oldValue) {
        localStorage['QDRSelectedChannel'] = $scope.selectedChannel;
        $scope.selectedChannelObject = $scope.channels[$scope.selectedChannel];
        $element.find('.entry-widget').focus();
      }
    })

  };

  return QDR;

} (QDR || {}));
