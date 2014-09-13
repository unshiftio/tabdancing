'use strict';

var EventEmitter = require('eventemitter3');

/**
 * A Shared Worker Engine for the tabdancer.
 *
 * @constructor
 * @param {Dancer} dancer The dancer which uses this engine.
 * @param {Object} options Configuration.
 * @api public
 */
function Shared(dancer, options) {
  if (!(this instanceof Shared)) return new Shared(dancer, options);

  this.dancer = dancer;             // Reference to our dancer instance.
  this.blob = false;                // Check if we support the Blob interface.
  this.worker = 0;                  // Reference to our Worker instance.
  this.url = 0;                     // URL Blob.
}

Shared.prototype = new EventEmitter();
Shared.prototype.constructor = Shared;
Shared.prototype.emits = require('./emits');

/**
 * The piece of code that needs to be loaded in the Shared Worker so we can
 * broadcast all our information.
 *
 * @type {String}
 * @private
 */
Shared.prototype.echo = [
  'var connections = [];',

  'self.addEventListener("connect", function onconnect(e) {',
    'var port = e.ports[0]; connections.push(port);',

    'port.addEventListener("message", function message(e) {',
      'for (var i = 0, l = connections.length; i < l; i++) {',
        'connections[i].postMessage(e.data);',
      '}',
    '}, false);',

    'port.start();',
    'port.postMessaage({ type: "tabdancer", connections: connections.length });',
  '}, false);'
].join('\n');

/**
 * Start listening for incoming data and or events.
 *
 * @param {Function} fn Receives boolean indication for master indication.
 * @api private
 */
Shared.prototype.listen = function listen(fn) {
  var waiting = true
    , selfie = this
    , blob, worker;

  //
  // Detect ancient blob interfaces to figure out how we can compile our code
  // to something useful. This detection is already done in the .supported
  // method which sets the .blob to true when it's supported.
  //
  if (!this.blob) {
    blob = new BlobBuilder();
    blob.append(this.echo);
    blob = blob.getBlob();
  } else {
    blob = new Blob([this.echo], { type: 'text/javascript' });
  }

  this.url = URL.createObjectURL(blob);

  worker = this.worker = new SharedWorker(this.url, this.dancer.prefix);
  worker.port.addEventListener('error', this.emits('error'), false);
  worker.port.addEventListener('message', this.emits('data', function parser(e) {
    var data = e.data;

    //
    // This is the first message that we receive from the worker which tells us
    // how many connections there are. If there are 0, it's save to assume that
    // we're the first to start this worker and are there for the master
    // process.
    //
    if (waiting && 'object' === typeof data && data.type === "tabdancer") {
      waiting = false;
      fn(undefined, selfie, data.connections === 0);
      return selfie.emits; // Return it self as indication to prevent execution
    }

    return data;
  }), false);

  //
  // The worker.port is only needed when assigning event listeners to the
  // worker. Which is something that we're doing.
  //
  worker.port.start();
};

/**
 * Write a message to all the things.
 *
 * @param {String} data Message to be broadcast.
 * @api public
 */
Shared.prototype.write = function write(data) {
  return this.worker.port.postMessage(data);
};

/**
 * End the Shared Worker and clean up all references to all the things.
 *
 * @api public
 */
Shared.prototype.end = function end() {
  if (this.url) URL.revokeObjectURL(this.url);
  if (this.worker) this.worker.port.close();
};

/**
 * Check to see if this engine is supported for tab dancing. It needs to check
 * if:
 *
 * - Blob URL's are working.
 * - Shared workers exist.
 * - Shared workers can communicate.
 *
 * @param {Function} fn Completion callback.
 * @api private
 */
Shared.prototype.supported = function supported(fn) {
  var passed = false
    , selfie = this
    , echo = this.echo
    , url, worker, timer, blob
    , message = this.dancer.prefix +':supported';

  /**
   * Cleanup all the crap that we've created while testing if this Shared Worker
   * thing is supported.
   *
   * @api private
   */
  function cleanup() {
    selfie.end();
    if (timer) clearTimeout(timer);

    fn(passed);
  }

  try {
    try { blob = new Blob([echo], { type: 'text/javascript' }); this.blob = true; }
    catch (e) { blob = new BlobBuilder(); blob.append(echo); blob = blob.getBlob(); }

    this.url = URL.createObjectURL(blob);
    this.worker = new SharedWorker(url);

    worker.port.addEventListener('error', cleanup);
    timer = setTimeout(cleanup, 200);

    worker.port.addEventListener('message', function message(e) {
      passed = e.data === message;
      cleanup();
    }, false);

    worker.port.start();
    worker.port.postMessage(message);
  } catch (e) {
    cleanup();
  }
};

//
// Expose the engine.
//
module.exports = Shared;
