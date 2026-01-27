/**
 * Date Utilities Module
 * 
 * Centralizes all date parsing and formatting operations.
 * Standard format: MM/DD/YYYY
 */

/**
 * Parse any common date format and return a Date object
 * Handles: YYYY-MM-DD, MM/DD/YYYY, M/D/YYYY, MM-DD-YYYY, ISO strings
 * 
 * @param dateInput - Date string in various formats
 * @returns Date object or null if parsing fails
 */
export function parseAnyDate(dateInput: string | null | undefined): Date | null {
  if (!dateInput || typeof dateInput !== 'string') {
    return null;
  }

  const trimmed = dateInput.trim();
  if (!trimmed) {
    return null;
  }

  // Try various date patterns
  let date: Date | null = null;

  // Pattern 1: YYYY-MM-DD (ISO format)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  // Pattern 2: MM/DD/YYYY or M/D/YYYY
  if (!date) {
    const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (usMatch) {
      const [, month, day, year] = usMatch;
      date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
  }

  // Pattern 3: MM-DD-YYYY or M-D-YYYY
  if (!date) {
    const dashMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (dashMatch) {
      const [, month, day, year] = dashMatch;
      date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
  }

  // Pattern 4: Month DD, YYYY (e.g., "January 15, 2025" or "Jan 15, 2025")
  if (!date) {
    const monthNames = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'
    ];
    const monthAbbrev = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    
    const textMatch = trimmed.match(/^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/i);
    if (textMatch) {
      const [, monthStr, day, year] = textMatch;
      const monthLower = monthStr.toLowerCase();
      let monthIndex = monthNames.indexOf(monthLower);
      if (monthIndex === -1) {
        monthIndex = monthAbbrev.indexOf(monthLower.substring(0, 3));
      }
      if (monthIndex !== -1) {
        date = new Date(parseInt(year), monthIndex, parseInt(day));
      }
    }
  }

  // Pattern 5: ISO string with time (e.g., "2025-01-15T00:00:00.000Z")
  if (!date) {
    const isoFullMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T/);
    if (isoFullMatch) {
      const [, year, month, day] = isoFullMatch;
      date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
  }

  // Validate the parsed date
  if (date && !isNaN(date.getTime())) {
    return date;
  }

  return null;
}

/**
 * Normalize any date format to MM/DD/YYYY
 * This is the standard output format for all dates in the system.
 * 
 * @param dateInput - Date string in any supported format
 * @returns Date in MM/DD/YYYY format, or null if parsing fails
 */
export function toMMDDYYYY(dateInput: string | null | undefined): string | null {
  const date = parseAnyDate(dateInput);
  if (!date) {
    return null;
  }

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();

  return `${month}/${day}/${year}`;
}

/**
 * Convert any date format to YYYY-MM-DD (ISO format)
 * Useful for database storage and sorting.
 * 
 * @param dateInput - Date string in any supported format
 * @returns Date in YYYY-MM-DD format, or null if parsing fails
 */
export function toYYYYMMDD(dateInput: string | null | undefined): string | null {
  const date = parseAnyDate(dateInput);
  if (!date) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Check if a string is already in MM/DD/YYYY format
 * 
 * @param dateInput - Date string to check
 * @returns true if already in MM/DD/YYYY format
 */
export function isMMDDYYYY(dateInput: string | null | undefined): boolean {
  if (!dateInput || typeof dateInput !== 'string') {
    return false;
  }
  return /^\d{2}\/\d{2}\/\d{4}$/.test(dateInput.trim());
}

/**
 * Check if a string is in YYYY-MM-DD format
 * 
 * @param dateInput - Date string to check
 * @returns true if in YYYY-MM-DD format
 */
export function isYYYYMMDD(dateInput: string | null | undefined): boolean {
  if (!dateInput || typeof dateInput !== 'string') {
    return false;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim());
}

/**
 * Normalize date for API response
 * Ensures the date is in MM/DD/YYYY format for frontend consumption.
 * 
 * @param dateInput - Date string from database or parsing
 * @returns Normalized date string or original input if already valid or null
 */
export function normalizeDateForOutput(dateInput: string | null | undefined): string | null {
  if (!dateInput) {
    return null;
  }

  // If already in MM/DD/YYYY format, return as-is
  if (isMMDDYYYY(dateInput)) {
    return dateInput;
  }

  // Convert to MM/DD/YYYY
  return toMMDDYYYY(dateInput);
}

/**
 * Normalize date for database storage
 * Converts any format to MM/DD/YYYY for consistent storage.
 * 
 * @param dateInput - Date string from GPT or user input
 * @returns Normalized date string in MM/DD/YYYY format
 */
export function normalizeDateForStorage(dateInput: string | null | undefined): string | null {
  if (!dateInput) {
    return null;
  }

  // Convert to MM/DD/YYYY (standard storage format per requirements)
  return toMMDDYYYY(dateInput);
}

/**
 * Batch normalize dates in an object
 * Useful for normalizing invoice objects with multiple date fields.
 * 
 * @param obj - Object containing date fields
 * @param dateFields - Array of field names to normalize
 * @returns Object with normalized date fields
 */
export function normalizeDatesInObject<T extends Record<string, unknown>>(
  obj: T,
  dateFields: string[] = ['invoice_date', 'due_date']
): T {
  const result = { ...obj };
  
  for (const field of dateFields) {
    if (field in result && typeof result[field] === 'string') {
      (result as Record<string, unknown>)[field] = normalizeDateForStorage(result[field] as string);
    }
  }
  
  return result;
}
