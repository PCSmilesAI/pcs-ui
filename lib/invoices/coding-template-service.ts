import { getDatabase } from '../db/client';
import { v4 as uuidv4 } from 'uuid';

export interface CodingTemplate {
  id: string;
  name: string;
  vendor_id?: string;
  vendor_name?: string;
  allocation_type: 'equal_split';
  apply_to_locations: 'all_locations';
  gl_account_id?: string;
  gl_account_name?: string;
  template_type?: string; // 'even_split' or 'table_template'
  created_by_user_id?: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface InvoiceAllocation {
  id: string;
  invoice_id: string;
  clinic_id: string;
  amount_cents: number;
  gl_account_id?: string;
  gl_account_name?: string;
  template_id?: string;
  created_by_user_id?: string;
  created_at: string;
}

/**
 * Get all active coding templates
 */
export function getAllCodingTemplates(): CodingTemplate[] {
  const db = getDatabase();
  const templates = db.prepare(`
    SELECT * FROM coding_templates WHERE is_active = 1 ORDER BY name
  `).all() as CodingTemplate[];
  return templates;
}

/**
 * Get coding templates for a specific vendor
 */
export function getCodingTemplatesByVendor(vendorName: string): CodingTemplate[] {
  const db = getDatabase();
  const templates = db.prepare(`
    SELECT * FROM coding_templates 
    WHERE is_active = 1 AND (vendor_name = ? OR vendor_id = ?)
    ORDER BY name
  `).all(vendorName, vendorName) as CodingTemplate[];
  return templates;
}

/**
 * Get a specific coding template by ID
 */
export function getCodingTemplateById(templateId: string): CodingTemplate | null {
  const db = getDatabase();
  const template = db.prepare(`
    SELECT * FROM coding_templates WHERE id = ?
  `).get(templateId) as CodingTemplate | undefined;
  return template || null;
}

/**
 * Create a new coding template
 */
export function createCodingTemplate(
  name: string,
  vendorName: string,
  glAccountName: string,
  createdByUserId: string
): CodingTemplate {
  const db = getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO coding_templates (
      id, name, vendor_name, allocation_type, apply_to_locations,
      gl_account_name, created_by_user_id, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, name, vendorName, 'equal_split', 'all_locations',
    glAccountName, createdByUserId, 1, now, now
  );

  return getCodingTemplateById(id)!;
}

/**
 * Get all clinics
 */
export function getAllClinics() {
  const db = getDatabase();
  return db.prepare(`
    SELECT id, name, address, ship_to_reference, contact_name, created_at
    FROM clinics ORDER BY name
  `).all();
}

/**
 * Apply a coding template to an invoice
 * Creates allocations for all clinics with equal split
 */
export function applyCodingTemplate(
  invoiceId: string,
  templateId: string,
  actingUserId: string
): { success: boolean; error?: string; allocations?: InvoiceAllocation[] } {
  const db = getDatabase();

  try {
    // Get invoice
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
    if (!invoice) {
      return { success: false, error: 'Invoice not found' };
    }

    // Get template
    const template = getCodingTemplateById(templateId);
    if (!template) {
      return { success: false, error: 'Coding template not found' };
    }

    const templateType = (template as any).template_type || 'even_split';
    const totalAmountCents = invoice.amount_cents || 0;

    // Delete existing allocations
    db.prepare('DELETE FROM invoice_allocations WHERE invoice_id = ?').run(invoiceId);

    // Create allocations
    const allocations: InvoiceAllocation[] = [];
    const now = new Date().toISOString();

    if (templateType === 'table_template') {
      // Load template rows
      const templateRows = db.prepare(`
        SELECT * FROM table_template_rows 
        WHERE template_id = ?
        ORDER BY created_at
      `).all(templateId) as any[];

      if (templateRows.length === 0) {
        return { success: false, error: 'Template has no rows defined' };
      }

      // Get all clinics for mapping
      const clinics = getAllClinics() as any[];
      const clinicMap = new Map<string, any>();
      clinics.forEach(clinic => {
        // Map by name variations
        const nameLower = clinic.name.toLowerCase();
        clinicMap.set(nameLower, clinic);
        // Also map by location name patterns
        if (nameLower.includes('columbia')) clinicMap.set('general-columbia', clinic);
        if (nameLower.includes('ridgefield')) clinicMap.set('general-ridgefield', clinic);
        if (nameLower.includes('milwaukie')) clinicMap.set('general-milwaukie', clinic);
        if (nameLower.includes('salem')) clinicMap.set('general-salem', clinic);
        if (nameLower.includes('lebanon')) clinicMap.set('general-lebanon', clinic);
        if (nameLower.includes('eugene')) clinicMap.set('general-eugene', clinic);
        if (nameLower.includes('roseburg')) clinicMap.set('general-roseburg', clinic);
        if (nameLower.includes('riddle')) clinicMap.set('general-riddle', clinic);
      });

      // Calculate total from template rows (may be relative percentages)
      const templateTotalCents = templateRows.reduce((sum, row) => sum + (row.amount_cents || 0), 0);
      const isRelative = templateTotalCents !== totalAmountCents && templateTotalCents > 0;

      let allocatedTotal = 0;
      for (let i = 0; i < templateRows.length; i++) {
        const row = templateRows[i];
        const rowId = uuidv4();

        // Find clinic by class_name or location_name
        let clinic: any = null;
        if (row.class_name) {
          const classLower = row.class_name.toLowerCase();
          clinic = clinicMap.get(classLower) || 
                   Array.from(clinicMap.values()).find(c => 
                     c.name.toLowerCase().includes(classLower.replace('general-', ''))
                   );
        }
        if (!clinic && row.location_name) {
          const locLower = row.location_name.toLowerCase();
          clinic = clinicMap.get(locLower) ||
                   Array.from(clinicMap.values()).find(c => 
                     c.name.toLowerCase().includes(locLower)
                   );
        }

        if (!clinic) {
          console.warn(`[CODING_TEMPLATE] Could not find clinic for class "${row.class_name}" or location "${row.location_name}"`);
          // Skip this row if clinic not found
          continue;
        }

        // Calculate amount (adjust if relative percentages)
        let amountCents = row.amount_cents || 0;
        if (isRelative && templateTotalCents > 0) {
          // Convert to percentage and apply to invoice total
          const percentage = amountCents / templateTotalCents;
          amountCents = Math.round(totalAmountCents * percentage);
        }

        // Adjust last allocation to ensure exact total
        if (i === templateRows.length - 1) {
          const remaining = totalAmountCents - allocatedTotal;
          if (remaining > 0) {
            amountCents = remaining;
          }
        }

        allocatedTotal += amountCents;

        db.prepare(`
          INSERT INTO invoice_allocations (
            id, invoice_id, clinic_id, amount_cents, gl_account_name,
            template_id, created_by_user_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          rowId,
          invoiceId,
          clinic.id,
          amountCents,
          row.category_name || row.gl_account_path || template.gl_account_name,
          templateId,
          actingUserId,
          now
        );

        allocations.push({
          id: rowId,
          invoice_id: invoiceId,
          clinic_id: clinic.id,
          amount_cents: amountCents,
          gl_account_name: row.category_name || row.gl_account_path || template.gl_account_name,
          template_id: templateId,
          created_by_user_id: actingUserId,
          created_at: now
        });
      }
    } else {
      // Even split logic (existing)
      const clinics = getAllClinics() as any[];
      if (clinics.length === 0) {
        return { success: false, error: 'No clinics found' };
      }

      const numClinics = clinics.length;
      const baseAmount = Math.floor(totalAmountCents / numClinics);
      const remainder = totalAmountCents % numClinics;

      for (let i = 0; i < clinics.length; i++) {
        const clinic = clinics[i];
        const allocationId = uuidv4();
        
        // Add remainder to last allocation to ensure exact total
        const amount = i === clinics.length - 1 ? baseAmount + remainder : baseAmount;

        db.prepare(`
          INSERT INTO invoice_allocations (
            id, invoice_id, clinic_id, amount_cents, gl_account_name,
            template_id, created_by_user_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          allocationId, invoiceId, clinic.id, amount,
          template.gl_account_name, templateId, actingUserId, now
        );

        allocations.push({
          id: allocationId,
          invoice_id: invoiceId,
          clinic_id: clinic.id,
          amount_cents: amount,
          gl_account_name: template.gl_account_name,
          template_id: templateId,
          created_by_user_id: actingUserId,
          created_at: now
        });
      }
    }

    // Update invoice
    db.prepare(`
      UPDATE invoices SET
        is_multi_location = 1,
        coding_template_id = ?,
        coded_by_user_id = ?,
        coded_at = ?,
        status = 'coded',
        updated_at = ?
      WHERE id = ?
    `).run(templateId, actingUserId, now, now, invoiceId);

    // Log event
    db.prepare(`
      INSERT INTO invoice_events (invoice_id, action, actor_email, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      invoiceId,
      'apply_coding_template',
      actingUserId,
      JSON.stringify({ template_id: templateId, num_allocations: allocations.length }),
      now
    );

    return { success: true, allocations };
  } catch (error: any) {
    console.error('[CODING_TEMPLATE]', 'Error applying template:', error);
    return { success: false, error: error?.message || 'Failed to apply coding template' };
  }
}

/**
 * Get allocations for an invoice
 */
export function getInvoiceAllocations(invoiceId: string): InvoiceAllocation[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM invoice_allocations WHERE invoice_id = ? ORDER BY created_at
  `).all(invoiceId) as InvoiceAllocation[];
}

