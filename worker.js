'use strict';

var connections = [];

self.addEventListener('connect', function onconnect(e) {
  var port = e.ports[0];

  port.master = !connections.length;
  connections.push(port);

  port.addEventListener('message', function message(e) {
    var data = e.data;

    if ("master" === data.event) {
      return port.postMessage({ event: 'master', msg: !!port.master });
    }

    for (var i = 0, l = connections.length; i < l; i++) {
      connections[i].postMessage(data);
    }
  }, false);

  port.start();
}, false);
