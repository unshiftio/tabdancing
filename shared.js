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
  this.worker = 0;                  // Reference to our Worker instance.
}

Shared.prototype = new EventEmitter();
Shared.prototype.constructor = Shared;
Shared.prototype.emits = require('emits');

/**
 * Generate a new Shared Worker.
 *
 * @returns {Boolean} Successfully started the shared worker.
 * @api private
 */
Shared.prototype.generate = function generate() {
  var onerror = this.emits('error')
    , selfie = this;

  if (this.worker) return false;

  /**
   * Handle incoming messages, woop, woop, woop (\/)(;,,;)(\/).
   *
   * @param {Event} e
   * @api private
   */
  function onmessage(e) {
    selfie.emit(e.data.event, e.data.msg);
  }

  try {
    this.worker = new SharedWorker(this.dancer.workerpath, this.dancer.prefix);
    this.worker.port.addEventListener('message', onmessage, false);
    this.worker.port.addEventListener('error', onerror, false);
    this.worker.port.start();

    this.once('end', function end() {
      if (!this.worker) return;

      this.worker.port();
      this.worker.removeEventListener('message', onmessage, false);
      this.worker.removeEventListener('error', onerror, false);
      this.worker = null;
    });
  } catch (e) {
    this.emit('end', e);
    return false;
  }

  return true;
};

/**
 * Start listening for incoming data and or events.
 *
 * @param {Function} fn Receives boolean indication for master indication.
 * @api private
 */
Shared.prototype.listen = function listen(fn) {
  this.once('master', function waiting(master) {
    fn(undefined, this, master);
  }).write(1, 'master');
};

/**
 * Write a message to all the things.
 *
 * @param {String} data Message to be broadcast.
 * @api public
 */
Shared.prototype.write = function write(msg, key) {
  return !!this.worker.port.postMessage({
    event: key || 'data',
    msg: msg
  });
};

/**
 * End the Shared Worker and clean up all references to all the things.
 *
 * @api public
 */
Shared.prototype.end = function end() {
  return this.emit('end');
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
  return fn(this.generate());
};

//
// Expose the engine.
//
module.exports = Shared;
