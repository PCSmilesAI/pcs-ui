/**
 * Vendor Matching Utility
 * 
 * Provides fuzzy matching to map parsed vendor names to QBO vendor names.
 * Uses multiple strategies: exact match, contains, Levenshtein distance, word overlap.
 */

/**
 * Normalize a string for comparison: lowercase, remove punctuation, trim
 */
function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[.,\-_'"()]/g, ' ')  // Replace punctuation with space
    .replace(/\s+/g, ' ')          // Collapse multiple spaces
    .trim();
}

/**
 * Remove common business suffixes for comparison
 */
function removeSuffixes(str: string): string {
  const suffixes = [
    'llc', 'inc', 'corp', 'corporation', 'company', 'co',
    'ltd', 'limited', 'plc', 'lp', 'llp', 'pllc', 'pc',
    'usa', 'u.s.a', 'dental', 'supply', 'supplies', 'services'
  ];
  
  let normalized = normalize(str);
  
  // Remove suffixes from the end
  for (const suffix of suffixes) {
    const pattern = new RegExp(`\\s+${suffix}\\s*$`, 'i');
    normalized = normalized.replace(pattern, '');
  }
  
  return normalized.trim();
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Get words from a string (split by spaces)
 */
function getWords(str: string): string[] {
  return normalize(str).split(' ').filter(w => w.length > 0);
}

/**
 * Calculate word overlap score between two strings
 * Returns a score from 0 to 1
 */
function wordOverlapScore(a: string, b: string): number {
  const wordsA = new Set(getWords(a));
  const wordsB = new Set(getWords(b));
  
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  
  let overlap = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) overlap++;
  }
  
  // Return overlap as percentage of smaller set
  const minSize = Math.min(wordsA.size, wordsB.size);
  return overlap / minSize;
}

/**
 * Check if one string contains the other (normalized)
 */
function containsMatch(a: string, b: string): boolean {
  const normA = normalize(a);
  const normB = normalize(b);
  return normA.includes(normB) || normB.includes(normA);
}

/**
 * Match result with confidence score
 */
export interface VendorMatchResult {
  match: string | null;
  confidence: number;  // 0-1, higher is better
  method: 'exact' | 'exact_normalized' | 'suffix_removed' | 'contains' | 'word_overlap' | 'levenshtein' | 'none';
}

/**
 * Match a raw vendor name to a QBO vendor
 * 
 * @param rawVendor - The vendor name from the invoice
 * @param qboVendors - List of QBO vendor names
 * @returns The best matching QBO vendor name and confidence score
 */
export function matchVendorToQBO(rawVendor: string, qboVendors: string[]): VendorMatchResult {
  if (!rawVendor || rawVendor.trim().length === 0) {
    return { match: null, confidence: 0, method: 'none' };
  }

  const normalizedRaw = normalize(rawVendor);
  const strippedRaw = removeSuffixes(rawVendor);

  // 1. Exact match (case-sensitive)
  for (const qbo of qboVendors) {
    if (rawVendor === qbo) {
      return { match: qbo, confidence: 1.0, method: 'exact' };
    }
  }

  // 2. Exact match (case-insensitive, normalized)
  for (const qbo of qboVendors) {
    if (normalizedRaw === normalize(qbo)) {
      return { match: qbo, confidence: 0.98, method: 'exact_normalized' };
    }
  }

  // 3. Match after removing business suffixes
  for (const qbo of qboVendors) {
    const strippedQBO = removeSuffixes(qbo);
    if (strippedRaw === strippedQBO && strippedRaw.length > 3) {
      return { match: qbo, confidence: 0.95, method: 'suffix_removed' };
    }
  }

  // 4. Contains match (one contains the other)
  const containsMatches: { vendor: string; score: number }[] = [];
  for (const qbo of qboVendors) {
    if (containsMatch(rawVendor, qbo)) {
      // Prefer longer matches
      const normQBO = normalize(qbo);
      const score = Math.min(normalizedRaw.length, normQBO.length) / Math.max(normalizedRaw.length, normQBO.length);
      containsMatches.push({ vendor: qbo, score });
    }
  }
  if (containsMatches.length > 0) {
    // Return the best contains match
    containsMatches.sort((a, b) => b.score - a.score);
    return { match: containsMatches[0].vendor, confidence: 0.85 * containsMatches[0].score, method: 'contains' };
  }

  // 5. Word overlap (at least 70% word overlap)
  let bestWordOverlap: { vendor: string; score: number } | null = null;
  for (const qbo of qboVendors) {
    const score = wordOverlapScore(rawVendor, qbo);
    if (score >= 0.7 && (!bestWordOverlap || score > bestWordOverlap.score)) {
      bestWordOverlap = { vendor: qbo, score };
    }
  }
  if (bestWordOverlap) {
    return { match: bestWordOverlap.vendor, confidence: 0.75 * bestWordOverlap.score, method: 'word_overlap' };
  }

  // 6. Levenshtein distance (for short strings, allow small edits)
  if (normalizedRaw.length <= 20) {
    let bestLevenshtein: { vendor: string; distance: number } | null = null;
    for (const qbo of qboVendors) {
      const normQBO = normalize(qbo);
      const distance = levenshteinDistance(normalizedRaw, normQBO);
      const maxAllowed = Math.min(3, Math.floor(normalizedRaw.length * 0.2));
      if (distance <= maxAllowed && (!bestLevenshtein || distance < bestLevenshtein.distance)) {
        bestLevenshtein = { vendor: qbo, distance };
      }
    }
    if (bestLevenshtein) {
      const confidence = 1 - (bestLevenshtein.distance / Math.max(normalizedRaw.length, 1));
      return { match: bestLevenshtein.vendor, confidence: 0.6 * confidence, method: 'levenshtein' };
    }
  }

  // No match found
  return { match: null, confidence: 0, method: 'none' };
}

