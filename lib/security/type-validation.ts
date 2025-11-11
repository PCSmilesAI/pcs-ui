/**
 * Type Validation Utilities
 * 
 * Provides functions to validate and sanitize types to prevent
 * type confusion attacks and parameter tampering
 */

/**
 * Validates that a value is a string
 * 
 * @param value - The value to validate
 * @returns true if value is a string, false otherwise
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Validates that a value is a number
 * 
 * @param value - The value to validate
 * @returns true if value is a number, false otherwise
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

/**
 * Validates that a value is an integer
 * 
 * @param value - The value to validate
 * @returns true if value is an integer, false otherwise
 */
export function isInteger(value: unknown): value is number {
  return Number.isInteger(value);
}

/**
 * Validates that a value is a positive integer
 * 
 * @param value - The value to validate
 * @returns true if value is a positive integer, false otherwise
 */
export function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

/**
 * Validates that a value is a boolean
 * 
 * @param value - The value to validate
 * @returns true if value is a boolean, false otherwise
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Validates that a value is an object
 * 
 * @param value - The value to validate
 * @returns true if value is an object, false otherwise
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validates that a value is an array
 * 
 * @param value - The value to validate
 * @returns true if value is an array, false otherwise
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Validates that a string matches a specific pattern
 * 
 * @param value - The value to validate
 * @param pattern - The regex pattern to match
 * @returns true if value matches pattern, false otherwise
 */
export function matchesPattern(value: unknown, pattern: RegExp): boolean {
  return isString(value) && pattern.test(value);
}

/**
 * Validates that a string is a valid email
 * 
 * @param value - The value to validate
 * @returns true if value is a valid email, false otherwise
 */
export function isValidEmail(value: unknown): boolean {
  if (!isString(value)) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
}

/**
 * Validates that a string is a valid UUID
 * 
 * @param value - The value to validate
 * @returns true if value is a valid UUID, false otherwise
 */
export function isValidUuid(value: unknown): boolean {
  if (!isString(value)) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Validates that a string is a valid URL
 * 
 * @param value - The value to validate
 * @returns true if value is a valid URL, false otherwise
 */
export function isValidUrl(value: unknown): boolean {
  if (!isString(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates that a value is within a specific range
 * 
 * @param value - The value to validate
 * @param min - The minimum value (inclusive)
 * @param max - The maximum value (inclusive)
 * @returns true if value is within range, false otherwise
 */
export function isInRange(value: unknown, min: number, max: number): boolean {
  return isNumber(value) && value >= min && value <= max;
}

/**
 * Validates that a string has a specific length
 * 
 * @param value - The value to validate
 * @param minLength - The minimum length (inclusive)
 * @param maxLength - The maximum length (inclusive)
 * @returns true if string length is valid, false otherwise
 */
export function hasValidLength(value: unknown, minLength: number, maxLength: number): boolean {
  return isString(value) && value.length >= minLength && value.length <= maxLength;
}

/**
 * Safely converts a value to a string
 * 
 * @param value - The value to convert
 * @returns The string representation of the value
 */
export function toSafeString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (isString(value)) {
    return value;
  }
  if (isNumber(value) || isBoolean(value)) {
    return String(value);
  }
  if (isArray(value) || isObject(value)) {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Safely converts a value to a number
 * 
 * @param value - The value to convert
 * @param defaultValue - The default value if conversion fails
 * @returns The number representation of the value, or defaultValue
 */
export function toSafeNumber(value: unknown, defaultValue: number = 0): number {
  const num = Number(value);
  return isNumber(num) ? num : defaultValue;
}

/**
 * Safely converts a value to an integer
 *
 * @param value - The value to convert
 * @param defaultValue - The default value if conversion fails
 * @returns The integer representation of the value, or defaultValue
 */
export function toSafeInteger(value: unknown, defaultValue: number = 0): number {
  const num = toSafeNumber(value, defaultValue);
  return Math.floor(num);
}

/**
 * Validates that a value is a valid invoice ID
 * Invoice IDs can be UUIDs or numeric invoice numbers
 *
 * @param value - The value to validate
 * @returns true if value is a valid invoice ID, false otherwise
 */
export function isValidInvoiceId(value: unknown): boolean {
  if (!isString(value)) return false;
  // Allow UUIDs or numeric invoice numbers (1-20 digits)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const numericRegex = /^\d{1,20}$/;
  return uuidRegex.test(value) || numericRegex.test(value);
}

