/**
 * @module QDR
 * @main QDR
 *
 * The main entrypoint for the QDR module
 *
 */
var QDR = (function(QDR) {

  /**
   * @property pluginName
   * @type {string}
   *
   * The name of this plugin
   */
  QDR.pluginName = "QDR";

  /**
   * @property log
   * @type {Logging.Logger}
   *
   * This plugin's logger instance
   */
  QDR.log = Logger.get(QDR.pluginName);

  /**
   * @property templatePath
   * @type {string}
   *
   * The top level path to this plugin's partials
   */
  QDR.templatePath = "../irc-plugin/plugin/html/";

  /**
   * @property jmxDomain
   * @type {string}
   *
   * The JMX domain this plugin mostly works with
   */
  QDR.jmxDomain = "hawtio"

  /**
   * @property mbeanType
   * @type {string}
   *
   * The mbean type this plugin will work with
   */
  QDR.mbeanType = "IRCHandler";

  /**
   * @property mbean
   * @type {string}
   *
   * The mbean's full object name
   */
  QDR.mbean = QDR.jmxDomain + ":type=" + QDR.mbeanType;

  /**
   * @property SETTINGS_KEY
   * @type {string}
   *
   * The key used to fetch our settings from local storage
   */
  QDR.SETTINGS_KEY = 'QDRSettings';

  /**
   * @property module
   * @type {object}
   *
   * This plugin's angularjs module instance
   */
  QDR.module = angular.module(QDR.pluginName, ['hawtioCore', 'hawtio-ui', 'hawtio-forms', 'luegg.directives']);

  // set up the routing for this plugin
  QDR.module.config(function($routeProvider) {
    $routeProvider
        .when('/irc/main', {
          templateUrl: QDR.templatePath + 'irc.html'
        })
        .when('/irc/settings', {
          templateUrl: QDR.templatePath + 'settings.html'
        });
  });

  // one-time initialization happens in the run function
  // of our module
  QDR.module.run(function(workspace, viewRegistry, localStorage, QDRService, $rootScope) {
    // let folks know we're actually running
    QDR.log.info("plugin running");

    Core.addCSS('../irc-plugin/plugin/css/plugin.css');

    // tell hawtio that we have our own custom layout for
    // our view
    viewRegistry["irc"] = QDR.templatePath + "qdrLayout.html";

    // Add a top level tab to hawtio's navigation bar
    workspace.topLevelTabs.push({
      id: "irc",
      content: "Qpid Dispatch Router",
      title: "example QDR client",
      isValid: function(workspace) { return workspace.treeContainsDomainAndProperties(QDR.jmxDomain, { 'type': QDR.mbeanType }); },
      href: function() { return "#/irc/main"; },
      isActive: function() { return workspace.isLinkActive("irc"); }
    });
    QDRService.initProton();
    var settings = angular.fromJson(localStorage[QDR.SETTINGS_KEY]);
    if (settings && settings.autostart) {
      QDR.log.debug("Settings.autostart set, starting QDR connection");
      QDRService.addConnectAction(function() {
        Core.notification('info', "Connected to QDR Server");
        Core.$apply($rootScope);
      });
      QDRService.connect(settings);
    }

  });

  return QDR;
}(QDR || {}));

// Very important!  Add our module to hawtioPluginLoader so it
// bootstraps our module
hawtioPluginLoader.addModule(QDR.pluginName);

// have to add this third-party directive too
hawtioPluginLoader.addModule('luegg.directives');
