/**
 * Invoice Field Materialization
 * 
 * Prevents "rewind on restart" by materializing effective fields.
 * When corrected_* fields exist, they take precedence over parsed_*.
 * Effective fields are computed once and stored, never recomputed.
 */

export interface InvoiceFields {
  // Parsed fields (from OCR/parser)
  parsed_invoice_number?: string;
  parsed_vendor?: string;
  parsed_amount?: string;
  parsed_due_date?: string;
  parsed_invoice_date?: string;
  parsed_office?: string;
  parsed_category?: string;

  // Corrected fields (user edits)
  corrected_invoice_number?: string;
  corrected_vendor?: string;
  corrected_amount?: string;
  corrected_due_date?: string;
  corrected_invoice_date?: string;
  corrected_office?: string;
  corrected_category?: string;

  // Effective fields (materialized, never recomputed)
  effective_invoice_number?: string;
  effective_vendor?: string;
  effective_amount?: string;
  effective_due_date?: string;
  effective_invoice_date?: string;
  effective_office?: string;
  effective_category?: string;

  // Metadata
  materialized_at?: string;
  materialized_by?: string;
}

/**
 * Materialize effective fields from parsed and corrected values
 * Corrected values take precedence over parsed values
 * 
 * @param fields Invoice fields object
 * @param materializerEmail Email of user/system performing materialization
 * @returns Updated fields with effective_* fields populated
 */
export function materializeFields(
  fields: InvoiceFields,
  materializerEmail: string = 'system'
): InvoiceFields {
  const now = new Date().toISOString();

  return {
    ...fields,
    // Materialize each field: corrected > parsed > undefined
    effective_invoice_number: fields.corrected_invoice_number || fields.parsed_invoice_number,
    effective_vendor: fields.corrected_vendor || fields.parsed_vendor,
    effective_amount: fields.corrected_amount || fields.parsed_amount,
    effective_due_date: fields.corrected_due_date || fields.parsed_due_date,
    effective_invoice_date: fields.corrected_invoice_date || fields.parsed_invoice_date,
    effective_office: fields.corrected_office || fields.parsed_office,
    effective_category: fields.corrected_category || fields.parsed_category,

    // Track when materialization occurred
    materialized_at: now,
    materialized_by: materializerEmail.toLowerCase().trim(),
  };
}

/**
 * Check if a field has been corrected by user
 */
export function isFieldCorrected(
  fields: InvoiceFields,
  fieldName: keyof Omit<InvoiceFields, 'materialized_at' | 'materialized_by'>
): boolean {
  const correctedField = `corrected_${fieldName.replace('parsed_', '')}` as keyof InvoiceFields;
  return !!fields[correctedField];
}

/**
 * Get the source of a field (corrected, parsed, or undefined)
 */
export function getFieldSource(
  fields: InvoiceFields,
  fieldName: string
): 'corrected' | 'parsed' | 'undefined' {
  const correctedKey = `corrected_${fieldName}` as keyof InvoiceFields;
  const parsedKey = `parsed_${fieldName}` as keyof InvoiceFields;

  if (fields[correctedKey]) return 'corrected';
  if (fields[parsedKey]) return 'parsed';
  return 'undefined';
}

/**
 * Revert a corrected field back to parsed value
 */
export function revertField(
  fields: InvoiceFields,
  fieldName: string,
  materializerEmail: string = 'system'
): InvoiceFields {
  const correctedKey = `corrected_${fieldName}` as keyof InvoiceFields;
  const updated = { ...fields };
  delete updated[correctedKey];

  // Re-materialize after revert
  return materializeFields(updated, materializerEmail);
}

/**
 * Correct a field (user edit)
 */
export function correctField(
  fields: InvoiceFields,
  fieldName: string,
  value: string,
  materializerEmail: string = 'system'
): InvoiceFields {
  const correctedKey = `corrected_${fieldName}` as keyof InvoiceFields;
  const updated = {
    ...fields,
    [correctedKey]: value,
  };

  // Re-materialize after correction
  return materializeFields(updated, materializerEmail);
}

/**
 * Get all corrected fields
 */
export function getCorrectedFields(fields: InvoiceFields): Record<string, string> {
  const corrected: Record<string, string> = {};
  const fieldNames = [
    'invoice_number',
    'vendor',
    'amount',
    'due_date',
    'invoice_date',
    'office',
    'category',
  ];

  for (const name of fieldNames) {
    const key = `corrected_${name}` as keyof InvoiceFields;
    if (fields[key]) {
      corrected[name] = String(fields[key]);
    }
  }

  return corrected;
}

/**
 * Validate that effective fields are set
 * Throws error if any effective field is missing
 */
export function validateMaterialization(fields: InvoiceFields): void {
  const required = [
    'effective_invoice_number',
    'effective_vendor',
    'effective_amount',
  ];

  const missing = required.filter(field => !fields[field as keyof InvoiceFields]);
  if (missing.length > 0) {
    throw new Error(
      `Materialization incomplete: missing ${missing.join(', ')}. ` +
      `Call materializeFields() first.`
    );
  }
}

