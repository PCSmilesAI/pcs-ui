import { getDatabase } from '../db/client';
import { randomUUID } from 'crypto';

export interface VendorKnowledgeBase {
  id: string;
  vendor_name: string;
  knowledge_prompt: string;
  created_at: string;
  updated_at: string;
  version: number;
  last_trained_at: string | null;
  training_invoice_count: number;
}

export interface SystemPrompt {
  id: string;
  prompt_name: string;
  prompt_text: string;
  description: string | null;
  updated_at: string;
}

// ============================================================================
// Vendor Knowledge Base Operations
// ============================================================================

/**
 * Get all vendor knowledge bases
 */
export function getAllKnowledgeBases(): VendorKnowledgeBase[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM vendor_knowledge_bases 
    ORDER BY vendor_name ASC
  `).all() as VendorKnowledgeBase[];
}

/**
 * Get knowledge base for a specific vendor
 */
export function getKnowledgeBase(vendorName: string): VendorKnowledgeBase | null {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM vendor_knowledge_bases 
    WHERE vendor_name = ?
  `).get(vendorName) as VendorKnowledgeBase | null;
}

/**
 * Get knowledge base by ID
 */
export function getKnowledgeBaseById(id: string): VendorKnowledgeBase | null {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM vendor_knowledge_bases 
    WHERE id = ?
  `).get(id) as VendorKnowledgeBase | null;
}

/**
 * Create or update a vendor knowledge base
 */
export function upsertKnowledgeBase(
  vendorName: string,
  knowledgePrompt: string,
  incrementTrainingCount: boolean = false
): VendorKnowledgeBase {
  const db = getDatabase();
  const existing = getKnowledgeBase(vendorName);

  if (existing) {
    // Update existing
    const newVersion = existing.version + 1;
    const trainingCount = incrementTrainingCount 
      ? existing.training_invoice_count + 1 
      : existing.training_invoice_count;

    db.prepare(`
      UPDATE vendor_knowledge_bases 
      SET knowledge_prompt = ?,
          updated_at = CURRENT_TIMESTAMP,
          version = ?,
          last_trained_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE last_trained_at END,
          training_invoice_count = ?
      WHERE id = ?
    `).run(knowledgePrompt, newVersion, incrementTrainingCount ? 1 : 0, trainingCount, existing.id);

    return getKnowledgeBaseById(existing.id)!;
  } else {
    // Create new
    const id = randomUUID();
    db.prepare(`
      INSERT INTO vendor_knowledge_bases 
      (id, vendor_name, knowledge_prompt, training_invoice_count)
      VALUES (?, ?, ?, ?)
    `).run(id, vendorName, knowledgePrompt, incrementTrainingCount ? 1 : 0);

    return getKnowledgeBaseById(id)!;
  }
}

/**
 * Delete a vendor knowledge base
 */
export function deleteKnowledgeBase(vendorName: string): boolean {
  const db = getDatabase();
  const result = db.prepare(`
    DELETE FROM vendor_knowledge_bases 
    WHERE vendor_name = ?
  `).run(vendorName);

  return result.changes > 0;
}

/**
 * Search knowledge bases by vendor name
 */
export function searchKnowledgeBases(searchTerm: string): VendorKnowledgeBase[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM vendor_knowledge_bases 
    WHERE vendor_name LIKE ?
    ORDER BY vendor_name ASC
  `).all(`%${searchTerm}%`) as VendorKnowledgeBase[];
}

// ============================================================================
// System Prompt Operations
// ============================================================================

/**
 * Get all system prompts
 */
export function getAllSystemPrompts(): SystemPrompt[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM system_prompts 
    ORDER BY prompt_name ASC
  `).all() as SystemPrompt[];
}

/**
 * Get a specific system prompt by name
 */
export function getSystemPrompt(promptName: string): SystemPrompt | null {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM system_prompts 
    WHERE prompt_name = ?
  `).get(promptName) as SystemPrompt | null;
}

/**
 * Get the Training Prompt (used when corrections are made)
 */
