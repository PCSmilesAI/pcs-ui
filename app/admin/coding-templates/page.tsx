'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface CodingTemplate {
  id: string;
  name: string;
  vendor_name: string;
  gl_account_name: string;
  template_type?: string;
  allocation_mode?: string;
  description?: string;
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
  percentage: string;
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

type AllocationMode = 'split_evenly' | 'fixed_amount' | 'percentage';

const ADMIN_EMAILS = new Set([
  'business@pcsmilesai.com',
  'mckaym@pcsmiles.com',
]);

const ALLOCATION_MODE_LABELS: Record<AllocationMode, string> = {
  split_evenly: 'Split Evenly',
  fixed_amount: 'Specific Dollar Amount',
  percentage: 'Percent Split',
};

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
  const [templateDescription, setTemplateDescription] = useState('');
  const [companyCode, setCompanyCode] = useState('Pacific Crest Smiles');
  const [vendorName, setVendorName] = useState('');
  const [vendorSearchQuery, setVendorSearchQuery] = useState('');
  const [vendorSuggestions, setVendorSuggestions] = useState<Vendor[]>([]);
  const [showVendorSuggestions, setShowVendorSuggestions] = useState(false);
  const [allocationMode, setAllocationMode] = useState<AllocationMode>('split_evenly');

  // GL Line rows state
  const [tableRows, setTableRows] = useState<TableTemplateRow[]>([
    { id: '1', glAccountPath: '', categoryName: '', description: '', className: '', locationName: '', amount: '', percentage: '' }
  ]);
  const [qboCategories, setQboCategories] = useState<QBOCategory[]>([]);
  const [qboLocations, setQboLocations] = useState<QBOLocation[]>([]);
  const [loadingQBOData, setLoadingQBOData] = useState(false);
  const [categorySearchQueries, setCategorySearchQueries] = useState<Record<string, string>>({});
  const [classSearchQueries, setClassSearchQueries] = useState<Record<string, string>>({});
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState<Record<string, boolean>>({});
  const [classDropdownOpen, setClassDropdownOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    checkAdminAccess();
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (showModal) {
      loadQBOData();
    }
  }, [showModal]);

  // Calculate percentage total for validation
  const percentageTotal = tableRows.reduce((sum, row) => sum + (parseFloat(row.percentage) || 0), 0);
  const isPercentageValid = Math.abs(percentageTotal - 100) < 0.01;

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
      // Fetch row counts for templates
      const templatesWithCounts = await Promise.all(
        (data.templates || []).map(async (template: CodingTemplate) => {
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
      amount: '',
      percentage: ''
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
        amount: '',
        percentage: ''
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
    if (!query) return qboCategories.slice(0, 20);
    
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
    setCategoryDropdownOpen({ ...categoryDropdownOpen, [rowId]: false });
  }

  function handleLocationSelect(rowId: string, location: QBOLocation) {
    updateTableRow(rowId, 'className', location.name);
    updateTableRow(rowId, 'locationName', location.name);
    setClassSearchQueries({ ...classSearchQueries, [rowId]: '' });
    setClassDropdownOpen({ ...classDropdownOpen, [rowId]: false });
  }

  function getAutocompleteCategorySuggestion(rowId: string): QBOCategory | null {
    const query = categorySearchQueries[rowId];
    if (!query) return null;
    
    const queryLower = query.toLowerCase();
    const startsWithMatch = qboCategories.find(cat =>
      cat.displayText.toLowerCase().startsWith(queryLower) ||
      cat.name.toLowerCase().startsWith(queryLower)
    );
    if (startsWithMatch) return startsWithMatch;
    
    const filtered = getFilteredCategories(rowId);
    return filtered.length > 0 ? filtered[0] : null;
  }

  function getAutocompleteLocationSuggestion(rowId: string): QBOLocation | null {
    const query = classSearchQueries[rowId];
    if (!query) return null;
    
    const queryLower = query.toLowerCase();
    const startsWithMatch = qboLocations.find(loc =>
      loc.name.toLowerCase().startsWith(queryLower)
    );
    if (startsWithMatch) return startsWithMatch;
    
    const filtered = getFilteredLocations(rowId);
    return filtered.length > 0 ? filtered[0] : null;
  }

  function getCategoryCompletionText(rowId: string): string {
    const query = categorySearchQueries[rowId];
    if (!query) return '';
    const suggestion = getAutocompleteCategorySuggestion(rowId);
    if (!suggestion) return '';
    
    const displayText = suggestion.displayText;
    const queryLower = query.toLowerCase();
    
    if (displayText.toLowerCase().startsWith(queryLower)) {
      return displayText.slice(query.length);
    }
    return '';
  }

  function getClassCompletionText(rowId: string): string {
    const query = classSearchQueries[rowId];
    if (!query) return '';
    const suggestion = getAutocompleteLocationSuggestion(rowId);
    if (!suggestion) return '';
    
    const name = suggestion.name;
    const queryLower = query.toLowerCase();
    
    if (name.toLowerCase().startsWith(queryLower)) {
      return name.slice(query.length);
    }
    return '';
  }

  function handleCategoryKeyDown(e: React.KeyboardEvent<HTMLInputElement>, rowId: string) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const suggestion = getAutocompleteCategorySuggestion(rowId);
      if (suggestion) {
        handleCategorySelect(rowId, suggestion);
      }
    } else if (e.key === 'Escape') {
      setCategoryDropdownOpen({ ...categoryDropdownOpen, [rowId]: false });
      setCategorySearchQueries({ ...categorySearchQueries, [rowId]: '' });
    } else if (e.key === 'Tab') {
      const suggestion = getAutocompleteCategorySuggestion(rowId);
      if (suggestion && categoryDropdownOpen[rowId]) {
        e.preventDefault();
        handleCategorySelect(rowId, suggestion);
      }
    }
  }

  function handleClassKeyDown(e: React.KeyboardEvent<HTMLInputElement>, rowId: string) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const suggestion = getAutocompleteLocationSuggestion(rowId);
      if (suggestion) {
        handleLocationSelect(rowId, suggestion);
      }
    } else if (e.key === 'Escape') {
      setClassDropdownOpen({ ...classDropdownOpen, [rowId]: false });
      setClassSearchQueries({ ...classSearchQueries, [rowId]: '' });
    } else if (e.key === 'Tab') {
      const suggestion = getAutocompleteLocationSuggestion(rowId);
      if (suggestion && classDropdownOpen[rowId]) {
        e.preventDefault();
        handleLocationSelect(rowId, suggestion);
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validation
    if (!templateName.trim()) {
      setError('Template Name is required');
      return;
    }

    if (!vendorName.trim()) {
      setError('Vendor is required');
      return;
    }

    if (tableRows.length === 0) {
      setError('At least one GL line is required');
      return;
    }

    // Validate based on allocation mode
    for (const row of tableRows) {
      if (!row.glAccountPath) {
        setError('All GL lines must have a Category selected');
        return;
      }

      if (allocationMode === 'fixed_amount' && !row.amount) {
        setError('All GL lines must have an Amount for Specific Dollar Amount mode');
        return;
      }

      if (allocationMode === 'percentage' && !row.percentage) {
        setError('All GL lines must have a Percentage for Percent Split mode');
        return;
      }
    }

    // Validate percentage total
    if (allocationMode === 'percentage' && !isPercentageValid) {
      setError(`Percentage allocation must equal 100%. Current total: ${percentageTotal.toFixed(1)}%`);
      return;
    }

    try {
      setSubmitting(true);

      const payload: any = {
        name: templateName,
        description: templateDescription,
        company_code: companyCode,
        vendor_name: vendorName,
        template_type: 'table_template',
        allocation_mode: allocationMode,
        table_rows: tableRows.map(row => ({
          gl_account_path: row.glAccountPath,
          category_name: row.categoryName,
          description: row.description || '',
          class_name: row.className,
          location_name: row.locationName,
          amount: allocationMode === 'fixed_amount' ? row.amount : null,
          percentage: allocationMode === 'percentage' ? row.percentage : null,
        })),
      };

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
        throw new Error(data.error || 'Failed to save template');
      }

      // Reset form and close modal
      resetForm();
      setShowModal(false);
      await fetchTemplates();
      showToast(editingTemplate ? 'Template updated successfully!' : 'Template created successfully!', 'success');
    } catch (err: any) {
      setError(err.message);
      console.error('Error saving template:', err);
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setTemplateName('');
    setTemplateDescription('');
    setVendorName('');
    setVendorSearchQuery('');
    setAllocationMode('split_evenly');
    setTableRows([{ id: '1', glAccountPath: '', categoryName: '', description: '', className: '', locationName: '', amount: '', percentage: '' }]);
    setEditingTemplate(null);
    setError(null);
  }

  function closeModal() {
    setShowModal(false);
    resetForm();
  }

  async function handleEditTemplate(template: CodingTemplate) {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setTemplateDescription(template.description || '');
    setVendorName(template.vendor_name);
    setVendorSearchQuery(template.vendor_name);
    setAllocationMode((template.allocation_mode as AllocationMode) || 'split_evenly');

    // Load template rows
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
            percentage: row.percentage ? row.percentage.toString() : '',
          })));
        }
      }
    } catch (err) {
      console.error('Failed to load template rows:', err);
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

  function getAllocationModeLabel(mode?: string): string {
    if (!mode) return 'Split Evenly';
    return ALLOCATION_MODE_LABELS[mode as AllocationMode] || mode;
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

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">Coding Templates</h1>
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
            >
              <span>+</span> Add Template
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
                        Allocation
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        GL Lines
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
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{template.name}</div>
                          {template.description && (
                            <div className="text-xs text-gray-500 truncate max-w-xs">{template.description}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {template.vendor_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {getAllocationModeLabel(template.allocation_mode)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {template.row_count || 0}
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
            <li><strong>Split Evenly:</strong> Divides the invoice total equally among all GL lines</li>
            <li><strong>Specific Dollar Amount:</strong> Applies fixed dollar amounts to each GL line</li>
            <li><strong>Percent Split:</strong> Allocates based on percentage (must equal 100%)</li>
            <li>Templates can be applied from the invoice view page to auto-populate GL lines</li>
          </ul>
        </div>
      </div>

      {/* Template Creation/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto m-4">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center z-10">
              <h2 className="text-xl font-bold text-gray-900">
                {editingTemplate ? 'Edit Template' : 'Create Template'}
              </h2>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                &times;
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
                    !templateName.trim() ? 'border-red-300' : 'border-gray-300'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="e.g., Monthly IT Split - 3 Locations"
                />
              </div>

              {/* Template Description */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Describe when to use this template..."
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                {/* Vendor Search */}
                <div className="relative">
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
                    <span className="absolute left-3 top-2.5 text-gray-400">&#128269;</span>
                    {showVendorSuggestions && vendorSuggestions.length > 0 && (
                      <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
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

                {/* Allocation Mode Dropdown */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Allocation *
                  </label>
                  <select
                    value={allocationMode}
                    onChange={(e) => setAllocationMode(e.target.value as AllocationMode)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="split_evenly">Split Evenly</option>
                    <option value="fixed_amount">Specific Dollar Amount</option>
                    <option value="percentage">Percent Split</option>
                  </select>
                </div>
              </div>

              {/* Percent Distribution Indicator */}
              {allocationMode === 'percentage' && (
                <div className={`mb-4 p-3 rounded-md ${
                  isPercentageValid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className={`font-medium ${isPercentageValid ? 'text-green-800' : 'text-red-800'}`}>
                      % Distribution
                    </span>
                    <span className={`text-lg font-bold ${isPercentageValid ? 'text-green-700' : 'text-red-700'}`}>
                      {percentageTotal.toFixed(1)}% / 100%
                    </span>
                  </div>
                  {!isPercentageValid && (
                    <p className="text-sm text-red-600 mt-1">
                      {percentageTotal < 100 
                        ? `Missing ${(100 - percentageTotal).toFixed(1)}% allocation`
                        : `Over-allocated by ${(percentageTotal - 100).toFixed(1)}%`
                      }
                    </p>
                  )}
                </div>
              )}

              {/* GL Lines Section */}
              <div className="mb-4">
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-sm font-medium text-gray-700">
                    GL Lines ({tableRows.length})
                  </label>
                  <button
                    type="button"
                    onClick={clearTable}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Clear all
                  </button>
                </div>
                
                <div className="space-y-3">
                  {tableRows.map((row, index) => (
                    <div 
                      key={row.id} 
                      className="p-4 border border-gray-200 rounded-lg bg-gray-50"
                    >
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-xs font-semibold text-gray-500 bg-gray-200 px-2 py-1 rounded">
                          GL Line {index + 1}
                        </span>
                        {tableRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeTableRow(row.id)}
                            className="text-red-500 hover:text-red-700 text-sm font-medium"
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-3">
                        {/* Category Dropdown */}
                        <div className="relative">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Account *
                          </label>
                          <div className="relative">
                            {categoryDropdownOpen[row.id] && categorySearchQueries[row.id] && getCategoryCompletionText(row.id) && (
                              <div className="absolute inset-0 px-3 py-2 text-sm pointer-events-none">
                                <span className="invisible">{categorySearchQueries[row.id]}</span>
                                <span className="text-gray-400">{getCategoryCompletionText(row.id)}</span>
                              </div>
                            )}
                            <input
                              type="text"
                              value={categoryDropdownOpen[row.id] ? categorySearchQueries[row.id] || '' : row.categoryName || ''}
                              onChange={(e) => {
                                setCategorySearchQueries({ ...categorySearchQueries, [row.id]: e.target.value });
                                setCategoryDropdownOpen({ ...categoryDropdownOpen, [row.id]: true });
                                if (!e.target.value) {
                                  updateTableRow(row.id, 'categoryName', '');
                                  updateTableRow(row.id, 'glAccountPath', '');
                                }
                              }}
                              onFocus={() => {
                                setCategorySearchQueries({ ...categorySearchQueries, [row.id]: '' });
                                setCategoryDropdownOpen({ ...categoryDropdownOpen, [row.id]: true });
                              }}
                              onBlur={() => {
                                setTimeout(() => {
                                  setCategoryDropdownOpen({ ...categoryDropdownOpen, [row.id]: false });
                                  setCategorySearchQueries({ ...categorySearchQueries, [row.id]: '' });
                                }, 200);
                              }}
                              onKeyDown={(e) => handleCategoryKeyDown(e, row.id)}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                              placeholder="Search account..."
                            />
                            {categoryDropdownOpen[row.id] && (
                              <div className="absolute z-30 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                                {getFilteredCategories(row.id).map((cat, idx) => (
                                  <div
                                    key={cat.id}
                                    onClick={() => handleCategorySelect(row.id, cat)}
                                    className={`px-3 py-2 text-sm cursor-pointer ${
                                      idx === 0 ? 'bg-blue-100 text-blue-900' : 'hover:bg-blue-50'
                                    }`}
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
                        </div>

                        {/* Class Dropdown */}
                        <div className="relative">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Class (Location)
                          </label>
                          <div className="relative">
                            {classDropdownOpen[row.id] && classSearchQueries[row.id] && getClassCompletionText(row.id) && (
                              <div className="absolute inset-0 px-3 py-2 text-sm pointer-events-none">
                                <span className="invisible">{classSearchQueries[row.id]}</span>
                                <span className="text-gray-400">{getClassCompletionText(row.id)}</span>
                              </div>
                            )}
                            <input
                              type="text"
                              value={classDropdownOpen[row.id] ? classSearchQueries[row.id] || '' : row.className || ''}
                              onChange={(e) => {
                                setClassSearchQueries({ ...classSearchQueries, [row.id]: e.target.value });
                                setClassDropdownOpen({ ...classDropdownOpen, [row.id]: true });
                                if (!e.target.value) {
                                  updateTableRow(row.id, 'className', '');
                                  updateTableRow(row.id, 'locationName', '');
                                }
                              }}
                              onFocus={() => {
                                setClassSearchQueries({ ...classSearchQueries, [row.id]: '' });
                                setClassDropdownOpen({ ...classDropdownOpen, [row.id]: true });
                              }}
                              onBlur={() => {
                                setTimeout(() => {
                                  setClassDropdownOpen({ ...classDropdownOpen, [row.id]: false });
                                  setClassSearchQueries({ ...classSearchQueries, [row.id]: '' });
                                }, 200);
                              }}
                              onKeyDown={(e) => handleClassKeyDown(e, row.id)}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                              placeholder="Search class..."
                            />
                            {classDropdownOpen[row.id] && (
                              <div className="absolute z-30 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                                {getFilteredLocations(row.id).map((loc, idx) => (
                                  <div
                                    key={loc.id}
                                    onClick={() => handleLocationSelect(row.id, loc)}
                                    className={`px-3 py-2 text-sm cursor-pointer ${
                                      idx === 0 ? 'bg-blue-100 text-blue-900' : 'hover:bg-blue-50'
                                    }`}
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
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        {/* Description */}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Description
                          </label>
                          <input
                            type="text"
                            value={row.description}
                            onChange={(e) => updateTableRow(row.id, 'description', e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="Optional"
                          />
                        </div>

                        {/* Amount (only for fixed_amount mode) */}
                        {allocationMode === 'fixed_amount' && (
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Amount *
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-2 text-gray-500 text-sm">$</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={row.amount}
                                onChange={(e) => updateTableRow(row.id, 'amount', e.target.value)}
                                className="w-full px-3 py-2 pl-7 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="0.00"
                              />
                            </div>
                          </div>
                        )}

                        {/* Percentage (only for percentage mode) */}
                        {allocationMode === 'percentage' && (
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Percentage *
                            </label>
                            <div className="relative">
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                value={row.percentage}
                                onChange={(e) => updateTableRow(row.id, 'percentage', e.target.value)}
                                className="w-full px-3 py-2 pr-7 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="0"
                              />
                              <span className="absolute right-3 top-2 text-gray-500 text-sm">%</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addTableRow}
                  className="mt-3 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium flex items-center gap-2"
                >
                  <span>+</span> Add GL Line
                </button>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 pt-4 border-t border-gray-200 flex gap-3">
                <button
                  type="submit"
                  disabled={submitting || (allocationMode === 'percentage' && !isPercentageValid)}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {submitting ? 'Saving...' : editingTemplate ? 'Update Template' : 'Save Template'}
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
