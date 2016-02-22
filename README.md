# hawtio dispatch router plugin

dispatch-plugin.war is a standalone hawtio plugin that can be deployed in a server alongside the main hawtio-web application.

The project creates a war file that can be deployed in various application services and is also OSGi-ified so it deploys nicely into Apache Karaf.

## Docker

The fastest way to use the console is to run the [docker image](https://hub.docker.com/r/ernieallen/dispatch-console/). Follow the installation/run instruction on that page.

## Building
The dispatch-plugin.war file is pre-built and can be installed alongside the hawtio.war on any system with a modern java installation. If you want to build the dispatch-plugin.war from source:

- clone the hawtio git repo

    $ git clone https://github.com/hawtio/hawtio.git

- build hawtio

    $ cd hawtio

    $ mvn clean install

    If you encounter any errors when building hawtio, visit [the hawtio build page](http://hawt.io/building/index.html) for help.

- create a dispatch dir under the hawtio dir and copy the source code

    $ mkdir dispatch

    $ cp -r {dir where this file is located}/dispatch/* dispatch/

- do a maven build of dispatch

    $ cd dispach

    $ mvn package

The dispatch-plugin-1.4.60.war file should now be in the target directory.

## Apache Tomcat installation

Copy the dispatch-plugin-1.4.60.war file as the following name

    dispatch-plugin.war
to the deploy directory of Apache Tomcat os similar Java web container. Ensure the hawtio.war file is present in the same directory. Point a browser at http://\<tomcathost:post\>/hawtio
Dispatch Router should be available as a tab in the console.

## Connecting to a router

On the Dispatch Router's console page, select the Connect sub tab. Enter the address of a dispatch router. Enter the port of a websockets to tcp proxy and click the Connect button.

### Websockts to tcp proxy

The console communicates to a router using Qpid Proton's [rhea](https://github.com/grs/rhea) javascript binding. When run from a browser, it uses websockets. 
The router communicates using tcp. Therefore a websockts/tcp proxy is required.

#### Using a python websockets/tcp proxy

A popular python based proxy is [websockify](https://github.com/kanaka/websockify). To use it:

    $ git clone https://github.com/kanaka/websockify.git
    $ cd websockify
    $ python websockify.py 5673 0.0.0.0:20009 &
    
In the above, websockify is listening for ws traffic on port 5673 and will proxy it to 0.0.0.0:20009. One of the routers will need a listener on the proxied port. An example router .conf file entry is:

    listener {
        role: normal
        addr: 0.0.0.0
        port: 20009
        sasl-mechanisms: ANONYMOUS
    }



