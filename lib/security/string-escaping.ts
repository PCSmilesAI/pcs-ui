/**
 * String Escaping Utilities
 * 
 * Provides functions to safely escape strings for different contexts
 * to prevent injection attacks (XSS, SQL injection, etc.)
 */

/**
 * Escapes HTML special characters to prevent XSS attacks
 * 
 * @param text - The text to escape
 * @returns The escaped text safe for HTML context
 */
export function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  
  return text.replace(/[&<>"']/g, (char) => map[char] || char);
}

/**
 * Escapes text for use in JavaScript strings
 * 
 * @param text - The text to escape
 * @returns The escaped text safe for JavaScript string context
 */
export function escapeJavaScript(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\x00/g, '\\0');
}

/**
 * Escapes text for use in URLs
 * 
 * @param text - The text to escape
 * @returns The escaped text safe for URL context
 */
export function escapeUrl(text: string): string {
  return encodeURIComponent(text);
}

/**
 * Escapes text for use in CSS
 * 
 * @param text - The text to escape
 * @returns The escaped text safe for CSS context
 */
export function escapeCss(text: string): string {
  return text.replace(/[^a-zA-Z0-9]/g, (char) => {
    const code = char.charCodeAt(0);
    return `\\${code.toString(16)} `;
  });
}

/**
 * Escapes text for use in SQL queries (basic escaping)
 * NOTE: Always use parameterized queries instead of string concatenation!
 * This is only for reference and should not be used in production.
 * 
 * @param text - The text to escape
 * @returns The escaped text
 */
export function escapeSql(text: string): string {
  return text.replace(/'/g, "''").replace(/\\/g, '\\\\');
}

/**
 * Removes potentially dangerous HTML tags and attributes
 * This is a basic implementation - use DOMPurify for production
 *
 * @param html - The HTML to sanitize
 * @returns The sanitized HTML
 */
export function sanitizeHtml(html: string): string {
  let sanitized = html;
  let previous: string;

  // Iteratively remove script tags and their content until no more replacements
  // SECURITY: Match script end tags with optional whitespace and attributes like </script foo="bar">
  do {
    previous = sanitized;
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script\b)<[^<]*)*<\/script\b[^>]*>/gi, '');
  } while (sanitized !== previous);

  // Iteratively remove event handlers until no more replacements
  do {
    previous = sanitized;
    sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  } while (sanitized !== previous);

  do {
    previous = sanitized;
    sanitized = sanitized.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '');
  } while (sanitized !== previous);

  // Iteratively remove iframe tags until no more replacements
  // SECURITY: Match iframe end tags with optional whitespace and attributes like </iframe foo="bar">
  do {
    previous = sanitized;
    sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe\b)<[^<]*)*<\/iframe\b[^>]*>/gi, '');
  } while (sanitized !== previous);

  // Iteratively remove object and embed tags until no more replacements
  // SECURITY: Match object/embed end tags with optional whitespace and attributes like </object foo="bar">
  do {
    previous = sanitized;
    sanitized = sanitized.replace(/<(object|embed)\b[^<]*(?:(?!<\/(object|embed)\b)<[^<]*)*<\/(object|embed)\b[^>]*>/gi, '');
  } while (sanitized !== previous);

  return sanitized;
}

/**
 * Validates that a string contains only safe characters
 * 
 * @param text - The text to validate
 * @param pattern - The regex pattern to match against (default: alphanumeric + common safe chars)
 * @returns true if text matches pattern, false otherwise
 */
export function isSafeString(text: string, pattern: RegExp = /^[a-zA-Z0-9._\-\s]*$/): boolean {
  return pattern.test(text);
}

/**
 * Removes null bytes and other control characters
 * 
 * @param text - The text to clean
 * @returns The cleaned text
 */
export function removeControlCharacters(text: string): string {
  return text.replace(/[\x00-\x1F\x7F]/g, '');
}

