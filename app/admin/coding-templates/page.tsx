'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface CodingTemplate {
  id: string;
  name: string;
  vendor_name: string;
  gl_account_name: string;
  template_type?: string;
  is_active: number;
  created_at: string;
  row_count?: number;
}

interface TableTemplateRow {
  id: string;
  glAccountPath: string;
  categoryName: string;
  description: string;
  className: string;
  locationName: string;
  amount: string;
}

interface QBOCategory {
  id: string;
  name: string;
  number?: string;
  fullPath: string;
  displayText: string;
}

interface QBOLocation {
  id: string;
  name: string;
  fullName: string;
}

interface Vendor {
  id: string;
  name: string;
}

const ADMIN_EMAILS = new Set([
  'business@pcsmilesai.com',
  'mckaym@pcsmiles.com',
]);

export default function CodingTemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<CodingTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CodingTemplate | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Template form state
  const [templateName, setTemplateName] = useState('');
  const [companyCode, setCompanyCode] = useState('Pacific Crest Smiles');
  const [vendorName, setVendorName] = useState('');
  const [vendorSearchQuery, setVendorSearchQuery] = useState('');
  const [vendorSuggestions, setVendorSuggestions] = useState<Vendor[]>([]);
  const [showVendorSuggestions, setShowVendorSuggestions] = useState(false);
  const [templateType, setTemplateType] = useState<'even_split' | 'table_template'>('table_template');
  const [glAccountName, setGlAccountName] = useState(''); // For even split

  // Table template state
  const [tableRows, setTableRows] = useState<TableTemplateRow[]>([
    { id: '1', glAccountPath: '', categoryName: '', description: '', className: '', locationName: '', amount: '' }
  ]);
  const [qboCategories, setQboCategories] = useState<QBOCategory[]>([]);
  const [qboLocations, setQboLocations] = useState<QBOLocation[]>([]);
  const [loadingQBOData, setLoadingQBOData] = useState(false);
  const [categorySearchQueries, setCategorySearchQueries] = useState<Record<string, string>>({});
  const [classSearchQueries, setClassSearchQueries] = useState<Record<string, string>>({});

  useEffect(() => {
    checkAdminAccess();
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (showModal && templateType === 'table_template') {
      loadQBOData();
    }
  }, [showModal, templateType]);

  async function checkAdminAccess() {
    try {
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem('loggedInUser') : null;
      if (stored) {
        const parsed = JSON.parse(stored);
        const userEmail = parsed?.email?.toLowerCase() || '';
        setIsAdmin(ADMIN_EMAILS.has(userEmail));
        if (!ADMIN_EMAILS.has(userEmail)) {
          setError('Only admins can access this page');
          setTimeout(() => router.push('/'), 2000);
        }
      } else {
        setError('Please log in first');
        setTimeout(() => router.push('/'), 2000);
      }
    } catch (err) {
      console.error('Error checking admin access:', err);
      setError('Error verifying access');
      setTimeout(() => router.push('/'), 2000);
    }
  }

  async function fetchTemplates() {
    try {
      setLoading(true);
      const response = await fetch('/api/coding-templates');
      if (!response.ok) {
        throw new Error('Failed to fetch templates');
      }
      const data = await response.json();
      // Fetch row counts for table templates
      const templatesWithCounts = await Promise.all(
        (data.templates || []).map(async (template: CodingTemplate) => {
          if (template.template_type === 'table_template') {
            try {
              const rowsResponse = await fetch(`/api/coding-templates/${template.id}/rows`);
              if (rowsResponse.ok) {
                const rowsData = await rowsResponse.json();
                return { ...template, row_count: rowsData.rows?.length || 0 };
              }
            } catch (e) {
              console.warn('Failed to fetch row count for template:', template.id, e);
            }
            return { ...template, row_count: 0 };
          }
          return { ...template, row_count: 9 }; // Even split = 9 locations
        })
      );
      setTemplates(templatesWithCounts);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching templates:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadQBOData() {
    try {
      setLoadingQBOData(true);
      
      // Load categories
      const categoriesRes = await fetch('/api/qbo/chart-of-accounts');
      if (categoriesRes.ok) {
        const categoriesData = await categoriesRes.json();
        setQboCategories(categoriesData.accounts || []);
      }

      // Load locations/classes
      const locationsRes = await fetch('/api/qbo/classes');
      if (locationsRes.ok) {
        const locationsData = await locationsRes.json();
        setQboLocations(locationsData.classes || []);
      }
    } catch (err: any) {
      console.error('Failed to load QBO data:', err);
    } finally {
      setLoadingQBOData(false);
    }
  }

  async function searchVendors(query: string) {
    if (query.length < 2) {
      setVendorSuggestions([]);
      return;
    }

    try {
      const response = await fetch(`/api/vendors/search?q=${encodeURIComponent(query)}&limit=10`);
      if (response.ok) {
        const data = await response.json();
        setVendorSuggestions(data.vendors || []);
        setShowVendorSuggestions(true);
      }
    } catch (err) {
      console.error('Failed to search vendors:', err);
    }
  }

  function addTableRow() {
    setTableRows([...tableRows, {
      id: Date.now().toString(),
      glAccountPath: '',
      categoryName: '',
      description: '',
      className: '',
      locationName: '',
      amount: ''
    }]);
  }

  function removeTableRow(id: string) {
    if (tableRows.length > 1) {
      setTableRows(tableRows.filter(row => row.id !== id));
    }
  }

  function clearTable() {
    if (confirm('Are you sure you want to clear all rows?')) {
      setTableRows([{
        id: '1',
        glAccountPath: '',
        categoryName: '',
        description: '',
        className: '',
        locationName: '',
        amount: ''
      }]);
    }
  }

  function updateTableRow(id: string, field: keyof TableTemplateRow, value: string) {
    setTableRows(tableRows.map(row =>
      row.id === id ? { ...row, [field]: value } : row
    ));
  }

  function getFilteredCategories(rowId: string): QBOCategory[] {
    const query = categorySearchQueries[rowId] || '';
    if (!query) return qboCategories.slice(0, 20); // Show first 20 if no search
    
    const queryLower = query.toLowerCase();
    return qboCategories.filter(cat =>
      cat.name.toLowerCase().includes(queryLower) ||
      cat.displayText.toLowerCase().includes(queryLower) ||
      cat.number?.includes(query)
    ).slice(0, 20);
  }

  function getFilteredLocations(rowId: string): QBOLocation[] {
    const query = classSearchQueries[rowId] || '';
    if (!query) return qboLocations;
    
    const queryLower = query.toLowerCase();
    return qboLocations.filter(loc =>
      loc.name.toLowerCase().includes(queryLower) ||
      loc.fullName.toLowerCase().includes(queryLower)
    );
  }

  function handleCategorySelect(rowId: string, category: QBOCategory) {
    updateTableRow(rowId, 'glAccountPath', category.fullPath);
    updateTableRow(rowId, 'categoryName', category.displayText);
    setCategorySearchQueries({ ...categorySearchQueries, [rowId]: '' });
  }

  function handleLocationSelect(rowId: string, location: QBOLocation) {
    updateTableRow(rowId, 'className', location.name);
    updateTableRow(rowId, 'locationName', location.name);
    setClassSearchQueries({ ...classSearchQueries, [rowId]: '' });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validation
    if (!templateName.trim()) {
      setError('Missing Template Name');
      return;
    }

    if (!vendorName.trim()) {
      setError('Vendor is required');
      return;
    }

    if (templateType === 'even_split') {
      if (!glAccountName.trim()) {
        setError('GL Account Name is required for even split templates');
        return;
      }
    } else {
      // Table template validation
      if (tableRows.length === 0) {
        setError('At least one table row is required');
        return;
      }

      for (const row of tableRows) {
        if (!row.glAccountPath || !row.amount) {
          setError('All rows must have Category and Amount');
          return;
        }
      }
    }

    try {
      setSubmitting(true);

      const payload: any = {
        name: templateName,
        company_code: companyCode,
        vendor_name: vendorName,
        template_type: templateType,
      };

      if (templateType === 'even_split') {
        payload.gl_account_name = glAccountName;
      } else {
        payload.table_rows = tableRows.map(row => ({
          gl_account_path: row.glAccountPath,
          category_name: row.categoryName,
          description: row.description || '',
          class_name: row.className,
          location_name: row.locationName,
          amount: row.amount,
        }));
      }

      const url = editingTemplate 
        ? `/api/coding-templates/${editingTemplate.id}`
        : '/api/coding-templates';
      const method = editingTemplate ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create template');
      }

      // Reset form and close modal
      setTemplateName('');
      setVendorName('');
      setVendorSearchQuery('');
      setGlAccountName('');
      setTableRows([{ id: '1', glAccountPath: '', categoryName: '', description: '', className: '', locationName: '', amount: '' }]);
      setEditingTemplate(null);
      setShowModal(false);
      await fetchTemplates();
      showToast(editingTemplate ? 'Template updated successfully!' : 'Template created successfully!', 'success');
    } catch (err: any) {
      setError(err.message);
      console.error('Error creating template:', err);
    } finally {
      setSubmitting(false);
    }
  }

  function closeModal() {
    setShowModal(false);
    setEditingTemplate(null);
    setTemplateName('');
    setVendorName('');
    setVendorSearchQuery('');
    setGlAccountName('');
    setTableRows([{ id: '1', glAccountPath: '', categoryName: '', description: '', className: '', locationName: '', amount: '' }]);
    setError(null);
  }

  async function handleEditTemplate(template: CodingTemplate) {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setVendorName(template.vendor_name);
    setVendorSearchQuery(template.vendor_name);
    setTemplateType((template.template_type as 'even_split' | 'table_template') || 'even_split');
    setGlAccountName(template.gl_account_name || '');

    // Load template rows if table template
    if (template.template_type === 'table_template') {
      try {
        const response = await fetch(`/api/coding-templates/${template.id}/rows`);
        if (response.ok) {
          const data = await response.json();
          if (data.rows && data.rows.length > 0) {
            setTableRows(data.rows.map((row: any, index: number) => ({
              id: row.id || `row-${index}`,
              glAccountPath: row.gl_account_path || '',
              categoryName: row.category_name || '',
              description: row.description || '',
              className: row.class_name || '',
              locationName: row.location_name || '',
              amount: row.amount_cents ? (row.amount_cents / 100).toFixed(2) : '',
            })));
          }
        }
      } catch (err) {
        console.error('Failed to load template rows:', err);
      }
    }

    setShowModal(true);
  }

  async function handleDeleteTemplate(templateId: string) {
    if (!confirm('Are you sure you want to delete this template? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/coding-templates/${templateId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete template');
      }

      await fetchTemplates();
      showToast('Template deleted successfully', 'success');
    } catch (err: any) {
      setError(err.message);
      console.error('Error deleting template:', err);
    }
  }

  function showToast(message: string, variant: 'success' | 'error' = 'success') {
    // Simple toast implementation
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 24px;
      background-color: ${variant === 'success' ? '#10b981' : '#ef4444'};
      color: white;
      border-radius: 6px;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 3000);
  }

  if (!isAdmin && loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600">Verifying access...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-red-600 font-semibold">Access Denied</p>
            <p className="text-gray-600 mt-2">Only admins can access this page. Redirecting...</p>
          </div>
        </div>
      </div>
    );
  }

  const totalAmount = tableRows.reduce((sum, row) => sum + (parseFloat(row.amount) || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">Coding Templates</h1>
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Add Template
            </button>
          </div>

          {error && !showModal && (
            <div className="px-6 py-4 bg-red-50 border-b border-red-200">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          <div className="px-6 py-4">
            {loading ? (
              <p className="text-gray-600">Loading templates...</p>
            ) : templates.length === 0 ? (
              <p className="text-gray-600">No coding templates yet. Create one to get started.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Template Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Vendor
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        GL Account
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Rows
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {templates.map((template) => (
                      <tr key={template.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {template.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {template.vendor_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {template.gl_account_name || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {template.template_type === 'table_template' ? 'Table Template' : 'Even Split'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {template.row_count !== undefined ? template.row_count : (template.template_type === 'even_split' ? 9 : '—')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            template.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {template.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {new Date(template.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditTemplate(template)}
                              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteTemplate(template.id)}
                              className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-xs"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-blue-900 mb-2">How Coding Templates Work</h2>
          <ul className="text-sm text-blue-800 space-y-2">
            <li>• Templates define how invoices from specific vendors are split across all 9 clinic locations</li>
            <li>• When an AP Manager applies a template to an invoice, it creates allocations for each clinic</li>
            <li>• Multi-location invoices bypass office manager approval and route directly to McKay (admin)</li>
            <li>• QuickBooks bills are generated with one line item per clinic location</li>
            <li>• All allocations are audited and tracked in the invoice event log</li>
          </ul>
        </div>
      </div>

      {/* Template Creation Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto m-4">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">
                {editingTemplate ? 'Edit Template' : 'Template'}
              </h2>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
                  {error}
                </div>
              )}

              {/* Template Name */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Template Name *
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md ${
                    !templateName.trim() ? 'border-red-500' : 'border-gray-300'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="e.g., IT Monthly 9 LOCATIONS"
                />
                {!templateName.trim() && (
                  <p className="mt-1 text-sm text-red-600">▲ Missing Template Name</p>
                )}
              </div>

              {/* Company Code */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company Code
                </label>
                <select
                  value={companyCode}
                  onChange={(e) => setCompanyCode(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Pacific Crest Smiles">Pacific Crest Smiles</option>
                </select>
              </div>

              {/* Vendor Search */}
              <div className="mb-4 relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vendor *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={vendorSearchQuery}
                    onChange={(e) => {
                      setVendorSearchQuery(e.target.value);
                      searchVendors(e.target.value);
                    }}
                    onFocus={() => {
                      if (vendorSearchQuery.length >= 2) {
                        setShowVendorSuggestions(true);
                      }
                    }}
                    className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Search Vendor"
                  />
                  <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
                  {showVendorSuggestions && vendorSuggestions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {vendorSuggestions.map((vendor) => (
                        <div
                          key={vendor.id}
                          onClick={() => {
                            setVendorName(vendor.name);
                            setVendorSearchQuery(vendor.name);
                            setShowVendorSuggestions(false);
                          }}
                          className="px-4 py-2 hover:bg-blue-50 cursor-pointer"
                        >
                          {vendor.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Template Type */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Template Type
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="even_split"
                      checked={templateType === 'even_split'}
                      onChange={(e) => setTemplateType(e.target.value as 'even_split' | 'table_template')}
                      className="mr-2"
                    />
                    Even Split
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="table_template"
                      checked={templateType === 'table_template'}
                      onChange={(e) => setTemplateType(e.target.value as 'even_split' | 'table_template')}
                      className="mr-2"
                    />
                    Table Template
                  </label>
                </div>
              </div>

              {/* Even Split Form */}
              {templateType === 'even_split' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    GL Account Name *
                  </label>
                  <input
                    type="text"
                    value={glAccountName}
                    onChange={(e) => setGlAccountName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., IT Support Services"
                  />
                </div>
              )}

              {/* Table Template */}
              {templateType === 'table_template' && (
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Line Items *
                    </label>
                    <button
                      type="button"
                      onClick={clearTable}
                      className="text-sm text-gray-600 hover:text-gray-800"
                    >
                      Clear table
                    </button>
                  </div>
                  
                  <div className="border border-gray-300 rounded-md overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase">Category</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase">Description</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase">Amount</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase">Class</th>
                          <th className="px-3 py-2 text-center text-xs font-medium text-gray-700 uppercase w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {tableRows.map((row) => (
                          <tr key={row.id}>
                            <td className="px-3 py-2">
                              <div className="relative">
                                <input
                                  type="text"
                                  value={row.categoryName || categorySearchQueries[row.id] || ''}
                                  onChange={(e) => {
                                    setCategorySearchQueries({ ...categorySearchQueries, [row.id]: e.target.value });
                                    if (!e.target.value) {
                                      updateTableRow(row.id, 'categoryName', '');
                                      updateTableRow(row.id, 'glAccountPath', '');
                                    }
                                  }}
                                  onFocus={() => {
                                    setCategorySearchQueries({ ...categorySearchQueries, [row.id]: row.categoryName || '' });
                                  }}
                                  className="w-full px-2 py-1 pl-8 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  placeholder="Type to search list"
                                />
                                <span className="absolute left-2 top-1.5 text-gray-400 text-xs">🔍</span>
                                {categorySearchQueries[row.id] !== undefined && categorySearchQueries[row.id] !== row.categoryName && (
                                  <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                                    {getFilteredCategories(row.id).map((cat) => (
                                      <div
                                        key={cat.id}
                                        onClick={() => handleCategorySelect(row.id, cat)}
                                        className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer"
                                      >
                                        {cat.displayText}
                                      </div>
                                    ))}
                                    {getFilteredCategories(row.id).length === 0 && (
                                      <div className="px-3 py-2 text-sm text-gray-500">No results</div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={row.description}
                                onChange={(e) => updateTableRow(row.id, 'description', e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder=""
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={row.amount}
                                onChange={(e) => updateTableRow(row.id, 'amount', e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="Numerical value"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <div className="relative">
                                <input
                                  type="text"
                                  value={row.className || classSearchQueries[row.id] || ''}
                                  onChange={(e) => {
                                    setClassSearchQueries({ ...classSearchQueries, [row.id]: e.target.value });
                                    if (!e.target.value) {
                                      updateTableRow(row.id, 'className', '');
                                      updateTableRow(row.id, 'locationName', '');
                                    }
                                  }}
                                  onFocus={() => {
                                    setClassSearchQueries({ ...classSearchQueries, [row.id]: row.className || '' });
                                  }}
                                  className="w-full px-2 py-1 pl-8 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  placeholder="Type to search list"
                                />
                                <span className="absolute left-2 top-1.5 text-gray-400 text-xs">🔍</span>
                                {classSearchQueries[row.id] !== undefined && classSearchQueries[row.id] !== row.className && (
                                  <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                                    {getFilteredLocations(row.id).map((loc) => (
                                      <div
                                        key={loc.id}
                                        onClick={() => handleLocationSelect(row.id, loc)}
                                        className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer"
                                      >
                                        {loc.name}
                                      </div>
                                    ))}
                                    {getFilteredLocations(row.id).length === 0 && (
                                      <div className="px-3 py-2 text-sm text-gray-500">No results</div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-center">
                              {tableRows.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeTableRow(row.id)}
                                  className="text-red-600 hover:text-red-800 text-lg"
                                >
                                  ×
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button
                    type="button"
                    onClick={addTableRow}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-800"
                  >
                    Add a new line
                  </button>

                  <div className="mt-3 flex items-start gap-2 text-sm text-gray-600">
                    <span>→</span>
                    <span>Amounts set here will be applied relatively to the invoice's total</span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-6 flex gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingTemplate ? 'Update and Close' : 'Save and Close'}
                </button>
                {editingTemplate && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm('Are you sure you want to delete this template?')) return;
                      try {
                        const response = await fetch(`/api/coding-templates/${editingTemplate.id}`, {
                          method: 'DELETE',
                        });
                        if (response.ok) {
                          closeModal();
                          await fetchTemplates();
                          showToast('Template deleted successfully', 'success');
                        } else {
                          const data = await response.json();
                          setError(data.error || 'Failed to delete template');
                        }
                      } catch (err: any) {
                        setError(err.message);
                      }
                    }}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                  >
                    Delete
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
