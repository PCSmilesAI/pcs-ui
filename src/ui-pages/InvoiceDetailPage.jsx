import React, { useState, useEffect, useCallback } from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { fetchQboCategories } from '../lib/categoriesClient';
import ACHBadge from '../ui/ach/ACHBadge';
import { useVendorAchMap } from '../ui/ach/useVendorAch';
import Toast from '../components/Toast.jsx';

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
 * repair). Below the summary the left column shows invoice
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
  const [toast, setToast] = useState(null);
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
    to_be_paid: { label: 'Ready to Pay', fg: '#047857', bg: '#d1fae5', border: '#34d399' },
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
      const response = await fetch('/api/invoices/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: invoiceId,
          action,
          ...(action === 'approve' ? { office: details?.office || invoice.office || invoice.office_location || invoice.clinic_id || '' } : {}),
          ...(action === 'reject' ? { reason: 'Rejected from invoice detail' } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({}));

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

  async function handleRepair() {
    try {
      console.log('🔧 Starting repair process...');
      
      // Create corrected data from current form state
      const correctedData = {
        invoice_number: details.invoice,
        vendor: details.vendor,
        vendor_name: details.vendor,
        total: paymentAmount.replace('$', '').replace(',', ''),
        invoice_total: paymentAmount.replace('$', '').replace(',', ''),
        office_location: details.office,
        clinic_id: details.office,
        category: details.category,
        invoice_date: details.invoice_date,
        due_date: details.due_date,
        line_items: items,
        status: 'repair',
        approved: false,
        timestamp: new Date().toISOString(),
        pdf_path: invoice.pdf_path,
        json_path: invoice.json_path,
        id: invoice.id
      };

      // Call repair API to log the training data
      const repairResponse = await fetch('/api/repair-invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invoice_number: invoice.invoice_number,
          original_data: invoice,
          corrected_data: correctedData,
          pdf_path: invoice.pdf_path,
          vendor_name: invoice.vendor_name || invoice.vendor
        })
      });

      if (!repairResponse.ok) {
        throw new Error('Failed to log repair data');
      }

      console.log('✅ Repair data logged successfully');
      
      // Update the invoice status
      await updateInvoiceStatus('repair', false);
      
    } catch (error) {
      console.error('❌ Error during repair process:', error);
      alert(`Error logging repair data: ${error.message}`);
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
      const response = await fetch('/api/invoices/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceIds: [invoiceId] }),
      });
      const payload = await response.json().catch(() => ({}));
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
        { label: 'Repair', onClick: handleRepair, style: { ...actionButtonStyle, backgroundColor: '#d97706', color: '#ffffff', borderColor: '#d97706' } }
      ];
    }

    // For all other statuses (incoming, awaiting_office_approval, awaiting_admin_approval, etc.), show Approve
    const defaultButtons = [
      { label: 'Approve', onClick: handleApprove, style: { ...actionButtonStyle, backgroundColor: '#059669', color: '#ffffff', borderColor: '#059669' } },
      { label: 'Reject', onClick: handleReject, style: { ...actionButtonStyle, backgroundColor: '#dc2626', color: '#ffffff', borderColor: '#dc2626' } },
      { label: 'Repair', onClick: handleRepair, style: { ...actionButtonStyle, backgroundColor: '#d97706', color: '#ffffff', borderColor: '#d97706' } }
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
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={cellHeaderStyle}>Stage</th>
                  <th style={cellHeaderStyle}>User</th>
                  <th style={cellHeaderStyle}>Last Action</th>
                </tr>
              </thead>
              <tbody>
                {approvalStages.map((stage) => {
                  const entry = approvals[stage.key] || null;
                  return (
                    <tr key={stage.key}>
                      <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>{stage.label}</td>
                      <td style={cellStyle}>{entry?.by || 'Pending'}</td>
                      <td style={cellStyle}>{formatApprovalTimestamp(entry?.at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <table style={{ ...tableStyle, marginTop: '12px' }}>
              <tbody>
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
                <tr>
                  <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>Category</td>
                  <td style={cellStyle}>
                    <input
                      type="text"
                      value={details.category}
                      onChange={(e) => handleDetailChange('category', e.target.value)}
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
          {/* Line Items section */}
          <div style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Line Items</h2>
            
            {/* Category Management Buttons */}
            <div style={{ marginBottom: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={fetchCategories}
                disabled={loadingCategories}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#357ab2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loadingCategories ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  opacity: loadingCategories ? 0.6 : 1
                }}
              >
                {loadingCategories ? 'Loading...' : 'Fetch QuickBooks Categories'}
              </button>
              
              <button
                onClick={autoCategorize}
                disabled={processing || categories.length === 0}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: (processing || categories.length === 0) ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  opacity: (processing || categories.length === 0) ? 0.6 : 1
                }}
              >
                {loadingLineCategories ? 'Processing...' : 'Auto-Categorize Items'}
              </button>
              
              <button
                onClick={saveLineCategories}
                disabled={processing}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#ffc107',
                  color: 'black',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: processing ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  opacity: processing ? 0.6 : 1
                }}
              >
                {processing ? 'Saving...' : 'Save Categories'}
              </button>
            </div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>Loading line items...</div>
            ) : items.length > 0 ? (
            <table style={tableStyle}>
              <thead>
                <tr>
                    <th style={cellHeaderStyle}>Item</th>
                    <th style={cellHeaderStyle}>Qty</th>
                    <th style={cellHeaderStyle}>Unit</th>
                    <th style={cellHeaderStyle}>Total</th>
                    <th style={cellHeaderStyle}>Category</th>
                </tr>
              </thead>
              <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id || index}>
                    <td style={cellStyle}>
                      <input
                        type="text"
                          value={item.name}
                          onChange={(e) => handleItemChange(index, 'name', e.target.value)}
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
                    <td style={cellStyle}>
                      <input
                        type="text"
                        value={item.qty}
                          onChange={(e) => handleItemChange(index, 'qty', e.target.value)}
                        style={{
                          border: '1px solid #cbd5e0',
                          borderRadius: '4px',
                            padding: '4px 8px',
                          fontSize: '14px',
                          width: '60px',
                          textAlign: 'center',
                        }}
                      />
                    </td>
                      <td style={cellStyle}>
                      <input
                        type="text"
                        value={item.unit}
                          onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                        style={{
                          border: '1px solid #cbd5e0',
                          borderRadius: '4px',
                            padding: '4px 8px',
                          fontSize: '14px',
                            width: '80px',
                          textAlign: 'right',
                        }}
                      />
                    </td>
                      <td style={cellStyle}>
                      <input
                        type="text"
                        value={item.total}
                          onChange={(e) => handleItemChange(index, 'total', e.target.value)}
                        style={{
                          border: '1px solid #cbd5e0',
                          borderRadius: '4px',
                            padding: '4px 8px',
                          fontSize: '14px',
                            width: '80px',
                          textAlign: 'right',
                        }}
                      />
                    </td>
                    <td style={cellStyle}>
                      <select
                        value={lineCategories[index]?.categoryId || ''}
                        onChange={(e) => {
                          const selectedCategory = categories.find(cat => cat.id === e.target.value);
                          if (selectedCategory) {
                            updateLineCategory(index, selectedCategory.id, selectedCategory.name);
                          }
                        }}
                        style={{
                          border: '1px solid #cbd5e0',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '14px',
                          width: '100%',
                          boxSizing: 'border-box',
                          backgroundColor: lineCategories[index]?.source === 'vendor-default' ? '#f0f9ff' : 
                                         lineCategories[index]?.source === 'keyword' ? '#f0fdf4' : 'white'
                        }}
                      >
                        <option value="">{lineCategories[index]?.categoryName || 'Not categorized'}</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                      {lineCategories[index] && (
                        <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                          {lineCategories[index].source === 'vendor-default' && '🎯 Vendor default'}
                          {lineCategories[index].source === 'keyword' && '🔍 Auto-detected'}
                          {lineCategories[index].source === 'manual' && '✏️ Manual'}
                          {lineCategories[index].confidence > 0 && (
                            <span> ({(lineCategories[index].confidence * 100).toFixed(0)}%)</span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                No line items available
              </div>
            )}
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
      <Toast message={toast?.message} variant={toast?.variant} onDismiss={dismissToast} />
    </div>
  );
}
