/**
 * Error Handling Utilities
 * 
 * Provides functions to safely handle and sanitize errors
 * to prevent information disclosure vulnerabilities
 */

import crypto from 'crypto';

/**
 * Generates a unique error ID for tracking
 */
export function generateErrorId(): string {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Sanitizes error messages to prevent information disclosure
 * Removes stack traces and sensitive details
 * 
 * @param error - The error to sanitize
 * @param isDevelopment - Whether to include more details (for development only)
 * @returns A safe error message
 */
export function sanitizeErrorMessage(error: unknown, isDevelopment: boolean = false): string {
  if (!isDevelopment) {
    // In production, return generic message
    return 'An unexpected error occurred';
  }

  // In development, return more details
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown error';
}

/**
 * Creates a safe error response object
 * 
 * @param error - The error to respond with
 * @param statusCode - HTTP status code
 * @param isDevelopment - Whether to include development details
 * @returns A safe error response object
 */
export function createErrorResponse(
  error: unknown,
  statusCode: number = 500,
  isDevelopment: boolean = false
): {
  ok: false;
  error: string;
  errorId: string;
  timestamp: string;
  ...(isDevelopment ? { details?: string } : {});
} {
  const errorId = generateErrorId();
  const timestamp = new Date().toISOString();

  const response: any = {
    ok: false,
    error: sanitizeErrorMessage(error, isDevelopment),
    errorId,
    timestamp,
  };

  // Only include details in development
  if (isDevelopment && error instanceof Error) {
    response.details = error.message;
  }

  return response;
}

/**
 * Logs error with full details (server-side only)
 * 
 * @param error - The error to log
 * @param context - Additional context information
 * @param errorId - The error ID for tracking
 */
export function logError(
  error: unknown,
  context: Record<string, any> = {},
  errorId: string = generateErrorId()
): void {
  const timestamp = new Date().toISOString();

  console.error(`[ERROR][${errorId}] ${timestamp}`, {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    context,
  });
}

/**
 * Validates that an error is safe to return to client
 * 
 * @param error - The error to validate
 * @returns true if error is safe to return, false otherwise
 */
export function isSafeErrorMessage(error: unknown): boolean {
  if (typeof error !== 'string') {
    return false;
  }

  // Check for sensitive patterns
  const sensitivePatterns = [
    /stack\s*trace/i,
    /at\s+\w+\s*\(/,
    /\/[a-z0-9_-]+\/[a-z0-9_-]+\.(js|ts)/i,
    /node_modules/i,
    /process\.env/i,
    /password|secret|token|key|credential/i,
  ];

  return !sensitivePatterns.some((pattern) => pattern.test(error));
}

/**
 * Extracts safe error information from an error object
 * 
 * @param error - The error to extract from
 * @returns Safe error information
 */
export function extractSafeErrorInfo(error: unknown): {
  message: string;
  code?: string;
  statusCode?: number;
} {
  if (error instanceof Error) {
    return {
      message: error.message,
      code: (error as any).code,
      statusCode: (error as any).statusCode,
    };
  }

  if (typeof error === 'object' && error !== null) {
    const obj = error as any;
    return {
      message: obj.message || String(error),
      code: obj.code,
      statusCode: obj.statusCode,
    };
  }

  return {
    message: String(error),
  };
}

/**
 * Wraps an async function with error handling
 * 
 * @param fn - The async function to wrap
 * @param errorHandler - Optional custom error handler
 * @returns The wrapped function
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  errorHandler?: (error: unknown) => any
): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (errorHandler) {
        return errorHandler(error);
      }
      throw error;
    }
  }) as T;
}

