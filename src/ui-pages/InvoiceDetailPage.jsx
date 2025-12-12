import React, { useState, useEffect, useCallback } from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { fetchQboCategories } from '../lib/categoriesClient';
import ACHBadge from '../ui/ach/ACHBadge';
import { useVendorAchMap } from '../ui/ach/useVendorAch';
import Toast from '../components/Toast.jsx';
import { csrfClient } from '../lib/api/csrfClient';
import { CodingTemplateSelector } from '../../components/invoices/CodingTemplateSelector';

// Helper function to get user email from localStorage/cookie
function getUserEmail() {
  try {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('loggedInUser') : null;
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed?.email || '';
    }
  } catch (e) {
    console.error('Failed to get user email:', e);
  }
  return '';
}

// Helper function to check if user is an admin
async function checkIfAdmin(email) {
  if (!email) return false;
  
  try {
    const response = await fetch('/api/workflow/config');
    if (!response.ok) return false;
    
    const config = await response.json();
    const admins = config?.admins || [];
    const normalizedEmail = email.trim().toLowerCase();
    
    return admins.map(e => e.trim().toLowerCase()).includes(normalizedEmail);
  } catch (e) {
    console.error('Failed to check admin status:', e);
    return false;
  }
}

/**
 * Detail view for a single invoice. Displays high level summary
 * information at the top along with actions (approve, reject,
 * update). Below the summary the left column shows invoice
 * status, details and line items. The right column contains the
 * actual invoice PDF. A back arrow returns the user to the
 * previous list. This version uses only inline styles so
 * that the layout and colours appear even if no CSS preprocessor
 * is available.
 */
