'use client';

import React, { useState, useEffect } from 'react';

interface CodingTemplate {
  id: string;
  name: string;
  vendor_name: string;
  gl_account_name: string;
  template_type?: string;
}

interface QBOCategory {
  id: string;
  name: string;
  type: string;
  subtype: string;
}

interface QBOLocation {
  id: string;
  name: string;
  fullName: string;
}

interface TableTemplateRow {
  id: string;
  glAccountPath: string;
  categoryName: string;
  className: string;
  locationName: string;
  amount: string;
}

interface CreateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateInvoiceModal({ isOpen, onClose, onSuccess }: CreateInvoiceModalProps) {
  const [templates, setTemplates] = useState<CodingTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [templateType, setTemplateType] = useState<'even_split' | 'table_template'>('even_split');
  const [templateId, setTemplateId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [amount, setAmount] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Table template state
  const [tableRows, setTableRows] = useState<TableTemplateRow[]>([
    { id: '1', glAccountPath: '', categoryName: '', className: '', locationName: '', amount: '' }
  ]);
  const [qboCategories, setQboCategories] = useState<QBOCategory[]>([]);
  const [qboLocations, setQboLocations] = useState<QBOLocation[]>([]);
  const [chartOfAccounts, setChartOfAccounts] = useState<string[]>([]);
  const [loadingQBOData, setLoadingQBOData] = useState(false);

  // Load templates and QBO data on mount
  useEffect(() => {
    if (isOpen) {
      loadTemplates();
      if (templateType === 'table_template') {
        loadQBOData();
      }
    }
  }, [isOpen, templateType]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/coding-templates');
      if (!res.ok) throw new Error('Failed to load templates');
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const loadQBOData = async () => {
    try {
      setLoadingQBOData(true);
      // Load QBO categories
      const categoriesRes = await fetch('/api/qbo/categories');
      if (categoriesRes.ok) {
        const categoriesData = await categoriesRes.json();
        setQboCategories(categoriesData.categories || []);
      }

      // Load QBO locations (classes)
      const locationsRes = await fetch('/api/qbo/classes');
      if (locationsRes.ok) {
        const locationsData = await locationsRes.json();
        setQboLocations(locationsData.classes || []);
      }

      // Load chart of accounts
      const chartRes = await fetch('/api/qbo/chart-of-accounts');
      if (chartRes.ok) {
        const chartData = await chartRes.json();
        setChartOfAccounts(chartData.accounts || []);
      }
    } catch (err: any) {
      console.error('Failed to load QBO data:', err);
    } finally {
      setLoadingQBOData(false);
    }
  };

  const addTableRow = () => {
    setTableRows([...tableRows, {
      id: Date.now().toString(),
      glAccountPath: '',
      categoryName: '',
      className: '',
      locationName: '',
      amount: ''
    }]);
  };

  const removeTableRow = (id: string) => {
    if (tableRows.length > 1) {
      setTableRows(tableRows.filter(row => row.id !== id));
    }
  };

  const updateTableRow = (id: string, field: keyof TableTemplateRow, value: string) => {
    setTableRows(tableRows.map(row =>
      row.id === id ? { ...row, [field]: value } : row
    ));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validation
    if (!invoiceNumber || !vendorName) {
      setError('Please fill in invoice number and vendor name');
      return;
    }

    if (templateType === 'even_split') {
      if (!amount) {
        setError('Please fill in amount for even split template');
        return;
      }
    } else if (templateType === 'table_template') {
      // Validate table rows
      const totalAmount = tableRows.reduce((sum, row) => {
        const rowAmount = parseFloat(row.amount) || 0;
        return sum + rowAmount;
      }, 0);
      
      if (totalAmount === 0) {
        setError('Please fill in at least one table row with an amount');
        return;
      }

      // Validate all rows have required fields
      for (const row of tableRows) {
        if (!row.glAccountPath || !row.amount) {
          setError('All table rows must have GL Account and Amount');
          return;
        }
      }
    }

    try {
      setSubmitting(true);

      // Create FormData to handle file upload
      const formData = new FormData();
      formData.append('template_type', templateType);
      if (templateId) {
        formData.append('template_id', templateId);
      }
      formData.append('invoice_number', invoiceNumber);
      formData.append('vendor_name', vendorName);
      
      if (templateType === 'even_split') {
        const amountCents = Math.round(parseFloat(amount) * 100);
        formData.append('amount_cents', amountCents.toString());
      } else {
        // For table template, calculate total from rows
        const totalAmount = tableRows.reduce((sum, row) => {
          const rowAmount = parseFloat(row.amount) || 0;
          return sum + rowAmount;
        }, 0);
        const amountCents = Math.round(totalAmount * 100);
        formData.append('amount_cents', amountCents.toString());
        formData.append('table_rows', JSON.stringify(tableRows));
      }
      
      formData.append('invoice_date', invoiceDate);
      formData.append('due_date', dueDate || '');
      formData.append('description', description || '');
      if (pdfFile) {
        formData.append('pdf_file', pdfFile);
      }

      const res = await fetch('/api/invoices/create-from-template', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create invoice');
      }

      const data = await res.json();
      const allocationCount = data.allocations?.length || data.tableRows?.length || 0;
      setSuccess(`✅ Invoice ${invoiceNumber} created with ${allocationCount} line item(s)!`);

      // Reset form
      setTemplateType('even_split');
      setTemplateId('');
      setInvoiceNumber('');
      setVendorName('');
      setAmount('');
      setInvoiceDate(new Date().toISOString().split('T')[0]);
      setDueDate('');
      setDescription('');
      setPdfFile(null);
      setTableRows([{ id: '1', glAccountPath: '', categoryName: '', className: '', locationName: '', amount: '' }]);

      // Close modal and refresh
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '24px',
        maxWidth: '500px',
        width: '90%',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>Create Invoice from Template</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#666',
            }}
          >
            ✕
          </button>
        </div>

        {error && (
          <div style={{
            backgroundColor: '#fee',
            color: '#c33',
            padding: '12px',
            borderRadius: '4px',
            marginBottom: '16px',
            fontSize: '14px',
          }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{
            backgroundColor: '#efe',
            color: '#3c3',
            padding: '12px',
            borderRadius: '4px',
            marginBottom: '16px',
            fontSize: '14px',
          }}>
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Template Type Selection */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>
              Template Type *
            </label>
            <select
              value={templateType}
              onChange={(e) => {
                setTemplateType(e.target.value as 'even_split' | 'table_template');
                setTemplateId(''); // Reset template selection when type changes
              }}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            >
              <option value="even_split">Even Split Across All Offices</option>
              <option value="table_template">Table Template (GL Account/Category/Class/Amount)</option>
            </select>
          </div>

          {/* Template Selection (optional for even_split) */}
          {templateType === 'even_split' && (
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>
                Coding Template (Optional)
              </label>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
              >
                <option value="">None (create new)</option>
                {templates.filter(t => !t.template_type || t.template_type === 'even_split').map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.vendor_name})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Invoice Number */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>
              Invoice Number *
            </label>
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="e.g., INV-2025-001"
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Vendor Name */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>
              Vendor Name *
            </label>
            <input
              type="text"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="e.g., IT Support Services"
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Amount (only for even_split) */}
          {templateType === 'even_split' && (
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>
                Total Amount ($) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                This amount will be split evenly across all 8 offices
              </div>
            </div>
          )}

          {/* Table Template UI */}
          {templateType === 'table_template' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ display: 'block', fontWeight: '500', fontSize: '14px' }}>
                  Line Items *
                </label>
                <button
                  type="button"
                  onClick={addTableRow}
                  style={{
                    padding: '4px 12px',
                    border: '1px solid #2563eb',
                    borderRadius: '4px',
                    backgroundColor: '#fff',
                    color: '#2563eb',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '500',
                  }}
                >
                  + Add Row
                </button>
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid #ddd', borderRadius: '4px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f5f5f5' }}>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd', fontWeight: '600' }}>GL Account</th>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd', fontWeight: '600' }}>Category</th>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd', fontWeight: '600' }}>Class (Location)</th>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd', fontWeight: '600' }}>Amount ($)</th>
                      <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #ddd', fontWeight: '600', width: '50px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row) => (
                      <tr key={row.id}>
                        <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
                          <input
                            type="text"
                            value={row.glAccountPath}
                            onChange={(e) => updateTableRow(row.id, 'glAccountPath', e.target.value)}
                            placeholder="e.g., 50000 Expenses: 52110 Dental Supplies"
                            list={`gl-accounts-${row.id}`}
                            style={{
                              width: '100%',
                              padding: '4px',
                              border: '1px solid #ddd',
                              borderRadius: '2px',
                              fontSize: '12px',
                            }}
                          />
                          <datalist id={`gl-accounts-${row.id}`}>
                            {chartOfAccounts.map((account) => (
                              <option key={account} value={account} />
                            ))}
                          </datalist>
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
                          <select
                            value={row.categoryName}
                            onChange={(e) => updateTableRow(row.id, 'categoryName', e.target.value)}
                            style={{
                              width: '100%',
                              padding: '4px',
                              border: '1px solid #ddd',
                              borderRadius: '2px',
                              fontSize: '12px',
                            }}
                          >
                            <option value="">Select...</option>
                            {qboCategories.map((cat) => (
                              <option key={cat.id} value={cat.name}>
                                {cat.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
                          <select
                            value={row.locationName}
                            onChange={(e) => updateTableRow(row.id, 'locationName', e.target.value)}
                            style={{
                              width: '100%',
                              padding: '4px',
                              border: '1px solid #ddd',
                              borderRadius: '2px',
                              fontSize: '12px',
                            }}
                          >
                            <option value="">Select...</option>
                            {qboLocations.map((loc) => (
                              <option key={loc.id} value={loc.name}>
                                {loc.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.amount}
                            onChange={(e) => updateTableRow(row.id, 'amount', e.target.value)}
                            placeholder="0.00"
                            style={{
                              width: '100%',
                              padding: '4px',
                              border: '1px solid #ddd',
                              borderRadius: '2px',
                              fontSize: '12px',
                            }}
                          />
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #eee', textAlign: 'center' }}>
                          {tableRows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeTableRow(row.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#dc2626',
                                cursor: 'pointer',
                                fontSize: '16px',
                                padding: '0',
                                width: '24px',
                                height: '24px',
                              }}
                              title="Remove row"
                            >
                              ×
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} style={{ padding: '8px', textAlign: 'right', fontWeight: '600', borderTop: '2px solid #ddd' }}>
                        Total:
                      </td>
                      <td style={{ padding: '8px', fontWeight: '600', borderTop: '2px solid #ddd' }}>
                        ${tableRows.reduce((sum, row) => sum + (parseFloat(row.amount) || 0), 0).toFixed(2)}
                      </td>
                      <td style={{ padding: '8px', borderTop: '2px solid #ddd' }}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Invoice Date */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>
              Invoice Date
            </label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Due Date */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>
              Due Date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes..."
              rows={3}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* PDF Attachment */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>
              PDF Attachment
            </label>
            <div style={{
              border: '2px dashed #ddd',
              borderRadius: '4px',
              padding: '12px',
              textAlign: 'center',
              backgroundColor: pdfFile ? '#f0f9ff' : '#fafafa',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && file.type === 'application/pdf') {
                    setPdfFile(file);
                  } else if (file) {
                    setError('Please select a valid PDF file');
                  }
                }}
                style={{
                  display: 'none',
                }}
                id="pdf-input"
              />
              <label
                htmlFor="pdf-input"
                style={{
                  display: 'block',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: pdfFile ? '#2563eb' : '#666',
                }}
              >
                {pdfFile ? (
                  <>
                    <i className="fas fa-file-pdf" style={{ marginRight: '8px', color: '#dc2626' }}></i>
                    {pdfFile.name}
                  </>
                ) : (
                  <>
                    <i className="fas fa-cloud-upload-alt" style={{ marginRight: '8px', color: '#999' }}></i>
                    Click to upload PDF or drag and drop
                  </>
                )}
              </label>
            </div>
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                flex: 1,
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                backgroundColor: '#f5f5f5',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || loading}
              style={{
                flex: 1,
                padding: '10px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: '#2563eb',
                color: 'white',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                opacity: submitting || loading ? 0.6 : 1,
              }}
            >
              {submitting ? 'Creating...' : 'Create Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

