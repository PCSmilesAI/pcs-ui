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

const ALLOCATION_MODE_COLORS: Record<AllocationMode, { bg: string; text: string }> = {
  split_evenly: { bg: '#dbeafe', text: '#1e40af' },
  fixed_amount: { bg: '#fef3c7', text: '#92400e' },
  percentage: { bg: '#f3e8ff', text: '#6b21a8' },
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
      padding: 16px 24px;
      background-color: ${variant === 'success' ? '#059669' : '#dc2626'};
      color: white;
      border-radius: 8px;
      z-index: 9999;
      box-shadow: 0 10px 25px rgba(0,0,0,0.2);
      font-weight: 500;
      font-size: 14px;
      animation: slideIn 0.3s ease-out;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => document.body.removeChild(toast), 300);
    }, 3000);
  }

  function getAllocationModeLabel(mode?: string): string {
    if (!mode) return 'Split Evenly';
    return ALLOCATION_MODE_LABELS[mode as AllocationMode] || mode;
  }

  function getAllocationModeColors(mode?: string): { bg: string; text: string } {
    if (!mode) return ALLOCATION_MODE_COLORS.split_evenly;
    return ALLOCATION_MODE_COLORS[mode as AllocationMode] || ALLOCATION_MODE_COLORS.split_evenly;
  }

  // Styles
  const styles = {
    page: {
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      padding: '32px 24px',
    } as React.CSSProperties,
    container: {
      maxWidth: '1200px',
      margin: '0 auto',
    } as React.CSSProperties,
    card: {
      backgroundColor: '#ffffff',
      borderRadius: '12px',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)',
      overflow: 'hidden',
    } as React.CSSProperties,
    cardHeader: {
      padding: '20px 24px',
      borderBottom: '1px solid #e5e7eb',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: '#ffffff',
    } as React.CSSProperties,
    title: {
      fontSize: '24px',
      fontWeight: '700',
      color: '#111827',
      margin: 0,
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    } as React.CSSProperties,
    primaryBtn: {
      padding: '10px 20px',
      backgroundColor: '#2563eb',
      color: '#ffffff',
      border: 'none',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      transition: 'all 0.2s',
    } as React.CSSProperties,
    table: {
      width: '100%',
      borderCollapse: 'collapse' as const,
    } as React.CSSProperties,
    th: {
      padding: '14px 20px',
      textAlign: 'left' as const,
      fontSize: '12px',
      fontWeight: '600',
      color: '#6b7280',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.05em',
      backgroundColor: '#f9fafb',
      borderBottom: '1px solid #e5e7eb',
    } as React.CSSProperties,
    td: {
      padding: '16px 20px',
      fontSize: '14px',
      color: '#374151',
      borderBottom: '1px solid #f3f4f6',
      verticalAlign: 'middle' as const,
    } as React.CSSProperties,
    badge: {
      padding: '4px 12px',
      borderRadius: '9999px',
      fontSize: '12px',
      fontWeight: '600',
      display: 'inline-block',
    } as React.CSSProperties,
    actionBtn: {
      padding: '6px 14px',
      borderRadius: '6px',
      fontSize: '13px',
      fontWeight: '500',
      cursor: 'pointer',
      border: 'none',
      transition: 'all 0.2s',
    } as React.CSSProperties,
    infoBox: {
      marginTop: '24px',
      backgroundColor: '#eff6ff',
      border: '1px solid #bfdbfe',
      borderRadius: '12px',
      padding: '20px 24px',
    } as React.CSSProperties,
    modalOverlay: {
      position: 'fixed' as const,
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px',
      backdropFilter: 'blur(4px)',
    } as React.CSSProperties,
    modal: {
      backgroundColor: '#ffffff',
      borderRadius: '16px',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
      width: '100%',
      maxWidth: '900px',
      maxHeight: '90vh',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column' as const,
    } as React.CSSProperties,
    modalHeader: {
      padding: '20px 24px',
      borderBottom: '1px solid #e5e7eb',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: '#f9fafb',
    } as React.CSSProperties,
    modalBody: {
      padding: '24px',
      overflowY: 'auto' as const,
      flex: 1,
    } as React.CSSProperties,
    formGroup: {
      marginBottom: '20px',
    } as React.CSSProperties,
    label: {
      display: 'block',
      fontSize: '13px',
      fontWeight: '600',
      color: '#374151',
      marginBottom: '6px',
    } as React.CSSProperties,
    input: {
      width: '100%',
      padding: '10px 14px',
      fontSize: '14px',
      border: '1px solid #d1d5db',
      borderRadius: '8px',
      outline: 'none',
      transition: 'border-color 0.2s, box-shadow 0.2s',
      backgroundColor: '#ffffff',
      boxSizing: 'border-box' as const,
    } as React.CSSProperties,
    select: {
      width: '100%',
      padding: '10px 14px',
      fontSize: '14px',
      border: '1px solid #d1d5db',
      borderRadius: '8px',
      outline: 'none',
      backgroundColor: '#ffffff',
      cursor: 'pointer',
      appearance: 'none' as const,
      backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
      backgroundPosition: 'right 10px center',
      backgroundRepeat: 'no-repeat',
      backgroundSize: '20px',
    } as React.CSSProperties,
    glLineCard: {
      padding: '20px',
      backgroundColor: '#f9fafb',
      borderRadius: '10px',
      border: '1px solid #e5e7eb',
      marginBottom: '12px',
    } as React.CSSProperties,
    glLineHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '16px',
    } as React.CSSProperties,
    glLineBadge: {
      padding: '4px 10px',
      backgroundColor: '#e5e7eb',
      borderRadius: '6px',
      fontSize: '12px',
      fontWeight: '600',
      color: '#374151',
    } as React.CSSProperties,
    removeBtn: {
      padding: '4px 12px',
      backgroundColor: 'transparent',
      color: '#dc2626',
      border: '1px solid #fecaca',
      borderRadius: '6px',
      fontSize: '12px',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'all 0.2s',
    } as React.CSSProperties,
    grid2: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '16px',
    } as React.CSSProperties,
    grid3: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '16px',
    } as React.CSSProperties,
    dropdown: {
      position: 'absolute' as const,
      top: '100%',
      left: 0,
      right: 0,
      backgroundColor: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
      maxHeight: '200px',
      overflowY: 'auto' as const,
      zIndex: 50,
      marginTop: '4px',
    } as React.CSSProperties,
    dropdownItem: {
      padding: '10px 14px',
      fontSize: '14px',
      cursor: 'pointer',
      transition: 'background-color 0.15s',
    } as React.CSSProperties,
    percentIndicator: {
      padding: '12px 16px',
      borderRadius: '8px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '20px',
    } as React.CSSProperties,
    modalFooter: {
      padding: '16px 24px',
      borderTop: '1px solid #e5e7eb',
      display: 'flex',
      gap: '12px',
      backgroundColor: '#f9fafb',
    } as React.CSSProperties,
  };

  if (!isAdmin && loading) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <div style={styles.card}>
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <div style={{ fontSize: '18px', color: '#6b7280' }}>Verifying access...</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <div style={styles.card}>
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <div style={{ fontSize: '18px', color: '#dc2626', fontWeight: '600' }}>Access Denied</div>
              <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '8px' }}>Only admins can access this page. Redirecting...</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Main Card */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h1 style={styles.title}>
              <span style={{ fontSize: '28px' }}>📋</span>
              Coding Templates
            </h1>
            <button
              onClick={() => setShowModal(true)}
              style={styles.primaryBtn}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1d4ed8'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#2563eb'; }}
            >
              <span style={{ fontSize: '18px' }}>+</span>
              New Template
            </button>
          </div>

          {error && !showModal && (
            <div style={{ padding: '16px 24px', backgroundColor: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
              <p style={{ color: '#dc2626', fontSize: '14px', margin: 0 }}>{error}</p>
            </div>
          )}

          <div style={{ padding: '0' }}>
            {loading ? (
              <div style={{ padding: '60px', textAlign: 'center' }}>
                <div style={{ fontSize: '16px', color: '#6b7280' }}>Loading templates...</div>
              </div>
            ) : templates.length === 0 ? (
              <div style={{ padding: '60px', textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
                <div style={{ fontSize: '18px', color: '#374151', fontWeight: '600' }}>No templates yet</div>
                <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '8px' }}>Create your first coding template to get started</div>
              </div>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Template Name</th>
                    <th style={styles.th}>Vendor</th>
                    <th style={styles.th}>Allocation</th>
                    <th style={styles.th}>GL Lines</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Created</th>
                    <th style={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((template) => {
                    const modeColors = getAllocationModeColors(template.allocation_mode);
                    return (
                      <tr key={template.id} style={{ transition: 'background-color 0.15s' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; }}
                      >
                        <td style={styles.td}>
                          <div style={{ fontWeight: '600', color: '#111827' }}>{template.name}</div>
                          {template.description && (
                            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {template.description}
                            </div>
                          )}
                        </td>
                        <td style={styles.td}>{template.vendor_name || '—'}</td>
                        <td style={styles.td}>
                          <span style={{
                            ...styles.badge,
                            backgroundColor: modeColors.bg,
                            color: modeColors.text,
                          }}>
                            {getAllocationModeLabel(template.allocation_mode)}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <span style={{
                            ...styles.badge,
                            backgroundColor: '#f3f4f6',
                            color: '#374151',
                          }}>
                            {template.row_count || 0} lines
                          </span>
                        </td>
                        <td style={styles.td}>
                          <span style={{
                            ...styles.badge,
                            backgroundColor: template.is_active ? '#dcfce7' : '#f3f4f6',
                            color: template.is_active ? '#166534' : '#6b7280',
                          }}>
                            {template.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={styles.td}>
                          {new Date(template.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td style={styles.td}>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => handleEditTemplate(template)}
                              style={{ ...styles.actionBtn, backgroundColor: '#eff6ff', color: '#2563eb' }}
                              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#dbeafe'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#eff6ff'; }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteTemplate(template.id)}
                              style={{ ...styles.actionBtn, backgroundColor: '#fef2f2', color: '#dc2626' }}
                              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#fee2e2'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#fef2f2'; }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Info Box */}
        <div style={styles.infoBox}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1e40af', margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>💡</span> How Coding Templates Work
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            <div style={{ fontSize: '14px', color: '#1e40af', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ color: '#3b82f6' }}>•</span>
              <span><strong>Split Evenly:</strong> Divides the invoice total equally among all GL lines</span>
            </div>
            <div style={{ fontSize: '14px', color: '#1e40af', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ color: '#3b82f6' }}>•</span>
              <span><strong>Specific Dollar Amount:</strong> Applies fixed dollar amounts to each GL line</span>
            </div>
            <div style={{ fontSize: '14px', color: '#1e40af', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ color: '#3b82f6' }}>•</span>
              <span><strong>Percent Split:</strong> Allocates based on percentage (must equal 100%)</span>
            </div>
            <div style={{ fontSize: '14px', color: '#1e40af', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ color: '#3b82f6' }}>•</span>
              <span>Templates can be applied from the invoice view page to auto-populate GL lines</span>
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div style={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', margin: 0 }}>
                {editingTemplate ? '✏️ Edit Template' : '✨ Create New Template'}
              </h2>
              <button
                onClick={closeModal}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  padding: '4px',
                  lineHeight: 1,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#6b7280'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#9ca3af'; }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} style={styles.modalBody}>
              {error && (
                <div style={{
                  padding: '12px 16px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  marginBottom: '20px',
                }}>
                  <p style={{ color: '#dc2626', fontSize: '14px', margin: 0 }}>{error}</p>
                </div>
              )}

              {/* Template Name */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Template Name *</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  style={{
                    ...styles.input,
                    borderColor: !templateName.trim() && error ? '#fca5a5' : '#d1d5db',
                  }}
                  placeholder="e.g., Monthly IT Split - 3 Locations"
                  onFocus={(e) => { e.target.style.borderColor = '#2563eb'; e.target.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.1)'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#d1d5db'; e.target.style.boxShadow = 'none'; }}
                />
              </div>

              {/* Description */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Description (optional)</label>
                <textarea
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  style={{ ...styles.input, minHeight: '70px', resize: 'vertical' as const }}
                  placeholder="Describe when to use this template..."
                  onFocus={(e) => { e.target.style.borderColor = '#2563eb'; e.target.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.1)'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#d1d5db'; e.target.style.boxShadow = 'none'; }}
                />
              </div>

              <div style={styles.grid2}>
                {/* Vendor Search */}
                <div style={styles.formGroup}>
                  <label style={styles.label}>Vendor *</label>
                  <div style={{ position: 'relative' }}>
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
                      onBlur={() => setTimeout(() => setShowVendorSuggestions(false), 200)}
                      style={{ ...styles.input, paddingLeft: '38px' }}
                      placeholder="Search for a vendor..."
                    />
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: '16px' }}>🔍</span>
                    {showVendorSuggestions && vendorSuggestions.length > 0 && (
                      <div style={styles.dropdown}>
                        {vendorSuggestions.map((vendor) => (
                          <div
                            key={vendor.id}
                            onClick={() => {
                              setVendorName(vendor.name);
                              setVendorSearchQuery(vendor.name);
                              setShowVendorSuggestions(false);
                            }}
                            style={styles.dropdownItem}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#eff6ff'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; }}
                          >
                            {vendor.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Allocation Mode */}
                <div style={styles.formGroup}>
                  <label style={styles.label}>Allocation Method *</label>
                  <select
                    value={allocationMode}
                    onChange={(e) => setAllocationMode(e.target.value as AllocationMode)}
                    style={styles.select}
                  >
                    <option value="split_evenly">Split Evenly</option>
                    <option value="fixed_amount">Specific Dollar Amount</option>
                    <option value="percentage">Percent Split</option>
                  </select>
                </div>
              </div>

              {/* Percentage Indicator */}
              {allocationMode === 'percentage' && (
                <div style={{
                  ...styles.percentIndicator,
                  backgroundColor: isPercentageValid ? '#dcfce7' : '#fef2f2',
                  border: `1px solid ${isPercentageValid ? '#86efac' : '#fecaca'}`,
                }}>
                  <span style={{ fontWeight: '600', color: isPercentageValid ? '#166534' : '#dc2626' }}>
                    % Distribution
                  </span>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '20px', fontWeight: '700', color: isPercentageValid ? '#166534' : '#dc2626' }}>
                      {percentageTotal.toFixed(1)}%
                    </span>
                    <span style={{ color: isPercentageValid ? '#166534' : '#dc2626', marginLeft: '4px' }}> / 100%</span>
                    {!isPercentageValid && (
                      <div style={{ fontSize: '12px', color: '#dc2626', marginTop: '2px' }}>
                        {percentageTotal < 100 ? `Missing ${(100 - percentageTotal).toFixed(1)}%` : `Over by ${(percentageTotal - 100).toFixed(1)}%`}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* GL Lines */}
              <div style={styles.formGroup}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <label style={{ ...styles.label, marginBottom: 0 }}>
                    GL Lines ({tableRows.length})
                  </label>
                  <button
                    type="button"
                    onClick={clearTable}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#6b7280',
                      fontSize: '13px',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    Clear all
                  </button>
                </div>

                {tableRows.map((row, index) => (
                  <div key={row.id} style={styles.glLineCard}>
                    <div style={styles.glLineHeader}>
                      <span style={styles.glLineBadge}>GL Line {index + 1}</span>
                      {tableRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeTableRow(row.id)}
                          style={styles.removeBtn}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#fef2f2'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div style={styles.grid2}>
                      {/* Account */}
                      <div style={{ position: 'relative' }}>
                        <label style={{ ...styles.label, fontSize: '12px' }}>Account *</label>
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
                          style={styles.input}
                          placeholder="Search accounts..."
                        />
                        {categoryDropdownOpen[row.id] && (
                          <div style={styles.dropdown}>
                            {getFilteredCategories(row.id).map((cat, idx) => (
                              <div
                                key={cat.id}
                                onClick={() => handleCategorySelect(row.id, cat)}
                                style={{
                                  ...styles.dropdownItem,
                                  backgroundColor: idx === 0 ? '#eff6ff' : '#ffffff',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#eff6ff'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = idx === 0 ? '#eff6ff' : '#ffffff'; }}
                              >
                                {cat.displayText}
                              </div>
                            ))}
                            {getFilteredCategories(row.id).length === 0 && (
                              <div style={{ ...styles.dropdownItem, color: '#9ca3af' }}>No results found</div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Class */}
                      <div style={{ position: 'relative' }}>
                        <label style={{ ...styles.label, fontSize: '12px' }}>Class (Location)</label>
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
                          style={styles.input}
                          placeholder="Search classes..."
                        />
                        {classDropdownOpen[row.id] && (
                          <div style={styles.dropdown}>
                            {getFilteredLocations(row.id).map((loc, idx) => (
                              <div
                                key={loc.id}
                                onClick={() => handleLocationSelect(row.id, loc)}
                                style={{
                                  ...styles.dropdownItem,
                                  backgroundColor: idx === 0 ? '#eff6ff' : '#ffffff',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#eff6ff'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = idx === 0 ? '#eff6ff' : '#ffffff'; }}
                              >
                                {loc.name}
                              </div>
                            ))}
                            {getFilteredLocations(row.id).length === 0 && (
                              <div style={{ ...styles.dropdownItem, color: '#9ca3af' }}>No results found</div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ ...styles.grid3, marginTop: '12px' }}>
                      {/* Description */}
                      <div>
                        <label style={{ ...styles.label, fontSize: '12px' }}>Description</label>
                        <input
                          type="text"
                          value={row.description}
                          onChange={(e) => updateTableRow(row.id, 'description', e.target.value)}
                          style={styles.input}
                          placeholder="Optional"
                        />
                      </div>

                      {/* Amount (fixed_amount mode) */}
                      {allocationMode === 'fixed_amount' && (
                        <div>
                          <label style={{ ...styles.label, fontSize: '12px' }}>Amount *</label>
                          <div style={{ position: 'relative' }}>
                            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }}>$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={row.amount}
                              onChange={(e) => updateTableRow(row.id, 'amount', e.target.value)}
                              style={{ ...styles.input, paddingLeft: '28px' }}
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                      )}

                      {/* Percentage (percentage mode) */}
                      {allocationMode === 'percentage' && (
                        <div>
                          <label style={{ ...styles.label, fontSize: '12px' }}>Percentage *</label>
                          <div style={{ position: 'relative' }}>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="100"
                              value={row.percentage}
                              onChange={(e) => updateTableRow(row.id, 'percentage', e.target.value)}
                              style={{ ...styles.input, paddingRight: '32px' }}
                              placeholder="0"
                            />
                            <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }}>%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addTableRow}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#059669',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginTop: '8px',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#047857'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#059669'; }}
                >
                  <span style={{ fontSize: '18px' }}>+</span>
                  Add GL Line
                </button>
              </div>
            </form>

            <div style={styles.modalFooter}>
              <button
                type="submit"
                onClick={handleSubmit}
                disabled={submitting || (allocationMode === 'percentage' && !isPercentageValid)}
                style={{
                  ...styles.primaryBtn,
                  opacity: (submitting || (allocationMode === 'percentage' && !isPercentageValid)) ? 0.5 : 1,
                  cursor: (submitting || (allocationMode === 'percentage' && !isPercentageValid)) ? 'not-allowed' : 'pointer',
                  flex: 1,
                  justifyContent: 'center',
                }}
              >
                {submitting ? 'Saving...' : (editingTemplate ? 'Update Template' : 'Save Template')}
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
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#b91c1c'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#dc2626'; }}
                >
                  Delete
                </button>
              )}
              <button
                type="button"
                onClick={closeModal}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#e5e7eb'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
