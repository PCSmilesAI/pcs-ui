import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface HistoricalInvoice {
  id: string;
  invoice_number: string | null;
  added_at: string;
  was_corrected: boolean;
  images: string[]; // base64 encoded images
  parsed_data: {
    invoice_number: string | null;
    invoice_date: string | null;
    due_date: string | null;
    vendor_name: string | null;
    total: number | null;
    office_location: string | null;
    line_items: Array<{
      description: string;
      quantity: number | null;
      unit_price: number | null;
      amount: number | null;
    }>;
  };
}

export interface VendorHistory {
  vendor_name: string;
  last_updated: string;
  entries: HistoricalInvoice[];
}

// ============================================================================
// Configuration
// ============================================================================

// Directory where vendor history files are stored
const HISTORY_DIR = path.join(process.cwd(), 'vendor_history');

// Maximum number of examples to include in parsing context
export const MAX_HISTORY_EXAMPLES = 5;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize vendor name to a safe filename
 */
function normalizeVendorName(vendorName: string): string {
  return vendorName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Get the path to a vendor's history file
 */
function getVendorHistoryPath(vendorName: string): string {
  const normalized = normalizeVendorName(vendorName);
  return path.join(HISTORY_DIR, `${normalized}.json`);
}

/**
 * Ensure the history directory exists
 */
function ensureHistoryDir(): void {
  if (!fs.existsSync(HISTORY_DIR)) {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
    console.log('[VENDOR-HISTORY] Created history directory:', HISTORY_DIR);
  }
}

/**
 * Generate a unique ID for a history entry
 */
function generateId(): string {
  return `hist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Get all history entries for a vendor
 */
export function getVendorHistory(vendorName: string): VendorHistory | null {
  try {
    const filePath = getVendorHistoryPath(vendorName);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as VendorHistory;
  } catch (error: any) {
    console.error(`[VENDOR-HISTORY] Error reading history for ${vendorName}:`, error.message);
    return null;
  }
}

/**
 * Get the N most recent history entries for a vendor
 */
export function getRecentHistory(vendorName: string, count: number = MAX_HISTORY_EXAMPLES): HistoricalInvoice[] {
  const history = getVendorHistory(vendorName);
  if (!history || history.entries.length === 0) {
    return [];
  }
  
  // Sort by added_at descending and take the most recent
  const sorted = [...history.entries].sort(
    (a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime()
  );
  
  return sorted.slice(0, count);
}

/**
 * Add a new invoice to a vendor's history
 */
export function addToHistory(
  vendorName: string,
  invoiceNumber: string | null,
  images: string[],
  parsedData: HistoricalInvoice['parsed_data'],
  wasCorrected: boolean = false
): HistoricalInvoice {
  ensureHistoryDir();
  
  const filePath = getVendorHistoryPath(vendorName);
  let history: VendorHistory;
  
  // Load existing or create new
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    history = JSON.parse(content);
  } else {
    history = {
      vendor_name: vendorName,
      last_updated: new Date().toISOString(),
      entries: []
    };
  }
  
  // Check if this invoice already exists (by invoice number)
  if (invoiceNumber) {
    const exists = history.entries.some(e => e.invoice_number === invoiceNumber);
    if (exists) {
      console.log(`[VENDOR-HISTORY] Invoice ${invoiceNumber} already in history for ${vendorName}`);
      return history.entries.find(e => e.invoice_number === invoiceNumber)!;
    }
  }
  
  // Create new entry
  const entry: HistoricalInvoice = {
    id: generateId(),
    invoice_number: invoiceNumber,
    added_at: new Date().toISOString(),
    was_corrected: wasCorrected,
    images,
    parsed_data: parsedData
  };
  
  // Add to history
  history.entries.push(entry);
  history.last_updated = new Date().toISOString();
  
  // Save
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2));
  console.log(`[VENDOR-HISTORY] Added invoice ${invoiceNumber || 'unknown'} to ${vendorName} history (total: ${history.entries.length})`);
  
  return entry;
}

/**
 * Update an existing history entry (e.g., after correction)
 */
export function updateHistoryEntry(
  vendorName: string,
  entryId: string,
  updates: Partial<Pick<HistoricalInvoice, 'parsed_data' | 'was_corrected' | 'images'>>
): HistoricalInvoice | null {
  const filePath = getVendorHistoryPath(vendorName);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const history: VendorHistory = JSON.parse(content);
  
  const entryIndex = history.entries.findIndex(e => e.id === entryId);
  if (entryIndex === -1) {
    return null;
  }
  
  // Apply updates
  if (updates.parsed_data) {
    history.entries[entryIndex].parsed_data = updates.parsed_data;
  }
  if (updates.was_corrected !== undefined) {
    history.entries[entryIndex].was_corrected = updates.was_corrected;
  }
  if (updates.images) {
    history.entries[entryIndex].images = updates.images;
  }
  
  history.last_updated = new Date().toISOString();
  
  // Save
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2));
  console.log(`[VENDOR-HISTORY] Updated entry ${entryId} for ${vendorName}`);
  
  return history.entries[entryIndex];
}

/**
 * Delete a history entry
 */
export function deleteHistoryEntry(vendorName: string, entryId: string): boolean {
  const filePath = getVendorHistoryPath(vendorName);
  if (!fs.existsSync(filePath)) {
    return false;
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const history: VendorHistory = JSON.parse(content);
  
  const initialLength = history.entries.length;
  history.entries = history.entries.filter(e => e.id !== entryId);
  
  if (history.entries.length === initialLength) {
    return false; // Entry not found
  }
  
  history.last_updated = new Date().toISOString();
  
  // Save
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2));
  console.log(`[VENDOR-HISTORY] Deleted entry ${entryId} from ${vendorName}`);
  
  return true;
}

/**
 * Get all vendors that have history
 */
export function getAllVendorsWithHistory(): Array<{ vendor_name: string; entry_count: number; last_updated: string }> {
  ensureHistoryDir();
  
  const vendors: Array<{ vendor_name: string; entry_count: number; last_updated: string }> = [];
  
  try {
    const files = fs.readdirSync(HISTORY_DIR);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      try {
        const filePath = path.join(HISTORY_DIR, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const history: VendorHistory = JSON.parse(content);
        vendors.push({
          vendor_name: history.vendor_name,
          entry_count: history.entries.length,
          last_updated: history.last_updated
        });
      } catch {
        // Skip invalid files
      }
    }
  } catch (error: any) {
    console.error('[VENDOR-HISTORY] Error listing vendors:', error.message);
  }
  
  return vendors.sort((a, b) => a.vendor_name.localeCompare(b.vendor_name));
}

/**
 * Check if an invoice is already in history (by invoice number)
 */
export function isInvoiceInHistory(vendorName: string, invoiceNumber: string): boolean {
  const history = getVendorHistory(vendorName);
  if (!history) return false;
  return history.entries.some(e => e.invoice_number === invoiceNumber);
}

/**
 * Get statistics for all vendor histories
 */
export function getHistoryStats(): {
  total_vendors: number;
  total_entries: number;
  vendors: Array<{ vendor_name: string; entry_count: number; corrected_count: number }>;
} {
  ensureHistoryDir();
  
  const stats = {
    total_vendors: 0,
    total_entries: 0,
    vendors: [] as Array<{ vendor_name: string; entry_count: number; corrected_count: number }>
  };
  
  try {
    const files = fs.readdirSync(HISTORY_DIR);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      try {
        const filePath = path.join(HISTORY_DIR, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const history: VendorHistory = JSON.parse(content);
        
        const correctedCount = history.entries.filter(e => e.was_corrected).length;
        
        stats.total_vendors++;
        stats.total_entries += history.entries.length;
        stats.vendors.push({
          vendor_name: history.vendor_name,
          entry_count: history.entries.length,
          corrected_count: correctedCount
        });
      } catch {
        // Skip invalid files
      }
    }
  } catch (error: any) {
    console.error('[VENDOR-HISTORY] Error getting stats:', error.message);
  }
  
  return stats;
}

// ============================================================================
// Formatting for GPT Context
// ============================================================================

/**
 * Format historical examples for inclusion in GPT prompt
 * Returns a text description of the examples (images are sent separately)
 */
export function formatHistoryForPrompt(entries: HistoricalInvoice[]): string {
  if (entries.length === 0) {
    return '';
  }
  
  let prompt = `\n\nHISTORICAL EXAMPLES FROM THIS VENDOR (${entries.length} examples):
These are correctly parsed invoices from the same vendor. Use them as reference for field locations and formatting patterns.\n\n`;
  
  entries.forEach((entry, index) => {
    prompt += `--- Example ${index + 1} (Invoice: ${entry.invoice_number || 'Unknown'}) ---\n`;
    prompt += `Correctly extracted data:\n`;
    prompt += JSON.stringify(entry.parsed_data, null, 2);
    prompt += '\n\n';
  });
  
  prompt += `Use the patterns from these examples to accurately extract fields from the new invoice.\n`;
  
  return prompt;
}

/**
 * Get images from historical entries for multi-modal context
 * Returns flattened array of all images from entries
 */
export function getHistoryImages(entries: HistoricalInvoice[]): string[] {
  const images: string[] = [];
  for (const entry of entries) {
    // Only include first page of each historical invoice to save tokens
    if (entry.images.length > 0) {
      images.push(entry.images[0]);
    }
  }
  return images;
}
