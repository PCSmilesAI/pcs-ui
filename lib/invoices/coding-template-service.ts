import { getDatabase } from '../db/client';
import { v4 as uuidv4 } from 'uuid';
import { getDentalOffices } from '../qbo/pcsClasses';

export interface CodingTemplate {
  id: string;
  name: string;
  description?: string;
  vendor_id?: string;
  vendor_name?: string;
  allocation_type: 'equal_split';
  apply_to_locations: 'all_locations';
  gl_account_id?: string;
  gl_account_name?: string;
  template_type?: string; // 'even_split' or 'table_template'
  allocation_mode?: 'split_evenly' | 'split_evenly_all_classes' | 'fixed_amount' | 'percentage';
  created_by_user_id?: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateRow {
  id: string;
  template_id: string;
  gl_account_path: string;
  category_name?: string;
  description?: string;
  class_name?: string;
  location_name?: string;
  amount_cents?: number;
  percentage?: number;
  created_at: string;
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
 * Get template rows for a specific template
 */
export function getTemplateRows(templateId: string): TemplateRow[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM table_template_rows 
    WHERE template_id = ?
    ORDER BY created_at
  `).all(templateId) as TemplateRow[];
}

/**
 * Calculate allocation amounts based on template's allocation mode
 */
function calculateAllocations(
  templateRows: TemplateRow[],
  totalAmountCents: number,
  allocationMode: string
): { amountCents: number; row: TemplateRow }[] {
  const numRows = templateRows.length;
  
  if (allocationMode === 'split_evenly' || allocationMode === 'split_evenly_all_classes') {
    // Split evenly among all rows (split_evenly_all_classes uses all QBO classes)
    const baseAmount = Math.floor(totalAmountCents / numRows);
    const remainder = totalAmountCents % numRows;
    
    return templateRows.map((row, index) => ({
      amountCents: index === numRows - 1 ? baseAmount + remainder : baseAmount,
      row
    }));
  }
  
  if (allocationMode === 'percentage') {
    // Apply percentage to invoice total
    let allocatedTotal = 0;
    
    return templateRows.map((row, index) => {
      const percentage = row.percentage || 0;
      let amountCents = Math.round(totalAmountCents * percentage / 100);
      
      // Adjust last row for rounding errors
      if (index === numRows - 1) {
        amountCents = totalAmountCents - allocatedTotal;
      } else {
        allocatedTotal += amountCents;
      }
      
      return { amountCents, row };
    });
  }
  
  if (allocationMode === 'fixed_amount') {
    // Use fixed amounts, scale proportionally if template total differs from invoice total
    const templateTotal = templateRows.reduce((sum, row) => sum + (row.amount_cents || 0), 0);
    const scale = templateTotal > 0 ? totalAmountCents / templateTotal : 1;
    
    let allocatedTotal = 0;
    
    return templateRows.map((row, index) => {
      let amountCents = Math.round((row.amount_cents || 0) * scale);
      
      // Adjust last row for rounding errors
      if (index === numRows - 1) {
        amountCents = totalAmountCents - allocatedTotal;
      } else {
        allocatedTotal += amountCents;
      }
      
      return { amountCents, row };
    });
  }
  
  // Fallback to even split
  const baseAmount = Math.floor(totalAmountCents / numRows);
  const remainder = totalAmountCents % numRows;
  
  return templateRows.map((row, index) => ({
    amountCents: index === numRows - 1 ? baseAmount + remainder : baseAmount,
    row
  }));
}

/**
 * Apply a coding template to an invoice
 * Handles all allocation modes: split_evenly, percentage, fixed_amount
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

    const allocationMode = (template as any).allocation_mode || 'split_evenly';
    const totalAmountCents = invoice.amount_cents || 0;

    // Delete existing allocations
    db.prepare('DELETE FROM invoice_allocations WHERE invoice_id = ?').run(invoiceId);

    // Create allocations
    const allocations: InvoiceAllocation[] = [];
    const now = new Date().toISOString();

    // Load template rows
    let templateRows = getTemplateRows(templateId);

    // For split_evenly modes, auto-generate rows from dental offices if none exist
    // This handles both 'split_evenly' and 'split_evenly_all_classes' modes
    if ((allocationMode === 'split_evenly_all_classes' || allocationMode === 'split_evenly') && templateRows.length === 0) {
      console.log(`[CODING_TEMPLATE] Auto-generating rows for ${allocationMode} mode (no rows defined)`);
      const dentalOffices = getDentalOffices();
      
      if (dentalOffices.length === 0) {
        return { success: false, error: 'No dental office classes available for even split mode' };
      }
      
      // Create virtual template rows from dental offices (all 8 locations)
      templateRows = dentalOffices.map((office) => ({
        id: `auto-${office.id}`,
        template_id: templateId,
        gl_account_path: template.gl_account_name || '',
        category_name: template.gl_account_name || '',
        description: '',
        class_name: office.name,
        location_name: office.name,
        created_at: now,
      })) as TemplateRow[];
      
      console.log(`[CODING_TEMPLATE] Auto-generated ${templateRows.length} rows from dental offices for ${allocationMode} mode`);
    }

    if (templateRows.length === 0) {
      return { success: false, error: 'Template has no rows defined. Add rows to the template or use a split evenly mode.' };
    }

    // Get all clinics for mapping
    const clinics = getAllClinics() as any[];
    const clinicMap = new Map<string, any>();
    clinics.forEach(clinic => {
      // Map by name variations
      const nameLower = clinic.name.toLowerCase();
      clinicMap.set(nameLower, clinic);
      // Also map by location name patterns
      const patterns = ['columbia', 'ridgefield', 'milwaukie', 'salem', 'lebanon', 'eugene', 'roseburg', 'riddle', 'longview', 'hazel dell', 'snohomish', '15th st'];
      patterns.forEach(pattern => {
        if (nameLower.includes(pattern)) {
          clinicMap.set(`general-${pattern}`, clinic);
          clinicMap.set(pattern, clinic);
        }
      });
    });

    // Calculate allocations based on mode
    const calculatedAllocations = calculateAllocations(templateRows, totalAmountCents, allocationMode);

    for (const { amountCents, row } of calculatedAllocations) {
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

      // Use a default clinic if not found
      if (!clinic) {
        console.warn(`[CODING_TEMPLATE] Could not find clinic for class "${row.class_name}" or location "${row.location_name}", using first clinic`);
        clinic = clinics[0];
      }

      if (!clinic) {
        console.error('[CODING_TEMPLATE] No clinics available');
        continue;
      }

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
      JSON.stringify({ 
        template_id: templateId, 
        allocation_mode: allocationMode,
        num_allocations: allocations.length 
      }),
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

