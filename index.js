'use strict';

var EventEmitter = require('eventemitter3')
  , series = require('async-series')
  , parser = require('./json');

/**
 * Dancer is a small connection manager which uses inter-tab communication.
 *
 * @constructor
 * @param {Object} options Dancing configuration.
 * @api public
 */
function Dancer(options) {
  if (!(this instanceof Dancer)) return new Dancer(options);

  options = options || {};

  var selfie = this;

  this.engine = null;                                 // The configured tab engine.
  this.isMaster = false;                              // Are we the master process.
  this.isClient = false;                              // Are we the client process.
  this.transport = null;                              // The name of the engine.
  this.options = options;                             // Configuration of things.
  this.activated = + new Date();                      // Dancer creation time.
  this.prefix = options.prefix || 'dancer';           // Prefix for all events.
  this.encoder = options.encoder || parser.encoder;   // Message encoder.
  this.decoder = options.decocer || parser.decoder;   // Message decoder.

  if (options.master) this.master(options.master);
  if (options.slave) this.slave(options.slave);
  if (!options.manual) setTimeout(function gogogo() {
    selfie.go();
  });
}

Dancer.prototype = new EventEmitter();
Dancer.prototype.constructor = Dancer;
Dancer.prototype.emits = require('./emits');

/**
 * The different engines that we support for inter tab communication.
 *
 * @type {Array}
 * @private
 */
Dancer.prototype.engines = {
  sharedworker: require('./shared'),
  localstorage: require('./localstorage')
};

/**
 * 1. 2. 3. -- GO!
 *
 * @api private
 */
Dancer.prototype.go = function go() {
  var selfie = this;

  this.select(function selection(err, engine, master) {
    //
    // When things fail, always become master. It's better to have multiple
    // masters instead of non-receiving clients.
    //
    if (err) {
      selfie.emits('error', err);
      master = true;
    }

    selfie.engine = engine;
    engine.on('data', selfie.emits('data', function parser(str, fn) {
      selfie.decoder(str, fn);
    }));

    if (master) return selfie.emit('master', function write(msg) {
      selfie.encoder(msg, function encoder(err, str) {
        engine.write(str);
      });
    });

  }, this.options);

  return selfie;
};

/**
 * Destroy the dancer, nuke all the things and clean up everything.
 *
 * @api public
 */
Dancer.prototype.destroy = function destroy() {
  if (this.engine) this.engine.destroy();

  return this;
};

/**
 * Select an available engine. If no engine is available we automatically assume
 * we should be a master process so connections will be started in a normal way.
 *
 * @param {Function} fn Completion callback.
 * @param {Object} options Optional configuration.
 * @api private
 */
Dancer.prototype.select = function select(fn, options) {
  var selfie = this
    , engines = {}
    , keys = []
    , engine;

  for (engine in this.engines) {
    engines[engine] = new this.engines[engine](this, options);
    keys.push(engine);
  }

  (function filterate() {
    engine = keys.shift();
    if (!engine) return fn(new Error('Unable to find a suitable dance partner'), undefined, true);

    engines[engine].supported(function supported(yay) {
      if (yay) {
        selfie.transport = engine;
        return engines[engine].listen(fn);
      }

      filterate();
    });
  }());
};

/**
 * Function to execute when selected as master.
 *
 * @param {Function} fn Callback
 * @returns {Dancer}
 * @api public
 */
Dancer.prototype.master = function master(fn) {
  return this.once('master', fn);
};

/**
 * We've been selected as slave.
 *
 * @param {Function} fn Callback
 * @returns {Dancer}
 * @api public
 */
Dancer.prototype.slave = function slave(fn) {
  return this.once('slave', fn);
};

/**
 * The current master process has died, try to get consensus about a newly
 * selected master tab which will do all the orchestration.
 *
 * @api private
 */
Dancer.prototype.consensus = function consensus() {
  return this;
};

//
// Expose the tab dancer.
//
module.exports = Dancer;
