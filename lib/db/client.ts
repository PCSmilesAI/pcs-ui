import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { resolveDataPath } from '../workflow/dataDir';

let db: Database.Database | null = null;
let migrationsRun = false;

export function getDatabase(): Database.Database {
  if (!db) {
    const dbPath = resolveDataPath('pcs.db');
    const dir = path.dirname(dbPath);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    console.log('[DB] Opening database at:', dbPath);
    db = new Database(dbPath);

    // Enable foreign keys and WAL mode for better concurrency
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');

    console.log('[DB] Database initialized successfully');
  }

  // Auto-run migrations on first access
  if (!migrationsRun) {
    try {
      console.log('[DB] Running migrations...');
      runMigrations();
      migrationsRun = true;
      console.log('[DB] Migrations completed');
    } catch (err: any) {
      console.error('[DB] Migration error:', err?.message, err?.stack);
      // Don't throw - migrations might already exist
    }
  }

  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    console.log('[DB] Database closed');
  }
}

export function runMigrations(): void {
  // Get database without triggering migrations again
  if (!db) {
    const dbPath = resolveDataPath('pcs.db');
    const dir = path.dirname(dbPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    console.log('[DB][MIGRATE] Opening database at:', dbPath);
    db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    console.log('[DB][MIGRATE] Database opened');
  }

  console.log('[DB][MIGRATE] Creating tables...');

  const columnExists = (table: string, column: string): boolean => {
    const rows = db
      ?.prepare(`PRAGMA table_info(${table})`)
      .all() as { name: string }[];
    return !!rows?.some((r) => r.name === column);
  };

  const ensureColumn = (table: string, column: string, definition: string) => {
    if (!columnExists(table, column)) {
      db?.exec(`ALTER TABLE ${table} ADD COLUMN ${definition};`);
    }
  };

  // Create invoices table with all fields
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT UNIQUE NOT NULL,
      source_file TEXT,
      source_message_id TEXT UNIQUE,
      
      -- Parsed fields (from parser/ingester)
      parsed_vendor_name TEXT,
      parsed_office_id TEXT,
      parsed_amount_cents INTEGER,
      
      -- Corrected fields (from user edits)
      corrected_vendor_name TEXT,
      corrected_office_id TEXT,
      corrected_amount_cents INTEGER,
      
      -- Effective fields (materialized: corrected OR parsed)
      vendor_name TEXT,
      office_id TEXT,
      amount_cents INTEGER,
      
      -- Field locks (JSON: { "vendor_name": true, ... })
      field_locks TEXT,
      
      -- Workflow fields
      status TEXT DEFAULT 'incoming',
      approvals TEXT,  -- JSON: { ap: {...}, office: {...}, admin: {...}, ... }

      -- Three-stage status tracking (Coded -> Approved -> Paid)
      coded_at TEXT,
      coded_by_user_id TEXT,
      approved_at TEXT,
      approved_by_user_id TEXT,
      paid_at TEXT,
      paid_by_user_id TEXT,

      -- Metadata
      deleted INTEGER DEFAULT 0,
      workflow_deleted_at TEXT,
      status_version INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      
      -- Additional fields from original invoice
      invoice_date TEXT,
      due_date TEXT,
      description TEXT,
      category TEXT,
      clinic_id TEXT,
      office_location TEXT,
      vendor_id TEXT,
      pdf_path TEXT,
      total REAL,
      invoice_total REAL,
      
      -- QBO Integration fields
      qbo_bill_id TEXT,
      qbo_bill_created_at TEXT,
      
      UNIQUE(source_message_id)
    );
  `);

  // Migration: Add qbo_bill_id column if it doesn't exist (for existing databases)
  try {
    db.exec(`ALTER TABLE invoices ADD COLUMN qbo_bill_id TEXT`);
    console.log('[DB] Added qbo_bill_id column');
  } catch (e: any) {
    // Column already exists, ignore
    if (!e.message?.includes('duplicate column')) {
      console.warn('[DB] qbo_bill_id migration:', e.message);
    }
  }
  try {
    db.exec(`ALTER TABLE invoices ADD COLUMN qbo_bill_created_at TEXT`);
    console.log('[DB] Added qbo_bill_created_at column');
  } catch (e: any) {
    // Column already exists, ignore
    if (!e.message?.includes('duplicate column')) {
      console.warn('[DB] qbo_bill_created_at migration:', e.message);
    }
  }
  
  // Create invoice_events table for audit trail
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoice_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor_email TEXT,
      actor_name TEXT,
      payload_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id)
    );
  `);
  
  // Create tombstones table to prevent re-ingestion of deleted invoices
  db.exec(`
    CREATE TABLE IF NOT EXISTS tombstones (
      source_message_id TEXT PRIMARY KEY,
      deleted_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  // Create indexes for common queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
    CREATE INDEX IF NOT EXISTS idx_invoices_vendor_name ON invoices(vendor_name);
    CREATE INDEX IF NOT EXISTS idx_invoices_office_id ON invoices(office_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_deleted ON invoices(deleted);
    CREATE INDEX IF NOT EXISTS idx_invoice_events_invoice_id ON invoice_events(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_invoice_events_created_at ON invoice_events(created_at);
  `);

  // Create rate_limits table for rate limiting
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      requests INTEGER DEFAULT 0,
      reset_at INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_at ON rate_limits(reset_at);
  `);

  // Create clinics table for all 9 locations
  db.exec(`
    CREATE TABLE IF NOT EXISTS clinics (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      address TEXT,
      ship_to_reference TEXT UNIQUE,
      contact_name TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create coding_templates table
  db.exec(`
    CREATE TABLE IF NOT EXISTS coding_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      vendor_id TEXT,
      vendor_name TEXT,
      allocation_type TEXT DEFAULT 'equal_split',
      apply_to_locations TEXT DEFAULT 'all_locations',
      gl_account_id TEXT,
      gl_account_name TEXT,
      created_by_user_id TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create coding_template_locations table (future-ready for per-location percentages)
  db.exec(`
    CREATE TABLE IF NOT EXISTS coding_template_locations (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      clinic_id TEXT NOT NULL,
      percentage REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (template_id) REFERENCES coding_templates(id),
      FOREIGN KEY (clinic_id) REFERENCES clinics(id),
      UNIQUE(template_id, clinic_id)
    );
  `);

  // Create invoice_allocations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoice_allocations (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      clinic_id TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      gl_account_id TEXT,
      gl_account_name TEXT,
      template_id TEXT,
      created_by_user_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id),
      FOREIGN KEY (clinic_id) REFERENCES clinics(id),
      FOREIGN KEY (template_id) REFERENCES coding_templates(id)
    );
  `);

  // Extend invoices table with multi-location fields
  ensureColumn('invoices', 'is_multi_location', 'is_multi_location INTEGER DEFAULT 0');
  ensureColumn('invoices', 'coding_template_id', 'coding_template_id TEXT');
  ensureColumn('invoices', 'coded_by_user_id', 'coded_by_user_id TEXT');
  ensureColumn('invoices', 'coded_at', 'coded_at TEXT');
  ensureColumn('invoices', 'template_type', 'template_type TEXT'); // 'even_split' or 'table_template'
  
  // Approval tracking columns
  ensureColumn('invoices', 'approved_at', 'approved_at TEXT');
  ensureColumn('invoices', 'approved_by_user_id', 'approved_by_user_id TEXT');
  ensureColumn('invoices', 'ap_approved_at', 'ap_approved_at TEXT');
  ensureColumn('invoices', 'ap_approved_by', 'ap_approved_by TEXT');
  ensureColumn('invoices', 'om_approved_at', 'om_approved_at TEXT');
  ensureColumn('invoices', 'om_approved_by', 'om_approved_by TEXT');
  ensureColumn('invoices', 'admin_approved_at', 'admin_approved_at TEXT');
  ensureColumn('invoices', 'admin_approved_by', 'admin_approved_by TEXT');
  ensureColumn('invoices', 'paid_by_user_id', 'paid_by_user_id TEXT');
  ensureColumn('invoices', 'approval_stage', 'approval_stage TEXT');

  // Add template_type to coding_templates table
  ensureColumn('coding_templates', 'template_type', 'template_type TEXT DEFAULT "even_split"');
  
  // Add allocation_mode, description, and company_code to coding_templates table for enhanced template support
  // allocation_mode: 'split_evenly' | 'fixed_amount' | 'percentage'
  ensureColumn('coding_templates', 'allocation_mode', 'allocation_mode TEXT DEFAULT "split_evenly"');
  ensureColumn('coding_templates', 'description', 'description TEXT');
  ensureColumn('coding_templates', 'company_code', 'company_code TEXT');

  // NEW: Create invoice_categories table for invoice-level categories
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoice_categories (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      category_name TEXT NOT NULL,
      class_name TEXT,
      confidence_score REAL DEFAULT 0,
      flagged_for_review INTEGER DEFAULT 0,
      reason TEXT,
      source TEXT DEFAULT 'manual',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id),
      UNIQUE(invoice_id, category_id)
    );
  `);
  ensureColumn('invoice_categories', 'class_name', 'class_name TEXT');
  ensureColumn('invoice_categories', 'confidence_score', 'confidence_score REAL DEFAULT 0');
  ensureColumn('invoice_categories', 'flagged_for_review', 'flagged_for_review INTEGER DEFAULT 0');
  ensureColumn('invoice_categories', 'reason', 'reason TEXT');
  
  // GL Line Splitting: Add amount, description, sequence, class_id columns
  ensureColumn('invoice_categories', 'description', 'description TEXT');
  ensureColumn('invoice_categories', 'amount_cents', 'amount_cents INTEGER');
  ensureColumn('invoice_categories', 'sequence', 'sequence INTEGER DEFAULT 1');
  ensureColumn('invoice_categories', 'class_id', 'class_id TEXT');

  // NEW: Invoice reassignment field - tracks current owner/assignee
  ensureColumn('invoices', 'current_assigned_user_email', 'current_assigned_user_email TEXT');
  
  // Payment tracking - Stripe transfer ID for payment verification
  ensureColumn('invoices', 'stripe_transfer_id', 'stripe_transfer_id TEXT');
  
  // Payment locking - prevent two users from paying the same invoice simultaneously
  ensureColumn('invoices', 'payment_started_by', 'payment_started_by TEXT');
  ensureColumn('invoices', 'payment_started_at', 'payment_started_at TEXT');
  
  // Verifier tracking - tracks who verified the invoice and when (for verifier workflow)
  ensureColumn('invoices', 'verified_by_user_id', 'verified_by_user_id TEXT');
  ensureColumn('invoices', 'verified_at', 'verified_at TEXT');

  // Parsing status tracking - for identifying invoices with failed parsing
  ensureColumn('invoices', 'parsing_status', 'parsing_status TEXT DEFAULT "pending"'); // 'pending' | 'success' | 'failed' | 'partial'
  ensureColumn('invoices', 'parsing_error', 'parsing_error TEXT'); // Error message if parsing failed
  ensureColumn('invoices', 'parse_attempts', 'parse_attempts INTEGER DEFAULT 0'); // Number of parse attempts
  ensureColumn('invoices', 'parsing_method', 'parsing_method TEXT'); // 'gpt-5-nano' | 'legacy' | null
  ensureColumn('invoices', 'parsing_confidence', 'parsing_confidence REAL'); // 0.0-1.0 confidence score from GPT

  // Multi-invoice document tracking - when a single PDF contains multiple invoices
  ensureColumn('invoices', 'notes', 'notes TEXT'); // Rejection feedback, coding corrections, etc.
  ensureColumn('invoices', 'document_group_id', 'document_group_id TEXT'); // UUID linking invoices from same PDF
  ensureColumn('invoices', 'document_invoice_index', 'document_invoice_index INTEGER'); // Position in document (1, 2, 3...)
  ensureColumn('invoices', 'document_invoice_total', 'document_invoice_total INTEGER'); // Total invoices in document
  ensureColumn('invoices', 'pdf_page_start', 'pdf_page_start INTEGER'); // 0-based first page in source PDF
  ensureColumn('invoices', 'pdf_page_end', 'pdf_page_end INTEGER'); // 0-based last page (inclusive) in source PDF

  // Create table_template_rows table for table template type
  // Note: invoice_id is nullable (template rows don't need an invoice)
  // Note: amount_cents is nullable (split evenly modes don't specify amounts)
  db.exec(`
    CREATE TABLE IF NOT EXISTS table_template_rows (
      id TEXT PRIMARY KEY,
      invoice_id TEXT,
      template_id TEXT,
      gl_account_path TEXT NOT NULL,
      category_name TEXT,
      description TEXT,
      class_name TEXT,
      location_name TEXT,
      amount_cents INTEGER,
      percentage REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id),
      FOREIGN KEY (template_id) REFERENCES coding_templates(id)
    );
  `);
  
  // Ensure template_id column exists (for existing databases)
  ensureColumn('table_template_rows', 'template_id', 'template_id TEXT');
  
  // Add percentage column for percent split allocation mode
  ensureColumn('table_template_rows', 'percentage', 'percentage REAL');
  
  // Add description column for template row descriptions
  ensureColumn('table_template_rows', 'description', 'description TEXT');

  // Create indexes for new tables
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_coding_templates_vendor_id ON coding_templates(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_coding_templates_is_active ON coding_templates(is_active);
    CREATE INDEX IF NOT EXISTS idx_invoice_allocations_invoice_id ON invoice_allocations(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_invoice_allocations_clinic_id ON invoice_allocations(clinic_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_is_multi_location ON invoices(is_multi_location);
    CREATE INDEX IF NOT EXISTS idx_invoices_coding_template_id ON invoices(coding_template_id);
    CREATE INDEX IF NOT EXISTS idx_invoice_categories_invoice_id ON invoice_categories(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_table_template_rows_invoice_id ON table_template_rows(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_assigned_user ON invoices(current_assigned_user_email);
    CREATE INDEX IF NOT EXISTS idx_invoices_parsing_status ON invoices(parsing_status);
  `);

  // Seed clinics table with all 9 locations
  const clinicsData = [
    { id: 'clinic_longview', name: 'SMILES DENTAL - LONGVIEW', address: '820 OCEAN BEACH HWY STE 110, LONGVIEW, WA 98632-2508', ship_to_reference: '5351067', contact_name: 'Shelly Streffry' },
    { id: 'clinic_hazel_dell', name: 'SMILES DENTAL - HAZEL DELL', address: '10009 NE HAZEL DELL AVE, VANCOUVER, WA 98685', ship_to_reference: '14288930', contact_name: 'Ericka Dall' },
    { id: 'clinic_ridgefield', name: 'SMILES DENTAL - RIDGEFIELD', address: '109 S 65TH AVE STE 104, RIDGEFIELD, WA 98642', ship_to_reference: '14288931', contact_name: 'Julie Wolf' },
    { id: 'clinic_eugene', name: 'SMILES DENTAL - EUGENE', address: '2201 WILLAMETTE ST STE A, EUGENE, OR 97405', ship_to_reference: '14288934', contact_name: 'Kendall Gresham' },
    { id: 'clinic_lebanon', name: 'SMILES DENTAL - LEBANON', address: '175 PARK ST, LEBANON, OR 97355', ship_to_reference: '14288935', contact_name: 'Joan P' },
    { id: 'clinic_milwaukie', name: 'SMILES DENTAL - MILWAUKIE', address: '11084 SE OAK ST, MILWAUKIE, OR 97222', ship_to_reference: '16820101', contact_name: 'Caitlin Nelson' },
    { id: 'clinic_snohomish', name: 'SMILES DENTAL - SNOHOMISH', address: '1322 AVENUE D STE A, SNOHOMISH, WA 98290-1746', ship_to_reference: '19599218', contact_name: 'Jena Ewald' },
    { id: 'clinic_15th_st', name: 'SMILES DENTAL - 15TH ST VANCOUVER', address: '16415 SE 15TH ST UNIT 105, VANCOUVER, WA 98683', ship_to_reference: '21405584', contact_name: 'Jena Ewald' },
    { id: 'clinic_salem', name: 'SMILES DENTAL - SALEM', address: 'Salem, OR', ship_to_reference: '21405585', contact_name: 'TBD' }
  ];

  const insertClinic = db.prepare(`
    INSERT OR IGNORE INTO clinics (id, name, address, ship_to_reference, contact_name)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const clinic of clinicsData) {
    insertClinic.run(clinic.id, clinic.name, clinic.address, clinic.ship_to_reference, clinic.contact_name);
  }

  // Create vendor_knowledge_bases table for PCS AI parsing system
  db.exec(`
    CREATE TABLE IF NOT EXISTS vendor_knowledge_bases (
      id TEXT PRIMARY KEY,
      vendor_name TEXT UNIQUE NOT NULL,
      knowledge_prompt TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      version INTEGER DEFAULT 1,
      last_trained_at TEXT,
      training_invoice_count INTEGER DEFAULT 0
    );
  `);

  // Create system_prompts table for Training Prompt and other system prompts
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_prompts (
      id TEXT PRIMARY KEY,
      prompt_name TEXT UNIQUE NOT NULL,
      prompt_text TEXT NOT NULL,
      description TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create indexes for knowledge base tables
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_vendor_knowledge_bases_vendor_name ON vendor_knowledge_bases(vendor_name);
    CREATE INDEX IF NOT EXISTS idx_system_prompts_prompt_name ON system_prompts(prompt_name);
  `);

  // Add preferred_template_id column to vendor_knowledge_bases for template auto-suggestion
  ensureColumn('vendor_knowledge_bases', 'preferred_template_id', 'preferred_template_id TEXT');
  ensureColumn('vendor_knowledge_bases', 'preferred_template_name', 'preferred_template_name TEXT');

  // Seed default Training Prompt if it doesn't exist
  const defaultTrainingPrompt = db.prepare(`
    INSERT OR IGNORE INTO system_prompts (id, prompt_name, prompt_text, description)
    VALUES (?, ?, ?, ?)
  `);
  
  defaultTrainingPrompt.run(
    'training_prompt_default',
    'Training Prompt',
    `You are an invoice parsing expert. A user has corrected parsing errors on an invoice.

ORIGINAL PARSED DATA:
{{original_data}}

CORRECTED DATA:
{{corrected_data}}

PDF IMAGES ARE ATTACHED.

Analyze what was parsed incorrectly and why. Then update the knowledge base for this vendor to prevent this mistake in the future.

Your response should be an UPDATED knowledge base prompt that:
1. Preserves all existing correct parsing rules
2. Adds or modifies rules to fix the identified parsing error
3. Includes specific field locations, patterns, or indicators found in this invoice

Return ONLY the updated knowledge base prompt text, nothing else.`,
    'Master prompt used when admin corrections trigger knowledge base updates'
  );

  // Seed default Master Parsing Prompt if it doesn't exist
  const defaultMasterParsingPrompt = db.prepare(`
    INSERT OR IGNORE INTO system_prompts (id, prompt_name, prompt_text, description)
    VALUES (?, ?, ?, ?)
  `);
  
  defaultMasterParsingPrompt.run(
    'master_parsing_prompt_default',
    'Master Parsing Prompt',
    `You are parsing dental supply invoices for Pacific Crest Smiles (PCS), a dental practice management company.

=== EXTRACTION RULES ===

1. INVOICE NUMBER
   - Extract the clean invoice number/ID directly from the PDF content
   - Do NOT use email filename or document name
   - Should be a single clean identifier (e.g., "5519129473", "INV-12345")
   - Look for labels: "Invoice #", "Invoice Number", "Inv No", "Document Number"

2. VENDOR NAME (STRICT QBO MATCHING)
   - You MUST match the vendor to the QBO_VENDORS list provided below
   - Return the EXACT QBO vendor name - do NOT return variations or raw invoice text
   - Use fuzzy matching: ignore case, punctuation, and business suffixes (LLC, Inc, Corp, etc.)
   - Example matches:
     * "HENRY SCHEIN INC." → "Henry Schein"
     * "Darby Dental Supply, LLC" → "Darby Dental Supply LLC"
     * "BRASSELER USA DENTAL" → "Brasseler"
     * "Airgas USA, LLC" → "Airgas USA LLC"
   - If you cannot find a reasonable match in QBO_VENDORS, return "Unknown"
   - NEVER return a vendor name that is not in the QBO_VENDORS list

3. AMOUNT / TOTAL
   - Extract the total amount due from the invoice
   - Look for: "Total Due", "Amount Due", "Balance Due", "Invoice Total", "Total"
   - Return as a decimal number (e.g., 2513.89)

4. LOCATION (CRITICAL PCS RULE)
   - Extract ONLY the city name, NOT the full address
   - IMPORTANT: Roseburg is the MAIN OFFICE / BILLING ADDRESS on almost every invoice
   - The "Bill To" or "Remit To" address is usually Roseburg - this is NOT the service location
   - Look for "Ship To", "Deliver To", "Service Location" - THIS is the correct location
   - If you see Roseburg, verify it's the actual service/delivery location, not just billing
   - Match to QBO_CLASSES list: "General-Salem" → "Salem", "General-Lebanon" → "Lebanon"
   - Valid PCS locations: Columbia, Eugene, Lebanon, Milwaukie, Riddle, Ridgefield, Roseburg, Salem

5. INVOICE DATE
   - The date the invoice was issued/created
   - Look for: "Invoice Date", "Date", "Issued Date", "Document Date"
   - Format as MM/DD/YYYY (e.g., 01/15/2025)

6. DUE DATE
   - The date payment is due
   - Look for: "Due Date", "Payment Due", "Due By"
   - If no explicit due date, calculate from payment terms:
     * "Net 30" or "Due in 30 days" = invoice_date + 30 days
     * "Net 15" = invoice_date + 15 days
     * "Due Upon Receipt" = same as invoice_date
   - Format as MM/DD/YYYY (e.g., 02/14/2025)

7. CATEGORY / GL LINES
   - Should align with QBO Chart of Accounts
   - Format: "ACCOUNT_NUMBER - Account Name" (e.g., "53352 - B&O Taxes")
   - Extract from line item descriptions if identifiable

=== QBO_VENDORS ===
{{QBO_VENDORS}}

=== QBO_CLASSES (Locations) ===
{{QBO_CLASSES}}

=== OUTPUT FORMAT ===
Return a JSON object with these exact fields. Return ONLY valid JSON, no explanation text.`,
    'Global parsing prompt applied to ALL invoice parsing - includes PCS-specific business rules'
  );

  // Update existing Master Parsing Prompt to use strict vendor matching
  // This ensures production databases get the updated prompt
  db.prepare(`
    UPDATE system_prompts 
    SET prompt_text = ?
    WHERE id = 'master_parsing_prompt_default'
    AND prompt_text LIKE '%If no exact match, return the vendor name as shown on the invoice%'
  `).run(`You are parsing dental supply invoices for Pacific Crest Smiles (PCS), a dental practice management company.

=== EXTRACTION RULES ===

1. INVOICE NUMBER
   - Extract the clean invoice number/ID directly from the PDF content
   - Do NOT use email filename or document name
   - Should be a single clean identifier (e.g., "5519129473", "INV-12345")
   - Look for labels: "Invoice #", "Invoice Number", "Inv No", "Document Number"

2. VENDOR NAME (STRICT QBO MATCHING)
   - You MUST match the vendor to the QBO_VENDORS list provided below
   - Return the EXACT QBO vendor name - do NOT return variations or raw invoice text
   - Use fuzzy matching: ignore case, punctuation, and business suffixes (LLC, Inc, Corp, etc.)
   - Example matches:
     * "HENRY SCHEIN INC." → "Henry Schein"
     * "Darby Dental Supply, LLC" → "Darby Dental Supply LLC"
     * "BRASSELER USA DENTAL" → "Brasseler"
     * "Airgas USA, LLC" → "Airgas USA LLC"
   - If you cannot find a reasonable match in QBO_VENDORS, return "Unknown"
   - NEVER return a vendor name that is not in the QBO_VENDORS list

3. AMOUNT / TOTAL
   - Extract the total amount due from the invoice
   - Look for: "Total Due", "Amount Due", "Balance Due", "Invoice Total", "Total"
   - Return as a decimal number (e.g., 2513.89)

4. LOCATION (CRITICAL PCS RULE)
   - Extract ONLY the city name, NOT the full address
   - IMPORTANT: Roseburg is the MAIN OFFICE / BILLING ADDRESS on almost every invoice
   - The "Bill To" or "Remit To" address is usually Roseburg - this is NOT the service location
   - Look for "Ship To", "Deliver To", "Service Location" - THIS is the correct location
   - If you see Roseburg, verify it's the actual service/delivery location, not just billing
   - Match to QBO_CLASSES list: "General-Salem" → "Salem", "General-Lebanon" → "Lebanon"
   - Valid PCS locations: Columbia, Eugene, Lebanon, Milwaukie, Riddle, Ridgefield, Roseburg, Salem

5. INVOICE DATE
   - The date the invoice was issued/created
   - Look for: "Invoice Date", "Date", "Issued Date", "Document Date"
   - Format as MM/DD/YYYY (e.g., 01/15/2025)

6. DUE DATE
   - The date payment is due
   - Look for: "Due Date", "Payment Due", "Due By"
   - If no explicit due date, calculate from payment terms:
     * "Net 30" or "Due in 30 days" = invoice_date + 30 days
     * "Net 15" = invoice_date + 15 days
     * "Due Upon Receipt" = same as invoice_date
   - Format as MM/DD/YYYY (e.g., 02/14/2025)

7. CATEGORY / GL LINES
   - Should align with QBO Chart of Accounts
   - Format: "ACCOUNT_NUMBER - Account Name" (e.g., "53352 - B&O Taxes")
   - Extract from line item descriptions if identifiable

=== QBO_VENDORS ===
{{QBO_VENDORS}}

=== QBO_CLASSES (Locations) ===
{{QBO_CLASSES}}

=== OUTPUT FORMAT ===
Return a JSON object with these exact fields. Return ONLY valid JSON, no explanation text.`);

  // Create users table for local authentication (hybrid with Gist)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      is_active INTEGER DEFAULT 1,
      last_login_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
  `);

  // Create other_documents table for non-invoice documents (credit memos, statements, etc.)
  db.exec(`
    CREATE TABLE IF NOT EXISTS other_documents (
      id TEXT PRIMARY KEY,
      document_type TEXT NOT NULL,
      vendor_name TEXT,
      amount REAL,
      document_date TEXT,
      reference_number TEXT,
      pdf_path TEXT,
      source_email_id TEXT,
      email_subject TEXT,
      email_from TEXT,
      classification_confidence REAL,
      raw_extracted_data TEXT,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_other_documents_type ON other_documents(document_type);
    CREATE INDEX IF NOT EXISTS idx_other_documents_status ON other_documents(status);
    CREATE INDEX IF NOT EXISTS idx_other_documents_vendor ON other_documents(vendor_name);
    CREATE INDEX IF NOT EXISTS idx_other_documents_created ON other_documents(created_at);
  `);

  // Add filing workflow columns to other_documents
  ensureColumn('other_documents', 'filed_at', 'filed_at TEXT');
  ensureColumn('other_documents', 'filed_by', 'filed_by TEXT');
  ensureColumn('other_documents', 'user_note', 'user_note TEXT');
  ensureColumn('other_documents', 'amount', 'amount REAL');
  ensureColumn('other_documents', 'location', 'location TEXT');

  // ─── Receipts table (Credit Card Receipts module — McKay) ────────────────
  // Single source of truth for the receipts module. Column set matches the
  // documented model in lib/receipts/db-store.ts and
  // context/modules/credit_card_receipts.md. Do not modify other tables here.
  db.exec(`
    CREATE TABLE IF NOT EXISTS receipts (
      id            TEXT PRIMARY KEY,
      vendor        TEXT,
      amount        REAL,
      date          TEXT,
      gl_account    TEXT,
      location      TEXT,
      card_last4    TEXT,
      match_status  TEXT DEFAULT 'unmatched',
      amex_txn_id   TEXT,
      submitted_by  TEXT,
      notes         TEXT,
      image_path    TEXT,
      created_at    TEXT,
      updated_at    TEXT
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_receipts_match_status ON receipts(match_status);
    CREATE INDEX IF NOT EXISTS idx_receipts_submitted_by ON receipts(submitted_by);
    CREATE INDEX IF NOT EXISTS idx_receipts_date ON receipts(date);
    CREATE INDEX IF NOT EXISTS idx_receipts_created ON receipts(created_at);
  `);

  console.log('[DB] Migrations completed successfully');
}
