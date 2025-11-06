import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { resolveDataPath } from '../workflow/dataDir';

let db: Database.Database | null = null;

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
  const db = getDatabase();
  
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
      
      UNIQUE(source_message_id)
    );
  `);
  
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
  
  console.log('[DB] Migrations completed successfully');
}

