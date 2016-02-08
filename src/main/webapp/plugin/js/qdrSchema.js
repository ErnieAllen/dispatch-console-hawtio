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
var QDR = (function (QDR) {

    QDR.module.controller("QDR.SchemaController", ['$scope', '$location', 'QDRService', function($scope, $location, QDRService) {
		if (!QDRService.connected) {
			// we are not connected. we probably got here from a bookmark or manual page reload
			$location.path("/dispatch_plugin/connect")
			$location.search('org', "schema");

			return;
		}

        $scope.schema = QDRService.schema;

    }]);

    return QDR;
}(QDR || {}));
