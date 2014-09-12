!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.TabDancer=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

var slice = Array.prototype.slice;

/**
 * Emit will return a function that will emit the given event.
 *
 * @param {String} event Name of the event you wish to emit.
 * @returns {Function} A function that emits.
 * @api private
 */
module.exports = function emits() {
  var args = slice.call(arguments, 0)
    , self = this
    , parser;

  //
  // Assume that if the last given argument is a function, it would be
  // a parser.
  //
  if ('function' === typeof args[args.length - 1]) {
    parser = args.pop();
  }

  return function emit(arg) {
    if (parser) {
      arg = parser.apply(self, arguments);
      if (arg === emits) return false;
    } else {
      arg = slice.call(arguments, 0);
    }

    return self.emit.apply(self, args.concat(arg));
  };
};

},{}],2:[function(require,module,exports){
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

  this.activated = + new Date();                      // Creation time.
  this.isMaster = false;                              // Are we the master process.
  this.isClient = false;                              // Are we the client process.
  this.prefix = options.prefix || 'dancer';           // Prefix for all events.
  this.encoder = options.encoder || parser.encoder;   // Message encoder.
  this.decoder = options.decocer || parser.decoder;   // Message decoder.

  if (options.master) this.master(options.master);
  if (options.slave) this.slave(options.slave);
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
 * Select an available engine. If no engine is available we automatically assume
 * we should be a master process so connections will be started in a normal way.
 *
 * @param {Function} fn Completion callback.
 * @param {Object} options Optional configuration.
 * @api private
 */
Dancer.prototype.select = function select(fn, options) {
  var engines = {}
    , keys = []
    , engine;

  for (engine in this.engines) {
    engines[engine] = new this.engines[engine](this, options);
    keys.push(engine);
  }

  (function filterate() {
    engine = keys.shift();
    if (!engine) return fn(new Error('Unable to find a suitable dance partner'));

    engines[engine].supported(function supported(yay) {
      if (yay) return engines[engine].listen(fn);
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

};

//
// Expose the tab dancer.
//
module.exports = Dancer;

},{"./emits":1,"./json":3,"./localstorage":4,"./shared":8,"async-series":5,"eventemitter3":7}],3:[function(require,module,exports){
'use strict';

/**
 * Message encoder.
 *
 * @param {Mixed} data The data that needs to be transformed into a string.
 * @param {Function} fn Completion callback.
 * @api public
 */
exports.encoder = function encoder(data, fn) {
  var err;

  try { data = JSON.stringify(data); }
  catch (e) { err = e; }

  fn(err, data);
};

/**
 * Message decoder.
 *
 * @param {Mixed} data The data that needs to be parsed from a string.
 * @param {Function} fn Completion callback.
 * @api public
 */
exports.decoder = function decoder(data, fn) {
  var err;

  if ('string' !== typeof data) return fn(err, data);

  try { data = JSON.parse(data); }
  catch (e) { err = e; }

  fn(err, data);
};

},{}],4:[function(require,module,exports){
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

},{"./emits":1,"eventemitter3":7}],5:[function(require,module,exports){
(function (process){
var nextTick = 'undefined' !== typeof process
  ? process.nextTick
  : 'undefined' !== typeof setImmediate
  ? setImmediate
  : setTimeout

function series(arr, ready, safe) {
  var length = arr.length
    , orig

  if (!length) return nextTick(ready, 1)

  function handleItem(idx) {
    arr[idx](function(err) {
      if (err) return ready(err)
      if (idx < length - 1) return handleItem(idx + 1)
      return ready()
    })
  }

  if (safe) {
    orig = handleItem
    handleItem = function(idx) {
      nextTick(function() {
        orig(idx)
      }, 1)
    }
  }

  handleItem(0)
}

module.exports = series

}).call(this,require('_process'))
},{"_process":6}],6:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],7:[function(require,module,exports){
'use strict';

/**
 * Representation of a single EventEmitter function.
 *
 * @param {Function} fn Event handler to be called.
 * @param {Mixed} context Context for function execution.
 * @param {Boolean} once Only emit once
 * @api private
 */
function EE(fn, context, once) {
  this.fn = fn;
  this.context = context;
  this.once = once || false;
}

/**
 * Minimal EventEmitter interface that is molded against the Node.js
 * EventEmitter interface.
 *
 * @constructor
 * @api public
 */
function EventEmitter() { /* Nothing to set */ }

/**
 * Holds the assigned EventEmitters by name.
 *
 * @type {Object}
 * @private
 */
EventEmitter.prototype._events = undefined;

/**
 * Return a list of assigned event listeners.
 *
 * @param {String} event The events that should be listed.
 * @returns {Array}
 * @api public
 */
EventEmitter.prototype.listeners = function listeners(event) {
  if (!this._events || !this._events[event]) return [];

  for (var i = 0, l = this._events[event].length, ee = []; i < l; i++) {
    ee.push(this._events[event][i].fn);
  }

  return ee;
};

/**
 * Emit an event to all registered event listeners.
 *
 * @param {String} event The name of the event.
 * @returns {Boolean} Indication if we've emitted an event.
 * @api public
 */
EventEmitter.prototype.emit = function emit(event, a1, a2, a3, a4, a5) {
  if (!this._events || !this._events[event]) return false;

  var listeners = this._events[event]
    , length = listeners.length
    , len = arguments.length
    , ee = listeners[0]
    , args
    , i, j;

  if (1 === length) {
    if (ee.once) this.removeListener(event, ee.fn, true);

    switch (len) {
      case 1: return ee.fn.call(ee.context), true;
      case 2: return ee.fn.call(ee.context, a1), true;
      case 3: return ee.fn.call(ee.context, a1, a2), true;
      case 4: return ee.fn.call(ee.context, a1, a2, a3), true;
      case 5: return ee.fn.call(ee.context, a1, a2, a3, a4), true;
      case 6: return ee.fn.call(ee.context, a1, a2, a3, a4, a5), true;
    }

    for (i = 1, args = new Array(len -1); i < len; i++) {
      args[i - 1] = arguments[i];
    }

    ee.fn.apply(ee.context, args);
  } else {
    for (i = 0; i < length; i++) {
      if (listeners[i].once) this.removeListener(event, listeners[i].fn, true);

      switch (len) {
        case 1: listeners[i].fn.call(listeners[i].context); break;
        case 2: listeners[i].fn.call(listeners[i].context, a1); break;
        case 3: listeners[i].fn.call(listeners[i].context, a1, a2); break;
        default:
          if (!args) for (j = 1, args = new Array(len -1); j < len; j++) {
            args[j - 1] = arguments[j];
          }

          listeners[i].fn.apply(listeners[i].context, args);
      }
    }
  }

  return true;
};

/**
 * Register a new EventListener for the given event.
 *
 * @param {String} event Name of the event.
 * @param {Functon} fn Callback function.
 * @param {Mixed} context The context of the function.
 * @api public
 */
EventEmitter.prototype.on = function on(event, fn, context) {
  if (!this._events) this._events = {};
  if (!this._events[event]) this._events[event] = [];
  this._events[event].push(new EE( fn, context || this ));

  return this;
};

/**
 * Add an EventListener that's only called once.
 *
 * @param {String} event Name of the event.
 * @param {Function} fn Callback function.
 * @param {Mixed} context The context of the function.
 * @api public
 */
EventEmitter.prototype.once = function once(event, fn, context) {
  if (!this._events) this._events = {};
  if (!this._events[event]) this._events[event] = [];
  this._events[event].push(new EE(fn, context || this, true ));

  return this;
};

/**
 * Remove event listeners.
 *
 * @param {String} event The event we want to remove.
 * @param {Function} fn The listener that we need to find.
 * @param {Boolean} once Only remove once listeners.
 * @api public
 */
EventEmitter.prototype.removeListener = function removeListener(event, fn, once) {
  if (!this._events || !this._events[event]) return this;

  var listeners = this._events[event]
    , events = [];

  if (fn) for (var i = 0, length = listeners.length; i < length; i++) {
    if (listeners[i].fn !== fn && listeners[i].once !== once) {
      events.push(listeners[i]);
    }
  }

  //
  // Reset the array, or remove it completely if we have no more listeners.
  //
  if (events.length) this._events[event] = events;
  else this._events[event] = null;

  return this;
};

/**
 * Remove all listeners or only the listeners for the specified event.
 *
 * @param {String} event The event want to remove all listeners for.
 * @api public
 */
EventEmitter.prototype.removeAllListeners = function removeAllListeners(event) {
  if (!this._events) return this;

  if (event) this._events[event] = null;
  else this._events = {};

  return this;
};

//
// Alias methods names because people roll like that.
//
EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
EventEmitter.prototype.addListener = EventEmitter.prototype.on;

//
// This function doesn't apply anymore.
//
EventEmitter.prototype.setMaxListeners = function setMaxListeners() {
  return this;
};

//
// Expose the module.
//
EventEmitter.EventEmitter = EventEmitter;
EventEmitter.EventEmitter2 = EventEmitter;
EventEmitter.EventEmitter3 = EventEmitter;

if ('object' === typeof module && module.exports) {
  module.exports = EventEmitter;
}

},{}],8:[function(require,module,exports){
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
  if (this.worker) this.worker.terminate();
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
    selfie.destroy();
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

},{"./emits":1,"eventemitter3":7}]},{},[2])(2)
});