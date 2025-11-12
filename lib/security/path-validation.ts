/**
 * Path Validation Utilities
 * 
 * Provides secure path validation functions to prevent path traversal attacks
 * and other file system security vulnerabilities.
 */

import path from 'path';

/**
 * Validates that a filename is safe (no path traversal attempts)
 * Only allows alphanumeric characters, dots, dashes, and underscores
 * 
 * @param filename - The filename to validate
 * @returns true if filename is safe, false otherwise
 */
export function isValidFilename(filename: string): boolean {
  // Check for path traversal attempts
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false;
  }
  
  // Only allow safe characters: alphanumeric, dot, dash, underscore
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
    return false;
  }
  
  return true;
}

/**
 * Validates that a path segment is safe (no path traversal attempts)
 * 
 * @param segment - The path segment to validate
 * @returns true if segment is safe, false otherwise
 */
export function isValidPathSegment(segment: string): boolean {
  // Reject empty segments, dots, and path separators
  if (!segment || segment === '.' || segment === '..' || segment.includes('/') || segment.includes('\\')) {
    return false;
  }
  
  // Only allow alphanumeric, dots, dashes, underscores
  return /^[a-zA-Z0-9._-]+$/.test(segment);
}

/**
 * Ensures a resolved path is within the base directory
 * Prevents path traversal attacks
 * 
 * @param filePath - The file path to check
 * @param baseDir - The base directory that should contain the file
 * @returns true if filePath is within baseDir, false otherwise
 */
export function isPathWithinBase(filePath: string, baseDir: string): boolean {
  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(baseDir);
  
  // Check if resolved path starts with base directory
  return resolvedPath.startsWith(resolvedBase + path.sep) || resolvedPath === resolvedBase;
}

/**
 * Safely joins path segments with comprehensive validation
 * 
 * @param baseDir - The base directory
 * @param segments - Path segments to join
 * @returns The safe joined path, or null if validation fails
 */
export function safePathJoin(baseDir: string, segments: string[]): string | null {
  // Validate all segments
  if (!segments.every(isValidPathSegment)) {
    return null;
  }
  
  const target = path.resolve(baseDir, ...segments);
  
  // Ensure target is within base directory
  if (!isPathWithinBase(target, baseDir)) {
    return null;
  }
  
  return target;
}

/**
 * Escapes special characters in filenames for use in HTTP headers
 *
 * @param filename - The filename to escape
 * @returns The escaped filename
 */
export function escapeFilenameForHeader(filename: string): string {
  // SECURITY: Escape backslashes first, then quotes to prevent incomplete escaping
  return filename.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Validates a file extension
 * 
 * @param filename - The filename to check
 * @param allowedExtensions - Array of allowed extensions (e.g., ['.pdf', '.json'])
 * @returns true if extension is allowed, false otherwise
 */
export function hasAllowedExtension(filename: string, allowedExtensions: string[]): boolean {
  const ext = path.extname(filename).toLowerCase();
  return allowedExtensions.includes(ext);
}

