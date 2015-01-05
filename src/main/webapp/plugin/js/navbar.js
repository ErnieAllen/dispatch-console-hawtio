/**
 * @module QDR
 */
var QDR = (function (QDR) {

  /**
   * @property breadcrumbs
   * @type {{content: string, title: string, isValid: isValid, href: string}[]}
   *
   * Data structure that defines the sub-level tabs for
   * our plugin, used by the navbar controller to show
   * or hide tabs based on some criteria
   */
  QDR.breadcrumbs = [
    {
      content: '<i class="icon-comments"></i> Main',
      title: "Connect to Router",
      isValid: function (QDRService) { return QDRService.isConnected(); },
      href: "#/irc/main"
    },
    {
      content: '<i class="icon-cogs"></i> Settings',
      title: "Connect to a router",
      isValid: function (QDRService) { return true; },
      href: "#/irc/settings"
    }
  ];

  /**
   * @function NavBarController
   *
   * @param $scope
   * @param workspace
   *
   * The controller for this plugin's navigation bar
   *
   */
  QDR.NavBarController = function($scope, QDRService, $location) {

    if ($location.path().startsWith("/irc/main") && !QDRService.isConnected()) {
      $location.path("/irc/settings");
    }

    $scope.breadcrumbs = QDR.breadcrumbs;

    $scope.isValid = function(link) {
      return link.isValid(QDRService);
    };

  };

  return QDR;

} (QDR || {}));
