'use client';

import React, { useState, useEffect } from 'react';

interface CodingTemplate {
  id: string;
  name: string;
  vendor_name: string;
  gl_account_name: string;
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
  const [templateId, setTemplateId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [amount, setAmount] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Load templates on mount
  useEffect(() => {
    if (isOpen) {
      loadTemplates();
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!templateId || !invoiceNumber || !vendorName || !amount) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      setSubmitting(true);
      const amountCents = Math.round(parseFloat(amount) * 100);

      // Create FormData to handle file upload
      const formData = new FormData();
      formData.append('template_id', templateId);
      formData.append('invoice_number', invoiceNumber);
      formData.append('vendor_name', vendorName);
      formData.append('amount_cents', amountCents.toString());
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
      setSuccess(`✅ Invoice ${invoiceNumber} created with ${data.allocations.length} allocations!`);

      // Reset form
      setTemplateId('');
      setInvoiceNumber('');
      setVendorName('');
      setAmount('');
      setInvoiceDate(new Date().toISOString().split('T')[0]);
      setDueDate('');
      setDescription('');
      setPdfFile(null);

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
          {/* Template Selection */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>
              Coding Template *
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
              <option value="">Select a template...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.vendor_name})
                </option>
              ))}
            </select>
          </div>

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

          {/* Amount */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>
              Amount ($) *
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
          </div>

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

