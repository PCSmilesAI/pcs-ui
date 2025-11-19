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
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          ✓ This invoice is already coded as multi-location
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-800">{success}</p>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Apply Coding Template</h3>
        
        {loading ? (
          <p className="text-sm text-gray-600">Loading templates...</p>
        ) : templates.length === 0 ? (
          <p className="text-sm text-gray-600">
            {vendorName
              ? `No templates available for vendor "${vendorName}"`
              : 'No coding templates available'}
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Template
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
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
              <div className="bg-gray-50 rounded p-3 text-sm">
                {(() => {
                  const template = templates.find(t => t.id === selectedTemplateId);
                  return (
                    <>
                      <p className="font-medium text-gray-900">{template?.name}</p>
                      <p className="text-gray-600">GL Account: {template?.gl_account_name}</p>
                      <p className="text-gray-600 mt-2">
                        This will create 9 equal allocations across all clinic locations.
                      </p>
                    </>
                  );
                })()}
              </div>
            )}

            <button
              onClick={handleApplyTemplate}
              disabled={!selectedTemplateId || applying}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {applying ? 'Applying...' : 'Apply Template'}
            </button>
          </div>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-xs text-blue-800">
          <strong>Note:</strong> Applying a coding template will mark this invoice as multi-location and route it directly to McKay for approval, bypassing office manager review.
        </p>
      </div>
    </div>
  );
}