export default function InvoiceDetailPage({ invoice, onBack, onPrevious, onNext, canGoPrevious, canGoNext, onInvoiceRejected }) {
  const invoiceIdentifier = invoice?.id || invoice?.invoice_number || null;
  const invoiceJsonPath = invoice?.json_path || null;
  const invoiceSourceFile = invoice?.source_file || null;

  // State for editable fields. Payment amount can be modified by the
  // user. Other details and line items could be lifted into state
  // similarly; here we demonstrate for payment and details.
  // Amount is stored in cents in the database, convert to dollars with $ prefix
  const initialAmountCents = invoice?.amount_cents;
  const initialAmount = initialAmountCents != null
    ? `$${(initialAmountCents / 100).toFixed(2)}`
    : (invoice?.amount || invoice?.total || '');
  const [paymentAmount, setPaymentAmount] = useState(initialAmount);
  const [details, setDetails] = useState({
    invoice: invoice?.invoice_number || invoice?.invoice || '',
    vendor: invoice?.vendor_name || invoice?.vendor || '',
    office: invoice?.office_id || invoice?.office || '',
    category: invoice?.category || 'Dental Lab',
    invoice_date: invoice?.invoice_date || '',
    due_date: invoice?.due_date || '',
  });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [lineCategories, setLineCategories] = useState({});
  const [loadingLineCategories, setLoadingLineCategories] = useState(false);
  const [invoiceCategories, setInvoiceCategories] = useState([]); // NEW: Invoice-level categories
  const [invoiceTotalAmount, setInvoiceTotalAmount] = useState(0); // Invoice total for allocation tracking
  const [allocationSummary, setAllocationSummary] = useState({ totalAmount: 0, allocated: 0, unallocated: 0 });
  const [qboClasses, setQboClasses] = useState([]); // QBO Classes for dropdown
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [toast, setToast] = useState(null);
  const [paymentDetails, setPaymentDetails] = useState(null);
  const [loadingPaymentDetails, setLoadingPaymentDetails] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [reassignmentTargets, setReassignmentTargets] = useState([]); // NEW: Reassignment targets
  const [selectedReassignmentTarget, setSelectedReassignmentTarget] = useState(null); // NEW: Selected target
  const [reassigningInvoice, setReassigningInvoice] = useState(false); // NEW: Reassignment loading state
  const [notes, setNotes] = useState(''); // NEW: Notes field for LLM feedback
  const [notesHistory, setNotesHistory] = useState([]); // NEW: Notes history
  const [isChatOpen, setIsChatOpen] = useState(false); // NEW: Chat interface visibility
  const [chatMessages, setChatMessages] = useState([]); // NEW: Chat messages
  const [chatInput, setChatInput] = useState(''); // NEW: Chat input
  const [sendingChat, setSendingChat] = useState(false); // NEW: Chat sending state
  const [isAdminOrAP, setIsAdminOrAP] = useState(false); // NEW: User authorization check
  const [allocations, setAllocations] = useState([]); // NEW: Template allocations
  const [template, setTemplate] = useState(null); // NEW: Applied template info
  const [improveParser, setImproveParser] = useState(false); // NEW: AI Mechanic checkbox
  const [improvingParser, setImprovingParser] = useState(false); // NEW: AI Mechanic loading state
  const [showUpdateModal, setShowUpdateModal] = useState(false); // NEW: Update confirmation modal
  const [updateComment, setUpdateComment] = useState(''); // NEW: User comment for AI mechanic
  const [showAllocationErrorModal, setShowAllocationErrorModal] = useState(false); // NEW: Allocation error modal
  const { getStatusForVendor } = useVendorAchMap();
  const showToast = useCallback((message, variant = 'info') => {
    setToast({ message, variant, at: Date.now() });
  }, []);

  // Load QBO categories and classes on mount
  useEffect(() => {
    fetchCategories();
    fetchQboClasses();
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);
  const STATUS_META = {
    incoming: { label: 'Incoming', fg: '#1d4ed8', bg: '#e0f2fe', border: '#60a5fa' },
    categorized: { label: 'Categorized', fg: '#0369a1', bg: '#e0f2fe', border: '#38bdf8' },
    awaiting_office_approval: {
      label: 'Awaiting Office Approval',
      fg: '#b45309',
      bg: '#fef3c7',
      border: '#f59e0b',
    },
    awaiting_admin_approval: {
      label: 'Awaiting Admin Approval',
      fg: '#6b21a8',
      bg: '#f3e8ff',
      border: '#c084fc',
    },
    to_be_paid: { label: 'To Be Paid', fg: '#047857', bg: '#d1fae5', border: '#34d399' },
    paid: { label: 'Paid', fg: '#065f46', bg: '#d1fae5', border: '#34d399' },
    rejected: { label: 'Rejected', fg: '#b91c1c', bg: '#fee2e2', border: '#f87171' },
    repair: { label: 'Needs Repair', fg: '#92400e', bg: '#fef3c7', border: '#fbbf24' },
  };
  const statusValue = (invoice?.status || 'incoming').toLowerCase();
  const statusMeta =
    STATUS_META[statusValue] ||
    {
      label: statusValue ? statusValue.replace(/_/g, ' ') : 'Unknown',
      fg: '#1f2937',
      bg: '#e5e7eb',
      border: '#cbd5f5',
    };
  const approvals =
    invoice?.approvals && typeof invoice.approvals === 'object' ? invoice.approvals : {};

  // NEW: Three-stage status system (Coded -> Approved -> Paid)
  const threeStageStatus = [
    {
      stage: 'Coded',
      timestamp: invoice?.coded_at,
      user: invoice?.coded_by_user_id,
    },
    {
      stage: 'Approved',
      timestamp: invoice?.approved_at,
      user: invoice?.approved_by_user_id,
    },
    {
      stage: 'Paid',
      timestamp: invoice?.paid_at,
      user: invoice?.paid_by_user_id,
    },
  ];

  // Legacy approval stages (kept for backward compatibility)
  const approvalStages = [
    { key: 'ap', label: 'Accounts Payable' },
    { key: 'office', label: 'Office Manager' },
    { key: 'admin', label: 'Admin' },
  ];
  const renderStatusChip = (size = 'lg') => (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: size === 'lg' ? '6px 14px' : '4px 10px',
        borderRadius: '9999px',
        backgroundColor: statusMeta.bg,
        color: statusMeta.fg,
        border: `1px solid ${statusMeta.border}`,
        fontSize: size === 'lg' ? '13px' : '12px',
        fontWeight: 600,
        textTransform: 'capitalize',
      }}
    >
      {statusMeta.label}
    </span>
  );
  const formatApprovalTimestamp = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // NEW: Format timestamp for three-stage status display (e.g., "On Nov 3 at 9:26am")
  const formatStageTimestamp = (timestamp) => {
    if (!timestamp) return 'Incomplete';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return 'Incomplete';
    const formatted = date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      meridiem: 'short',
    });
    return `On ${formatted}`;
  };

  useEffect(() => {
    // Use database field names (amount_cents, vendor_name, office_id) with fallback to legacy JSON fields
    const amountCents = invoice?.amount_cents;
    const amountDisplay = amountCents != null
      ? `$${(amountCents / 100).toFixed(2)}`
      : (invoice?.amount || invoice?.total || '');
    setPaymentAmount(amountDisplay);

    setDetails({
      invoice: invoice?.invoice_number || invoice?.invoice || '',
      vendor: invoice?.vendor_name || invoice?.vendor || '',
      office: invoice?.office_id || invoice?.office || '',
      category: invoice?.category || 'Dental Lab',
      invoice_date: invoice?.invoice_date || '',
      due_date: invoice?.due_date || '',
    });
  }, [invoice]);

  // Load allocations when invoice loads
  useEffect(() => {
    async function loadAllocations() {
      if (!invoiceIdentifier) return;
      
      try {
        const response = await fetch(`/api/invoices/${invoiceIdentifier}`);
        if (response.ok) {
          const data = await response.json();
          if (data.allocations) {
            setAllocations(data.allocations);
          }
          if (data.template) {
            setTemplate(data.template);
          }
        }
      } catch (error) {
        console.error('Error loading allocations:', error);
      }
    }
    
    loadAllocations();
  }, [invoiceIdentifier]);

  // Load line items from JSON data
  useEffect(() => {
    let isActive = true;

    async function loadLineItems() {
      if (!invoiceJsonPath && !invoiceSourceFile) {
        if (isActive) {
          console.log('🧭 Line item load: no json_path or source_file; using embedded line_items if available');
          if (Array.isArray(invoice?.line_items) && invoice.line_items.length > 0) {
            const transformedItems = invoice.line_items.map((item, index) => ({
              id: item.product_number || `item-${index}`,
              name: item.product_name || '',
              qty: item.Quantity || '1',
              unit: `$${item.unit_price || '0.00'}`,
              total: `$${item.line_item_total || '0.00'}`,
              category: item.quickbooks_category || 'Not categorized',
            }));
            setItems(transformedItems);
          } else {
            setItems([]);
          }
          setLoading(false);
        }
        return;
      }

      const trySetFromJson = (jsonData) => {
        if (Array.isArray(jsonData?.line_items)) {
          const transformedItems = jsonData.line_items.map((item, index) => ({
            id: item.product_number || `item-${index}`,
            name: item.product_name || '',
            qty: item.Quantity || '1',
            unit: `$${item.unit_price || '0.00'}`,
            total: `$${item.line_item_total || '0.00'}`,
            category: item.quickbooks_category || 'Not categorized',
          }));
          setItems(transformedItems);
          return true;
        }
        return false;
      };

      try {
        console.log('🧭 Line item load start', {
          invoice_number: invoice?.invoice_number,
          invoiceJsonPath,
          invoiceSourceFile
        });
        // First attempt: direct fetch using the provided path
        const directUrl = invoiceJsonPath
          ? (invoiceJsonPath.startsWith('/') ? invoiceJsonPath : `/${invoiceJsonPath}`)
          : null;
        let response = null;
        if (directUrl) {
          console.log('🌐 Fetch (direct)', directUrl);
          response = await fetch(directUrl, { cache: 'no-store' });
          console.log('🌐 Fetch (direct) status', response.status);
          if (response.ok) {
            const jsonData = await response.json();
            if (isActive && trySetFromJson(jsonData)) {
              setLoading(false);
              return;
            }
          }
        }

        // Fallback: use safe API route to serve from output_jsons
        // Prefer json_path; if missing, derive from source_file
        const marker = '/output_jsons/';
        let rel = '';
        if (invoiceJsonPath) {
          const idx = invoiceJsonPath.indexOf(marker);
          rel = idx >= 0
            ? invoiceJsonPath.slice(idx + marker.length)
            : invoiceJsonPath.replace(/^\/?output_jsons\/?/, '');
        } else if (invoiceSourceFile) {
          rel = invoiceSourceFile.replace(/^\//, '');
        }
        if (rel) {
          const apiUrl = `/output_jsons/${rel}`;
          console.log('🌐 Fetch (fallback /output_jsons)', apiUrl);
          response = await fetch(apiUrl, { cache: 'no-store' });
          console.log('🌐 Fetch (fallback) status', response.status);
          if (response.ok) {
            const jsonData = await response.json();
            if (isActive && trySetFromJson(jsonData)) {
              setLoading(false);
              return;
            }
          }
        }

        if (isActive) {
          console.warn('Failed to load JSON data for line items from both direct and API routes', {
            invoice_number: invoice?.invoice_number,
            invoiceJsonPath,
            invoiceSourceFile
          });
          // Final fallback: use embedded line_items from the invoice object if present
          if (Array.isArray(invoice?.line_items) && invoice.line_items.length > 0) {
            console.log('🧩 Using embedded invoice.line_items as fallback');
            const transformedItems = invoice.line_items.map((item, index) => ({
              id: item.product_number || `item-${index}`,
              name: item.product_name || '',
              qty: item.Quantity || '1',
              unit: `$${item.unit_price || '0.00'}`,
              total: `$${item.line_item_total || '0.00'}`,
              category: item.quickbooks_category || 'Not categorized',
            }));
            setItems(transformedItems);
          } else {
            setItems([]);
          }
        }
      } catch (error) {
        if (isActive) {
          console.error('Error loading line items:', error);
          setItems([]);
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    loadLineItems();

    return () => {
      isActive = false;
    };
  }, [invoiceJsonPath, invoiceSourceFile]);

  const loadLineCategories = useCallback(async () => {
    if (!invoiceIdentifier) {
      setLineCategories({});
      return;
    }

    setLoadingLineCategories(true);
    try {
      const response = await fetch(`/api/invoices/${invoiceIdentifier}/categories`);

      if (response.ok) {
        const data = await response.json();
        setLineCategories(data.lineCategories || {});
        console.log('✅ Line categories loaded:', Object.keys(data.lineCategories || {}).length, 'assignments');
      } else {
        console.warn('Failed to load line categories:', response.status);
        setLineCategories({});
      }
    } catch (error) {
      console.error('❌ Error loading line categories:', error);
      setLineCategories({});
    } finally {
      setLoadingLineCategories(false);
    }
  }, [invoiceIdentifier]);

  // Load line categories when component mounts or invoice changes
  useEffect(() => {
    if (invoiceIdentifier) {
      loadLineCategories();
    }
  }, [invoiceIdentifier, loadLineCategories]);

  // Load payment details for paid invoices
  useEffect(() => {
    const loadPaymentDetails = async () => {
      const status = (invoice?.status || '').toLowerCase();
      if (status !== 'paid' && status !== 'completed') {
        setPaymentDetails(null);
        return;
      }

      // If we already have payment details, don't reload
      if (paymentDetails) return;

      try {
        setLoadingPaymentDetails(true);
        const stripeTransferId = invoice?.stripe_transfer_id;
        const vendorName = invoice?.vendor || invoice?.vendor_name;

        if (!stripeTransferId || !vendorName) {
          setPaymentDetails(null);
          return;
        }

        // Fetch payment details from Stripe
        const response = await fetch(
          `/api/stripe/payment-history?vendor=${encodeURIComponent(vendorName)}&t=${Date.now()}`,
          { cache: 'no-store', credentials: 'include' }
        );

        if (!response.ok) {
          console.warn('Failed to load payment details');
          setPaymentDetails(null);
          return;
        }

        const data = await response.json();
        if (data?.ok && data?.paymentHistory) {
          // Find the payment matching this transfer ID
          const payment = data.paymentHistory.find(p => p.id === stripeTransferId);
          if (payment) {
            setPaymentDetails(payment);
          }
        }
      } catch (error) {
        console.error('Error loading payment details:', error);
        setPaymentDetails(null);
      } finally {
        setLoadingPaymentDetails(false);
      }
    };

    loadPaymentDetails();
  }, [invoice?.status, invoice?.stripe_transfer_id, invoice?.vendor, invoice?.vendor_name]);

  if (!invoice) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <h2>Invoice not found</h2>
        <p>This invoice could not be loaded.</p>
        {onBack && (
          <button
            onClick={onBack}
            style={{
              padding: '8px 16px',
              backgroundColor: '#357ab2',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginTop: '16px',
            }}
          >
            Go Back
          </button>
        )}
      </div>
    );
  }

  function handleDetailChange(field, value) {
    setDetails((prev) => ({ ...prev, [field]: value }));
  }

  function handleItemChange(index, field, value) {
    setItems((prev) => {
      const updated = prev.slice();
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  // This function is now imported from categoriesClient.js

  // Fetch QuickBooks categories (wrapper for existing code)
  async function fetchCategories() {
    setLoadingCategories(true);
    try {
      const result = await fetchQboCategories();
      setCategories(result.categories);
      console.log('✅ Categories loaded:', result.categories.length, 'from', result.source);
      
      // Show helpful message if no categories found
      if (result.categories.length === 0) {
        const message = result.reason || 'No expense accounts found in QuickBooks. Ask your accountant to set up Chart of Accounts.';
        console.log('ℹ️', message);
        // Don't show alert for empty results, just log it
      }
    } catch (error) {
      console.error('❌ Error fetching categories:', error);
      // Show the actual error message instead of generic "undefined"
      alert(`Failed to load QuickBooks categories: ${error.message}`);
    } finally {
      setLoadingCategories(false);
    }
  }

  // Fetch QBO Classes for dropdown
  async function fetchQboClasses() {
    setLoadingClasses(true);
    try {
      const response = await fetch('/api/qbo/classes');
      if (response.ok) {
        const data = await response.json();
        setQboClasses(data.classes || []);
        console.log('✅ QBO Classes loaded:', data.classes?.length || 0);
      } else {
        console.warn('Failed to load QBO classes:', response.status);
      }
    } catch (error) {
      console.error('❌ Error fetching QBO classes:', error);
    } finally {
      setLoadingClasses(false);
    }
  }

  // Load line categories for this invoice
  // Auto-categorize line items
  async function autoCategorize() {
    if (!invoiceIdentifier) return;

    setLoadingLineCategories(true);
    try {
      const response = await fetch(`/api/invoices/${invoiceIdentifier}/auto-categorize`, {
        method: 'POST'
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Auto-categorization complete:', data.categorizedCount, 'of', data.lineCount, 'lines categorized');
        
        // Reload the categories to show the new assignments
        await loadLineCategories();
      } else {
        const errorData = await response.json();
        console.error('❌ Auto-categorization failed:', errorData.detail || errorData.error);
        alert(`Auto-categorization failed: ${errorData.detail || errorData.error}`);
      }
    } catch (error) {
      console.error('❌ Error during auto-categorization:', error);
      alert(`Auto-categorization failed: ${error.message}`);
    } finally {
      setLoadingLineCategories(false);
    }
  }

  // Save line category changes
  async function saveLineCategories() {
    if (!invoiceIdentifier) return;

    try {
      const response = await fetch(`/api/invoices/${invoiceIdentifier}/categories`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ lineCategories })
      });
      
      if (response.ok) {
        console.log('✅ Line categories saved successfully');
      } else {
        const errorData = await response.json();
        console.error('❌ Failed to save line categories:', errorData.detail || errorData.error);
        alert(`Failed to save categories: ${errorData.detail || errorData.error}`);
      }
    } catch (error) {
      console.error('❌ Error saving line categories:', error);
      alert(`Failed to save categories: ${error.message}`);
    }
  }

  // Update a specific line category
  function updateLineCategory(index, categoryId, categoryName) {
    setLineCategories(prev => ({
      ...prev,
      [index]: {
        categoryId,
        categoryName,
        confidence: 1.0,
        source: 'manual',
        updatedAt: new Date().toISOString()
      }
    }));
  }

  // NEW: Invoice-level category handlers with GL line splitting
  
  // Calculate allocation summary whenever categories change
  useEffect(() => {
    const allocated = invoiceCategories.reduce((sum, cat) => sum + (parseFloat(cat.amount) || 0), 0);
    const roundedAllocated = Math.round(allocated * 100) / 100;
    const unallocated = Math.round((invoiceTotalAmount - roundedAllocated) * 100) / 100;
    setAllocationSummary({
      totalAmount: invoiceTotalAmount,
      allocated: roundedAllocated,
      unallocated: unallocated
    });
  }, [invoiceCategories, invoiceTotalAmount]);

  function addInvoiceCategory() {
    // Default new category amount to the unallocated amount
    const currentAllocated = invoiceCategories.reduce((sum, cat) => sum + (parseFloat(cat.amount) || 0), 0);
    const unallocatedAmount = Math.max(0, Math.round((invoiceTotalAmount - currentAllocated) * 100) / 100);
    
    setInvoiceCategories(prev => [...prev, { 
      categoryId: '', 
      categoryName: '', 
      classId: '',
      className: '',
      description: '',
      amount: unallocatedAmount,
      sequence: prev.length + 1,
      source: 'manual',
      isEditing: true 
    }]);
  }

  function removeInvoiceCategory(index) {
    setInvoiceCategories(prev => prev.filter((_, i) => i !== index));
  }

  function updateInvoiceCategory(index, field, value, displayValue) {
    setInvoiceCategories(prev => {
      const updated = [...prev];
      const current = updated[index] || {};
      if (field === 'category') {
        updated[index] = { ...current, categoryId: value, categoryName: displayValue, source: 'manual' };
      } else if (field === 'class') {
        updated[index] = { ...current, classId: value, className: displayValue, source: 'manual' };
      } else if (field === 'description') {
        updated[index] = { ...current, description: value };
      } else if (field === 'amount') {
        // Parse amount, allow empty string for clearing
        const numValue = value === '' ? 0 : parseFloat(value) || 0;
        updated[index] = { ...current, amount: numValue };
      }
      return updated;
    });
  }

  function confirmInvoiceCategory(index) {
    setInvoiceCategories(prev => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], isEditing: false };
      }
      return updated;
    });
  }

  async function saveInvoiceCategories() {
    if (!invoiceIdentifier) return;

    // Client-side validation: check if unallocated is zero
    const tolerance = 0.01;
    if (Math.abs(allocationSummary.unallocated) > tolerance) {
      showToast(`Cannot save: Unallocated amount must be $0.00 (currently $${allocationSummary.unallocated.toFixed(2)})`, 'error');
      return;
    }

    // Validate all categories have required fields
    for (const cat of invoiceCategories) {
      if (!cat.categoryId && !cat.categoryName) {
        showToast('All GL lines must have an account selected', 'error');
        return;
      }
      if (!cat.amount || cat.amount <= 0) {
        showToast('All GL lines must have a positive amount', 'error');
        return;
      }
    }

    setProcessing(true);
    try {
      const response = await fetch(`/api/invoices/${invoiceIdentifier}/invoice-categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ categories: invoiceCategories })
      });

      const responseData = await response.json();

      if (response.ok) {
        showToast('GL lines saved successfully', 'success');
        console.log('✅ Invoice GL lines saved');
        // Update local state with server response
        if (responseData.categories) {
          setInvoiceCategories(responseData.categories);
        }
        if (responseData.summary) {
          setAllocationSummary(responseData.summary);
        }
        // Exit edit mode for all categories
        setInvoiceCategories(prev => prev.map(cat => ({ ...cat, isEditing: false })));
      } else {
        const errorMsg = responseData.message || responseData.error || 'Failed to save GL lines';
        showToast(errorMsg, 'error');
        console.error('❌ Failed to save invoice GL lines:', errorMsg);
      }
    } catch (error) {
      console.error('❌ Error saving invoice GL lines:', error);
      showToast(`Failed to save GL lines: ${error.message}`, 'error');
    } finally {
      setProcessing(false);
    }
  }

  // Check if user is admin or AP manager
  useEffect(() => {
    const checkAuth = async () => {
      const email = getUserEmail();
      if (!email) return;
      
      try {
        const response = await fetch('/api/workflow/config');
        if (response.ok) {
          const config = await response.json();
          const admins = config?.admins || [];
          const apManagers = config?.ap_managers || [];
          const normalizedEmail = email.trim().toLowerCase();
          const isAdmin = admins.map(e => e.trim().toLowerCase()).includes(normalizedEmail);
          const isAP = apManagers.map(e => e.trim().toLowerCase()).includes(normalizedEmail);
          setIsAdminOrAP(isAdmin || isAP);
        }
      } catch (error) {
        console.error('Failed to check auth status:', error);
      }
    };
    checkAuth();
  }, []);

  // Load invoice categories when component mounts (using GL line splitting endpoint)
  useEffect(() => {
    const loadInvoiceCategories = async () => {
      if (!invoiceIdentifier) return;

      try {
        // Use the enhanced endpoint that returns amounts and allocation summary
        const response = await fetch(`/api/invoices/${invoiceIdentifier}/invoice-categories`);
        if (response.ok) {
          const data = await response.json();
          
          // Set invoice total for allocation tracking
          if (data.invoice?.totalAmount !== undefined) {
            setInvoiceTotalAmount(data.invoice.totalAmount);
          }
          
          // Set categories with amounts - loaded categories are NOT in edit mode
          if (data.categories) {
            setInvoiceCategories(data.categories.map(cat => ({
              ...cat,
              isEditing: false // Loaded categories show as confirmed
            })));
          }
          
          // Set allocation summary
          if (data.summary) {
            setAllocationSummary(data.summary);
          }
          
          console.log('✅ Invoice GL lines loaded:', data.categories?.length || 0, 'Total:', data.invoice?.totalAmount);
        }
      } catch (error) {
        console.error('❌ Error loading invoice GL lines:', error);
      }
    };

    loadInvoiceCategories();
  }, [invoiceIdentifier]);

  // Load notes history
  useEffect(() => {
    const loadNotes = async () => {
      if (!invoiceIdentifier || !isAdminOrAP) return;

      try {
        const response = await fetch(`/api/invoices/${invoiceIdentifier}/notes`);
        if (response.ok) {
          const data = await response.json();
          setNotes(data.currentNote || '');
          setNotesHistory(data.history || []);
        }
      } catch (error) {
        console.error('❌ Error loading notes:', error);
      }
    };

    loadNotes();
  }, [invoiceIdentifier, isAdminOrAP]);

  // NEW: Load reassignment targets when component mounts
  useEffect(() => {
    const loadReassignmentTargets = async () => {
      if (!invoiceIdentifier) return;

      try {
        const response = await fetch(`/api/invoices/${invoiceIdentifier}/reassign`);
        if (response.ok) {
          const data = await response.json();
          setReassignmentTargets(data.targets || []);
          console.log('✅ Reassignment targets loaded:', data.targets?.length || 0);
        }
      } catch (error) {
        console.error('❌ Error loading reassignment targets:', error);
      }
    };

    loadReassignmentTargets();
  }, [invoiceIdentifier]);

  // Function to handle PDF download
  function handleDownload() {
    if (invoice?.pdf_path) {
      // Create a link element to trigger the download
      const link = document.createElement('a');
      link.href = (() => {
        const p = invoice.pdf_path;
        if (!p) return '';
        // Already a full URL
        if (p.startsWith('http://') || p.startsWith('https://')) return p;
        // Already an API path
        if (p.startsWith('/api/pdf/')) return p;
        // Extract filename from email_invoices path
        if (p.includes('email_invoices/')) {
          const filename = p.split('/').pop();
          return `/api/pdf/${filename}`;
        }
        // If it's just a filename, use the API endpoint
        if (!p.includes('/')) {
          return `/api/pdf/${p}`;
        }
        // Otherwise treat as relative path
        return p;
      })();
      link.download = `${invoice?.invoice || invoice?.invoice_number || 'invoice'}_${invoice?.vendor || 'vendor'}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      console.warn('No PDF path available for download');
    }
  }

  async function transitionInvoice(action) {
    if (!invoice) return;
    const invoiceId = invoice.id || invoice.invoice_number || invoice.invoice;
    if (!invoiceId) {
      showToast('Missing invoice identifier.', 'error');
      return;
    }

    if (action === 'approve') {
      // Check if the user is an admin
      const userEmail = getUserEmail();
      const isAdmin = await checkIfAdmin(userEmail);

      // Use office_id first (effective value from 3-layer system), then fallback to legacy fields
      const officeValue = (details?.office || invoice.office_id || invoice.office || invoice.office_location || invoice.clinic_id || '').trim();

      // Only require office for non-admin users
      if (!isAdmin && (!officeValue || officeValue.toLowerCase() === 'unknown')) {
        showToast('Office is required before approval.', 'error');
        return;
      }
    }

    setProcessing(true);
    try {
      const response = await csrfClient.post('/api/invoices/transition', {
        id: invoiceId,
        action,
        // Use office_id first (effective value from 3-layer system)
        ...(action === 'approve' ? { office: details?.office || invoice.office_id || invoice.office || invoice.office_location || invoice.clinic_id || '' } : {}),
        ...(action === 'reject' ? { reason: 'Rejected from invoice detail' } : {}),
      });
      const payload = response.data || {};

      if (!response.ok || payload?.error) {
        const message = payload?.error || `Failed to ${action} invoice`;
        if (message.toLowerCase().includes('office required')) {
          showToast('Office is required before approval.', 'error');
        } else {
          showToast(message, 'error');
        }
        return;
      }

      if (payload?.invoice) {
        const updated = payload.invoice;
        setDetails((prev) => ({
          ...prev,
          invoice: updated.invoice_number || updated.invoice || prev.invoice,
          vendor: updated.vendor_name || updated.vendor || prev.vendor,
          // Use office_id first (effective value from 3-layer system), then fallback to legacy fields
          office:
            updated.office_id ||
            updated.office ||
            updated.office_location ||
            updated.clinic_id ||
            prev.office,
          category: updated.category || prev.category,
          invoice_date: updated.invoice_date || prev.invoice_date,
          due_date: updated.due_date || prev.due_date,
        }));
        // Use amount_cents first (database field), then fallback to legacy
        if (updated.amount_cents != null) {
          setPaymentAmount(`$${(updated.amount_cents / 100).toFixed(2)}`);
        } else if (updated.total || updated.invoice_total) {
          const amountValue = updated.total ?? updated.invoice_total;
          const parsed =
            typeof amountValue === 'number'
              ? amountValue
              : Number.parseFloat(String(amountValue).replace(/[^0-9.-]/g, '')) || 0;
          setPaymentAmount(`$${parsed.toFixed(2)}`);
        }
      }

      alert(action === 'approve' ? 'Invoice moved to the next approval step.' : 'Invoice rejected.');

      // If invoice was rejected, notify parent to update the queue
      if (action === 'reject' && onInvoiceRejected) {
        const invoiceId = invoice.id || invoice.invoice_number || invoice.invoice;
        onInvoiceRejected(invoiceId);
      }

      if (onBack) onBack();
    } catch (error) {
      showToast(error?.message || 'Unexpected error while updating invoice', 'error');
    } finally {
      setProcessing(false);
    }
  }

  // Function to update invoice status in the queue
  async function updateInvoiceStatus(newStatus, newApproved = null) {
    setProcessing(true);
    try {
      console.log('Attempting to update invoice:', {
        invoice_number: invoice?.invoice_number,
        status: newStatus,
        approved: newApproved
      });

      // Load current queue
      const response = await fetch('/invoice_queue.json');
      if (!response.ok) {
        throw new Error('Failed to load invoice queue');
      }
      
      const queue = await response.json();
      
      // Find and update the specific invoice
      const updatedQueue = queue.map(inv => {
        if (inv.invoice_number === invoice?.invoice_number) {
          return {
            ...inv,
            status: newStatus,
            ...(newApproved !== null && { approved: newApproved }),
            timestamp: new Date().toISOString()
          };
        }
        return inv;
      });
      
      // Try to save to the public directory (this will work if the file is writable)
      try {
        const saveResponse = await fetch('/api/update-invoice-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            invoice_number: invoice?.invoice_number,
            status: newStatus,
            approved: newApproved
          })
        });
        
        if (saveResponse.ok) {
          console.log('API call successful');
        } else {
          console.log('API call failed, but continuing with local update');
        }
      } catch (apiError) {
        console.log('API not available, using local update only');
      }
      
      // Update the invoice prop to reflect the new status immediately
      const updatedInvoice = updatedQueue.find(inv => inv.invoice_number === invoice?.invoice_number);
      if (updatedInvoice) {
        // Update the invoice object passed from parent
        Object.assign(invoice, updatedInvoice);
      }

      // Status override functionality removed - using direct API calls

      // If invoice is being approved, create QuickBooks bill
      if (newStatus === 'approved' && newApproved === true) {
        try {
          console.log('🔄 Creating QuickBooks bill for approved invoice...');
          
          const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
          // Check QBO connection first to avoid noisy errors
          const statusUrl = `${baseUrl}/api/qbo/status?ts=${Date.now()}`;
          const statusRes = await fetch(statusUrl, { cache: 'no-store' });
          const statusText = await statusRes.text();
          let statusJson = null;
          try {
            statusJson = statusText ? JSON.parse(statusText) : null;
          } catch (parseErr) {
            console.error('❌ Failed to parse QuickBooks status JSON:', parseErr, { statusText });
          }

          const isConnected = !!statusJson?.connected;

          if (!statusRes.ok || !isConnected) {
            console.warn('⚠️ QuickBooks status check issue:', {
              status: statusRes.status,
              ok: statusRes.ok,
              isConnected,
              statusJson,
              statusText,
            });
          }

          if (!isConnected) {
            alert('Invoice approved. QuickBooks not connected — please connect QuickBooks first.');
            onBack();
            return;
          }
          const billResponse = await fetch(`${baseUrl}/api/qbo/auto-create-bill`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              invoiceData: {
                invoice_number: invoice?.invoice_number,
                vendor: invoice?.vendor,
                total: invoice?.amount?.replace('$', '') || invoice?.total,
                invoice_date: invoice?.invoice_date || invoice?.invoiceDate,
                due_date: invoice?.due_date || invoice?.dueDate,
                pdf_path: invoice?.pdf_path,
                json_path: invoice?.json_path,
                line_items: invoice?.line_items || []
              }
            })
          });
          
          const billResult = await billResponse.json();
          
          if (billResult.success) {
            console.log('✅ QuickBooks bill created successfully:', billResult.billId);
            const pdfStatus = billResult.pdfAttached ? ' and PDF attached' : ' (PDF not attached)';
            alert(`Invoice approved and QuickBooks bill created! Bill ID: ${billResult.billId}${pdfStatus}`);
          } else {
            console.warn('⚠️ Failed to create QuickBooks bill:', billResult.error);
            alert(`Invoice approved, but failed to create QuickBooks bill: ${billResult.error}`);
          }
        } catch (billError) {
          console.error('❌ Error creating QuickBooks bill:', billError);
          alert(`Invoice approved, but failed to create QuickBooks bill: ${billError.message}`);
        }
      } else {
        // Show success message for non-approval actions
        alert(`Invoice ${newStatus.toLowerCase()} successfully!`);
      }
      
      // Navigate back to refresh the list
      onBack();
      
    } catch (error) {
      console.error('Error updating invoice status:', error);
      alert(`Error updating invoice status: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  }

  // Button click handlers
  function handleApprove() {
    // Check if allocation is fully matched before allowing approval
    const tolerance = 0.01;
    if (Math.abs(allocationSummary.unallocated) > tolerance) {
      setShowAllocationErrorModal(true);
      return;
    }
    transitionInvoice('approve');
  }

  function handleReject() {
    transitionInvoice('reject');
  }

  // Open the Update confirmation modal
  function handleUpdateClick() {
    setShowUpdateModal(true);
    setUpdateComment('');
  }

  // Actually perform the update (called from modal confirmation)
  async function handleUpdateConfirm() {
    try {
      console.log('🔧 Starting invoice update process...');
      setProcessing(true);
      setShowUpdateModal(false);

      const invoiceId = invoice?.id || invoice?.invoice_number;
      if (!invoiceId) {
        showToast('Missing invoice identifier', 'error');
        return;
      }

      // Parse amount from display format
      // SECURITY: Use global regex to replace all occurrences of $ and ,
      const amountStr = paymentAmount.replace(/\$/g, '').replace(/,/g, '');
      const amountNum = parseFloat(amountStr) || 0;
      const amountCents = Math.round(amountNum * 100);

      // Call update API with corrected fields
      const response = await csrfClient.post(`/api/invoices/${encodeURIComponent(invoiceId)}/update`, {
        vendor_name: details.vendor,
        office_id: details.office,
        amount_cents: amountCents
      });

      // csrfClient returns { ok, status, data, error } not a Response object
      if (!response.ok) {
        throw new Error(response.error || 'Failed to update invoice');
      }

      console.log('✅ Invoice updated successfully');

      // Build corrected values for AI training
      const originalValues = {
        vendor_name: invoice?.vendor_name || invoice?.vendor || '',
        office_id: invoice?.office_id || invoice?.office || '',
        amount_cents: invoice?.amount_cents || 0,
      };

      const correctedValues = {
        vendor_name: details.vendor,
        office_id: details.office,
        amount_cents: amountCents,
      };

      // Check if any values changed
      const changedFields = Object.keys(correctedValues).filter(
        key => originalValues[key] !== correctedValues[key]
      );

      console.log('🔍 AI Mechanic check:', {
        originalValues,
        correctedValues,
        changedFields,
        hasComment: !!updateComment.trim(),
        willSend: changedFields.length > 0 || !!updateComment.trim()
      });

      // Always send to AI Mechanic with the user comment (if provided or fields changed)
      const shouldSend = changedFields.length > 0 || updateComment.trim();
      console.log('🤖 Will send to AI Mechanic?', shouldSend, '- changedFields:', changedFields.length, 'hasComment:', !!updateComment.trim());

      if (shouldSend) {
        setImprovingParser(true);
        try {
          console.log('🤖 Sending corrections to AI Mechanic... invoiceId:', invoiceId);
          const mechanicResponse = await csrfClient.post(
            `/api/invoices/${encodeURIComponent(invoiceId)}/report-parser-issue`,
            {
              corrected_fields: correctedValues,
              user_comment: updateComment.trim() || null,
              original_fields: originalValues,
              changed_fields: changedFields,
            }
          );

          // csrfClient returns { ok, data, error } not a Response
          if (mechanicResponse.ok) {
            console.log('✅ AI Mechanic response:', mechanicResponse.data);
            if (updateComment.trim()) {
              showToast('Update submitted with your comment to AI Mechanic!', 'success');
            } else {
              showToast('Parser improvement request sent to AI Mechanic!', 'success');
            }
          } else {
            console.warn('⚠️ AI Mechanic failed:', mechanicResponse.error);
            showToast(`AI Mechanic: ${mechanicResponse.error || 'Failed to process'}`, 'warning');
          }
        } catch (mechanicError) {
          console.warn('⚠️ Error calling AI Mechanic:', mechanicError);
          showToast('AI Mechanic is not available', 'warning');
        } finally {
          setImprovingParser(false);
        }
      }

      showToast('Invoice updated successfully! Changes are now reflected across the system.', 'success');

      // Refresh the page after a short delay to show the toast
      setTimeout(() => {
        window.location.reload();
      }, 1500);

    } catch (error) {
      console.error('❌ Error during invoice update:', error);
      const errorMsg = error?.message || 'Unknown error';
      showToast(`Error updating invoice: ${errorMsg}`, 'error');
    } finally {
      setProcessing(false);
    }
  }

  // NEW: Handle chat send
  async function handleChatSend() {
    if (!chatInput.trim() || sendingChat || !invoiceIdentifier) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setSendingChat(true);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: invoiceIdentifier,
          message: userMessage,
          conversationHistory: chatMessages,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get LLM response');
      }

      const data = await response.json();
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (error) {
      console.error('Error sending chat message:', error);
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
      }]);
      showToast('Failed to get AI response', 'error');
    } finally {
      setSendingChat(false);
    }
  }

  // NEW: Handle invoice reassignment
  async function handleReassignInvoice() {
    if (!invoice || !selectedReassignmentTarget) {
      showToast('Please select a target to send the invoice to.', 'error');
      return;
    }

    const invoiceId = invoice.id || invoice.invoice_number || invoice.invoice;
    if (!invoiceId) {
      showToast('Missing invoice identifier.', 'error');
      return;
    }

    try {
      setReassigningInvoice(true);
      const response = await fetch(`/api/invoices/${invoiceId}/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetEmail: selectedReassignmentTarget.email }),
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to reassign invoice');
      }

      showToast(`Invoice sent to ${selectedReassignmentTarget.name}`, 'success');
      setSelectedReassignmentTarget(null);

      // Refresh invoice lists after reassignment
      if (onBack) {
        setTimeout(() => onBack(), 1000);
      }
    } catch (error) {
      console.error('❌ Error reassigning invoice:', error);
      showToast(error?.message || 'Failed to reassign invoice', 'error');
    } finally {
      setReassigningInvoice(false);
    }
  }

  async function handlePaid() {
    if (!invoice) return;
    const invoiceId = invoice.id || invoice.invoice_number || invoice.invoice;
    if (!invoiceId) {
      showToast('Missing invoice identifier.', 'error');
      return;
    }
    setProcessing(true);
    try {
      // Check if vendor is onboarded
      const vendorName = invoice?.vendor || invoice?.vendor_name || '';
      if (!vendorName) {
        showToast('Vendor information missing.', 'error');
        setProcessing(false);
        return;
      }

      const achResponse = await fetch(`/api/vendors/ach-info?vendor=${encodeURIComponent(vendorName)}`);
      const achData = await achResponse.json().catch(() => ({}));

      if (!achData.ok) {
        showToast('Failed to check vendor onboarding status.', 'error');
        setProcessing(false);
        return;
      }

      // Check if vendor is onboarded (ach_status should be 'complete')
      if (achData.ach_status !== 'complete') {
        // Show message with button to navigate to vendor page
        const message = `Vendor "${vendorName}" is not fully onboarded. Please complete their Stripe onboarding before processing payment.`;
        showToast(message, 'warning');

        // Create a modal-like message with a button
        const userConfirm = confirm(`${message}\n\nWould you like to go to the Vendor page to complete onboarding?`);
        if (userConfirm) {
          // Navigate to vendor detail page
          window.location.href = `/VendorDetailPage?vendor=${encodeURIComponent(vendorName)}`;
        }
        setProcessing(false);
        return;
      }

      // Vendor is onboarded, proceed with payment through Stripe
      showToast('Processing payment...', 'info');
      const response = await csrfClient.post('/api/invoices/pay', { invoiceIds: [invoiceId] });
      const payload = response.data || {};
      if (!response.ok || !payload?.ok) {
        const errorMsg = payload?.results?.[0]?.error || payload?.error || 'Failed to process payment';
        showToast(errorMsg, 'error');
        return;
      }

      // Check if payment was successful
      const result = payload.results?.[0];
      if (result?.ok) {
        showToast(`✅ Payment processed! Transfer ID: ${result.transferId}`, 'success');
        if (onBack) onBack();
      } else {
        showToast(`Payment failed: ${result?.error || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      showToast(err?.message || 'Unexpected error while marking paid', 'error');
    } finally {
      setProcessing(false);
    }
  }

  // Strong remove for completed invoices: delete from queue + delete files
  async function handleRemoveCompletely() {
    if (!confirm('This will permanently remove the invoice and its files. Continue?')) return;
    setProcessing(true);
    try {
      // Call API if available (local/dev)
      try {
        const resp = await fetch('/api/remove-invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoice_number: invoice?.invoice_number,
            json_path: invoice?.json_path,
            pdf_path: invoice?.pdf_path,
          })
        });
        if (!resp.ok) throw new Error('API remove failed');
      } catch (_) {
        // fall back to client-side only
      }

      // Status override functionality removed - using direct API calls

      alert('Invoice removed');
      onBack();
    } catch (e) {
      console.error(e);
      alert('Failed to remove invoice');
    } finally {
      setProcessing(false);
    }
  }

  // Determine which buttons to show based on invoice status
  function getActionButtons() {
    const status = (invoice?.status || 'incoming').toLowerCase();

    console.log('🔍 InvoiceDetailPage Debug:');
    console.log('  - Invoice Number:', invoice?.invoice_number);
    console.log('  - Status:', status);
    console.log('  - Full invoice object:', invoice);

    if (status === 'removed') {
      return []; // No buttons for removed invoices
    }

    if (status === 'completed' || status === 'paid') {
      return [
        { label: 'Remove', onClick: handleRemoveCompletely, style: { ...actionButtonStyle, backgroundColor: '#dc2626', color: '#ffffff', borderColor: '#dc2626' } }
      ];
    }

    // For invoices ready to be paid (to_be_paid status), show Pay button
    if (status === 'to_be_paid') {
      return [
        { label: 'Pay', onClick: handlePaid, style: { ...actionButtonStyle, backgroundColor: '#059669', color: '#ffffff', borderColor: '#059669' } },
        { label: 'Reject', onClick: handleReject, style: { ...actionButtonStyle, backgroundColor: '#dc2626', color: '#ffffff', borderColor: '#dc2626' } },
        { label: 'Update', onClick: handleUpdateClick, style: { ...actionButtonStyle, backgroundColor: '#d97706', color: '#ffffff', borderColor: '#d97706' } }
      ];
    }

    // For all other statuses (incoming, awaiting_office_approval, awaiting_admin_approval, etc.), show Approve
    const defaultButtons = [
      { label: 'Approve', onClick: handleApprove, style: { ...actionButtonStyle, backgroundColor: '#059669', color: '#ffffff', borderColor: '#059669' } },
      { label: 'Reject', onClick: handleReject, style: { ...actionButtonStyle, backgroundColor: '#dc2626', color: '#ffffff', borderColor: '#dc2626' } },
      { label: 'Update', onClick: handleUpdateClick, style: { ...actionButtonStyle, backgroundColor: '#d97706', color: '#ffffff', borderColor: '#d97706' } }
    ];

    return defaultButtons;
  }

  // Basic styles used throughout the detail page
  const wrapperStyle = { padding: '24px' };
  const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
  };
  const summaryStyle = {
    display: 'flex',
    alignItems: 'baseline',
    gap: '24px', // more spacing between data points
    fontSize: '18px',
    fontWeight: '600',
    color: '#357ab2',
  };
  const buttonRowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '24px',
  };
  const actionButtonStyle = {
    padding: '8px 16px',
    borderRadius: '9999px',
    fontSize: '14px',
    fontWeight: '500',
    border: '1px solid #357ab2',
    color: '#357ab2',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  };
  const mainGridStyle = {
    display: 'grid',
    // Use equal columns to center the divider on the page. Each column
    // takes up half of the available width so the vertical line sits
    // precisely in the middle.
    gridTemplateColumns: '1fr 1fr',
    borderTop: '1px solid #357ab2',
    borderLeft: '1px solid #357ab2',
  };
  const leftColumnStyle = {
    borderRight: '1px solid #357ab2',
  };
  const rightColumnStyle = {
    borderRight: '1px solid #357ab2',
    display: 'flex',
    flexDirection: 'column',
    padding: '16px',
    justifyContent: 'flex-start',
    alignItems: 'center',
  };
  // Section styles within left column
  const sectionStyle = {
    borderBottom: '1px solid #357ab2',
    padding: '16px',
  };
  const sectionTitleStyle = {
    fontSize: '18px',
    fontWeight: '600',
    color: '#357ab2',
    marginBottom: '8px',
  };
  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    borderLeft: '1px solid #357ab2',
    borderTop: '1px solid #357ab2',
    fontSize: '14px',
  };
  const cellHeaderStyle = {
    padding: '8px 12px',
    borderRight: '1px solid #357ab2',
    borderBottom: '1px solid #357ab2',
    fontWeight: '500',
    color: '#5a5a5a',
    backgroundColor: '#ffffff',
    textAlign: 'left',
  };
  const cellStyle = {
    padding: '8px 12px',
    borderRight: '1px solid #357ab2',
    borderBottom: '1px solid #357ab2',
    color: '#1f1f1f',
    backgroundColor: '#ffffff',
  };

  return (
    <div style={wrapperStyle}>
      {/* Header with back arrow and invoice summary */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={onBack}
            aria-label="Back"
            style={{
              color: '#357ab2',
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
            }}
          >
            <i className="fas fa-arrow-left"></i>
          </button>
          <button
            onClick={onPrevious}
            disabled={!canGoPrevious}
            aria-label="Previous Invoice"
            style={{
              color: canGoPrevious ? '#357ab2' : '#ccc',
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: canGoPrevious ? 'pointer' : 'not-allowed',
            }}
          >
            <i className="fas fa-chevron-left"></i>
          </button>
          <button
            onClick={onNext}
            disabled={!canGoNext}
            aria-label="Next Invoice"
            style={{
              color: canGoNext ? '#357ab2' : '#ccc',
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: canGoNext ? 'pointer' : 'not-allowed',
            }}
          >
            <i className="fas fa-chevron-right"></i>
          </button>
          <div style={summaryStyle}>
            <span>{invoice?.invoice || invoice?.invoice_number || 'N/A'}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span>{invoice?.vendor || 'N/A'}</span>
              <ACHBadge status={getStatusForVendor(invoice?.vendor)} />
            </span>
            <span>{invoice?.amount || 'N/A'}</span>
            {renderStatusChip()}
          </div>
        </div>
        <button
          onClick={handleDownload}
          aria-label="Download PDF"
          style={{
            color: '#357ab2',
            background: 'none',
            border: 'none',
            fontSize: '20px',
            cursor: 'pointer',
          }}
        >
          <i className="fas fa-download"></i>
        </button>
      </div>

      {/* Action buttons */}
      <div style={buttonRowStyle}>
        {getActionButtons().map((button) => (
          <button
            key={button.label}
            onClick={button.onClick}
            disabled={processing || improvingParser}
            style={{
              ...button.style,
              opacity: (processing || improvingParser) ? 0.6 : 1,
              cursor: (processing || improvingParser) ? 'not-allowed' : 'pointer',
            }}
          >
            {processing ? 'Processing...' : (improvingParser ? 'Improving Parser...' : button.label)}
          </button>
        ))}
      </div>

      {/* NEW: Send to: Reassignment UI */}
      {reassignmentTargets.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '24px',
          padding: '12px',
          backgroundColor: '#f8f9fa',
          borderRadius: '6px',
          border: '1px solid #e0e0e0',
        }}>
          <label style={{ fontWeight: '500', color: '#4a5568', whiteSpace: 'nowrap' }}>
            Send to:
          </label>
          <select
            value={selectedReassignmentTarget?.email || ''}
            onChange={(e) => {
              const target = reassignmentTargets.find(t => t.email === e.target.value);
              setSelectedReassignmentTarget(target || null);
            }}
            style={{
              padding: '8px 12px',
              borderRadius: '4px',
              border: '1px solid #cbd5e0',
              fontSize: '14px',
              backgroundColor: '#ffffff',
              cursor: 'pointer',
              flex: 1,
              maxWidth: '300px',
            }}
          >
            <option value="">-- Select a destination --</option>
            {reassignmentTargets.map((target) => (
              <option key={target.email} value={target.email}>
                {target.name}
              </option>
            ))}
          </select>
          {selectedReassignmentTarget && (
            <button
              onClick={handleReassignInvoice}
              disabled={reassigningInvoice}
              style={{
                padding: '8px 16px',
                borderRadius: '4px',
                fontSize: '14px',
                fontWeight: '500',
                border: '1px solid #059669',
                backgroundColor: '#059669',
                color: '#ffffff',
                cursor: reassigningInvoice ? 'not-allowed' : 'pointer',
                opacity: reassigningInvoice ? 0.6 : 1,
              }}
            >
              {reassigningInvoice ? 'Sending...' : 'Send'}
            </button>
          )}
        </div>
      )}

      {/* Main content: two columns using grid. On small screens it
          stacks; on larger screens we allow it to span 2/3 and 1/3
          implicitly via the parent container. */}
      <div style={mainGridStyle}>
        {/* Left column: invoice status, details and line items */}
        <div style={leftColumnStyle}>
          {/* Invoice Status section */}
          <div style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Invoice Status</h2>
            <div style={{ marginBottom: '12px' }}>{renderStatusChip('sm')}</div>
            {/* NEW: Three-stage status table (Coded -> Approved -> Paid) */}
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={cellHeaderStyle}>Stage</th>
                  <th style={cellHeaderStyle}>Status</th>
                  <th style={cellHeaderStyle}>User</th>
                </tr>
              </thead>
              <tbody>
                {threeStageStatus.map((stageInfo) => (
                  <tr key={stageInfo.stage}>
                    <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>{stageInfo.stage}</td>
                    <td style={cellStyle}>{formatStageTimestamp(stageInfo.timestamp)}</td>
                    <td style={cellStyle}>{stageInfo.user || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table style={{ ...tableStyle, marginTop: '12px' }}>
              <tbody>
                {statusValue === 'paid' || statusValue === 'completed' ? (
                  // Payment Details Row for Paid Invoices
                  <tr>
                    <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>Payment Details</td>
                    <td style={cellStyle}>
                      {loadingPaymentDetails ? (
                        <span style={{ color: '#357ab2' }}>Loading...</span>
                      ) : paymentDetails ? (
                        <span>
                          {new Date(paymentDetails.date).toLocaleDateString('en-US', {
                            month: '2-digit',
                            day: '2-digit',
                            year: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      ) : (
                        <span style={{ color: '#999' }}>N/A</span>
                      )}
                    </td>
                    <td style={cellStyle}>
                      <strong>${paymentAmount.replace(/[^0-9.]/g, '')}</strong>
                    </td>
                    <td style={cellStyle}>
                      {paymentDetails ? (
                        <button
                          onClick={() => setSelectedPayment(paymentDetails)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#357ab2',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            fontWeight: '500',
                            padding: 0,
                          }}
                        >
                          Receipt
                        </button>
                      ) : (
                        <span style={{ color: '#999' }}>N/A</span>
                      )}
                    </td>
                  </tr>
                ) : (
                  // Original Payment Amount Row for Non-Paid Invoices
                  <tr>
                    <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>Payment Amount</td>
                    <td style={cellStyle}>
                      <input
                        type="text"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        style={{
                          border: '1px solid #cbd5e0',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '14px',
                          width: '80px',
                        }}
                      />
                    </td>
                    <td style={{ ...cellStyle, fontWeight: '600', color: statusMeta.fg }}>{statusMeta.label}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Invoice Details section */}
          <div style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Invoice Details</h2>
            <table style={tableStyle}>
              <tbody>
                <tr>
                  <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>Invoice #</td>
                  <td style={cellStyle}>
                    <input
                      type="text"
                      value={details.invoice}
                      onChange={(e) => handleDetailChange('invoice', e.target.value)}
                      style={{
                        border: '1px solid #cbd5e0',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '14px',
                        width: 'calc(100% - 16px)',
                        boxSizing: 'border-box',
                      }}
                    />
                  </td>
                </tr>
                <tr>
                  <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>Invoice Date</td>
                  <td style={cellStyle}>
                    <input
                      type="text"
                      value={details.invoice_date}
                      onChange={(e) => handleDetailChange('invoice_date', e.target.value)}
                      style={{
                        border: '1px solid #cbd5e0',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '14px',
                        width: 'calc(100% - 16px)',
                        boxSizing: 'border-box',
                      }}
                    />
                  </td>
                </tr>
                <tr>
                  <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>Due Date</td>
                  <td style={cellStyle}>
                    <input
                      type="text"
                      value={details.due_date}
                      onChange={(e) => handleDetailChange('due_date', e.target.value)}
                      style={{
                        border: '1px solid #cbd5e0',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '14px',
                        width: 'calc(100% - 16px)',
                        boxSizing: 'border-box',
                      }}
                    />
                  </td>
                </tr>
                <tr>
                  <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>Vendor</td>
                  <td style={cellStyle}>
                    <input
                      type="text"
                      value={details.vendor}
                      onChange={(e) => handleDetailChange('vendor', e.target.value)}
                      style={{
                        border: '1px solid #cbd5e0',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '14px',
                        width: 'calc(100% - 16px)',
                        boxSizing: 'border-box',
                      }}
                    />
                  </td>
                </tr>
                <tr>
                  <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>Office</td>
                  <td style={cellStyle}>
                    <input
                      type="text"
                      value={details.office}
                      onChange={(e) => handleDetailChange('office', e.target.value)}
                      style={{
                        border: '1px solid #cbd5e0',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '14px',
                        width: 'calc(100% - 16px)',
                        boxSizing: 'border-box',
                      }}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {/* GL Line Splitting Section */}
          <div style={sectionStyle}>
            <h2 style={sectionTitleStyle}>GL Lines ({invoiceCategories.length})</h2>

            {/* Allocation Summary Bar */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              backgroundColor: Math.abs(allocationSummary.unallocated) <= 0.01 ? '#ecfdf5' : '#fef2f2',
              border: `1px solid ${Math.abs(allocationSummary.unallocated) <= 0.01 ? '#10b981' : '#ef4444'}`,
              borderRadius: '6px',
              marginBottom: '16px'
            }}>
              <div style={{ display: 'flex', gap: '24px', fontSize: '14px' }}>
                <span><strong>Invoice Total:</strong> ${allocationSummary.totalAmount.toFixed(2)}</span>
                <span><strong>Allocated:</strong> ${allocationSummary.allocated.toFixed(2)}</span>
                <span style={{ 
                  color: Math.abs(allocationSummary.unallocated) <= 0.01 ? '#059669' : '#dc2626',
                  fontWeight: '600'
                }}>
                  <strong>Unallocated:</strong> ${allocationSummary.unallocated.toFixed(2)}
                </span>
              </div>
              {Math.abs(allocationSummary.unallocated) <= 0.01 ? (
                <span style={{ 
                  backgroundColor: '#10b981', 
                  color: 'white', 
                  padding: '4px 12px', 
                  borderRadius: '12px', 
                  fontSize: '12px',
                  fontWeight: '600'
                }}>
                  ✓ Fully Allocated
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
                  Unallocated: ${Math.abs(allocationSummary.unallocated).toFixed(2)}
                </span>
              )}
            </div>

            {/* GL Lines list */}
            <div style={{ marginBottom: '16px' }}>
              {invoiceCategories && invoiceCategories.length > 0 ? (
                <div>
                  {invoiceCategories.map((cat, index) => (
                    <div key={index} style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      marginBottom: '12px',
                      padding: '14px',
                      border: cat.isEditing ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                      borderRadius: '6px',
                      backgroundColor: cat.isEditing ? '#f0f9ff' : '#f8fafc'
                    }}>
                      {cat.isEditing ? (
                        /* EDIT MODE - Show dropdowns and inputs */
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontSize: '12px', fontWeight: '600', color: '#3b82f6' }}>
                              GL Line {index + 1} (Editing)
                            </span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={() => confirmInvoiceCategory(index)}
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
                              {invoiceCategories.length > 1 && (
                                <button
                                  onClick={() => removeInvoiceCategory(index)}
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

                          {/* Account dropdown */}
                          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            <div style={{ flex: '1 1 300px' }}>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '4px' }}>
                                Account *
                              </label>
                              <select
                                value={cat.categoryId || ''}
                                onChange={(e) => {
                                  const selected = categories.find(c => c.id === e.target.value);
                                  updateInvoiceCategory(index, 'category', e.target.value, selected?.fullName || selected?.name || '');
                                }}
                                style={{
                                  padding: '8px 12px',
                                  borderRadius: '4px',
                                  border: '1px solid #cbd5e0',
                                  fontSize: '14px',
                                  backgroundColor: '#ffffff',
                                  cursor: 'pointer',
                                  width: '100%'
                                }}
                              >
                                <option value="">-- Select Account --</option>
                                {categories.map(c => (
                                  <option key={c.id} value={c.id}>{c.displayText || c.fullName || c.name}</option>
                                ))}
                              </select>
                            </div>

                            {/* Class dropdown */}
                            <div style={{ flex: '1 1 200px' }}>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '4px' }}>
                                Class (Location)
                              </label>
                              <select
                                value={cat.classId || ''}
                                onChange={(e) => {
                                  const selected = qboClasses.find(c => c.id === e.target.value);
                                  updateInvoiceCategory(index, 'class', e.target.value, selected?.fullName || selected?.name || '');
                                }}
                                style={{
                                  padding: '8px 12px',
                                  borderRadius: '4px',
                                  border: '1px solid #cbd5e0',
                                  fontSize: '14px',
                                  backgroundColor: '#ffffff',
                                  cursor: 'pointer',
                                  width: '100%'
                                }}
                              >
                                <option value="">-- Select Class --</option>
                                {qboClasses.map(c => (
                                  <option key={c.id} value={c.id}>{c.fullName || c.name}</option>
                                ))}
                              </select>
                            </div>

                            {/* Amount input */}
                            <div style={{ flex: '0 0 140px' }}>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '4px' }}>
                                Amount *
                              </label>
                              <div style={{ position: 'relative' }}>
                                <span style={{ 
                                  position: 'absolute', 
                                  left: '12px', 
                                  top: '50%', 
                                  transform: 'translateY(-50%)', 
                                  color: '#6b7280',
                                  fontSize: '14px'
                                }}>$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={cat.amount || ''}
                                  onChange={(e) => updateInvoiceCategory(index, 'amount', e.target.value)}
                                  style={{
                                    padding: '8px 12px 8px 24px',
                                    borderRadius: '4px',
                                    border: '1px solid #cbd5e0',
                                    fontSize: '14px',
                                    width: '100%',
                                    boxSizing: 'border-box'
                                  }}
                                  placeholder="0.00"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Description input */}
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '4px' }}>
                              Description (optional)
                            </label>
                            <input
                              type="text"
                              value={cat.description || ''}
                              onChange={(e) => updateInvoiceCategory(index, 'description', e.target.value)}
                              style={{
                                padding: '8px 12px',
                                borderRadius: '4px',
                                border: '1px solid #cbd5e0',
                                fontSize: '14px',
                                width: '100%',
                                boxSizing: 'border-box'
                              }}
                              placeholder="Enter description for this line..."
                            />
                          </div>
                        </>
                      ) : (
                        /* READ MODE - Show confirmed values as text */
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                <span style={{ 
                                  fontSize: '11px', 
                                  fontWeight: '600', 
                                  color: '#10b981',
                                  backgroundColor: '#ecfdf5',
                                  padding: '2px 8px',
                                  borderRadius: '4px'
                                }}>
                                  GL Line {index + 1}
                                </span>
                                <span style={{ 
                                  fontSize: '16px', 
                                  fontWeight: '700', 
                                  color: '#059669'
                                }}>
                                  ${(cat.amount || 0).toFixed(2)}
                                </span>
                              </div>
                              <div style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '4px' }}>
                                {cat.categoryName || 'No account selected'}
                              </div>
                              {cat.className && (
                                <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '2px' }}>
                                  <strong>Class:</strong> {cat.className}
                                </div>
                              )}
                              {cat.description && (
                                <div style={{ fontSize: '13px', color: '#6b7280', fontStyle: 'italic' }}>
                                  {cat.description}
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={() => setInvoiceCategories(prev => {
                                  const updated = [...prev];
                                  updated[index] = { ...updated[index], isEditing: true };
                                  return updated;
                                })}
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
                              {invoiceCategories.length > 1 && (
                                <button
                                  onClick={() => removeInvoiceCategory(index)}
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
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                  No GL lines assigned yet. Click "Add GL Line" to split this invoice.
                </div>
              )}
            </div>

            {/* Add GL Line and Save buttons */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
              <button
                onClick={addInvoiceCategory}
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

              <button
                onClick={saveInvoiceCategories}
                disabled={processing || Math.abs(allocationSummary.unallocated) > 0.01}
                style={{
                  padding: '8px 16px',
                  backgroundColor: (processing || Math.abs(allocationSummary.unallocated) > 0.01) ? '#9ca3af' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: (processing || Math.abs(allocationSummary.unallocated) > 0.01) ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  opacity: (processing || Math.abs(allocationSummary.unallocated) > 0.01) ? 0.6 : 1
                }}
                title={Math.abs(allocationSummary.unallocated) > 0.01 ? 'Cannot save: Unallocated amount must be $0.00' : ''}
              >
                {processing ? 'Saving...' : 'Save GL Lines'}
              </button>
            </div>
          </div>

          {/* Apply Coding Template Section (Admin/AP only) */}
          {isAdminOrAP && !invoice?.is_multi_location && (
            <div style={sectionStyle}>
              <h2 style={sectionTitleStyle}>Apply Coding Template</h2>
              <CodingTemplateSelector
                invoiceId={invoiceIdentifier}
                vendorName={invoice?.vendor || invoice?.vendor_name}
                isMultiLocation={invoice?.is_multi_location}
                onApplied={async () => {
                  // Reload invoice to get allocations
                  const response = await fetch(`/api/invoices/${invoiceIdentifier}`);
                  if (response.ok) {
                    const data = await response.json();
                    if (data.invoice) {
                      // Update invoice state
                      setAllocations(data.allocations || []);
                      setTemplate(data.template || null);
                      showToast('Template applied successfully!', 'success');
                    }
                  }
                }}
              />
            </div>
          )}

          {/* Template Allocations Section */}
          {(invoice?.is_multi_location || allocations.length > 0) && (
            <div style={sectionStyle}>
              <h2 style={sectionTitleStyle}>
                {template ? `Coding Template Applied: ${template.name}` : 'Template Allocations'}
              </h2>
              {allocations.length > 0 ? (
                <div>
                  <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    border: '1px solid #e2e8f0',
                    fontSize: '14px',
                    backgroundColor: '#ffffff',
                  }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f5f5f5' }}>
                        <th style={{ ...cellHeaderStyle, border: '1px solid #e2e8f0' }}>Category</th>
                        <th style={{ ...cellHeaderStyle, border: '1px solid #e2e8f0' }}>Description</th>
                        <th style={{ ...cellHeaderStyle, border: '1px solid #e2e8f0' }}>Amount</th>
                        <th style={{ ...cellHeaderStyle, border: '1px solid #e2e8f0' }}>Class</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allocations.map((alloc, index) => (
                        <tr key={alloc.id || index} style={{ backgroundColor: index % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                          <td style={{ ...cellStyle, border: '1px solid #e2e8f0' }}>
                            {alloc.gl_account_name || '—'}
                          </td>
                          <td style={{ ...cellStyle, border: '1px solid #e2e8f0' }}>
                            {alloc.description || '—'}
                          </td>
                          <td style={{ ...cellStyle, border: '1px solid #e2e8f0', fontWeight: '500' }}>
                            ${((alloc.amount_cents || 0) / 100).toFixed(2)}
                          </td>
                          <td style={{ ...cellStyle, border: '1px solid #e2e8f0' }}>
                            {alloc.clinic_name || alloc.class_name || '—'}
                          </td>
                        </tr>
                      ))}
                      <tr style={{ backgroundColor: '#f5f5f5', fontWeight: '600' }}>
                        <td colSpan={2} style={{ ...cellStyle, border: '1px solid #e2e8f0', textAlign: 'right' }}>
                          Total:
                        </td>
                        <td style={{ ...cellStyle, border: '1px solid #e2e8f0' }}>
                          ${(allocations.reduce((sum, alloc) => sum + (alloc.amount_cents || 0), 0) / 100).toFixed(2)}
                        </td>
                        <td style={{ ...cellStyle, border: '1px solid #e2e8f0' }}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                  No allocations found
                </div>
              )}
            </div>
          )}

          {/* NEW: Notes Field (Admin/AP only) */}
          {isAdminOrAP && (
            <div style={sectionStyle}>
              <h2 style={sectionTitleStyle}>Notes</h2>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about this invoice parsing, categorization, or any feedback for the LLM..."
                rows={4}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #cbd5e0',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                  marginBottom: '12px',
                }}
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={async () => {
                    if (!invoiceIdentifier) return;
                    try {
                      const response = await fetch(`/api/invoices/${invoiceIdentifier}/notes`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ note: notes }),
                      });
                      if (response.ok) {
                        showToast('Notes saved and sent to LLM', 'success');
                        // Reload notes history
                        const data = await response.json();
                        setNotesHistory(data.history || []);
                      } else {
                        showToast('Failed to save notes', 'error');
                      }
                    } catch (error) {
                      console.error('Error saving notes:', error);
                      showToast('Failed to save notes', 'error');
                    }
                  }}
                  disabled={processing}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: processing ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    opacity: processing ? 0.6 : 1,
                  }}
                >
                  Save Notes
                </button>
              </div>
              {notesHistory.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Notes History</h3>
                  {notesHistory.map((note, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '8px',
                        marginBottom: '8px',
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '4px',
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ color: '#666', marginBottom: '4px' }}>
                        {note.created_at ? new Date(note.created_at).toLocaleString() : 'Unknown date'}
                      </div>
                      <div>{note.note}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* NEW: Chat Interface (Admin/AP only) */}
          {isAdminOrAP && (
            <div style={sectionStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h2 style={sectionTitleStyle}>AI Assistant</h2>
                <button
                  onClick={() => setIsChatOpen(!isChatOpen)}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: isChatOpen ? '#dc2626' : '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '500',
                  }}
                >
                  {isChatOpen ? 'Close Chat' : 'Open Chat'}
                </button>
              </div>
              {isChatOpen && (
                <div
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    backgroundColor: '#f8fafc',
                    height: '400px',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      overflowY: 'auto',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    {chatMessages.length === 0 ? (
                      <div style={{ textAlign: 'center', color: '#666', padding: '20px' }}>
                        Ask questions about invoice parsing, categories, or vendor-specific rules.
                      </div>
                    ) : (
                      chatMessages.map((msg, idx) => (
                        <div
                          key={idx}
                          style={{
                            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            maxWidth: '80%',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            backgroundColor: msg.role === 'user' ? '#3b82f6' : 'white',
                            color: msg.role === 'user' ? 'white' : '#333',
                            fontSize: '14px',
                            border: msg.role === 'assistant' ? '1px solid #e2e8f0' : 'none',
                          }}
                        >
                          {msg.content}
                        </div>
                      ))
                    )}
                  </div>
                  <div style={{ borderTop: '1px solid #e2e8f0', padding: '12px', display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && chatInput.trim()) {
                          e.preventDefault();
                          handleChatSend();
                        }
                      }}
                      placeholder="Ask a question..."
                      disabled={sendingChat}
                      style={{
                        flex: 1,
                        padding: '8px',
                        border: '1px solid #cbd5e0',
                        borderRadius: '4px',
                        fontSize: '14px',
                      }}
                    />
                    <button
                      onClick={handleChatSend}
                      disabled={sendingChat || !chatInput.trim()}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: sendingChat || !chatInput.trim() ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        opacity: sendingChat || !chatInput.trim() ? 0.6 : 1,
                      }}
                    >
                      {sendingChat ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        {/* Right column: PDF viewer */}
        <div style={rightColumnStyle}>
          {invoice?.pdf_path ? (
            <iframe
              src={(function() {
                const p = invoice.pdf_path;
                if (!p) return '';
                // Already a full URL
                if (p.startsWith('http://') || p.startsWith('https://')) return p;
                // Already an API path
                if (p.startsWith('/api/pdf/')) return p;
                // Extract filename from email_invoices path
                if (p.includes('email_invoices/')) {
                  const filename = p.split('/').pop();
                  return `/api/pdf/${filename}`;
                }
                // If it's just a filename, use the API endpoint
                if (!p.includes('/')) {
                  return `/api/pdf/${p}`;
                }
                // Otherwise treat as relative path
                return p;
              })()}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                minHeight: '600px',
              }}
              title="Invoice PDF"
            />
          ) : (
            <div style={{ textAlign: 'center', color: '#666' }}>
              No PDF available
            </div>
          )}
        </div>
      </div>

      {/* Payment Receipt Modal */}
      {selectedPayment && (
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
            backgroundColor: '#fff',
            borderRadius: 8,
            maxWidth: '800px',
            maxHeight: '90vh',
            overflowY: 'auto',
            position: 'relative',
            padding: 24,
          }}>
            <button
              onClick={() => setSelectedPayment(null)}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: 'none',
                border: 'none',
                fontSize: 24,
                cursor: 'pointer',
                color: '#357ab2',
              }}
            >
              ✕
            </button>
            <PaymentReceiptModal payment={selectedPayment} invoice={invoice} />
          </div>
        </div>
      )}

      {/* Update Confirmation Modal with Comment */}
      {showUpdateModal && (
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
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600', color: '#1f2937' }}>
              🤖 Submit Update to AI Mechanic
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#6b7280' }}>
              Your changes will be saved and sent to the AI Mechanic for parser improvement.
              Add an optional comment to provide context or request specific actions.
            </p>
            <textarea
              value={updateComment}
              onChange={(e) => setUpdateComment(e.target.value)}
              placeholder="Optional: Add a comment for the AI Mechanic...&#10;&#10;Examples:&#10;• 'The vendor name was parsed incorrectly'&#10;• 'This invoice is missing a PDF, please find it'&#10;• 'The amount should include tax'"
              rows={5}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                marginBottom: '16px',
                resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowUpdateModal(false);
                  setUpdateComment('');
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateConfirm}
                disabled={processing}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#d97706',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: processing ? 'not-allowed' : 'pointer',
                  opacity: processing ? 0.6 : 1,
                }}
              >
                {processing ? 'Submitting...' : 'Confirm Submission'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Allocation Error Modal */}
      {showAllocationErrorModal && (
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
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '450px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            border: '2px solid #ef4444',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
              }}>
                ⚠️
              </div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#dc2626' }}>
                Cannot Approve Invoice
              </h3>
            </div>
            
            <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#374151', lineHeight: '1.5' }}>
              The GL Lines allocation does not match the invoice total. All amounts must be fully allocated before approval.
            </p>
            
            <div style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
                <span style={{ color: '#6b7280' }}>Invoice Total:</span>
                <span style={{ fontWeight: '600', color: '#1f2937' }}>${allocationSummary.totalAmount.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
                <span style={{ color: '#6b7280' }}>Allocated:</span>
                <span style={{ fontWeight: '600', color: '#1f2937' }}>${allocationSummary.allocated.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', paddingTop: '8px', borderTop: '1px solid #fecaca' }}>
                <span style={{ color: '#dc2626', fontWeight: '600' }}>Unallocated:</span>
                <span style={{ fontWeight: '700', color: '#dc2626' }}>${Math.abs(allocationSummary.unallocated).toFixed(2)}</span>
              </div>
            </div>
            
            <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#6b7280' }}>
              Please adjust the GL Lines in the section above to ensure the total allocated amount equals the invoice total.
            </p>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowAllocationErrorModal(false)}
                style={{
                  padding: '10px 24px',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast?.message} variant={toast?.variant} onDismiss={dismissToast} />
    </div>
  );
}

// Inline component for payment receipt display
function PaymentReceiptModal({ payment, invoice }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!payment || !invoice) return;

    const load = async () => {
      try {
        setLoading(true);

        // Get all invoice IDs from the payment metadata
        const invoiceIds = payment.invoiceIds || [];

        if (invoiceIds.length === 0) {
          // Fallback to current invoice if no metadata
          setInvoices([invoice]);
          return;
        }

        // Fetch all invoices associated with this payment
        const invoicePromises = invoiceIds.map(id =>
          fetch(`/api/invoices/${id}?t=${Date.now()}`, {
            cache: 'no-store',
            credentials: 'include',
          })
            .then(res => res.ok ? res.json() : null)
            .catch(() => null)
        );

        const results = await Promise.all(invoicePromises);
        const loadedInvoices = results.filter(Boolean);

        setInvoices(loadedInvoices.length > 0 ? loadedInvoices : [invoice]);
      } catch (e) {
        console.error('Failed to load invoice details:', e);
        setInvoices([invoice]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [payment, invoice]);

  const sectionStyle = { marginBottom: 20 };
  const sectionTitleStyle = { fontSize: 14, fontWeight: 600, color: '#357ab2', marginBottom: 12 };

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 600, color: '#357ab2', marginBottom: 20 }}>Payment Receipt</div>

      {/* Stripe Receipt Section */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Stripe Receipt</div>
        <div style={{ marginBottom: 8 }}>
          <strong>Payment ID:</strong> {payment.id}
        </div>
        <div style={{ marginBottom: 8 }}>
          <strong>Date Paid:</strong>{' '}
          {new Date(payment.date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
        <div style={{ marginBottom: 8 }}>
          <strong>Amount:</strong> ${payment.amount.toFixed(2)}
        </div>
        <div style={{ marginBottom: 8 }}>
          <strong>Status:</strong> <span style={{ color: '#16a34a' }}>Succeeded</span>
        </div>
        {payment.receiptUrl && (
          <div>
            <a
              href={payment.receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#357ab2', textDecoration: 'none', fontWeight: 500 }}
            >
              View Full Stripe Receipt →
            </a>
          </div>
        )}
      </div>

      {/* PCS Dashboard Receipt Section */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>PCS Dashboard Receipt</div>
        <div style={{ marginBottom: 8 }}>
          <strong>Vendor:</strong> {invoice?.vendor || invoice?.vendor_name || 'N/A'}
        </div>
        <div style={{ marginBottom: 8 }}>
          <strong>Total Amount Paid:</strong> ${payment.amount.toFixed(2)}
        </div>
        <div style={{ marginBottom: 12 }}>
          <strong>Invoices Paid:</strong> {invoices.length}
        </div>

        {loading && <div style={{ color: '#357ab2' }}>Loading invoice details...</div>}

        {invoices.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Invoices Included:</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '1px solid #357ab2' }}>
                    <th style={{ padding: '6px', textAlign: 'left', fontWeight: 600 }}>Invoice #</th>
                    <th style={{ padding: '6px', textAlign: 'left', fontWeight: 600 }}>Amount</th>
                    <th style={{ padding: '6px', textAlign: 'left', fontWeight: 600 }}>Date</th>
                    <th style={{ padding: '6px', textAlign: 'left', fontWeight: 600 }}>PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '6px' }}>{inv.invoice_number || inv.invoice || 'N/A'}</td>
                      <td style={{ padding: '6px' }}>
                        ${(inv.invoice_total || inv.total || inv.amount || 0).toFixed(2)}
                      </td>
                      <td style={{ padding: '6px' }}>
                        {inv.invoice_date
                          ? new Date(inv.invoice_date).toLocaleDateString('en-US')
                          : 'N/A'}
                      </td>
                      <td style={{ padding: '6px' }}>
                        {inv.pdf_path ? (
                          <a
                            href={inv.pdf_path}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#357ab2', textDecoration: 'none', fontSize: '11px' }}
                          >
                            View
                          </a>
                        ) : (
                          'N/A'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && invoices.length === 0 && (
          <div style={{ color: '#5a5a5a', fontSize: '12px' }}>No invoices found for this payment</div>
        )}
      </div>
    </div>
  );
}
