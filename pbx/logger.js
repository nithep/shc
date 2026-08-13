'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Structured Logger for Hotel ECS Project.
 * outputs JSON logs to stdout and optionally to a file.
 */
class StructuredLogger {
  constructor(options = {}) {
    this.serviceName = options.serviceName || 'hotel-ecs';
    this.logFile = options.logFile || null;
    this.logLevel = options.logLevel || 'info'; // debug, info, warn, error
  }

  _shouldLog(level) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    const current = levels[this.logLevel] !== undefined ? levels[this.logLevel] : 1;
    const target = levels[level] !== undefined ? levels[level] : 1;
    return target >= current;
  }

  _format(level, msg, context = {}) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      service: this.serviceName,
      message: msg,
      trace_id: context.traceId || context.trace_id || null,
      room_no: context.roomNo || context.room_no || null,
      command_type: context.commandType || context.command_type || null,
      agent_id: context.agentId || context.agent_id || null,
      ...context,
    });
  }

  _log(level, msg, context = {}) {
    if (!this._shouldLog(level)) return;

    const formatted = this._format(level, msg, context);
    console.log(formatted);

    if (this.logFile) {
      try {
        fs.appendFileSync(this.logFile, formatted + '\n', 'utf8');
      } catch (err) {
        // Fallback if writing fails
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'ERROR',
          message: 'Failed to write to log file: ' + err.message,
        }));
      }
    }
  }

  debug(msg, context) {
    this._log('debug', msg, context);
  }

  info(msg, context) {
    this._log('info', msg, context);
  }

  warn(msg, context) {
    this._log('warn', msg, context);
  }

  error(msg, context) {
    this._log('error', msg, context);
  }
}

// Global logger instance
const logger = new StructuredLogger({
  serviceName: 'pbx-connector',
  logFile: path.join(__dirname, '..', 'backend', 'structured.log'),
  logLevel: process.env.LOG_LEVEL || 'info',
});

module.exports = {
  StructuredLogger,
  logger,
};
