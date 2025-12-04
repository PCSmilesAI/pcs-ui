'use client';

import { useEffect, useState } from 'react';

interface CodingTemplate {
  id: string;
  name: string;
  vendor_name: string;
  gl_account_name: string;
}

interface CodingTemplateSelectorProps {
  invoiceId: string;
  vendorName?: string;
  isMultiLocation?: boolean;
  onApplied?: () => void;
}

export function CodingTemplateSelector({
  invoiceId,
  vendorName,
  isMultiLocation,
  onApplied
}: CodingTemplateSelectorProps) {
  const [templates, setTemplates] = useState<CodingTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, [vendorName]);

  async function fetchTemplates() {
    try {
      setLoading(true);
      const url = vendorName
        ? `/api/coding-templates?vendor=${encodeURIComponent(vendorName)}`
        : '/api/coding-templates';
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch templates');
      }
      const data = await response.json();
      setTemplates(data.templates || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching templates:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleApplyTemplate() {
    if (!selectedTemplateId) {
      setError('Please select a template');
      return;
    }

    try {
      setApplying(true);
      setError(null);
      setSuccess(null);

      const response = await fetch(`/api/invoices/${invoiceId}/apply-coding-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: selectedTemplateId })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to apply template');
      }

      const data = await response.json();
      setSuccess(`Template applied! Created ${data.allocations?.length || 0} allocations.`);
      setSelectedTemplateId('');
      
      // Notify parent component
      if (onApplied) {
        onApplied();
      }
    } catch (err: any) {
      setError(err.message);
      console.error('Error applying template:', err);
    } finally {
      setApplying(false);
    }
  }

  if (isMultiLocation) {
    return (
      <div style={{
        backgroundColor: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: '6px',
        padding: '16px',
      }}>
        <p style={{ fontSize: '14px', color: '#1e40af' }}>
          ✓ This invoice is already coded as multi-location
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {error && (
        <div style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '6px',
          padding: '16px',
        }}>
          <p style={{ fontSize: '14px', color: '#991b1b' }}>{error}</p>
        </div>
      )}

      {success && (
        <div style={{
          backgroundColor: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: '6px',
          padding: '16px',
        }}>
          <p style={{ fontSize: '14px', color: '#166534' }}>{success}</p>
        </div>
      )}

      <div style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '6px',
        padding: '16px',
      }}>
        <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#111827', marginBottom: '12px' }}>
          Apply Coding Template
        </h3>
        
        {loading ? (
          <p style={{ fontSize: '14px', color: '#6b7280' }}>Loading templates...</p>
        ) : templates.length === 0 ? (
          <p style={{ fontSize: '14px', color: '#6b7280' }}>
            {vendorName
              ? `No templates available for vendor "${vendorName}"`
              : 'No coding templates available'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
                marginBottom: '8px',
              }}>
                Select Template
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  backgroundColor: '#ffffff',
                  cursor: 'pointer',
                }}
              >
                <option value="">-- Choose a template --</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} ({template.vendor_name})
                  </option>
                ))}
              </select>
            </div>

            {selectedTemplateId && (
              <div style={{
                backgroundColor: '#f9fafb',
                borderRadius: '6px',
                padding: '12px',
                fontSize: '14px',
              }}>
                {(() => {
                  const template = templates.find(t => t.id === selectedTemplateId);
                  return (
                    <>
                      <p style={{ fontWeight: '500', color: '#111827', marginBottom: '4px' }}>
                        {template?.name}
                      </p>
                      <p style={{ color: '#6b7280', marginBottom: '8px' }}>
                        GL Account: {template?.gl_account_name}
                      </p>
                      <p style={{ color: '#6b7280' }}>
                        This will create allocations based on the template configuration.
                      </p>
                    </>
                  );
                })()}
              </div>
            )}

            <button
              onClick={handleApplyTemplate}
              disabled={!selectedTemplateId || applying}
              style={{
                width: '100%',
                padding: '10px 16px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: (!selectedTemplateId || applying) ? 'not-allowed' : 'pointer',
                opacity: (!selectedTemplateId || applying) ? 0.5 : 1,
              }}
            >
              {applying ? 'Applying...' : 'Apply Template'}
            </button>
          </div>
        )}
      </div>

      <div style={{
        backgroundColor: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: '6px',
        padding: '16px',
      }}>
        <p style={{ fontSize: '12px', color: '#1e40af' }}>
          <strong>Note:</strong> Applying a coding template will mark this invoice as multi-location and route it directly to McKay for approval, bypassing office manager review.
        </p>
      </div>
    </div>
  );
}