/**
 * Search through all text content for any QBO vendor name
 * Used as a fallback when the parsed vendor name doesn't match
 * 
 * @param fullText - All OCR text from the invoice
 * @param qboVendors - List of QBO vendor names
 * @returns The best matching QBO vendor found in the text
 */
export function findVendorInText(fullText: string, qboVendors: string[]): VendorMatchResult {
  if (!fullText || fullText.trim().length === 0) {
    return { match: null, confidence: 0, method: 'none' };
  }

  const normalizedText = normalize(fullText);
  
  // Sort vendors by length (longer first) to prefer more specific matches
  const sortedVendors = [...qboVendors].sort((a, b) => b.length - a.length);
  
  // Look for exact vendor names in the text
  for (const qbo of sortedVendors) {
    const normalizedQBO = normalize(qbo);
    if (normalizedQBO.length >= 4 && normalizedText.includes(normalizedQBO)) {
      // Calculate confidence based on how specific the match is
      const confidence = Math.min(0.8, 0.5 + (normalizedQBO.length / 30));
      return { match: qbo, confidence, method: 'contains' };
    }
  }

  // Look for vendor names without suffixes
  for (const qbo of sortedVendors) {
    const strippedQBO = removeSuffixes(qbo);
    if (strippedQBO.length >= 4 && normalizedText.includes(strippedQBO)) {
      const confidence = Math.min(0.7, 0.4 + (strippedQBO.length / 30));
      return { match: qbo, confidence, method: 'suffix_removed' };
    }
  }

  return { match: null, confidence: 0, method: 'none' };
}

/**
 * Best-effort vendor matching with multiple fallback strategies
 * 
 * @param rawVendor - The vendor name from GPT parsing
 * @param fullText - All OCR text from the invoice (optional fallback)
 * @param qboVendors - List of QBO vendor names
 * @returns The best matching vendor name or 'Unknown'
 */
export function resolveVendor(
  rawVendor: string,
  fullText: string | null,
  qboVendors: string[]
): { vendor: string; confidence: number; method: string } {
  // First try to match the parsed vendor name
  const directMatch = matchVendorToQBO(rawVendor, qboVendors);
  
  if (directMatch.match && directMatch.confidence >= 0.5) {
    return {
      vendor: directMatch.match,
      confidence: directMatch.confidence,
      method: `direct_${directMatch.method}`
    };
  }

  // Fallback: search all OCR text for vendor names
  if (fullText) {
    const textMatch = findVendorInText(fullText, qboVendors);
    if (textMatch.match && textMatch.confidence >= 0.4) {
      return {
        vendor: textMatch.match,
        confidence: textMatch.confidence,
        method: `text_search_${textMatch.method}`
      };
    }
  }

  // No match found - return Unknown
  return {
    vendor: 'Unknown',
    confidence: 0,
    method: 'no_match'
  };
}

/**
 * Get all QBO vendors that could potentially match a given vendor name
 * Useful for showing suggestions to users
 */
export function getSuggestedVendors(rawVendor: string, qboVendors: string[], limit: number = 5): string[] {
  const normalizedRaw = normalize(rawVendor);
  
  const scored = qboVendors.map(qbo => {
    const normalizedQBO = normalize(qbo);
    
    // Calculate a combined score
    let score = 0;
    
    // Exact normalized match
    if (normalizedRaw === normalizedQBO) score += 100;
    
    // Contains match
    if (containsMatch(rawVendor, qbo)) score += 50;
    
    // Word overlap
    score += wordOverlapScore(rawVendor, qbo) * 30;
    
    // Levenshtein (inverse)
    const distance = levenshteinDistance(normalizedRaw, normalizedQBO);
    if (distance < 10) score += (10 - distance) * 2;
    
    return { vendor: qbo, score };
  });
  
  return scored
    .filter(s => s.score > 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.vendor);
}
