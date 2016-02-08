/*
Licensed to the Apache Software Foundation (ASF) under one
or more contributor license agreements.  See the NOTICE file
distributed with this work for additional information
regarding copyright ownership.  The ASF licenses this file
to you under the Apache License, Version 2.0 (the
"License"); you may not use this file except in compliance
with the License.  You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing,
software distributed under the License is distributed on an
"AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, either express or implied.  See the License for the
specific language governing permissions and limitations
under the License.
*/
/**
 * @module QDR
 */
/**
 * @module QDR
 */
var QDR = (function (QDR) {

  /**
   * @method ChartsController
   * @param $scope
   * @param QDRServer
   * @param QDRChartServer
   *
   * Controller that handles the QDR charts page
   */
  QDR.module.controller("QDR.ChartsController", function($scope, QDRService, QDRChartService, $dialog, $location, localStorage, $routeParams) {

	var updateTimer = null;

	if (!QDRService.connected && !$routeParams.chid) {
		// we are not connected. we probably got here from a bookmark or manual page reload
		$location.path("/dispatch_plugin/connect")
        $location.search('org', "charts");
		return;
	}

    $scope.svgCharts = [];
    // create an svg object for each chart
    QDRChartService.charts.forEach(function (chart) {
		// if we are generating a chart for the hawtio dashboard, just show the chart described in $routeParams
		if ( (!$routeParams.chid  && chart.dashboard) || ($routeParams.chid && chart.hdash && ($routeParams.chid == chart.id()))) {
	        var svgChart = new QDRChartService.AreaChart(chart, $location.path())
	        svgChart.zoomed = false;
	        $scope.svgCharts.push(svgChart);
			// make sure hawtio dashboard charts are saved to localstorage only when the dashboard requests them
			if ($routeParams.chid && !chart.hdash) {
				QDRChartService.addHDash(chart);
			}
		}
    })

    // redraw the charts every second
    var updateCharts = function () {
        $scope.svgCharts.forEach(function (svgChart) {
            svgChart.tick(svgChart.chart.id()); // on this page we are using the chart.id() as the div id in which to render the chart
        })
		var updateRate = $routeParams.chid ? localStorage['updateRate'] || 5000 : 1000;
        updateTimer = setTimeout(updateCharts, updateRate);
    }

	$scope.hDash = function () {
		return $routeParams.chid ? "hDash" : "";
	}
	$scope.isHDash = function () {
		return $routeParams.chid;
	}
	// we are showing a chart for the hawtio dashboard page, but we are not logged in
	$scope.dashLogin = $routeParams.chid && !QDRService.connected;

	$scope.loginHref = QDR.pluginName + "/connect";
	$scope.chartsLoaded = function () {
        $scope.svgCharts.forEach(function (svgChart) {
            QDRChartService.sendChartRequest(svgChart.chart.request(), true);
        })
        if (updateTimer)
            clearTimeout(updateTimer)
		updateTimer = setTimeout(updateCharts, 100);
	}

	$scope.zoomChart = function (chart) {
		chart.zoomed = !chart.zoomed;
		chart.zoom(chart.chart.id(), chart.zoomed);
	}
    $scope.showListPage = function () {
        $location.path("/dispatch_plugin/list");
    };

    $scope.hasCharts = function () {
        if ($routeParams.chid)
            return true;
        return QDRChartService.numCharts() > 0 || $scope.dashLogin;
    };

    $scope.editChart = function (chart) {
        doDialog("chart-config-template.html", chart.chart);
    };

    $scope.delChart = function (chart) {
        QDRChartService.unRegisterChart(chart.chart);
        // remove from svgCharts
        $scope.svgCharts.forEach(function (svgChart, i) {
            if (svgChart === chart) {
                delete $scope.svgCharts.splice(i, 1);
            }
        })
    };

    // called from dialog when we want to clone the dialog chart
    // the chart argument here is a QDRChartService chart
    $scope.addChart = function (chart) {
        $scope.svgCharts.push(new QDRChartService.AreaChart(chart, $location.$$path));
    };

    $scope.$on("$destroy", function( event ) {
        if (updateTimer) {
            clearTimeout(updateTimer);
            updateTimer = null;
        }
        for (var i=$scope.svgCharts.length-1; i>=0; --i) {
            delete $scope.svgCharts.splice(i, 1);
        }
    });

	$scope.addToDashboardLink = function (chart) {
		var href = "#" + $location.path();
		var size = angular.toJson({
                size_x: 2,
                size_y: 2
              });

		var params = angular.toJson({chid: chart.chart.id()});
        var title = "Dispatch Router";
	    return "/hawtio/#/dashboard/add?tab=dashboard" +
	          "&href=" + encodeURIComponent(href) +
	          "&routeParams=" + encodeURIComponent(params) +
	          "&title=" + encodeURIComponent(title) +
	          "&size=" + encodeURIComponent(size);
    };

    $scope.$on("$destroy", function( event ) {
		$scope.svgCharts = [];
	})

    function doDialog(template, chart) {

	    $dialog.dialog({
			backdrop: true,
			keyboard: true,
			backdropClick: true,
			templateUrl: template,
			controller: "QDR.ChartDialogController",
			resolve: {
				chart: function() {
					return chart;
				},
				dashboard: function () {
					return $scope;
				}
			}
	    }).open();
    };

  });

  QDR.module.controller("QDR.ChartDialogController", function($scope, QDRChartService, $location, dialog, $rootScope, localStorage, chart, dashboard) {

		UI.colors[0] = "#cbe7f3"
		UI.colors[1] = "#058dc7"
		UI.colors[UI.colors.length-1] = "#FFFFFF"

        var dialogSvgChart = null;
        $scope.svgDivId = "dialogChart";    // the div id for the svg chart

		$scope.updateTimer = null;
        $scope.chart = chart;  // the underlying chart object from the dashboard
        $scope.dialogChart = $scope.chart.copy(); // the chart object for this dialog
        $scope.userTitle = $scope.chart.title();
		$scope.applyText = $scope.chart.hdash ? "Apply" : "Apply to existing chart";

        $scope.$watch('userTitle', function(newValue, oldValue) {
            if (newValue !== oldValue) {
                $scope.dialogChart.title(newValue);
            }
        })
        // the stored rateWindow is in milliseconds, but the slider is in seconds
        $scope.rateWindow = $scope.chart.rateWindow / 1000;

		var cleanup = function () {
			if ($scope.updateTimer) {
				clearTimeout($scope.updateTimer);
				$scope.updateTimer = null;
			}
			QDRChartService.unRegisterChart($scope.dialogChart);     // remove the chart
		}
		$scope.okClick = function () {
			cleanup();
	        dialog.close();
	    };

        // initialize the rateWindow slider
        $scope.slider = {
            'options': {
                min: 1,
                max: 10,
                step: 1,
                tick: true,
                stop: function (event, ui) {
                    $scope.dialogChart.rateWindow = ui.value * 1000;
                    if (dialogSvgChart)
                        dialogSvgChart.tick($scope.svgDivId);
                }
            }
		};

        $scope.visibleDuration =
        $scope.duration = {
            'options': {
                min: 1,
                max: 10,
                step: 1,
                tick: true,
                stop: function (event, ui) {
                    if (dialogSvgChart)
                        dialogSvgChart.tick($scope.svgDivId);
                }
            }
		};

        // handle the Apply button click
        // update the dashboard chart's properties
        $scope.apply = function () {
            $scope.chart.areaColor = $scope.dialogChart.areaColor;
            $scope.chart.lineColor = $scope.dialogChart.lineColor;
            $scope.chart.type = $scope.dialogChart.type;
            $scope.chart.rateWindow = $scope.dialogChart.rateWindow;
            $scope.chart.title($scope.dialogChart.title());
            $scope.chart.visibleDuration = $scope.dialogChart.visibleDuration;
            QDRChartService.saveCharts();
        }

        // add a new chart to the dashboard based on the current dialog settings
        $scope.copyToDashboard = function () {
            var chart = $scope.dialogChart.copy();
            // set the new chart's dashboard state
            QDRChartService.addDashboard(chart);
            // notify the chart controller that it needs to display a new chart
            dashboard.addChart(chart);
        }

        // update the chart on the popup dialog
        var updateDialogChart = function () {
            // draw the chart using the current data
            if (dialogSvgChart)
                dialogSvgChart.tick($scope.svgDivId);

            // draw the chart again in 1 second
			var updateRate = chart.hdash ? localStorage['updateRate'] || 5000 : 1000;
            $scope.updateTimer = setTimeout(updateDialogChart, updateRate);
        }

        var showChart = function () {
            // ensure the div for our chart is loaded in the dom
            var div = angular.element("#dialogChart");
            if (!div.width()) {
                setTimeout(showChart, 100);
                return;
            }
            dialogSvgChart = new QDRChartService.AreaChart($scope.dialogChart, $location.$$path);
            updateDialogChart();
        }
        showChart();


  });

  return QDR;

}(QDR || {}));

