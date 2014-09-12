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