export function getTrainingPrompt(): SystemPrompt | null {
  return getSystemPrompt('Training Prompt');
}

/**
 * Get the Master Parsing Prompt (used for all invoice parsing)
 */
export function getMasterParsingPrompt(): SystemPrompt | null {
  return getSystemPrompt('Master Parsing Prompt');
}

/**
 * Update a system prompt
 */
export function updateSystemPrompt(
  promptName: string,
  promptText: string,
  description?: string
): SystemPrompt | null {
  const db = getDatabase();
  const existing = getSystemPrompt(promptName);

  if (existing) {
    db.prepare(`
      UPDATE system_prompts 
      SET prompt_text = ?,
          description = COALESCE(?, description),
          updated_at = CURRENT_TIMESTAMP
      WHERE prompt_name = ?
    `).run(promptText, description || null, promptName);

    return getSystemPrompt(promptName);
  } else {
    // Create new
    const id = randomUUID();
    db.prepare(`
      INSERT INTO system_prompts 
      (id, prompt_name, prompt_text, description)
      VALUES (?, ?, ?, ?)
    `).run(id, promptName, promptText, description || null);

    return getSystemPrompt(promptName);
  }
}

// ============================================================================
// Default Knowledge Base Templates
// ============================================================================

/**
 * Generate a default knowledge base prompt for a new vendor
 */
export function generateDefaultKnowledgePrompt(vendorName: string): string {
  return `You are parsing invoices from ${vendorName}.

EXTRACTION REQUIREMENTS:
Extract the following fields from the invoice:

1. invoice_number: The unique invoice identifier (look for "Invoice #", "Invoice Number", "Inv #", etc.)
2. invoice_date: The date the invoice was issued (look for "Invoice Date", "Date", "Issued")
3. due_date: When payment is due (look for "Due Date", "Payment Due", "Terms")
4. vendor_name: Should be "${vendorName}" or the company name on the invoice
5. total: The total amount due (look for "Total", "Amount Due", "Balance Due", "Invoice Total")
6. office_location: The delivery/ship-to location (look for "Ship To", "Deliver To", "Location")
7. line_items: Array of individual items with description, quantity, unit_price, and amount

PARSING RULES:
- Amounts should be extracted as numbers without currency symbols
- Dates should be in YYYY-MM-DD format when possible
- If a field cannot be found, return null for that field
- For office_location, look for dental office names like "Smiles Dental", "Pacific Crest", etc.

OUTPUT FORMAT:
Return a JSON object with these exact field names. Do not include any explanation, just the JSON.`;
}

/**
 * Get knowledge base for vendor, creating default if not exists
 */
export function getOrCreateKnowledgeBase(vendorName: string): VendorKnowledgeBase {
  const existing = getKnowledgeBase(vendorName);
  if (existing) {
    return existing;
  }

  // Create default knowledge base
  const defaultPrompt = generateDefaultKnowledgePrompt(vendorName);
  return upsertKnowledgeBase(vendorName, defaultPrompt, false);
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Get statistics about knowledge bases
 */
export function getKnowledgeBaseStats(): {
  totalVendors: number;
  totalTrainingCorrections: number;
  vendorsWithKnowledgeBase: string[];
  recentlyTrained: VendorKnowledgeBase[];
} {
  const db = getDatabase();
  
  const allKbs = getAllKnowledgeBases();
  const totalTrainingCorrections = allKbs.reduce(
    (sum, kb) => sum + kb.training_invoice_count, 
    0
  );

  const recentlyTrained = db.prepare(`
    SELECT * FROM vendor_knowledge_bases 
    WHERE last_trained_at IS NOT NULL
    ORDER BY last_trained_at DESC
    LIMIT 10
  `).all() as VendorKnowledgeBase[];

  return {
    totalVendors: allKbs.length,
    totalTrainingCorrections,
    vendorsWithKnowledgeBase: allKbs.map(kb => kb.vendor_name),
    recentlyTrained
  };
}
