'use strict';

const path = require('path');
const escapeRegExp = require('lodash.escaperegexp');

class Log {
  constructor() {
    this._sanitize = false;
    const sensitivePath = path.join(__dirname, '..');
    const pathFragments = sensitivePath.split(path.sep);
    const escapedPathFragments = pathFragments.map(escapeRegExp);
    this._sanitizationRegex = new RegExp(escapedPathFragments.join('(\\\\|\\/)'), 'g');
  }

  get sanitize() {
    return this._sanitize;
  }

  set sanitize(shouldSanitize) {
    this._sanitize = shouldSanitize;
  }

  log(...args) {
    this._log('LOG', args);
  }

  warn(...args) {
    this._log('WARN', args);
  }

  error(...args) {
    this._log('ERROR', args);
  }

  _log(type, args) {
    let message = `[${type}] ${args.join(', ')}`;
    if (this._sanitize) {
      message = message.replace(this._sanitizationRegex, '.');
    }
    console.log(message);
  }
}

module.exports = new Log();
