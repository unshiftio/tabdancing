'use strict';

var EventEmitter = require('eventemitter3');

/**
 * LocalStorage Engine for the tabdancer.
 *
 * @constructor
 * @param {Dancer} dancer The dancer which uses this engine.
 * @param {Object} options Configuration.
 * @api public
 */
function LocalStorage(dancer, options) {
  if (!(this instanceof LocalStorage)) return new LocalStorage(dancer, options);

  this.dancer = dancer;   // Reference to the dancer.
  this.timers = {};       // Contains the setInterval references.
  this.interval = 100;
}

LocalStorage.prototype = new EventEmitter();
LocalStorage.prototype.constructor = LocalStorage;
LocalStorage.prototype.emits = require('./emits');

/**
 * Start listening for storage events and process all the things.
 *
 * @param {Function} fn Receives boolean for master indication.
 * @api private
 */
LocalStorage.prototype.listen = function listen(fn) {
  var prefix = this.dancer.prefix
    , now = +new Date()
    , selfie = this
    , master;

  window.addEventListener('storage', function storage(evt) {
    if (!evt.key || evt.key.slice(prefix.length) !== prefix) return;

    selfie.emit(evt.key.slice(prefix.length + 1), evt.newValue);
  });

  //
  // No active master when the interval has been passed and master has not been
  // updated.
  //
  if (now - (this.get('master') || 0) > (this.interval + 20)) {
    return fn(undefined, this, false);
  }

  //
  // Update the master key and write it immediately.
  //
  this.timer.master = setInterval(function update() {
    selfie.write(+new Date(), ':master');
  }, this.interval);
  this.write(now, ':master');

  fn(undefined, this, true);
};

/**
 * Close the localStorage things.
 *
 * @api public
 */
LocalStorage.prototype.end = function destroy() {
  for (var key in this.timers) clearTimeout(this.timers[key]);
};

/**
 * Write a message.
 *
 * @param {String} msg The data we need to transfer.
 * @param {String} key Name of the key.
 * @returns {Boolean}
 * @api public
 */
LocalStorage.prototype.write = function write(msg, key) {
  key = this.dancer.prefix + (key || ':data');

  try {
    localStorage.setItem(key, msg);
    return true;
  } catch (e) {
    //
    // We failed to write the data to cache, it could be that we wanted to store
    // more data then available so we could slice the data and send it in
    // chunks. But we probably need to write a protocol for this.
    //
    return false;
  }
};

/**
 * Retreive data from the localStorage object.
 *
 * @param {String} key The key we wish to retrieve.
 * @returns {String|Undefined} Data from localStorage.
 * @api public
 */
LocalStorage.prototype.get = function get(key) {
  key = this.dancer.prefix + key;

  try { return localStorage.getItem(key); }
  catch (e) { return undefined; }
};

/**
 * Check if LocalStorage is supported and working as intended as there are
 * various edge cases that we need to detect:
 *
 * - LocalStorage is disabled in private browsing mode.
 * - It's also disabled when you disable cookies.
 * - All the storage could be allocated by something else.
 * - IE8 doesn't have localStorage when you browse locally.
 *
 * @returns {Boolean}
 * @api private
 */
LocalStorage.prototype.supported = function supported(fn) {
  var key = this.dancer.prefix +':supported'
    , passed;

  try {
    localStorage.setItem(key, key);
    localStorage.removeItem(key);
    passed = true;
  } catch (e) {
    passed = false;
  }

  fn(passed);
};

//
// Expose the engine.
//
module.exports = LocalStorage;
