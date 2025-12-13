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
  isEditing: boolean;
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
    { id: '1', glAccountPath: '', categoryName: '', className: '', locationName: '', amount: '', isEditing: true }
  ]);
  const [qboCategories, setQboCategories] = useState<QBOCategory[]>([]);
  const [qboLocations, setQboLocations] = useState<QBOLocation[]>([]);
  const [chartOfAccounts, setChartOfAccounts] = useState<string[]>([]);
  const [loadingQBOData, setLoadingQBOData] = useState(false);

  // Styles matching InvoiceDetailPage
  const sectionStyle = {
    borderBottom: '1px solid #357ab2',
    padding: '16px',
  };
  const sectionTitleStyle = {
    fontSize: '18px',
    fontWeight: '600' as const,
    color: '#357ab2',
    marginBottom: '12px',
  };
  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse' as const,
    borderLeft: '1px solid #357ab2',
    borderTop: '1px solid #357ab2',
    fontSize: '14px',
  };
  const cellHeaderStyle = {
    padding: '8px 12px',
    borderRight: '1px solid #357ab2',
    borderBottom: '1px solid #357ab2',
    fontWeight: '500' as const,
    color: '#4a5568',
    backgroundColor: '#f8fafc',
    textAlign: 'left' as const,
    width: '35%',
  };
  const cellStyle = {
    padding: '8px 12px',
    borderRight: '1px solid #357ab2',
    borderBottom: '1px solid #357ab2',
    color: '#1f1f1f',
    backgroundColor: '#ffffff',
  };
  const inputStyle = {
    border: '1px solid #cbd5e0',
    borderRadius: '4px',
    padding: '6px 10px',
    fontSize: '14px',
    width: '100%',
    boxSizing: 'border-box' as const,
  };

  // Load templates and QBO data on mount
  useEffect(() => {
    if (isOpen) {
      loadTemplates();
      loadQBOData();
    }
  }, [isOpen]);

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
      const categoriesRes = await fetch('/api/qbo/categories');
      if (categoriesRes.ok) {
        const categoriesData = await categoriesRes.json();
        setQboCategories(categoriesData.categories || []);
      }

      const locationsRes = await fetch('/api/qbo/classes');
      if (locationsRes.ok) {
        const locationsData = await locationsRes.json();
        setQboLocations(locationsData.classes || []);
      }

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
      amount: '',
      isEditing: true
    }]);
  };

  const removeTableRow = (id: string) => {
    if (tableRows.length > 1) {
      setTableRows(tableRows.filter(row => row.id !== id));
    }
  };

  const updateTableRow = (id: string, field: keyof TableTemplateRow, value: string | boolean) => {
    setTableRows(tableRows.map(row =>
      row.id === id ? { ...row, [field]: value } : row
    ));
  };

  const confirmRow = (id: string) => {
    setTableRows(tableRows.map(row =>
      row.id === id ? { ...row, isEditing: false } : row
    ));
  };

  // Calculate allocation summary
  const totalAmount = templateType === 'even_split' 
    ? parseFloat(amount) || 0 
    : tableRows.reduce((sum, row) => sum + (parseFloat(row.amount) || 0), 0);
  const allocated = templateType === 'even_split' 
    ? (parseFloat(amount) || 0) 
    : tableRows.reduce((sum, row) => sum + (parseFloat(row.amount) || 0), 0);
  const unallocated = 0; // For create modal, we don't track unallocated

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

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
      const totalAmount = tableRows.reduce((sum, row) => {
        const rowAmount = parseFloat(row.amount) || 0;
        return sum + rowAmount;
      }, 0);
      
      if (totalAmount === 0) {
        setError('Please fill in at least one GL line with an amount');
        return;
      }

      for (const row of tableRows) {
        if (row.amount && parseFloat(row.amount) > 0 && !row.glAccountPath) {
          setError('All GL lines with amounts must have an Account selected');
          return;
        }
      }
    }

    try {
      setSubmitting(true);

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
        const totalAmount = tableRows.reduce((sum, row) => {
          const rowAmount = parseFloat(row.amount) || 0;
          return sum + rowAmount;
        }, 0);
        const amountCents = Math.round(totalAmount * 100);
        formData.append('amount_cents', amountCents.toString());
        formData.append('table_rows', JSON.stringify(tableRows.filter(r => parseFloat(r.amount) > 0)));
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
      setSuccess(`Invoice ${invoiceNumber} created with ${allocationCount} GL line(s)!`);

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
      setTableRows([{ id: '1', glAccountPath: '', categoryName: '', className: '', locationName: '', amount: '', isEditing: true }]);

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
        maxWidth: '700px',
        width: '95%',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
        border: '1px solid #357ab2',
      }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          padding: '16px 20px',
          borderBottom: '2px solid #357ab2',
          backgroundColor: '#f8fafc'
        }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#357ab2' }}>Create Invoice</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#666',
              padding: '0 4px',
            }}
          >
            ×
          </button>
        </div>

        {error && (
          <div style={{
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            padding: '12px 20px',
            fontSize: '14px',
            borderBottom: '1px solid #fca5a5',
          }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{
            backgroundColor: '#d1fae5',
            color: '#065f46',
            padding: '12px 20px',
            fontSize: '14px',
            borderBottom: '1px solid #6ee7b7',
          }}>
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Invoice Details Section */}
          <div style={sectionStyle}>
            <h3 style={sectionTitleStyle}>Invoice Details</h3>
            <table style={tableStyle}>
              <tbody>
                <tr>
                  <td style={cellHeaderStyle}>Invoice # *</td>
                  <td style={cellStyle}>
                    <input
                      type="text"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      placeholder="e.g., INV-2025-001"
                      style={inputStyle}
                    />
                  </td>
                </tr>
                <tr>
                  <td style={cellHeaderStyle}>Vendor *</td>
                  <td style={cellStyle}>
                    <input
                      type="text"
                      value={vendorName}
                      onChange={(e) => setVendorName(e.target.value)}
                      placeholder="e.g., Henry Schein"
                      style={inputStyle}
                    />
                  </td>
                </tr>
                <tr>
                  <td style={cellHeaderStyle}>Invoice Date</td>
                  <td style={cellStyle}>
                    <input
                      type="date"
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                      style={inputStyle}
                    />
                  </td>
                </tr>
                <tr>
                  <td style={cellHeaderStyle}>Due Date</td>
                  <td style={cellStyle}>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      style={inputStyle}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* GL Lines Section */}
          <div style={sectionStyle}>
            <h3 style={sectionTitleStyle}>GL Lines ({templateType === 'even_split' ? '8 offices' : tableRows.length})</h3>
            
            {/* Template Type Selection */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', gap: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="templateType"
                    checked={templateType === 'even_split'}
                    onChange={() => setTemplateType('even_split')}
                    style={{ accentColor: '#357ab2' }}
                  />
                  <span style={{ fontSize: '14px' }}>Even Split (All 8 Offices)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="templateType"
                    checked={templateType === 'table_template'}
                    onChange={() => setTemplateType('table_template')}
                    style={{ accentColor: '#357ab2' }}
                  />
                  <span style={{ fontSize: '14px' }}>Custom GL Lines</span>
                </label>
              </div>
            </div>

            {/* Allocation Summary Bar */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              backgroundColor: totalAmount > 0 ? '#ecfdf5' : '#fef2f2',
              border: `1px solid ${totalAmount > 0 ? '#10b981' : '#ef4444'}`,
              borderRadius: '6px',
              marginBottom: '16px'
            }}>
              <div style={{ display: 'flex', gap: '24px', fontSize: '14px' }}>
                <span><strong>Invoice Total:</strong> ${totalAmount.toFixed(2)}</span>
                <span><strong>Allocated:</strong> ${allocated.toFixed(2)}</span>
              </div>
              {totalAmount > 0 ? (
                <span style={{ 
                  backgroundColor: '#10b981', 
                  color: 'white', 
                  padding: '4px 12px', 
                  borderRadius: '12px', 
                  fontSize: '12px',
                  fontWeight: '600'
                }}>
                  ✓ Ready
                </span>
              ) : (
                <span style={{ 
                  backgroundColor: '#ef4444', 
                  color: 'white', 
                  padding: '4px 12px', 
                  borderRadius: '12px', 
                  fontSize: '12px',
                  fontWeight: '600'
                }}>
                  Enter Amount
                </span>
              )}
            </div>

            {/* Even Split Mode */}
            {templateType === 'even_split' && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{
                  padding: '14px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  backgroundColor: '#f8fafc'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#357ab2' }}>
                      GL Line 1
                    </span>
                    <span style={{ fontSize: '16px', fontWeight: '600', color: '#10b981' }}>
                      ${(parseFloat(amount) || 0).toFixed(2)}
                    </span>
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '4px' }}>
                      Total Amount ($) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      style={inputStyle}
                    />
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                      This amount will be split evenly across all 8 offices
                    </div>
                  </div>
                  <div style={{ fontSize: '13px', color: '#374151' }}>
                    <strong>Split per office:</strong> ${((parseFloat(amount) || 0) / 8).toFixed(2)}
                  </div>
                </div>

                {/* Coding Template Selection */}
                <div style={{ marginTop: '12px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '4px' }}>
                    Apply Coding Template (Optional)
                  </label>
                  <select
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    disabled={loading}
                    style={{
                      ...inputStyle,
                      cursor: loading ? 'wait' : 'pointer',
                    }}
                  >
                    <option value="">-- Select a template --</option>
                    {templates.filter(t => !t.template_type || t.template_type === 'even_split').map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.vendor_name})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Custom GL Lines Mode */}
            {templateType === 'table_template' && (
              <div style={{ marginBottom: '16px' }}>
                {tableRows.map((row, index) => (
                  <div key={row.id} style={{
                    padding: '14px',
                    border: row.isEditing ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                    borderRadius: '6px',
                    backgroundColor: row.isEditing ? '#f0f9ff' : '#f8fafc',
                    marginBottom: '12px'
                  }}>
                    {row.isEditing ? (
                      /* EDIT MODE */
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <span style={{ fontSize: '12px', fontWeight: '600', color: '#3b82f6' }}>
                            GL Line {index + 1} (Editing)
                          </span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              type="button"
                              onClick={() => confirmRow(row.id)}
                              style={{
                                padding: '4px 12px',
                                backgroundColor: '#10b981',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: '600'
                              }}
                            >
                              ✓ Done
                            </button>
                            {tableRows.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeTableRow(row.id)}
                                style={{
                                  padding: '4px 8px',
                                  backgroundColor: '#fee2e2',
                                  color: '#991b1b',
                                  border: '1px solid #fca5a5',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: 'bold'
                                }}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 200px' }}>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '4px' }}>
                              Account *
                            </label>
                            <input
                              type="text"
                              value={row.glAccountPath}
                              onChange={(e) => updateTableRow(row.id, 'glAccountPath', e.target.value)}
                              placeholder="e.g., 11010 Dental Equipment"
                              list={`gl-accounts-${row.id}`}
                              style={inputStyle}
                            />
                            <datalist id={`gl-accounts-${row.id}`}>
                              {chartOfAccounts.map((account) => (
                                <option key={account} value={account} />
                              ))}
                            </datalist>
                          </div>

                          <div style={{ flex: '1 1 150px' }}>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '4px' }}>
                              Class (Location)
                            </label>
                            <select
                              value={row.locationName}
                              onChange={(e) => updateTableRow(row.id, 'locationName', e.target.value)}
                              style={inputStyle}
                            >
                              <option value="">Select...</option>
                              {qboLocations.map((loc) => (
                                <option key={loc.id} value={loc.name}>
                                  {loc.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div style={{ flex: '0 0 120px' }}>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '4px' }}>
                              Amount ($) *
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={row.amount}
                              onChange={(e) => updateTableRow(row.id, 'amount', e.target.value)}
                              placeholder="0.00"
                              style={inputStyle}
                            />
                          </div>
                        </div>
                      </>
                    ) : (
                      /* VIEW MODE */
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              <span style={{ fontSize: '12px', fontWeight: '600', color: '#357ab2' }}>
                                GL Line {index + 1}
                              </span>
                              <span style={{ fontSize: '16px', fontWeight: '600', color: '#10b981' }}>
                                ${parseFloat(row.amount || '0').toFixed(2)}
                              </span>
                            </div>
                            <div style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937' }}>
                              {row.glAccountPath || 'No account selected'}
                            </div>
                            {row.locationName && (
                              <div style={{ fontSize: '13px', color: '#6b7280' }}>
                                Class: {row.locationName}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              type="button"
                              onClick={() => updateTableRow(row.id, 'isEditing', true)}
                              style={{
                                padding: '4px 12px',
                                backgroundColor: '#f3f4f6',
                                color: '#374151',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: '500'
                              }}
                            >
                              Edit
                            </button>
                            {tableRows.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeTableRow(row.id)}
                                style={{
                                  padding: '4px 8px',
                                  backgroundColor: '#fee2e2',
                                  color: '#991b1b',
                                  border: '1px solid #fca5a5',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: 'bold'
                                }}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}

                {/* Add GL Line Button */}
                <button
                  type="button"
                  onClick={addTableRow}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  + Add GL Line
                </button>
              </div>
            )}
          </div>

          {/* Attachments Section */}
          <div style={sectionStyle}>
            <h3 style={sectionTitleStyle}>Attachments</h3>
            <div style={{
              border: '2px dashed #cbd5e0',
              borderRadius: '6px',
              padding: '20px',
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
                style={{ display: 'none' }}
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
                    <i className="fas fa-file-pdf" style={{ marginRight: '8px', color: '#dc2626', fontSize: '20px' }}></i>
                    {pdfFile.name}
                  </>
                ) : (
                  <>
                    <i className="fas fa-cloud-upload-alt" style={{ marginRight: '8px', color: '#999', fontSize: '20px' }}></i>
                    Click to upload PDF or drag and drop
                  </>
                )}
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ 
            display: 'flex', 
            gap: '12px', 
            padding: '16px 20px',
            backgroundColor: '#f8fafc',
            borderTop: '1px solid #e2e8f0'
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                flex: 1,
                padding: '10px 16px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                backgroundColor: '#ffffff',
                color: '#374151',
                cursor: submitting ? 'not-allowed' : 'pointer',
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
                padding: '10px 16px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: submitting || loading ? '#9ca3af' : '#10b981',
                color: 'white',
                cursor: submitting || loading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '600',
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
