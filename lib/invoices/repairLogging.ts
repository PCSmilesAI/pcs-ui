import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

/**
 * Repair logging system for tracking invoice updates/repairs
 * Stores PDF, original JSON, and corrected JSON for AI training
 */

const REPAIR_LOG_DIR = process.env.PCS_REPAIR_LOG_DIR || '/var/www/pcs-ui-data/repair-logs';

export interface RepairLogEntry {
  id: string;
  invoice_number: string;
  vendor_name: string;
  timestamp: string;
  user_email: string;
  original_data: Record<string, any>;
  corrected_data: Record<string, any>;
  pdf_path?: string;
  changes: Record<string, { old: any; new: any }>;
}

/**
 * Create a repair log entry for an updated invoice
 * Stores the original data, corrected data, and metadata
 */
export async function logRepair(
  invoiceNumber: string,
  vendorName: string,
  userEmail: string,
  originalData: Record<string, any>,
  correctedData: Record<string, any>,
  pdfPath?: string
): Promise<RepairLogEntry> {
  try {
    // Ensure repair log directory exists
    await fs.mkdir(REPAIR_LOG_DIR, { recursive: true });

    // Generate unique ID for this repair
    const repairId = randomUUID();
    const timestamp = new Date().toISOString();

    // Calculate what changed
    const changes: Record<string, { old: any; new: any }> = {};
    const allKeys = new Set([
      ...Object.keys(originalData || {}),
      ...Object.keys(correctedData || {})
    ]);

    for (const key of allKeys) {
      const oldVal = originalData?.[key];
      const newVal = correctedData?.[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes[key] = { old: oldVal, new: newVal };
      }
    }

    // Create repair log entry
    const logEntry: RepairLogEntry = {
      id: repairId,
      invoice_number: invoiceNumber,
      vendor_name: vendorName,
      timestamp,
      user_email: userEmail,
      original_data: originalData,
      corrected_data: correctedData,
      pdf_path: pdfPath,
      changes
    };

    // Create vendor-specific subdirectory
    const vendorDir = path.join(REPAIR_LOG_DIR, sanitizeVendorName(vendorName));
    await fs.mkdir(vendorDir, { recursive: true });

    // Create invoice-specific subdirectory
    const invoiceDir = path.join(vendorDir, `${invoiceNumber}_${repairId}`);
    await fs.mkdir(invoiceDir, { recursive: true });

    // Write metadata file
    const metadataPath = path.join(invoiceDir, 'metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(logEntry, null, 2));

    // Write original data
    const originalPath = path.join(invoiceDir, 'original.json');
    await fs.writeFile(originalPath, JSON.stringify(originalData, null, 2));

    // Write corrected data
    const correctedPath = path.join(invoiceDir, 'corrected.json');
    await fs.writeFile(correctedPath, JSON.stringify(correctedData, null, 2));

    // Write changes summary
    const changesPath = path.join(invoiceDir, 'changes.json');
    await fs.writeFile(changesPath, JSON.stringify(changes, null, 2));

    // If PDF path is provided, try to copy it
    if (pdfPath) {
      try {
        const pdfFileName = path.basename(pdfPath);
        const destPdfPath = path.join(invoiceDir, `invoice_${pdfFileName}`);
        
        // Check if source PDF exists
        try {
          await fs.access(pdfPath);
          await fs.copyFile(pdfPath, destPdfPath);
          console.log('[REPAIR-LOG]', 'PDF copied successfully', { invoiceNumber, destPdfPath });
        } catch (e) {
          console.warn('[REPAIR-LOG]', 'PDF file not found or not accessible', { pdfPath });
        }
      } catch (e) {
        console.warn('[REPAIR-LOG]', 'Failed to copy PDF', { pdfPath, error: (e as any)?.message });
      }
    }

    console.log('[REPAIR-LOG]', 'Repair logged successfully', {
      invoiceNumber,
      vendorName,
      repairId,
      invoiceDir,
      changesCount: Object.keys(changes).length
    });

    return logEntry;
  } catch (error) {
    console.error('[REPAIR-LOG]', 'Failed to log repair', {
      invoiceNumber,
      vendorName,
      error: (error as any)?.message
    });
    throw error;
  }
}

/**
 * Sanitize vendor name for use as directory name
 */
function sanitizeVendorName(vendorName: string): string {
  return vendorName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100); // Limit length
}

/**
 * Get repair logs for a specific vendor
 */
export async function getRepairLogsForVendor(vendorName: string): Promise<RepairLogEntry[]> {
  try {
    const vendorDir = path.join(REPAIR_LOG_DIR, sanitizeVendorName(vendorName));
    
    try {
      await fs.access(vendorDir);
    } catch {
      return []; // Directory doesn't exist yet
    }

    const entries = await fs.readdir(vendorDir, { withFileTypes: true });
    const logs: RepairLogEntry[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          const metadataPath = path.join(vendorDir, entry.name, 'metadata.json');
          const content = await fs.readFile(metadataPath, 'utf-8');
          logs.push(JSON.parse(content));
        } catch (e) {
          console.warn('[REPAIR-LOG]', 'Failed to read repair log', { entry: entry.name });
        }
      }
    }

    return logs.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  } catch (error) {
    console.error('[REPAIR-LOG]', 'Failed to get repair logs', {
      vendorName,
      error: (error as any)?.message
    });
    return [];
  }
}

/**
 * Get all repair logs across all vendors
 */
export async function getAllRepairLogs(): Promise<RepairLogEntry[]> {
  try {
    try {
      await fs.access(REPAIR_LOG_DIR);
    } catch {
      return []; // Directory doesn't exist yet
    }

    const vendors = await fs.readdir(REPAIR_LOG_DIR, { withFileTypes: true });
    const allLogs: RepairLogEntry[] = [];

    for (const vendor of vendors) {
      if (vendor.isDirectory()) {
        const logs = await getRepairLogsForVendor(vendor.name);
        allLogs.push(...logs);
      }
    }

    return allLogs.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  } catch (error) {
    console.error('[REPAIR-LOG]', 'Failed to get all repair logs', {
      error: (error as any)?.message
    });
    return [];
  }
}

