'use strict';

var path = require('path')
  , fs = require('fs');

var http = require('http').createServer(function incoming(req, res) {
  console.log('incoming: ', req.url);

  if ('/' === req.url) {
    res.setHeader('Content-Type', 'text/html');
    return fs.createReadStream(__dirname +'/index.html').pipe(res);
  }

  res.setHeader('Content-Type', 'text/javascript');

  if ('/tabdancer.js' === req.url) return fs.createReadStream(
    path.join(__dirname, '..', 'dist', 'tabdancer.js')
  ).pipe(res);

  if ('/worker.js' === req.url) return fs.createReadStream(
    path.join(__dirname, '..', 'worker.js')
  ).pipe(res);

  res.end('');
});

var WebSocketServer = require('ws').Server
  , app = new WebSocketServer({ server: http });

app.on('connection', function (socket) {
  console.log('new connection');

  socket.on('message', function message(data) {
    socket.send(data);
  });

  socket.on('close', function close() {
    console.log('connection closed');
  });
});

http.listen(8080, function () {
  console.log('now listening on: http://localhost:8080/');
});
