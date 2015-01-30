/**
 * @module QDR
 */
var QDR = (function (QDR) {

  /**
   * @method SettingsController
   * @param $scope
   * @param QDRServer
   *
   * Controller that handles the QDR settings page
   */

  /**
   * @function NavBarController
   *
   * @param $scope
   * @param workspace
   *
   * The controller for this plugin's navigation bar
   *
   */
	QDR.TopoTabsController = function($scope, QDRService, $location) {

		QDR.log.debug("started QDR.TopoTabsController with location: " + $location.url());

		$scope.states = [
			{
                content: '<i class="icon-comments"></i> General',
                title: "General router stats",
                name: 'general',
                isValid: function (QDRService) { return true; } //QDRService.isConnected(); }
			},
			{
				content: '<i class="icon-cogs"></i> Connections',
				title: "Router connections",
				description: "Show the connections for the highlighted router",
                name: 'connections',
				isValid: function (QDRService) { return true; }
			},
			{
				content: '<i class="icon-star-empty"></i> Nodes',
				title: "Router nodex",
				description: "Show the nodes for the highlighted router",
                name: 'nodes',
				isValid: function (QDRService) { return true; }
			  }
		];
        $scope.currentTab = $scope.states[0].name;

		$scope.isValid = function(whichTab) {
		  return whichTab.isValid(QDRService);
		};

		$scope.isActive = function(whichTab) {
            return whichTab.name === $scope.currentTab;
			//return QDR.TopoSubPage(href) == QDR.TopoSubPage($location.url());		
		};
		
		$scope.setActive = function(whichTab) {
		    $scope.currentTab = whichTab.name;
		};
  	};

    QDR.currentAttributes = [
/*
        {
            attributeName: 'foo',
            attributeValue: "foo-val" 
        },
        {
            attributeName: 'bar',
            attributeValue: "bar-val" 
        },
        ...
        {
              attributeName: 'baz',
              attributeValue: 1
        }
*/
        ];
	
	QDR.TopologyFormController = function($scope, localStorage, $location) {
		QDR.log.debug("started QDR.TopologyFormController with location: " + $location.url());

        $scope.attributes = QDR.currentAttributes;
        $scope.isCurrent = function (name) { QDR.log.debug("isCurrent? " + name); return name === 'general'};
        var generalCellTemplate = '<div class="ngCellText"><span title="{{row.entity.description}}">{{row.entity.attributeName}}</span></div>';
        
        $scope.topoGridOptions = {
            selectedItems: [],
            data: 'attributes',
            displayFooter: true,
            displaySelectionCheckbox: false,
            canSelectRows: false,
            enableSorting: false,
            showSelectionCheckbox: false,
            enableRowClickSelection: false,
            multiSelect: false,
            sortInfo: {
              sortBy: 'nothing!!!',
              ascending: true
            },

            columnDefs: [
            {
                field: 'attributeName',
                displayName: 'Attribute',
                cellTemplate: generalCellTemplate
            },
            {
                field: 'attributeValue',
                displayName: 'Value'
            }
            ]
        };

	};

    QDR.TopologyController = function($scope, $rootScope, QDRService, localStorage, $location) {

		QDR.log.debug("started QDR.TopologyController with location: " + $location.url());
        $scope.schema = "Not connected";

		$scope.update = function () {
			QDR.log.debug("topology controller update called for scope variable");
		};



		// set up SVG for D3
	    var width, height;
	    var tpdiv = $('#topology');
	    var colors = {"inter-router": "#EAEAEA", "normal": "#F0F000"};
	    var gap = 5;
	    var radius = 25;
	    var radiusNormal = 15;
	    width = tpdiv.width() - gap;
	    height = $(document).height() - gap;

	    var svg;
		var force;
		var drag_line;
		var path;
		var savedKeys = [];
	    // mouse event vars
	    var selected_node = null,
	        selected_link = null,
	        mousedown_link = null,
	        mousedown_node = null,
	        mouseup_node = null;

	    // only respond once per keydown
	    var lastKeyDown = -1;


	    // set up initial nodes and links
	    //  - nodes are known by 'id', not by index in array.
	    //  - reflexive edges are indicated on the node (as a bold black circle).
	    //  - links are always source < target; edge directions are set by 'left' and 'right'.
		var nodes = [];
		var links = [];

		var nameFromId = function (id) {
			return id.split('/')[3];
		};

		var aNode = function (id, name, nodeType, nodeIndex, x, y) {
			return {   key: id,
				name: name,
				nodeType: nodeType,
				reflexive: false,
				x: x,
				y: y,
				id: nodeIndex
			};
		};
		
		var initForceGraph = function () {
		
			nodes = [];
			links = [];
			
			svg = d3.select('#topology')
				.append('svg')
				.attr("id", "SVG_ID")
				.attr('width', width)
				.attr('height', height);
			// mouse event vars
			selected_node = null;
			selected_link = null;
			mousedown_link = null;
			mousedown_node = null;
			mouseup_node = null;

			// only respond once per keydown
			lastKeyDown = -1;
			// initialize the list of nodes
			var nodeIndex = 0;
			var yInit = 10;
			var nodeCount = Object.keys(QDRService.topology._nodeInfo).length;
			for (var id in QDRService.topology._nodeInfo) {
				var name = nameFromId(id);
				var position = angular.fromJson(localStorage[name]) ||
					{x: width / 4 + ((width / 2)/nodeCount) * nodeIndex,
					y: height / 2 + yInit};
				nodes.push( aNode(id, name, "inter-router", nodeIndex, position.x, position.y) );
				yInit *= -1;
				//QDR.log.debug("adding node " + nodeIndex);
				nodeIndex++;
			}
	
			// initialize the list of links
			var source = 0;
			var client = 1;
			for (var id in QDRService.topology._nodeInfo) {
				var onode = QDRService.topology._nodeInfo[id];
				var conns = onode['.connection'].results;
	
				for (var j = 0; j < conns.length; j++) {
					if (conns[j][4] == "inter-router") {
						var target = getNodeIndex(conns[j][0]);
						var linkIndex = getLink(source, target);
						if (conns[j][8] == "out") links[linkIndex].right = true;
						else links[linkIndex].left = true;
					} else if (conns[j][4] == "normal") {
						// not a router, but an external client
						QDR.log.debug("found an external client for " + id);
						var name = nameFromId(id) + "." + client;
						QDR.log.debug("external client name is  " + name);
						var parent = getNodeIndex(nameFromId(id));
						QDR.log.debug("external client parent is " + parent);
	
						var position = angular.fromJson(localStorage[name]) ||
							{x: nodes[parent].x + 40 + Math.sin(Math.PI/2 * client),
							y: nodes[parent].y + 40} + Math.cos(Math.PI/2 * client);
						QDR.log.debug("adding node " + nodeIndex);
						nodes.push(	aNode("amqp:/_topo/0/" + name + "/$management", name, "normal", nodeIndex, position.x, position.y) );
						// nopw add a link
						QDR.log.debug("adding link between nodes " + nodeIndex + " and " + parent);
						getLink(nodeIndex, parent);
	
						nodeIndex++;
						client++;
					}
				}
				source++;
			}

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
            $scope.schema = QDRService.schema;
			// add a row for each attribute in .router attributeNames array
			while(QDR.currentAttributes.length > 0) {QDR.currentAttributes.pop()}
			for (var id in QDRService.topology._nodeInfo) {
				var onode = QDRService.topology._nodeInfo[id];
				var nodeResults = onode['.router'].results[0];
				var nodeAttributes = onode['.router'].attributeNames;
/*
                // move attribute 'routerId' to the front of the list
                // since hawtio-simple-grid doesn't support sorting
                var index = nodeAttributes.indexOf('routerId');
                if (index > -1) {
                    nodeAttributes.splice(index, 1);
                    var routerId = nodeResults.splice(index, 1)[0];
                    nodeAttributes.unshift('routerId');
                    nodeResults.unshift(routerId);
                }
*/
				for (var i=0; i<nodeAttributes.length; ++i) {
					var name = nodeAttributes[i];
					var val = nodeResults[i];
					var desc = "";
/*
					if (QDRService.schema.entityTypes)
					    if (QDRService.schema.entityTypes.router)
    					    if (QDRService.schema.entityTypes.router.attributes)
*/
        					    if (QDRService.schema.entityTypes.router.attributes[name])
            					    if (QDRService.schema.entityTypes.router.attributes[name].description)
            					        desc = QDRService.schema.entityTypes.router.attributes[name].description;
/*					var schemaDesc = "";
					if (QDRService.schema.entityTypes.router.attributes[name])
					    schemaDesc = QDRService.schema.entityTypes.router.attributes[name].description;
*/
//					QDR.currentAttributes.push({'attributeName': name, 'attributeValue': val, 'description': QDRService.schema.entityTypes.router.attributes[name].description});
					QDR.currentAttributes.push({'attributeName': name, 'attributeValue': val, 'description': desc});
				}
				break;
			}
			// init D3 force layout
			force = d3.layout.force()
				.nodes(nodes)
				.links(links)
				.size([width, height])
				.linkDistance(150)
				.charge(-1800)
				.friction(.10)
				.gravity(0.0001)
				.on('tick', tick)
	
			// define arrow markers for graph links
			svg.append('svg:defs').append('svg:marker')
				.attr('id', 'end-arrow')
				.attr('viewBox', '0 -5 10 10')
				.attr('refX', 6)
				.attr('markerWidth', 3)
				.attr('markerHeight', 3)
				.attr('orient', 'auto')
				.append('svg:path')
				.attr('d', 'M 0 -5 L 10 0 L 0 5 z')
				.attr('fill', '#000');
	
			svg.append('svg:defs').append('svg:marker')
				.attr('id', 'start-arrow')
				.attr('viewBox', '0 -5 10 10')
				.attr('refX', 6)
				.attr('markerWidth', 3)
				.attr('markerHeight', 3)
				.attr('orient', 'auto')
				.append('svg:path')
				.attr('d', 'M 10 -5 L 0 0 L 10 5 z')
				.attr('fill', '#000');
	
/*
			// Per-type markers, as they don't inherit styles.
			svg.append("defs").selectAll("marker")
				.data(["suit", "licensing", "resolved"])
			  .enter().append("marker")
				.attr("id", function(d) { return d; })
				.attr("viewBox", "0 -5 10 10")
				.attr("refX", 15)
				.attr("refY", -1.5)
				.attr("markerWidth", 6)
				.attr("markerHeight", 6)
				.attr("orient", "auto")
			  .append("path")
				.attr("d", "M0,-5L10,0L0,5");
*/

			// line displayed when dragging new nodes
			drag_line = svg.append('svg:path')
				.attr('class', 'link dragline hidden')
				.attr('d', 'M0,0L0,0');

			// handles to link and node element groups
			path = svg.append('svg:g').selectAll('path'),
				circle = svg.append('svg:g').selectAll('g');


			force.linkDistance(function(d) {
				//QDR.log.debug("setting linkDistance for ");
				//console.dump(d);
				if (d.source.nodeType === 'normal')
					return 50;
				return 150;
			});

			force.on('end', function() {
				QDR.log.debug("force end called");
				circle
					.attr('cx', function(d) {
						localStorage[d.name] = angular.toJson({x: d.x, y: d.y});
						return d.x; });
			});

			// app starts here
			restart();
		}
        //console.log(JSON.stringify(nodes));
        //console.log(JSON.stringify(links));
		initForceGraph();
		saveChanged();

        // called when we mouseover a node
        // we need to update the table
		function updateNodeForm (d) {
			//QDR.log.debug("update form info for ");
			//console.dump(d);
			var onode = QDRService.topology._nodeInfo[d.key];
			if (onode) {
				var nodeResults = onode['.router'].results[0];
				var nodeAttributes = onode['.router'].attributeNames;

                //convert parallel arrays into array of objects
                //var nv = [].map.call(nodeAttributes,
                //    function (attr, idx) { return {attributeName: attr, attributeValue: nodeResults[idx]}});

                for (var i=0; i<QDR.currentAttributes.length; ++i) {
                    var idx = nodeAttributes.indexOf(QDR.currentAttributes[i].attributeName);
                    if (idx > -1) {
                        if (QDR.currentAttributes[i].attributeValue != nodeResults[idx]) {
                            // highlight the changed data
                            QDR.currentAttributes[i].attributeValue = nodeResults[idx];

                        }
                    }
                }
				$scope.$apply();
			}
		}


        function getNodeIndex (_id) {
            var nodeIndex = 0;
            for (var id in QDRService.topology._nodeInfo) {
                if (id.split("/")[3] == _id) return nodeIndex;
                nodeIndex++
            }
            QDR.log.debug("unable to fine nodeIndex for " + _id);
            return 0;
        }

        function getLink (_source, _target) {
            for (var i=0; i < links.length; i++) {
                if (links[i].source == _source && links[i].target == _target) return i;
				// same link, just reversed
                if (links[i].source == _target && links[i].target == _source) {
                	links[i].source = _source;
                	links[i].target = _target;
                	var lval = links[i].left;
                	links[i].left = links[i].right;
                	links[i].right = lval;
                 	return i;
				}
            }
            var link = {
                source: _source,
                target: _target,
                left: false,
                right: false
            };
            return links.push(link) - 1;
        }
		

	    function resetMouseVars() {
	        mousedown_node = null;
	        mouseup_node = null;
	        mousedown_link = null;
	    }

	    // update force layout (called automatically each iteration)
	    function tick() {
	        // draw directed edges with proper padding from node centers
	        path.attr('d', function (d) {
				//QDR.log.debug("in tick for d");
				//console.dump(d);
	            var deltaX = d.target.x - d.source.x,
	                deltaY = d.target.y - d.source.y,
	                dist = Math.sqrt(deltaX * deltaX + deltaY * deltaY),
	                normX = deltaX / dist,
	                normY = deltaY / dist,
	                sourcePadding = d.left ? radius + 2 + 5 : radius + 2,
	                targetPadding = d.right ? radius + 2 + 5 : radius + 2,
	                sourceX = d.source.x + (sourcePadding * normX),
	                sourceY = d.source.y + (sourcePadding * normY),
	                targetX = d.target.x - (targetPadding * normX),
	                targetY = d.target.y - (targetPadding * normY);
	            return 'M' + sourceX + ',' + sourceY + 'L' + targetX + ',' + targetY;
	        });

	        circle.attr('transform', function (d) {
	            return 'translate(' + d.x + ',' + d.y + ')';
	        });
	    }

	    // update graph (called when needed)
	    function restart() {
	        circle.call(force.drag);
	        svg.classed('ctrl', true);

	        // path (link) group
	        path = path.data(links);

			// update existing links
  			path.classed('selected', function(d) { return d === selected_link; })
    			.style('marker-start', function(d) { return d.left ? 'url(#start-arrow)' : ''; })
    			.style('marker-end', function(d) { return d.right ? 'url(#end-arrow)' : ''; });

			// add new links
			path.enter().append('svg:path')
				.attr('class', 'link')
				.classed('selected', function(d) { return d === selected_link; })
				.style('marker-start', function(d) { return d.left ? 'url(#start-arrow)' : ''; })
				.style('marker-end', function(d) { return d.right ? 'url(#end-arrow)' : ''; })
				.on('mousedown', function(d) {
				  if(d3.event.ctrlKey) return;

				  // select link
				  mousedown_link = d;
				  if(mousedown_link === selected_link) selected_link = null;
				  else selected_link = mousedown_link;
				  selected_node = null;
				  restart();
				});

	        // remove old links
	        path.exit().remove();


	        // circle (node) group
	        // NB: the function arg is crucial here! nodes are known by id, not by index!
	        circle = circle.data(nodes, function (d) {
	            return d.id;
	        });

	        // update existing nodes (reflexive & selected visual states)
	        circle.selectAll('circle')
	            .style('fill', function (d) {
	            	sColor = colors[d.nodeType];
	            return (d === selected_node) ? d3.rgb(sColor).brighter().toString() : d3.rgb(sColor);
	        })
	            .classed('reflexive', function (d) {
	            return d.reflexive;
	        });

	        // add new nodes
	        var g = circle.enter().append('svg:g');

	        g.append('svg:circle')
	            .attr('class', 'node')
	            .attr('r', function (d) {
	            	return d.nodeType === 'normal' ? radiusNormal : radius;
	        })
	            .style('fill', function (d) {
	            sColor = colors[d.nodeType]; 
	            return (d === selected_node) ? d3.rgb(sColor).brighter().toString() : d3.rgb(sColor);
	        })
	            .style('stroke', function (d) {
	            sColor = colors[d.nodeType]; 
	            return d3.rgb(sColor).darker().toString();
	        })
	            .classed('reflexive', function (d) {
	            return d.reflexive;
	        })
	            .on('mouseover', function (d) {
				updateNodeForm(d);
	                if (!mousedown_node || d === mousedown_node) return;
	            // enlarge target node
	            d3.select(this).attr('transform', 'scale(1.1)');

	        })
	            .on('mouseout', function (d) {
	            if (!mousedown_node || d === mousedown_node) return;
	            // unenlarge target node
	            d3.select(this).attr('transform', '');
	        })
	            .on('mousedown', function (d) {
	            if (d3.event.ctrlKey) return;
				//QDR.log.debug("onmouse down past ctrlKey");
	            // select node
	            mousedown_node = d;
	            if (mousedown_node === selected_node) selected_node = null;
	            else selected_node = mousedown_node;
	            selected_link = null;

	            // reposition drag line
	            drag_line.style('marker-end', 'url(#end-arrow)')
	                .classed('hidden', false)
	                .attr('d', 'M' + mousedown_node.x + ',' + mousedown_node.y + 'L' + mousedown_node.x + ',' + mousedown_node.y);

	            restart();
	        })
	            .on('mouseup', function (d) {
	            if (!mousedown_node) return;

	            // needed by FF
	            drag_line.classed('hidden', true)
	                .style('marker-end', '');

	            // check for drag-to-self
	            mouseup_node = d;
	            if (mouseup_node === mousedown_node) {
	                resetMouseVars();
	                return;
	            }

	            // unenlarge target node
	            d3.select(this).attr('transform', '');
	        })
	        	.on('mousemove', function (d) {
            	 if (!mousedown_node) return;

		         //d3.select(this).classed("fixed", d.fixed = true);
   	        })
   	        	// doesn't work
   	        	.on('dblclick', function (d) { 
            	 //if (!mousedown_node) return;
                 //QDR.log.debug("dblclick works ");
                 //console.dump(d);
				
		         //d3.select(this).classed("fixed", d.fixed = false);
   	        });

	        // show node IDs
	        g.append('svg:text')
	            .attr('x', 0)
	            .attr('y', 4)
	            .attr('class', 'id')
	            .text(function (d) {
	            return d.nodeType === 'normal' ? d.name.slice(-1) : d.name;
	        });

	        // remove old nodes
	        circle.exit().remove();

	        // set the graph in motion
	        force.start();

	    }

	    function mousedown() {
	        // prevent I-bar on drag
	        //d3.event.preventDefault();

	        // because :active only works in WebKit?
	        svg.classed('active', true);
	    }

	    function mousemove() {
	        if (!mousedown_node) return;

	        // update drag line
	        drag_line.attr('d', 'M' + mousedown_node.x + ',' + mousedown_node.y + 'L' + d3.mouse(this)[0] + ',' + d3.mouse(this)[1]);

	        restart();
	    }

	    function mouseup() {
	        if (mousedown_node) {
	            // hide drag line
	            drag_line.classed('hidden', true)
	                .style('marker-end', '');
	        }

	        // because :active only works in WebKit?
	        svg.classed('active', false);

	        // clear mouse event vars
	        resetMouseVars();
	    }

	    function spliceLinksForNode(node) {
	        var toSplice = links.filter(function (l) {
	            return (l.source === node || l.target === node);
	        });
	        toSplice.map(function (l) {
	            links.splice(links.indexOf(l), 1);
	        });
	    }

	    function keydown() {

	        d3.event.preventDefault();

	        if (lastKeyDown !== -1) return;
	        lastKeyDown = d3.event.keyCode;

	        // ctrl
	        if (d3.event.keyCode === 17) {
	            circle.call(force.drag);
	            svg.classed('ctrl', true);
	        }

	        if (!selected_node && !selected_link) return;
	        switch (d3.event.keyCode) {
	            case 8:
	                // backspace
	            case 46:
	                // delete
	                if (selected_node) {
	                    nodes.splice(nodes.indexOf(selected_node), 1);
	                    spliceLinksForNode(selected_node);
	                } else if (selected_link) {
	                    links.splice(links.indexOf(selected_link), 1);
	                }
	                selected_link = null;
	                selected_node = null;
	                restart();
	                break;
	            case 66:
	                // B
	                if (selected_link) {
	                    // set link direction to both left and right
	                    selected_link.left = true;
	                    selected_link.right = true;
	                }
	                restart();
	                break;
	            case 76:
	                // L
	                if (selected_link) {
	                    // set link direction to left only
	                    selected_link.left = true;
	                    selected_link.right = false;
	                }
	                restart();
	                break;
	            case 82:
	                // R
	                if (selected_node) {
	                    // toggle node reflexivity
	                    selected_node.reflexive = !selected_node.reflexive;
	                } else if (selected_link) {
	                    // set link direction to right only
	                    selected_link.left = false;
	                    selected_link.right = true;
	                }
	                restart();
	                break;
	        }
	    }

	    function keyup() {
	        lastKeyDown = -1;

	        // ctrl
	        if (d3.event.keyCode === 17) {
	            circle.on('mousedown.drag', null)
	                .on('touchstart.drag', null);
	            svg.classed('ctrl', false);
	        }
	    }


		var stop = setInterval(function() {
			QDRService.addUpdatedAction(function() {
				//QDR.log.debug("Topology controller was notified that the model was updated");
				if (hasChanged()) {
					QDR.log.info("svg graph changed")
					saveChanged();
					// TODO: update graph nodes instead of rebuilding entire graph
					d3.select("#SVG_ID").remove();
					initForceGraph();
					if ($location.path().startsWith("/irc/topology"))
			        	Core.notification('info', "Qpid dispatch router topology changed");

				} else {
					//QDR.log.debug("no changes")
				}
			});
			QDRService.topology.get();

          }, 10000);

		function hasChanged () {
			if (Object.keys(QDRService.topology._nodeInfo).length != savedKeys.length)
				return true;
			for (var key in QDRService.topology._nodeInfo) {
				if (savedKeys.indexOf(key) == -1) {
					//QDR.log.debug("could not find " + key + " in ");
					//console.dump(savedKeys);
					return true;
				}
			}
			return false;
		};
		function saveChanged () {
			savedKeys = Object.keys(QDRService.topology._nodeInfo);
			QDR.log.debug("saving current keys");
			console.dump(savedKeys);
		};
		// we are about to leave the page, save the node positions
		$rootScope.$on('$locationChangeStart', function(event, newUrl, oldUrl) {
			QDR.log.debug("locationChangeStart");
			nodes.forEach( function (d) {
	           localStorage[d.name] = angular.toJson({x: d.x, y: d.y});
			});

		});
		// When the DOM element is removed from the page,
        // AngularJS will trigger the $destroy event on
        // the scope
        $scope.$on("$destroy", function( event ) {
   			QDR.log.debug("scope on destroy");
			if (angular.isDefined(stop)) {
				clearInterval(stop);
				stop = undefined;
			};

			d3.select("#SVG_ID").remove();
			//savedKeys = [];
        });



  };

  return QDR;
}(QDR || {}));
