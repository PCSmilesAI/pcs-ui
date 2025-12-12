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

type AllocationMode = 'split_evenly' | 'split_evenly_all_classes' | 'fixed_amount' | 'percentage';

const ADMIN_EMAILS = new Set([
  'business@pcsmilesai.com',
  'mckaym@pcsmiles.com',
]);

const ALLOCATION_MODE_LABELS: Record<AllocationMode, string> = {
  split_evenly: 'Split Evenly',
  split_evenly_all_classes: 'Split Evenly Across All Classes',
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
      const categoriesRes = await fetch('/api/qbo/chart-of-accounts');
      if (categoriesRes.ok) {
        const categoriesData = await categoriesRes.json();
        setQboCategories(categoriesData.accounts || []);
      }
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
    // In "split_evenly_all_classes" mode, propagate category to all rows
    if (allocationMode === 'split_evenly_all_classes') {
      setTableRows(tableRows.map(row => ({
        ...row,
        glAccountPath: category.fullPath,
        categoryName: category.displayText,
      })));
    } else {
      updateTableRow(rowId, 'glAccountPath', category.fullPath);
      updateTableRow(rowId, 'categoryName', category.displayText);
    }
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

  function handleCategoryKeyDown(e: React.KeyboardEvent<HTMLInputElement>, rowId: string) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const suggestion = getAutocompleteCategorySuggestion(rowId);
      if (suggestion) handleCategorySelect(rowId, suggestion);
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
      if (suggestion) handleLocationSelect(rowId, suggestion);
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

  function handleAllocationModeChange(newMode: AllocationMode) {
    setAllocationMode(newMode);
    
    // If switching to "Split Evenly Across All Classes", auto-populate GL lines for each class
    if (newMode === 'split_evenly_all_classes') {
      if (qboLocations.length === 0) {
        // If locations haven't loaded yet, show a message
        setError('Loading classes... please wait and try again.');
        loadQBOData().then(() => {
          setError(null);
        });
        return;
      }
      
      // Get the category from the first row (if it exists)
      const firstRow = tableRows[0];
      const categoryPath = firstRow?.glAccountPath || '';
      const categoryName = firstRow?.categoryName || '';
      const description = firstRow?.description || '';
      
      // Create a GL line for each class/location
      const newRows: TableTemplateRow[] = qboLocations.map((loc, index) => ({
        id: `auto-${Date.now()}-${index}`,
        glAccountPath: categoryPath,
        categoryName: categoryName,
        description: description,
        className: loc.name,
        locationName: loc.name,
        amount: '',
        percentage: '',
      }));
      
      setTableRows(newRows);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

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
    if (!confirm('Are you sure you want to delete this template?')) return;
    try {
      const response = await fetch(`/api/coding-templates/${templateId}`, { method: 'DELETE' });
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
      position: fixed; top: 20px; right: 20px; padding: 12px 20px;
      background-color: ${variant === 'success' ? '#10b981' : '#ef4444'};
      color: white; border-radius: 4px; z-index: 9999; font-size: 14px;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => document.body.removeChild(toast), 3000);
  }

  function getAllocationModeLabel(mode?: string): string {
    if (!mode) return 'Split Evenly';
    return ALLOCATION_MODE_LABELS[mode as AllocationMode] || mode;
  }

  // Simple PCS-style styles
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #cbd5e0',
    borderRadius: '4px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    backgroundColor: '#fff',
    cursor: 'pointer',
  };

  const buttonStyle: React.CSSProperties = {
    padding: '8px 16px',
    fontSize: '14px',
    border: '1px solid #3182ce',
    borderRadius: '4px',
    cursor: 'pointer',
    backgroundColor: '#3182ce',
    color: 'white',
  };

  const outlineButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: 'white',
    color: '#3182ce',
  };

  if (!isAdmin && loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ color: '#718096' }}>Verifying access...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ color: '#e53e3e', fontWeight: 600 }}>Access Denied</p>
        <p style={{ color: '#718096', marginTop: '8px' }}>Only admins can access this page. Redirecting...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 32px', backgroundColor: '#fff', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, color: '#2d3748', margin: 0 }}>Coding Templates</h1>
        <button
          onClick={() => setShowModal(true)}
          style={buttonStyle}
        >
          + Add Template
        </button>
      </div>

      {error && !showModal && (
        <div style={{ padding: '12px 16px', backgroundColor: '#fed7d7', color: '#c53030', borderRadius: '4px', marginBottom: '16px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {/* How Templates Work */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ color: '#3182ce', fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>How Coding Templates Work</h3>
        <ul style={{ fontSize: '14px', color: '#4a5568', margin: 0, paddingLeft: '20px', lineHeight: '1.8' }}>
          <li><strong>Split Evenly:</strong> Divides the invoice total equally among all GL lines</li>
          <li><strong>Specific Dollar Amount:</strong> Applies fixed dollar amounts to each GL line</li>
          <li><strong>Percent Split:</strong> Allocates based on percentage (must equal 100%)</li>
          <li>Templates can be applied from the invoice view page to auto-populate GL lines</li>
        </ul>
      </div>

      {/* Template Summary */}
      <h3 style={{ color: '#3182ce', fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Template Summary</h3>

      {/* Templates Table */}
      {loading ? (
        <p style={{ color: '#718096', fontSize: '14px' }}>Loading templates...</p>
      ) : templates.length === 0 ? (
        <p style={{ color: '#718096', fontSize: '14px' }}>No templates yet. Click &quot;+ Add Template&quot; to create one.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ textAlign: 'left', padding: '12px 16px', color: '#3182ce', fontWeight: 600 }}>Template Name</th>
              <th style={{ textAlign: 'left', padding: '12px 16px', color: '#3182ce', fontWeight: 600 }}>Vendor</th>
              <th style={{ textAlign: 'left', padding: '12px 16px', color: '#3182ce', fontWeight: 600 }}>Allocation</th>
              <th style={{ textAlign: 'center', padding: '12px 16px', color: '#3182ce', fontWeight: 600 }}># of GL Lines</th>
              <th style={{ textAlign: 'left', padding: '12px 16px', color: '#3182ce', fontWeight: 600 }}>Status</th>
              <th style={{ textAlign: 'left', padding: '12px 16px', color: '#3182ce', fontWeight: 600 }}>Created</th>
              <th style={{ textAlign: 'center', padding: '12px 16px', color: '#3182ce', fontWeight: 600 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr key={template.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '12px 16px', color: '#2d3748' }}>
                  <div style={{ fontWeight: 500 }}>{template.name}</div>
                  {template.description && (
                    <div style={{ fontSize: '12px', color: '#718096', marginTop: '2px' }}>{template.description}</div>
                  )}
                </td>
                <td style={{ padding: '12px 16px', color: '#4a5568' }}>{template.vendor_name || '—'}</td>
                <td style={{ padding: '12px 16px', color: '#4a5568' }}>{getAllocationModeLabel(template.allocation_mode)}</td>
                <td style={{ padding: '12px 16px', color: '#4a5568', textAlign: 'center' }}>{template.row_count || 0}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    backgroundColor: template.is_active ? '#c6f6d5' : '#e2e8f0',
                    color: template.is_active ? '#276749' : '#718096',
                  }}>
                    {template.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', color: '#4a5568' }}>
                  {new Date(template.created_at).toLocaleDateString()}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                  <button
                    onClick={() => handleEditTemplate(template)}
                    style={{ color: '#3182ce', background: 'none', border: 'none', cursor: 'pointer', marginRight: '12px', fontSize: '14px' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteTemplate(template.id)}
                    style={{ color: '#e53e3e', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px',
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '8px',
            width: '100%',
            maxWidth: '800px',
            maxHeight: '90vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 24px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#2d3748', margin: 0 }}>
                {editingTemplate ? 'Edit Template' : 'Create Template'}
              </h2>
              <button
                onClick={closeModal}
                style={{ background: 'none', border: 'none', fontSize: '24px', color: '#718096', cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              {error && (
                <div style={{ padding: '10px 14px', backgroundColor: '#fed7d7', color: '#c53030', borderRadius: '4px', marginBottom: '16px', fontSize: '14px' }}>
                  {error}
                </div>
              )}

              {/* Template Name */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#4a5568', marginBottom: '4px' }}>
                  Template Name *
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  style={inputStyle}
                  placeholder="e.g., Monthly IT Split - 3 Locations"
                />
              </div>

              {/* Description */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#4a5568', marginBottom: '4px' }}>
                  Description (optional)
                </label>
                <textarea
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }}
                  placeholder="Describe when to use this template..."
                />
              </div>

              {/* Vendor & Allocation Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                {/* Vendor */}
                <div style={{ position: 'relative' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#4a5568', marginBottom: '4px' }}>
                    Vendor *
                  </label>
                  <input
                    type="text"
                    value={vendorSearchQuery}
                    onChange={(e) => {
                      setVendorSearchQuery(e.target.value);
                      searchVendors(e.target.value);
                    }}
                    onFocus={() => { if (vendorSearchQuery.length >= 2) setShowVendorSuggestions(true); }}
                    onBlur={() => setTimeout(() => setShowVendorSuggestions(false), 200)}
                    style={inputStyle}
                    placeholder="Search for a vendor..."
                  />
                  {showVendorSuggestions && vendorSuggestions.length > 0 && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      backgroundColor: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '4px',
                      maxHeight: '200px',
                      overflowY: 'auto',
                      zIndex: 50,
                      marginTop: '2px',
                    }}>
                      {vendorSuggestions.map((vendor) => (
                        <div
                          key={vendor.id}
                          onClick={() => {
                            setVendorName(vendor.name);
                            setVendorSearchQuery(vendor.name);
                            setShowVendorSuggestions(false);
                          }}
                          style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '14px' }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#edf2f7'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#fff'; }}
                        >
                          {vendor.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Allocation */}
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#4a5568', marginBottom: '4px' }}>
                    Allocation Method *
                  </label>
                  <select
                    value={allocationMode}
                    onChange={(e) => handleAllocationModeChange(e.target.value as AllocationMode)}
                    style={selectStyle}
                  >
                    <option value="split_evenly">Split Evenly</option>
                    <option value="split_evenly_all_classes">Split Evenly Across All Classes</option>
                    <option value="fixed_amount">Specific Dollar Amount</option>
                    <option value="percentage">Percent Split</option>
                  </select>
                </div>
              </div>

              {/* Percentage Indicator */}
              {allocationMode === 'percentage' && (
                <div style={{
                  padding: '10px 14px',
                  backgroundColor: isPercentageValid ? '#c6f6d5' : '#fed7d7',
                  color: isPercentageValid ? '#276749' : '#c53030',
                  borderRadius: '4px',
                  marginBottom: '16px',
                  fontSize: '14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <span>% Distribution</span>
                  <span style={{ fontWeight: 600 }}>{percentageTotal.toFixed(1)}% / 100%</span>
                </div>
              )}

              {/* Split Evenly Across All Classes Indicator */}
              {allocationMode === 'split_evenly_all_classes' && (
                <div style={{
                  padding: '10px 14px',
                  backgroundColor: '#ebf8ff',
                  color: '#2b6cb0',
                  borderRadius: '4px',
                  marginBottom: '16px',
                  fontSize: '14px',
                }}>
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>Auto-Generated GL Lines</div>
                  <div style={{ fontSize: '13px' }}>
                    {tableRows.length} classes detected. Invoice amounts will be split evenly ({(100 / tableRows.length).toFixed(1)}% each).
                    Set the Account on the first line — it will apply to all lines.
                  </div>
                </div>
              )}

              {/* GL Lines */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <label style={{ fontSize: '14px', fontWeight: 500, color: '#4a5568' }}>
                    GL Lines ({tableRows.length})
                  </label>
                  <button
                    type="button"
                    onClick={clearTable}
                    style={{ background: 'none', border: 'none', color: '#718096', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Clear all
                  </button>
                </div>

                {tableRows.map((row, index) => (
                  <div key={row.id} style={{
                    padding: '16px',
                    backgroundColor: '#f7fafc',
                    borderRadius: '4px',
                    border: '1px solid #e2e8f0',
                    marginBottom: '12px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#4a5568' }}>GL Line {index + 1}</span>
                      {tableRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeTableRow(row.id)}
                          style={{ background: 'none', border: 'none', color: '#e53e3e', fontSize: '13px', cursor: 'pointer' }}
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      {/* Account */}
                      <div style={{ position: 'relative' }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#718096', marginBottom: '4px' }}>Account *</label>
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
                          style={inputStyle}
                          placeholder="Search accounts..."
                        />
                        {categoryDropdownOpen[row.id] && (
                          <div style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            backgroundColor: '#fff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '4px',
                            maxHeight: '180px',
                            overflowY: 'auto',
                            zIndex: 50,
                            marginTop: '2px',
                          }}>
                            {getFilteredCategories(row.id).map((cat) => (
                              <div
                                key={cat.id}
                                onClick={() => handleCategorySelect(row.id, cat)}
                                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px' }}
                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#edf2f7'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#fff'; }}
                              >
                                {cat.displayText}
                              </div>
                            ))}
                            {getFilteredCategories(row.id).length === 0 && (
                              <div style={{ padding: '8px 12px', color: '#a0aec0', fontSize: '13px' }}>No results</div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Class */}
                      <div style={{ position: 'relative' }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#718096', marginBottom: '4px' }}>Class (Location)</label>
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
                          style={inputStyle}
                          placeholder="Search classes..."
                        />
                        {classDropdownOpen[row.id] && (
                          <div style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            backgroundColor: '#fff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '4px',
                            maxHeight: '180px',
                            overflowY: 'auto',
                            zIndex: 50,
                            marginTop: '2px',
                          }}>
                            {getFilteredLocations(row.id).map((loc) => (
                              <div
                                key={loc.id}
                                onClick={() => handleLocationSelect(row.id, loc)}
                                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px' }}
                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#edf2f7'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#fff'; }}
                              >
                                {loc.name}
                              </div>
                            ))}
                            {getFilteredLocations(row.id).length === 0 && (
                              <div style={{ padding: '8px 12px', color: '#a0aec0', fontSize: '13px' }}>No results</div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: allocationMode === 'split_evenly' ? '1fr' : '1fr 1fr', gap: '12px' }}>
                      {/* Description */}
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#718096', marginBottom: '4px' }}>Description</label>
                        <input
                          type="text"
                          value={row.description}
                          onChange={(e) => updateTableRow(row.id, 'description', e.target.value)}
                          style={inputStyle}
                          placeholder="Optional"
                        />
                      </div>

                      {/* Amount */}
                      {allocationMode === 'fixed_amount' && (
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#718096', marginBottom: '4px' }}>Amount *</label>
                          <div style={{ position: 'relative' }}>
                            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#718096' }}>$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={row.amount}
                              onChange={(e) => updateTableRow(row.id, 'amount', e.target.value)}
                              style={{ ...inputStyle, paddingLeft: '24px' }}
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                      )}

                      {/* Percentage */}
                      {allocationMode === 'percentage' && (
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#718096', marginBottom: '4px' }}>Percentage *</label>
                          <div style={{ position: 'relative' }}>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="100"
                              value={row.percentage}
                              onChange={(e) => updateTableRow(row.id, 'percentage', e.target.value)}
                              style={{ ...inputStyle, paddingRight: '28px' }}
                              placeholder="0"
                            />
                            <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#718096' }}>%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addTableRow}
                  style={{ ...outlineButtonStyle, backgroundColor: '#fff' }}
                >
                  + Add GL Line
                </button>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
            }}>
              <button
                type="button"
                onClick={closeModal}
                style={outlineButtonStyle}
              >
                Cancel
              </button>
              {editingTemplate && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm('Delete this template?')) return;
                    try {
                      const response = await fetch(`/api/coding-templates/${editingTemplate.id}`, { method: 'DELETE' });
                      if (response.ok) {
                        closeModal();
                        await fetchTemplates();
                        showToast('Template deleted', 'success');
                      } else {
                        const data = await response.json();
                        setError(data.error || 'Failed to delete');
                      }
                    } catch (err: any) {
                      setError(err.message);
                    }
                  }}
                  style={{ ...buttonStyle, backgroundColor: '#e53e3e', borderColor: '#e53e3e' }}
                >
                  Delete
                </button>
              )}
              <button
                type="submit"
                onClick={handleSubmit}
                disabled={submitting || (allocationMode === 'percentage' && !isPercentageValid)}
                style={{
                  ...buttonStyle,
                  opacity: (submitting || (allocationMode === 'percentage' && !isPercentageValid)) ? 0.5 : 1,
                  cursor: (submitting || (allocationMode === 'percentage' && !isPercentageValid)) ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'Saving...' : (editingTemplate ? 'Update Template' : 'Save Template')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
