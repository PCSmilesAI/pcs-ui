/**
 * Centralized Structured Logger
 * 
 * Provides structured logging with correlation IDs for request tracing.
 * All logs include:
 * - timestamp
 * - level (info, warn, error)
 * - correlation_id (for tracing across services)
 * - module (where the log came from)
 * - message
 * - context (additional data)
 */

import { randomUUID } from 'crypto';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  correlation_id: string;
  module: string;
  message: string;
  context?: Record<string, any>;
}

// Thread-local correlation ID (simulated with global for Node.js)
let currentCorrelationId: string = randomUUID();

/**
 * Set correlation ID for current request
 */
export function setCorrelationId(id: string): void {
  currentCorrelationId = id;
}

/**
 * Get current correlation ID
 */
export function getCorrelationId(): string {
  return currentCorrelationId;
}

/**
 * Generate new correlation ID
 */
export function generateCorrelationId(): string {
  currentCorrelationId = randomUUID();
  return currentCorrelationId;
}

/**
 * Create a logger for a specific module
 */
export function createLogger(moduleName: string) {
  return {
    info: (message: string, context?: Record<string, any>) => {
      logEntry('info', moduleName, message, context);
    },
    warn: (message: string, context?: Record<string, any>) => {
      logEntry('warn', moduleName, message, context);
    },
    error: (message: string, context?: Record<string, any>) => {
      logEntry('error', moduleName, message, context);
    },
    debug: (message: string, context?: Record<string, any>) => {
      logEntry('debug', moduleName, message, context);
    },
  };
}

/**
 * Internal log entry function
 */
function logEntry(
  level: LogLevel,
  module: string,
  message: string,
  context?: Record<string, any>
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    correlation_id: currentCorrelationId,
    module,
    message,
    context,
  };

  // Output as JSON for structured logging
  const output = JSON.stringify(entry);

  // Use appropriate console method
  switch (level) {
    case 'error':
      console.error(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    case 'debug':
      console.debug(output);
      break;
    case 'info':
    default:
      console.log(output);
  }
}

/**
 * Log an API request
 */
export function logRequest(
  method: string,
  path: string,
  context?: Record<string, any>
): void {
  const logger = createLogger('api');
  logger.info(`${method} ${path}`, {
    method,
    path,
    ...context,
  });
}

/**
 * Log an API response
 */
export function logResponse(
  method: string,
  path: string,
  statusCode: number,
  durationMs: number,
  context?: Record<string, any>
): void {
  const logger = createLogger('api');
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
  logger[level](`${method} ${path} ${statusCode}`, {
    method,
    path,
    status_code: statusCode,
    duration_ms: durationMs,
    ...context,
  });
}

/**
 * Log a database operation
 */
export function logDatabase(
  operation: string,
  table: string,
  durationMs: number,
  context?: Record<string, any>
): void {
  const logger = createLogger('database');
  logger.info(`${operation} ${table}`, {
    operation,
    table,
    duration_ms: durationMs,
    ...context,
  });
}

/**
 * Log a state transition
 */
export function logStateTransition(
  invoiceId: string,
  fromState: string,
  toState: string,
  actor: string,
  context?: Record<string, any>
): void {
  const logger = createLogger('state_machine');
  logger.info(`transition ${fromState} -> ${toState}`, {
    invoice_id: invoiceId,
    from_state: fromState,
    to_state: toState,
    actor,
    ...context,
  });
}

/**
 * Log an authorization check
 */
export function logAuthz(
  action: string,
  actor: string,
  allowed: boolean,
  context?: Record<string, any>
): void {
  const logger = createLogger('authz');
  const level = allowed ? 'info' : 'warn';
  logger[level](`${allowed ? 'allowed' : 'denied'} ${action}`, {
    action,
    actor,
    allowed,
    ...context,
  });
}

/**
 * Log an external service call
 */
export function logExternalService(
  service: string,
  operation: string,
  statusCode: number,
  durationMs: number,
  context?: Record<string, any>
): void {
  const logger = createLogger('external_service');
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
  logger[level](`${service} ${operation} ${statusCode}`, {
    service,
    operation,
    status_code: statusCode,
    duration_ms: durationMs,
    ...context,
  });
}

// Export default logger
export const logger = createLogger('app');

