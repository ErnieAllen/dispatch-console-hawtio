/**
 * @module QDR
 */
var QDR = (function(QDR) {

  QDR.SERVER = 'Server Messages';

  // The QDR service handles the connection to
  // the server in the background
  QDR.module.factory("QDRService", function($rootScope, $http, $resource) {
    var self = {

      timeout: 10,
      connectActions: [],
      disconnectActions: [],
      updatedActions: [],

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
      addUpdatedAction: function(action) {
        if (angular.isFunction(action)) {
          self.updatedActions.push(action);
        }
      },

      executeConnectActions: function() {
        self.connectActions.forEach(function(action) {
          //QDR.log.debug("executing connect action " + action);
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
      executeUpdatedActions: function() {
        self.updatedActions.forEach(function(action) {
          action.apply();
        });
        self.updatedActions = [];
      },

      notifyTopologyDone: function() {
        //QDR.log.debug("got Toplogy done notice");

        if (!self.gotTopology) {
            //QDR.log.debug("topology was just initialized");
            self.gotTopology = true;
            self.executeConnectActions();
            Core.$apply($rootScope);
        } else {
            //QDR.log.debug("topology model was just updated");
            self.executeUpdatedActions();
        }

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

      /*
       * @property message
       * The proton message that is used to send commands
       * and receive responses
       */
      messenger: undefined,
      msgReceived: undefined,
      msgSend: undefined,
      address: undefined,
      schema: undefined,

      replyTo: undefined,
      subscription: undefined,
      subscribed: false,
      gotTopology: false,
      localNode: undefined,
      errorText: undefined,

      isConnected: function() {
        return self.gotTopology;
      },

    correlator: {
        _objects: {},
        _corremationID: 0,

        corr: function () {
            return (++this._corremationID + "");
        },
        add: function(id) {
            //QDR.log.debug("correlator:add id="+id);
            this._objects[id] = {resolver: null};
        },
        request: function() {
            //QDR.log.debug("correlator:request");
            return this;
        },
        then: function(id, resolver) {
            //QDR.log.debug("registered then resolver for correlationID: " + id);
            this._objects[id].resolver = resolver;
        },
        resolve: function() {
            var statusCode = self.msgReceived.properties['statusCode'];
            if (typeof statusCode === "undefined") {
                //QDR.log.debug("correlator:resolve:statusCode was not 200 (OK) but was undefined. Waiting.");
                return;
            }

            var correlationID = self.msgReceived.getCorrelationID();
            //QDR.log.debug("message received: ");
            //console.dump(msgReceived.body);
            this._objects[correlationID].resolver(self.msgReceived.body);
            delete this._objects[correlationID];
        }
    },

    onSubscription: function() {
        //setInterval( function () { self.topology.get() }, 1000);
        self.getSchema();
        self.topology.get();
     },

    pumpData: function() {
         //QDR.log.debug("pumpData called");
	     if (!self.subscribed) {
	     	 var subscriptionAddress = self.subscription.getAddress();
	         if (subscriptionAddress) {
      	     	self.replyTo = subscriptionAddress;
	            self.subscribed = true;
	            var splitAddress = subscriptionAddress.split('/');
	            splitAddress.pop();
	            self.localNode = splitAddress.join('/') + "/$management";
                //QDR.log.debug("we are subscribed. replyTo is " + self.replyTo + " localNode is " + self.localNode);

	            self.onSubscription();
	         }
	     }

	     while (self.messenger.incoming()) {
	         // The second parameter forces Binary payloads to be decoded as strings
	         // this is useful because the broker QMF Agent encodes strings as AMQP
	         // binary, which is a right pain from an interoperability perspective.
             self.msgReceived.clear();;
	         var t = self.messenger.get(self.msgReceived, true);
	 		 //QDR.log.debug("pumpData incoming t was " + t);
	         self.correlator.resolve();
	         self.messenger.accept(t);
	         self.messenger.settle(t);
	         //msgReceived.free();
	         //delete msgReceived;
	     }

	     if (self.messenger.isStopped()) {
			 QDR.log.debug("command completed and messenger stopped");
	     }
	 },

      initProton: function() {
        //QDR.log.debug("*************QDR init proton called ************");
        self.messenger = new proton.Messenger();
        self.msgReceived = new proton.Message();
        self.msgSend = new proton.Message();
        self.messenger.on('error', function(error) {
          self.errorText = error;
          QDR.log.error("Got error from messenger: " + error);
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
          //QDR.log.debug("*************QDR closed ************");
        }
      },
      error: function(line) {
        if (line.num) {
          QDR.log.debug("error - num: ", line.num, " message: ", line.message);
        } else {
          QDR.log.debug("error - message: ", line.message);
        }
      },
      disconnected: function(line) {
        QDR.log.debug("Disconnected from QDR server");
        self.executeDisconnectActions();
      },

      /*
       *
       * send the management messages that build up the topology
       *
       *
       */
      topology: {
        _gettingTopo: false,
        _expectedCount: 0,
        _nodeInfo: {},
        _expected: [],
        _timerHandle: null,
        _ticks: 0,

        get: function () {
            if (this._gettingTopo)
                return;
            if (!self.subscribed)
                return;
            this._expectedCount = 0;
            this._gettingTopo = true;
            self.errorText = undefined;
            this.cleanUp(this._nodeInfo);
            this._nodeInfo = {};
            this._expected = [];

            self.makeMgmtCalls(self.localNode);
            self.getRemoteNodeInfo();
        },

        cleanUp: function (obj) {
/*
            for (var o in obj) {
                QDR.log.debug("cleaning up");
                console.dump(obj[o]);
                if (isNaN(parseInt(o)))
                    this.cleanUp(obj[o]);
            }
*/
            delete obj;
        },
        setExpectedCount: function (count, timeout) {
            this._expectedCount = count;
            this._ticks = 0;
            this.timerHandle = setTimeout(this.timedOut, timeout * 1000);
         },
        timedOut: function () {
        // a node dropped out. this happens when the get-mgmt-nodex
        // results contains more nodes than actually respond within
        // the timeout. However, if the responses we get don't contain
        // the missing node, assume we are done.
            QDR.log.debug("timed out waiting for management responses");
            // note: can't use 'this' in a timeout handler
            self.topology.dump("state at timeout");
            // check if _nodeInfo is consistent
            if (self.topology.isConsistent()) {
                //TODO: notify controllers which node was dropped
                // so they can keep an event log
                self.topology.ondone();
                return;
            }
            self.topology.onerror(Error("Timed out waiting for management responses"));
        },
        isConsistent: function () {
            // see if the responses we have so far reference any nodes
            // for which we don't have a response
            var gotKeys = {};
            for (var id in this._nodeInfo) {
                var onode = this._nodeInfo[id];
                // get list of node names in the connection data
                var connectionResults = onode['.connection'].results;
                for (var j=0; j < connectionResults.length; ++j) {
                    var roleIndex = onode['.connection'].attributeNames.indexOf('role');
                    var containerIndex = onode['.connection'].attributeNames.indexOf('container');

                    if (connectionResults[j][roleIndex] == "inter-router")
                        gotKeys[connectionResults[j][containerIndex]] = ""; // just add the key
                }
            }
            // gotKeys now contains all the container names that we have received
            return (
                // one node responded and it doesn't connect to any other node (of course)
                (Object.keys(gotKeys).length == 0 && Object.keys(this._nodeInfo).length == 1) ||
                // the number of nodes that responded is the same as the referenced nodes
                (Object.keys(gotKeys).length == Object.keys(this._nodeInfo).length));
        },
            
        addNodeInfo: function (id, entity, values) {
            if (id) {
                if (!this._nodeInfo.hasOwnProperty(id)) {
                    this._nodeInfo[id] = {};
                }
                this._nodeInfo[id][entity] = values;
            }
            if (this._expectedCount == Object.keys(this._nodeInfo).length) {
                for (var id in this._nodeInfo) {
                    if (!this._nodeInfo[id].hasOwnProperty(".router") || !this._nodeInfo[id].hasOwnProperty(".connection"))
                        return;
                }
                this.ondone();
            }
        },
        expect: function (id, key1, key2) {
            var expObj = {};
            expObj[id] = [key1, key2];
            this._expected.push(expObj);
        },
/*
        {
            ".router": {
                "results": [
                    [4, "router/QDR.X", 1, "0", 3, 60, 60, 9, "QDR.X", 30, "interior", "org.apache.qpid.dispatch.router", 3, 8, "router/QDR.X"]
                ],
                "attributeNames": ["raIntervalFlux", "name", "helloInterval", "area", "helloMaxAge", "mobileAddrMaxAge", "remoteLsMaxAge", "addrCount", "routerId", "raInterval", "mode", "type", "nodeCount", "linkCount", "identity"]
            },
            ".connection": {
                "results": [
                    ["QDR.A", "connection/0.0.0.0:20001", "operational", "0.0.0.0:20001", "inter-router", "connection/0.0.0.0:20001", "ANONYMOUS", "org.apache.qpid.dispatch.connection", "out"],
                    ["1429f141-9a06-4242-c47d-cb385dc3d86a", "connection/localhost:40738", "operational", "localhost:40738", "normal", "connection/localhost:40738", "ANONYMOUS", "org.apache.qpid.dispatch.connection", "in"]
                ],
                "attributeNames": ["container", "name", "state", "host", "role", "identity", "sasl", "type", "dir"]
            }
        }
*/
        ondone: function () {
            clearTimeout(this.timerHandle);
            this._gettingTopo = false;
            //this.miniDump();
            self.notifyTopologyDone();
         },
         dump: function (prefix) {
            if (prefix)
                QDR.log.debug(prefix);
            QDR.log.debug("---");
            for (var key in this._nodeInfo) {
                QDR.log.debug(key);
                console.dump(this._nodeInfo[key]);
                QDR.log.debug("---");
            }
            QDR.log.debug("was expecting " + this._expectedCount);
            console.dump(this._expected);
        },
         miniDump: function (prefix) {
            if (prefix)
                QDR.log.debug(prefix);
            QDR.log.debug("---");
            console.dump(Object.keys(this._nodeInfo));
            QDR.log.debug("---");
        },
        onerror: function (err) {
            this._gettingTopo = false;
            QDR.log.debug("Err:" + err);
            self.executeDisconnectActions();

        }

      },

      getRemoteNodeInfo: function () {
	 	//QDR.log.debug("getRemoteNodeInfo called");
        var id;
        // first get the list of remote node names
	 	self.correlator.request(
                id = self.sendMgmtNodesQuery()
            ).then(id, function(response) {
                //QDR.log.debug("got remote node list of ");
                //console.dump(response);
                if( Object.prototype.toString.call( response ) === '[object Array]' ) {
                    // we expect a response for each of these nodes + the node we are connected to
                    self.topology.setExpectedCount(response.length + 1, self.timeout);
                    if (response.length == 0) {
                        // there is only one node or the router network is unstable
                        QDR.log.debug("got empty list from get-mgmt-nodes call");
                        // make this call to trigger the done state
                        self.topology.addNodeInfo(null);
                    }
                    for (var i=0; i<response.length; ++i) {
                        self.makeMgmtCalls(response[i]);
                    }
                };
                self.topology.cleanUp(response);
            });
      },

      makeMgmtCalls: function (id) {
            self.topology.expect(id, ".router", ".connection");
            self.getNodeInfo(id, ".router");
            self.getNodeInfo(id, ".connection");
      },

      getNodeInfo: function (nodeName, entity) {
        //QDR.log.debug("getNodeInfo called with nodeName: " + nodeName + " and entity " + entity);
        var id;
        self.correlator.request(
            id = self.sendQuery(nodeName, entity)
        ).then(id, function(response) {
            self.topology.addNodeInfo(nodeName, entity, response);
            self.topology.cleanUp(response);
        });
      },

      getSchema: function () {
        //QDR.log.debug("getting schema");
        var id;
        self.correlator.request(
            id = self.sendSchemaQuery()
        ).then(id, function(response) {
            //QDR.log.debug("Got schema response");
            //console.dump(response);
            self.schema = angular.copy(response);
            self.topology.cleanUp(response);
        });
      },

    sendQuery: function(toAddr, entity) {
        var correlationID = self.correlator.corr();
        self.msgSend.clear();

        self.msgSend.setReplyTo(self.replyTo);
        self.msgSend.setCorrelationID(correlationID);
        self.msgSend.properties = {
            "operation": "QUERY",
            "entityType": "org.apache.qpid.dispatch" + entity,
            "type": "org.amqp.management",
            "name": "self",
        };
        // remove the amqp: from the beginning of the toAddr
        // toAddr looks like amqp:/_topo/0/QDR.A/$management
        var toAddrParts = toAddr.split('/');
        if (toAddrParts.shift() != "amqp:") {
            self.topology.error(Error("unexpected format for router address: " + toAddr));
            return;
        }
        var fullAddr =  self.address + "/" + toAddrParts.join('/');
        self.msgSend.setAddress(fullAddr);
        //QDR.log.debug("sendQuery for " + toAddr + " :: address is " + fullAddr);

        self.msgSend.body = {
            "attributeNames": [],
         }

        self.correlator.add(correlationID);
        //QDR.log.debug("message for " + toAddr);
        //console.dump(message);
        self.messenger.put(self.msgSend, true);
        return correlationID;
    },

    sendMgmtNodesQuery: function () {
        //console.log("sendMgmtNodesQuery");
        var correlationID = self.correlator.corr();
        self.msgSend.clear();

        self.msgSend.setAddress(self.address + "/$management");
        self.msgSend.setReplyTo(self.replyTo);
        self.msgSend.setCorrelationID(correlationID);
        self.msgSend.properties = {
            "operation": "GET-MGMT-NODES",
            "type": "org.amqp.management",
            "name": "self",
        };

        self.msgSend.body = [];

        //QDR.log.debug("sendMgmtNodesQuery address is " + self.address + "/$management");
        //QDR.log.debug("sendMgmtNodesQuery replyTo is " + self.replyTo);
        self.correlator.add(correlationID);
        self.messenger.put(self.msgSend, true);
        return correlationID;
    },

    sendSchemaQuery: function () {
        //console.log("sendMgmtNodesQuery");
        var correlationID = self.correlator.corr();
        self.msgSend.clear();

        self.msgSend.setAddress(self.address + "/$management");
        self.msgSend.setReplyTo(self.replyTo);
        self.msgSend.setCorrelationID(correlationID);
        self.msgSend.properties = {
            "operation": "GET-SCHEMA",
            "type": "org.amqp.management",
            "name": "self",
        };

        self.msgSend.body = [];

        //QDR.log.debug("sendMgmtNodesQuery address is " + self.address + "/$management");
        //QDR.log.debug("sendMgmtNodesQuery replyTo is " + self.replyTo);
        self.correlator.add(correlationID);
        self.messenger.put(self.msgSend, true);
        return correlationID;
    },

      disconnect: function() {
      },

      connect: function(options) {
        self.options = options;
        self.topologyInitialized = false;
        if (!self.subscribed) {
            var baseAddress = 'amqp://' + options.address + ':5673';
            self.address = baseAddress;
            QDR.log.debug("Subscribing to router: ", baseAddress + "/#");
            self.subscription = self.messenger.subscribe(baseAddress + "/#");
            // wait for response messages to come in
            self.messenger.recv(); // Receive as many messages as messenger can buffer.
        } else {
            self.topology.get();
        }
      }
    }
      return self;
  });

  return QDR;
}(QDR || {}));

(function() {
    console.dump = function(object) {
        if (window.JSON && window.JSON.stringify)
            console.log(JSON.stringify(object));
        else
            console.log(object);
    };
})();