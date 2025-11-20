import React, { useState, useEffect, useCallback } from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { fetchQboCategories } from '../lib/categoriesClient';
import ACHBadge from '../ui/ach/ACHBadge';
import { useVendorAchMap } from '../ui/ach/useVendorAch';
import Toast from '../components/Toast.jsx';
import { csrfClient } from '../lib/api/csrfClient';

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
  const [paymentAmount, setPaymentAmount] = useState(invoice?.amount || invoice?.total || '');
  const [details, setDetails] = useState({
    invoice: invoice?.invoice || invoice?.invoice_number || '',
    vendor: invoice?.vendor || '',
    office: invoice?.office || '',
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
  const [toast, setToast] = useState(null);
  const [paymentDetails, setPaymentDetails] = useState(null);
  const [loadingPaymentDetails, setLoadingPaymentDetails] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [reassignmentTargets, setReassignmentTargets] = useState([]); // NEW: Reassignment targets
  const [selectedReassignmentTarget, setSelectedReassignmentTarget] = useState(null); // NEW: Selected target
  const [reassigningInvoice, setReassigningInvoice] = useState(false); // NEW: Reassignment loading state
  const { getStatusForVendor } = useVendorAchMap();
  const showToast = useCallback((message, variant = 'info') => {
    setToast({ message, variant, at: Date.now() });
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
    setPaymentAmount(invoice?.amount || invoice?.total || '');
    setDetails({
      invoice: invoice?.invoice || invoice?.invoice_number || '',
      vendor: invoice?.vendor || '',
      office: invoice?.office || '',
      category: invoice?.category || 'Dental Lab',
      invoice_date: invoice?.invoice_date || '',
      due_date: invoice?.due_date || '',
    });
  }, [invoice]);

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

  // NEW: Invoice-level category handlers
  function addInvoiceCategory() {
    setInvoiceCategories(prev => [...prev, { id: '', name: '', source: 'manual' }]);
  }

  function removeInvoiceCategory(index) {
    setInvoiceCategories(prev => prev.filter((_, i) => i !== index));
  }

  function updateInvoiceCategory(index, categoryId, categoryName) {
    setInvoiceCategories(prev => {
      const updated = [...prev];
      updated[index] = { id: categoryId, name: categoryName, source: 'manual' };
      return updated;
    });
  }

  async function saveInvoiceCategories() {
    if (!invoiceIdentifier) return;

    setProcessing(true);
    try {
      const response = await fetch(`/api/invoices/${invoiceIdentifier}/invoice-categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ categories: invoiceCategories })
      });

      if (response.ok) {
        showToast('Categories saved successfully', 'success');
        console.log('✅ Invoice categories saved');
      } else {
        const errorData = await response.json();
        const errorMsg = errorData.detail || errorData.error || 'Failed to save categories';
        showToast(errorMsg, 'error');
        console.error('❌ Failed to save invoice categories:', errorMsg);
      }
    } catch (error) {
      console.error('❌ Error saving invoice categories:', error);
      showToast(`Failed to save categories: ${error.message}`, 'error');
    } finally {
      setProcessing(false);
    }
  }

  // Load invoice categories when component mounts
  useEffect(() => {
    const loadInvoiceCategories = async () => {
      if (!invoiceIdentifier) return;

      try {
        const response = await fetch(`/api/invoices/${invoiceIdentifier}/invoice-categories`);
        if (response.ok) {
          const data = await response.json();
          setInvoiceCategories(data.categories || []);
          console.log('✅ Invoice categories loaded:', data.categories?.length || 0);
        }
      } catch (error) {
        console.error('❌ Error loading invoice categories:', error);
      }
    };

    loadInvoiceCategories();
  }, [invoiceIdentifier]);

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
      
      const officeValue = (details?.office || invoice.office || invoice.office_location || invoice.clinic_id || '').trim();
      
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
        ...(action === 'approve' ? { office: details?.office || invoice.office || invoice.office_location || invoice.clinic_id || '' } : {}),
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
          office:
            updated.office_location ||
            updated.office ||
            updated.clinic_id ||
            prev.office,
          category: updated.category || prev.category,
          invoice_date: updated.invoice_date || prev.invoice_date,
          due_date: updated.due_date || prev.due_date,
        }));
        if (updated.total || updated.invoice_total) {
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
    transitionInvoice('approve');
  }

  function handleReject() {
    transitionInvoice('reject');
  }

  async function handleUpdate() {
    try {
      console.log('🔧 Starting invoice update process...');
      setProcessing(true);

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

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData?.error || 'Failed to update invoice');
      }

      console.log('✅ Invoice updated successfully');
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
        { label: 'Update', onClick: handleUpdate, style: { ...actionButtonStyle, backgroundColor: '#d97706', color: '#ffffff', borderColor: '#d97706' } }
      ];
    }

    // For all other statuses (incoming, awaiting_office_approval, awaiting_admin_approval, etc.), show Approve
    const defaultButtons = [
      { label: 'Approve', onClick: handleApprove, style: { ...actionButtonStyle, backgroundColor: '#059669', color: '#ffffff', borderColor: '#059669' } },
      { label: 'Reject', onClick: handleReject, style: { ...actionButtonStyle, backgroundColor: '#dc2626', color: '#ffffff', borderColor: '#dc2626' } },
      { label: 'Update', onClick: handleUpdate, style: { ...actionButtonStyle, backgroundColor: '#d97706', color: '#ffffff', borderColor: '#d97706' } }
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
            disabled={processing}
            style={{
              ...button.style,
              opacity: processing ? 0.6 : 1,
              cursor: processing ? 'not-allowed' : 'pointer',
            }}
          >
            {processing ? 'Processing...' : button.label}
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
          {/* NEW: Categories section (replaces Line Items) */}
          <div style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Categories</h2>

            {/* Categories list */}
            <div style={{ marginBottom: '16px' }}>
              {invoiceCategories && invoiceCategories.length > 0 ? (
                <div>
                  {invoiceCategories.map((cat, index) => (
                    <div key={index} style={{
                      display: 'flex',
                      gap: '12px',
                      alignItems: 'center',
                      marginBottom: '12px',
                      padding: '12px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '4px',
                      backgroundColor: '#f8fafc'
                    }}>
                      <select
                        value={cat.id || ''}
                        onChange={(e) => {
                          const selectedCat = categories.find(c => c.id === e.target.value);
                          if (selectedCat) {
                            updateInvoiceCategory(index, selectedCat.id, selectedCat.name);
                          }
                        }}
                        style={{
                          flex: 1,
                          border: '1px solid #cbd5e0',
                          borderRadius: '4px',
                          padding: '8px',
                          fontSize: '14px',
                          backgroundColor: 'white'
                        }}
                      >
                        <option value="">{cat.name || 'Select category...'}</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>

                      {/* Source badge */}
                      {cat.source && (
                        <span style={{
                          fontSize: '12px',
                          padding: '4px 8px',
                          borderRadius: '3px',
                          backgroundColor: cat.source === 'parser' ? '#e0f2fe' : '#fef3c7',
                          color: cat.source === 'parser' ? '#0369a1' : '#b45309',
                          whiteSpace: 'nowrap'
                        }}>
                          {cat.source === 'parser' ? '🔍 Parser' : '✏️ Manual'}
                        </span>
                      )}

                      {/* Remove button */}
                      <button
                        onClick={() => removeInvoiceCategory(index)}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: '#fee2e2',
                          color: '#991b1b',
                          border: '1px solid #fca5a5',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: 'bold'
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                  No categories assigned yet
                </div>
              )}
            </div>

            {/* Add category button */}
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
                + Add Category
              </button>

              <button
                onClick={saveInvoiceCategories}
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
                  opacity: processing ? 0.6 : 1
                }}
              >
                {processing ? 'Saving...' : 'Save Categories'}
              </button>
            </div>
          </div>
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
