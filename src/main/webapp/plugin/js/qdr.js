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
      if (!Core.isBlank(target)) {
        $scope.showNewChannelDialog.close();
        QDRService.joinChannel(target, function() {
          $scope.selectedChannel = target;
        });
      }
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

    $scope.disconnect = function() {
      QDRService.addDisconnectAction(function() {
        if ($location.path().startsWith("/irc/main")) {
          $location.path("/irc/settings");
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

    $scope.schema = {
      "description":  "Schema for the Qpid Dispatch Router management model. See qdrouter.txt.",

          "prefix": "org.apache.qpid.dispatch",

          "annotations": {

        "addrPort": {
          "description": "Attributes for internet address and port.",
              "attributes": {
            "addr": {
              "description":"Host address: ipv4 or ipv6 literal or a host name.",
                  "type": "String",
                  "default": "0.0.0.0"
            },
            "port": {
              "description":"Port number or symbolic service name.",
                  "type": "String",
                  "default": "amqp"
            }
          }
        },

        "saslMechanisms": {
          "description": "Attribute for a list of SASL mechanisms.",
              "attributes": {
            "saslMechanisms": {
              "type": "String",
                  "required": true,
                  "description": "Comma separated list of accepted SASL authentication mechanisms."
            }
          }
        },

        "connectionRole": {
          "description": "Attribute for the role of a connection.",
              "attributes": {
            "role": {
              "type": [
                "normal",
                "inter-router",
                "on-demand"
              ],
                  "default": "normal",
                  "description": "The role of an established connection. In the normal role, the connection is assumed to be used for AMQP clients that are doing normal message delivery over the connection.  In the inter-router role, the connection is assumed to be to another router in the network.  Inter-router discovery and routing protocols can only be used over interRouter connections."
            }
          }
        },

        "sslProfile": {
          "description":"Attributes for setting TLS/SSL configuration for connections.",
              "attributes": {
            "certDb": {
              "type": "String",
                  "description": "The path to the database that contains the public certificates of trusted certificate authorities (CAs)."
            },
            "certFile": {
              "type": "String",
                  "description": "The path to the file containing the PEM-formatted public certificate to be used on the local end of any connections using this profile."
            },
            "keyFile": {
              "type": "String",
                  "description": "The path to the file containing the PEM-formatted private key for the above certificate."
            },
            "passwordFile": {
              "type": "String",
                  "description": "If the above private key is password protected, this is the path to a file containing the password that unlocks the certificate key."
            },
            "password": {
              "type": "String",
                  "description": "An alternative to storing the password in a file referenced by passwordFile is to supply the password right here in the configuration file.  This option can be used by supplying the password in the 'password' option.  Don't use both password and passwordFile in the same profile."
            }
          }
        }
      },

      "entityTypes": {

        "entity": {
          "description": "Base entity type for all entities.",
              "attributes": {
            "name": {
              "type": "String",
                  "required": true,
                  "unique": true,
                  "default": "$identity",
                  "description": "Unique name, can be changed."
            },
            "identity": {
              "type": "String",
                  "required": true,
                  "unique": true,
                  "default": "$name",
                  "description": "Unique identity, will not change."
            },
            "type": {
              "type": "String",
                  "required": true,
                  "value": "$$entityType",
                  "description": "Management entity type."
            }
          }
        },

        "configurationEntity": {
          "description": "Base type for entities containing configuration information.",
              "extends": "entity",
              "attributes": {}
        },

        "operationalEntity": {
          "description": "Base type for entities containing current operational information.",
              "extends": "entity",
              "operations": ["READ"],
              "attributes": {}
        },

        "container": {
          "description":"Attributes related to the AMQP container.",
              "extends": "configurationEntity",
              "operations": ["CREATE", "READ"],
              "singleton": true,
              "attributes": {
            "containerName": {
              "type": "String",
                  "description": "The  name of the AMQP container.  If not specified, the container name will be set to a value of the container's choosing.  The automatically assigned container name is not guaranteed to be persistent across restarts of the container."
            },
            "workerThreads": {
              "type": "Integer",
                  "default": 1,
                  "description": "The number of threads that will be created to process message traffic and other application work (timers, non-amqp file descriptors, etc.) ."
            }
          }
        },

        "router": {
          "description":"Tracks peer routers and computes routes to destinations.",
              "extends": "configurationEntity",
              "operations": ["CREATE", "READ"],
              "singleton": true,
              "attributes": {
            "routerId": {
              "description":"Router's unique identity.",
                  "type": "String"
            },
            "mode": {
              "type": [
                "standalone",
                "interior",
                "edge",
                "endpoint"
              ],
                  "default": "standalone",
                  "description": "In standalone mode, the router operates as a single component.  It does not participate in the routing protocol and therefore will not coorperate with other routers. In interior mode, the router operates in cooreration with other interior routers in an interconnected network.  In edge mode, the router operates with an uplink into an interior router network. Edge routers are typically used as connection concentrators or as security firewalls for access into the interior network."
            },
            "area": {
              "type": "String",
                  "description": "Unused placeholder."
            },
            "helloInterval": {
              "type": "Integer",
                  "default": 1,
                  "description": "Interval in seconds between HELLO messages sent to neighbor routers."
            },
            "helloMaxAge": {
              "type": "Integer",
                  "default": 3,
                  "description": "Time in seconds after which a neighbor is declared lost if no HELLO is received."
            },
            "raInterval": {
              "type": "Integer",
                  "default": 30,
                  "description": "Interval in seconds between Router-Advertisements sent to all routers."
            },
            "remoteLsMaxAge": {
              "type": "Integer",
                  "default": 60,
                  "description": "Time in seconds after which link state is declared stale if no RA is received."
            },
            "mobileAddrMaxAge": {
              "type": "Integer",
                  "default": 60,
                  "description": "Time in seconds after which mobile addresses are declared stale if no RA is received."
            },
            "addrCount": {"type": "Integer", "description":"Number of addresses known to the router."},
            "linkCount": {"type": "Integer", "description":"Number of links attached to the router node."},
            "nodeCount": {"type": "Integer", "description":"Number of known peer router nodes."}
          }
        },

        "listener": {
          "description": "Listens for incoming connections to the router.",
              "extends": "configurationEntity",
              "operations": ["CREATE", "READ"],
              "annotations": [
            "sslProfile",
            "addrPort",
            "saslMechanisms",
            "connectionRole"
          ],
              "attributes": {
            "requirePeerAuth": {
              "type": "Boolean",
                  "default": true,
                  "description": "Only for listeners using SSL.  If set to 'yes', attached clients will be required to supply a certificate.  If the certificate is not traceable to a CA in the ssl profile's cert-db, authentication fails for the connection."
            },
            "trustedCerts": {
              "type": "String",
                  "description": "This optional setting can be used to reduce the set of available CAs for client authentication.  If used, this setting must provide a path to a PEM file that contains the trusted certificates."
            },
            "allowUnsecured": {
              "type": "Boolean",
                  "default": false,
                  "description": "For listeners using SSL only.  If set to 'yes', this option causes the listener to watch the initial network traffic to determine if the client is using SSL or is running in-the-clear.  The listener will enable SSL only if the client uis using SSL."
            },
            "allowNoSasl": {
              "type": "Boolean",
                  "default": false,
                  "description": "If set to 'yes', this option causes the listener to allow clients to connect even if they skip the SASL authentication protocol."
            },
            "maxFrameSize": {
              "type": "Integer",
                  "default": 65536,
                  "description": "Defaults to 65536.  If specified, it is the maximum frame size in octets that will be used in the connection-open negotiation with a connected peer.  The frame size is the largest contiguous set of uniterruptible data that can be sent for a message delivery over the connection. Interleaving of messages on different links is done at frame granularity."
            }
          }
        },

        "connector": {
          "description": "Establishes an outgoing connections from the router.",
              "extends": "configurationEntity",
              "operations": ["CREATE", "READ"],
              "annotations": [
            "sslProfile",
            "addrPort",
            "saslMechanisms",
            "connectionRole"
          ],
              "attributes": {
            "allowRedirect": {
              "type": "Boolean",
                  "default": true,
                  "description": "Allow the peer to redirect this connection to another address."
            },
            "maxFrameSize": {
              "type": "Integer",
                  "default": 65536,
                  "description": "Maximum frame size in octets that will be used in the connection-open negotiation with a connected peer.  The frame size is the largest contiguous set of uniterruptible data that can be sent for a message delivery over the connection. Interleaving of messages on different links is done at frame granularity."
            }
          }
        },

        "log": {
          "description": "Set the level of logging output from a particular module.",
              "extends": "configurationEntity",
              "operations": ["CREATE", "READ", "UPDATE", "DELETE"],
              "attributes": {
            "module": {
              "type":[
                "ROUTER",
                "MESSAGE",
                "SERVER",
                "AGENT",
                "CONTAINER",
                "CONFIG",
                "DEFAULT",
                "ERROR",
                "DISPATCH"
              ],
                  "required": true,
                  "description": "Module to configure logging level. The special module 'DEFAULT' specifies logging for modules that don't have explicit log sections."
            },
            "level": {
              "type": [
                "none",
                "trace",
                "debug",
                "info",
                "notice",
                "warning",
                "error",
                "critical"
              ],
                  "default": "info",
                  "description": "Indicates the minimum logging level for the module. E.g. 'warning' means log warning, error and critical messages. 'trace' logs all messages. 'none' disables logging for the module."
            },
            "timestamp": {
              "type": "Boolean",
                  "default": true,
                  "description": "Include timestamp in log messages."
            },
            "source": {
              "type": "Boolean",
                  "default": false,
                  "description": "Include source file and line number in log messages."
            },
            "output": {
              "type": "String",
                  "description": "Where to send log messages. Can be 'stderr', 'syslog' or a file name."
            }
          }
        },

        "fixedAddress": {
          "description":"Establishes semantics for addresses starting with a prefix.",
              "extends": "configurationEntity",
              "operations": ["CREATE", "READ"],
              "attributes": {
            "prefix": {
              "type": "String",
                  "required": true,
                  "description": "The address prefix (always starting with '/')."
            },
            "phase": {
              "type": "Integer",
                  "description": "The phase of a multi-hop address passing through one or more waypoints."
            },
            "fanout": {
              "type": [
                "multiple",
                "single"
              ],
                  "default": "multiple",
                  "description": "One of 'multiple' or 'single'.  Multiple fanout is a non-competing pattern.  If there are multiple consumers using the same address, each consumer will receive its own copy of every message sent to the address.  Single fanout is a competing pattern where each message is sent to only one consumer."
            },
            "bias": {
              "type": [
                "closest",
                "spread"
              ],
                  "default": "closest",
                  "description": "Only if fanout is single.  One of 'closest' or 'spread'.  Closest bias means that messages to an address will always be delivered to the closest (lowest cost) subscribed consumer. Spread bias will distribute the messages across subscribers in an approximately even manner."
            }
          }
        },

        "waypoint": {
          "description":"A remote node that messages for an address pass through.",
              "extends": "configurationEntity",
              "operations": ["CREATE", "READ"],
              "attributes": {
            "address": {
              "description":"The AMQP address of the waypoint.",
                  "type": "String",
                  "required": true
            },
            "connector": {
              "description":"The name of the on-demand connector used to reach the waypoint's container.",
                  "type": "String",
                  "required": true
            },
            "inPhase": {
              "description":"The phase of the address as it is routed _to_ the waypoint.",
                  "type": "Integer",
                  "default": -1
            },
            "outPhase": {
              "description":"The phase of the address as it is routed _from_ the waypoint.",
                  "type": "Integer",
                  "default": -1
            }
          }
        },

        "dummy": {
          "description": "Dummy entity for test purposes.",
              "extends": "entity",
              "operations": ["CREATE", "READ", "UPDATE", "DELETE", "CALLME"],
              "attributes": {
            "arg1": {"type": "String"},
            "arg2": {"type": "String"},
            "num1": {"type": "Integer"},
            "num2": {"type": "Integer"}
          }
        },


        "router.link": {
          "description": "Link to another AMQP endpoint: router node, client or other AMQP process.",
              "extends": "operationalEntity",
              "attributes": {
            "linkType": {"type": ["endpoint", "waypoint", "inter-router", "inter-area"]},
            "linkDir": {"type": ["in", "out"]},
            "owningAddr": {"type": "String"},
            "eventFifoDepth": {"type": "Integer"},
            "msgFifoDepth": {"type": "Integer"}
          }
        },

        "router.address": {
          "description": "AMQP address managed by the router.",
              "extends": "operationalEntity",
              "attributes": {
            "inProcess": {"type": "Boolean"},
            "subscriberCount": {"type": "Integer"},
            "remoteCount": {"type": "Integer"},
            "deliveriesIngress": {"type": "Integer"},
            "deliveriesEgress": {"type": "Integer"},
            "deliveriesTransit": {"type": "Integer"},
            "deliveriesToContainer": {"type": "Integer"},
            "deliveriesFromContainer": {"type": "Integer"}
          }
        },

        "router.node": {
          "description": "AMQP node managed by the router.",
              "extends": "operationalEntity",
              "attributes": {
            "addr": {"type": "String"},
            "nextHop": {"type": "Integer"},
            "routerLink": {"type": "Integer"},
            "validOrigins": {"type": "List"}
          }
        },

        "connection": {
          "description": "Connections to the router's container.",
              "extends": "operationalEntity",
              "attributes": {
            "container": {"type": "String"} ,
            "state": {"type": [
              "connecting",
              "opening",
              "operational",
              "failed",
              "user"
            ]},
            "host": {"type": "String"},
            "dir": {"type": ["in", "out"]},
            "role": {"type": "String"},
            "sasl": {"type": "String"}
          }
        },

        "allocator": {
          "description": "Memory allocation pool.",
              "extends": "operationalEntity",
              "attributes": {
            "typeSize": {"type": "Integer"},
            "transferBatchSize": {"type": "Integer"},
            "localFreeListMax": {"type": "Integer"},
            "globalFreeListMax": {"type": "Integer"},
            "totalAllocFromHeap": {"type": "Integer"},
            "totalFreeToHeap": {"type": "Integer"},
            "heldByThreads": {"type": "Integer"},
            "batchesRebalancedToThreads": {"type": "Integer"},
            "batchesRebalancedToGlobal": {"type": "Integer"}
          }
        }
      }
    };


  };

  return QDR;

} (QDR || {}));
