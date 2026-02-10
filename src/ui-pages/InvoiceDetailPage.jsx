import React, { useState, useEffect, useCallback } from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { fetchQboCategories } from '../lib/categoriesClient';
import ACHBadge from '../ui/ach/ACHBadge';
import { useVendorAchMap } from '../ui/ach/useVendorAch';
import Toast from '../components/Toast.jsx';
import SendProgressModal from '../components/SendProgressModal.jsx';
import { csrfClient } from '../lib/api/csrfClient';
import { CodingTemplateSelector } from '../../components/invoices/CodingTemplateSelector';
import SearchableSelect from '../components/SearchableSelect';
import AddNewVendorModal from '../components/AddNewVendorModal';
import { useUserRole } from '../context/UserRoleContext';

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
export default function InvoiceDetailPage({ invoice: initialInvoice, onBack, onPrevious, onNext, canGoPrevious, canGoNext, onInvoiceRejected }) {
  // Get user permissions from context
  const { permissions } = useUserRole();
  
  // Track current invoice data (can be refreshed after updates)
  const [invoice, setInvoice] = useState(initialInvoice);
  
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
  const [qboVendors, setQboVendors] = useState([]); // QBO Vendors for dropdown
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [showAddVendorModal, setShowAddVendorModal] = useState(false); // Add New Vendor modal
  const [toast, setToast] = useState(null);
  const [paymentDetails, setPaymentDetails] = useState(null);
  const [loadingPaymentDetails, setLoadingPaymentDetails] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [reassignmentTargets, setReassignmentTargets] = useState([]); // NEW: Reassignment targets
  const [selectedReassignmentTarget, setSelectedReassignmentTarget] = useState(null); // NEW: Selected target
  const [reassigningInvoice, setReassigningInvoice] = useState(false); // NEW: Reassignment loading state
  const [notes, setNotes] = useState(''); // NEW: Notes field for PCS AI feedback
  const [notesHistory, setNotesHistory] = useState([]); // NEW: Notes history
  const [isChatOpen, setIsChatOpen] = useState(false); // NEW: Chat interface visibility
  const [chatMessages, setChatMessages] = useState([]); // NEW: Chat messages
  const [chatInput, setChatInput] = useState(''); // NEW: Chat input
  const [sendingChat, setSendingChat] = useState(false); // NEW: Chat sending state
  // Use permissions context - isAdminOrAP is derived from permissions
  const isAdminOrAP = permissions.isAdmin || permissions.isAPManager;
  const [allocations, setAllocations] = useState([]); // NEW: Template allocations
  const [template, setTemplate] = useState(null); // NEW: Applied template info
  const [improveParser, setImproveParser] = useState(false); // NEW: AI Mechanic checkbox
  const [improvingParser, setImprovingParser] = useState(false); // NEW: AI Mechanic loading state
  const [showUpdateModal, setShowUpdateModal] = useState(false); // NEW: Update confirmation modal
  const [updateComment, setUpdateComment] = useState(''); // NEW: User comment for AI mechanic
  const [showAllocationErrorModal, setShowAllocationErrorModal] = useState(false); // NEW: Allocation error modal
  const [pdfLoadState, setPdfLoadState] = useState('loading'); // 'loading', 'loaded', 'error'
  
  // Coding Template Creation State
  const [glLinesModified, setGlLinesModified] = useState(false); // Track when GL lines are modified
  const [showCreateTemplateModal, setShowCreateTemplateModal] = useState(false); // Create Template modal
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDescription, setNewTemplateDescription] = useState('');
  const [newTemplateAllocationMode, setNewTemplateAllocationMode] = useState('percentage'); // Default to percentage since we have amounts
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  
  // Templates Dropdown State
  const [availableTemplates, setAvailableTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [suggestedTemplateId, setSuggestedTemplateId] = useState(''); // Vendor's preferred template
  const [suggestedTemplateName, setSuggestedTemplateName] = useState('');
  
  // Reparse State (for invoices with parsing errors)
  const [reparsing, setReparsing] = useState(false);
  const [reparseResult, setReparseResult] = useState(null);

  // Split invoice state (for splitting multi-invoice PDFs)
  const [splitting, setSplitting] = useState(false);
  
  // Scan & Reparse State (for post-update scanning of similar invoices)
  const [scanningInvoices, setScanningInvoices] = useState(false);
  const [scanResults, setScanResults] = useState(null);
  const [showScanModal, setShowScanModal] = useState(false);
  
  // Duplicate Invoice Handling State
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateInvoiceId, setDuplicateInvoiceId] = useState(null);
  const [pendingUpdateData, setPendingUpdateData] = useState(null); // Store update data for retry after confirmation
  
  // NEW: Verifier workflow state (for users with specific vendor access like Laura)
  const [isVerifier, setIsVerifier] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendStep1Status, setSendStep1Status] = useState('idle'); // 'idle' | 'processing' | 'complete' | 'error'
  const [sendStep2Status, setSendStep2Status] = useState('idle');
  const [sendStep1Error, setSendStep1Error] = useState(null);
  const [sendStep2Error, setSendStep2Error] = useState(null);
  
  const { getStatusForVendor } = useVendorAchMap();
  const showToast = useCallback((message, variant = 'info') => {
    setToast({ message, variant, at: Date.now() });
  }, []);
  
  // Function to refresh invoice data from the server (stays on same page)
  const refreshInvoiceData = useCallback(async () => {
    if (!invoiceIdentifier) return;
    
    try {
      const response = await fetch(`/api/invoices/${invoiceIdentifier}`);
      if (response.ok) {
        const data = await response.json();
        if (data.invoice) {
          setInvoice(data.invoice);
          // Update related state
          const amountCents = data.invoice.amount_cents;
          const newAmount = amountCents != null
            ? `$${(amountCents / 100).toFixed(2)}`
            : (data.invoice.amount || data.invoice.total || '');
          setPaymentAmount(newAmount);
          setDetails({
            invoice: data.invoice.invoice_number || data.invoice.invoice || '',
            vendor: data.invoice.vendor_name || data.invoice.vendor || '',
            office: data.invoice.office_id || data.invoice.office || '',
            category: data.invoice.category || 'Dental Lab',
            invoice_date: data.invoice.invoice_date || '',
            due_date: data.invoice.due_date || '',
          });
          if (data.allocations) {
            setAllocations(data.allocations);
          }
          if (data.template) {
            setTemplate(data.template);
          }
        }
      }
    } catch (err) {
      console.error('Error refreshing invoice data:', err);
    }
  }, [invoiceIdentifier]);

  // Load QBO categories, classes, and vendors on mount
  useEffect(() => {
    fetchCategories();
    fetchQboClasses();
    fetchQboVendors();
  }, []);
  
  // Check if current user is a verifier (has specific vendor access, like Laura)
  useEffect(() => {
    async function checkVerifierStatus() {
      try {
        const userEmail = getUserEmail();
        if (!userEmail) return;
        
        const response = await fetch('/api/workflow/config');
        if (response.ok) {
          const config = await response.json();
          const vendorAccess = config?.vendor_access?.[userEmail.toLowerCase()];
          // User is a verifier if they have an array of specific vendors (not "*" or "assigned_only")
          setIsVerifier(Array.isArray(vendorAccess));
        }
      } catch (e) {
        console.error('Failed to check verifier status:', e);
      }
    }
    checkVerifierStatus();
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
    paid: { label: 'Payment Complete', fg: '#065f46', bg: '#d1fae5', border: '#34d399' },
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
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
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
      {/* Show Receipt link when invoice is paid */}
      {statusValue === 'paid' && invoice?.id && (
        <a
          href={`/payment-receipt/${encodeURIComponent(invoice.id)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 10px',
            borderRadius: '9999px',
            backgroundColor: '#f3f4f6',
            color: '#357ab2',
            border: '1px solid #357ab2',
            fontSize: '12px',
            fontWeight: 500,
            textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          <i className="fas fa-receipt" style={{ fontSize: '10px' }}></i>
          Receipt
        </a>
      )}
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

  // Reset PDF load state when invoice changes
  useEffect(() => {
    setPdfLoadState('loading');
  }, [invoice?.pdf_path]);

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
              borderRadius: '9999px',
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

  // Fetch QBO Vendors for dropdown
  async function fetchQboVendors() {
    setLoadingVendors(true);
    try {
      const response = await fetch('/api/qbo/vendors');
      if (response.ok) {
        const data = await response.json();
        // Add "Add New Vendor" as the first option
        const vendorOptions = [
          { id: '__add_new__', name: '+ Add New Vendor', displayName: '+ Add New Vendor' },
          ...(data.vendors || [])
        ];
        setQboVendors(vendorOptions);
        console.log('✅ QBO Vendors loaded:', data.vendors?.length || 0);
      } else {
        console.warn('Failed to load QBO vendors:', response.status);
      }
    } catch (error) {
      console.error('❌ Error fetching QBO vendors:', error);
    } finally {
      setLoadingVendors(false);
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
  
  // Sync paymentAmount field with invoiceTotalAmount for allocation tracking
  // This ensures the GL Lines allocation updates LIVE as the user edits the payment amount
  useEffect(() => {
    // Parse payment amount string (remove $ and , characters)
    const amountStr = paymentAmount?.toString().replace(/\$/g, '').replace(/,/g, '') || '0';
    const parsedAmount = parseFloat(amountStr) || 0;
    const roundedAmount = Math.round(parsedAmount * 100) / 100;
    
    // Only update if different to avoid infinite loops
    if (Math.abs(roundedAmount - invoiceTotalAmount) > 0.001) {
      setInvoiceTotalAmount(roundedAmount);
    }
  }, [paymentAmount]);
  
  // Calculate allocation summary whenever categories or invoice total changes
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
    setGlLinesModified(true); // Track modification
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
    setGlLinesModified(true); // Track modification
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

  // Fetch available coding templates
  async function fetchAvailableTemplates() {
    try {
      setLoadingTemplates(true);
      const response = await fetch('/api/coding-templates');
      if (response.ok) {
        const data = await response.json();
        setAvailableTemplates(data.templates || []);
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    } finally {
      setLoadingTemplates(false);
    }
  }
  
  // Fetch vendor's preferred template (if any)
  async function fetchVendorTemplatePreference() {
    const vendorName = invoice?.vendor_name || invoice?.vendor;
    if (!vendorName) return;
    
    try {
      const response = await fetch(`/api/vendors/${encodeURIComponent(vendorName)}/template-preference`);
      if (response.ok) {
        const data = await response.json();
        if (data.hasPreference && data.templateId) {
          setSuggestedTemplateId(data.templateId);
          setSuggestedTemplateName(data.templateName || 'Suggested Template');
          // Auto-select the suggested template if no template is currently selected
          if (!selectedTemplateId) {
            setSelectedTemplateId(data.templateId);
          }
          console.log(`[TEMPLATE] Vendor ${vendorName} has preferred template: ${data.templateName}`);
        }
      }
    } catch (error) {
      console.error('Failed to fetch vendor template preference:', error);
    }
  }

  // Create template from current GL lines
  async function handleCreateTemplateFromInvoice() {
    if (!newTemplateName.trim()) {
      showToast('Please enter a template name', 'error');
      return;
    }

    if (invoiceCategories.length === 0) {
      showToast('No GL lines to save as template', 'error');
      return;
    }

    // Validate all categories have required fields
    for (const cat of invoiceCategories) {
      if (!cat.categoryId && !cat.categoryName) {
        showToast('All GL lines must have an account selected', 'error');
        return;
      }
    }

    setCreatingTemplate(true);
    try {
      // Calculate percentages from current amounts
      const totalAmount = invoiceCategories.reduce((sum, cat) => sum + (parseFloat(cat.amount) || 0), 0);
      
      const templateRows = invoiceCategories.map(cat => {
        const amount = parseFloat(cat.amount) || 0;
        const percentage = totalAmount > 0 ? ((amount / totalAmount) * 100).toFixed(1) : 0;
        
        return {
          gl_account_path: cat.categoryName || '',
          category_name: cat.categoryName || '',
          description: cat.description || '',
          class_name: cat.className || '',
          location_name: cat.className || '',
          amount: newTemplateAllocationMode === 'fixed_amount' ? amount.toFixed(2) : null,
          percentage: newTemplateAllocationMode === 'percentage' ? percentage : null,
        };
      });

      const response = await fetch('/api/coding-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTemplateName,
          description: newTemplateDescription,
          vendor_name: details.vendor || invoice?.vendor_name || 'Unknown Vendor',
          template_type: 'table_template',
          allocation_mode: newTemplateAllocationMode,
          table_rows: templateRows,
        })
      });

      if (response.ok) {
        showToast('Template created successfully!', 'success');
        setShowCreateTemplateModal(false);
        setNewTemplateName('');
        setNewTemplateDescription('');
        setNewTemplateAllocationMode('percentage');
        setGlLinesModified(false);
        // Refresh templates list
        fetchAvailableTemplates();
      } else {
        const data = await response.json();
        showToast(data.error || 'Failed to create template', 'error');
      }
    } catch (error) {
      console.error('Error creating template:', error);
      showToast('Failed to create template', 'error');
    } finally {
      setCreatingTemplate(false);
    }
  }

  // Apply a template to the invoice
  async function handleApplyTemplate() {
    if (!selectedTemplateId) {
      showToast('Please select a template', 'error');
      return;
    }

    setApplyingTemplate(true);
    try {
      // First, fetch the template details
      const templateResponse = await fetch(`/api/coding-templates/${selectedTemplateId}/rows`);
      if (!templateResponse.ok) {
        throw new Error('Failed to load template');
      }
      const templateData = await templateResponse.json();
      let templateRows = templateData.rows || [];
      const template = (await (await fetch(`/api/coding-templates/${selectedTemplateId}`)).json()).template;
      const allocationMode = template?.allocation_mode || 'split_evenly';
      
      // For split_evenly modes with no pre-saved rows, dynamically generate from QBO classes (8 locations)
      // This handles both 'split_evenly' and 'split_evenly_all_classes' modes
      if ((allocationMode === 'split_evenly_all_classes' || allocationMode === 'split_evenly') && templateRows.length === 0) {
        try {
          console.log(`[TEMPLATE] No rows defined for ${allocationMode} mode, auto-generating from QBO classes...`);
          const classesResponse = await fetch('/api/qbo/classes');
          if (classesResponse.ok) {
            const classesData = await classesResponse.json();
            const qboClasses = classesData.classes || [];
            
            if (qboClasses.length === 0) {
              showToast('No QuickBooks classes found. Please configure classes in QuickBooks first.', 'error');
              return;
            }
            
            // Generate template rows from QBO classes (all 8 locations)
            templateRows = qboClasses.map((cls, index) => ({
              id: `auto-${index}`,
              gl_account_path: template?.gl_account_name || '',
              category_name: template?.gl_account_name || '',
              description: '',
              class_name: cls.name || cls.fullName,
              location_name: cls.name || cls.fullName,
            }));
            
            console.log(`[TEMPLATE] Auto-generated ${templateRows.length} GL lines from QBO classes for ${allocationMode} mode`);
          } else {
            showToast('Failed to fetch QuickBooks classes', 'error');
            return;
          }
        } catch (classError) {
          console.error('Error fetching QBO classes:', classError);
          showToast('Failed to fetch QuickBooks classes for template', 'error');
          return;
        }
      }
      
      if (templateRows.length === 0) {
        showToast('Template has no GL lines defined. Please add rows to the template or use a split evenly mode.', 'error');
        return;
      }

      // Calculate amounts based on allocation mode
      const totalAmount = invoiceTotalAmount || 0;
      
      let newCategories = [];
      
      if (allocationMode === 'split_evenly' || allocationMode === 'split_evenly_all_classes') {
        // Split evenly among all lines
        const evenAmount = totalAmount / templateRows.length;
        newCategories = templateRows.map((row, index) => ({
          categoryId: '',
          categoryName: row.category_name || row.gl_account_path || '',
          classId: '',
          className: row.class_name || row.location_name || '',
          description: row.description || '',
          amount: index === templateRows.length - 1 
            ? Math.round((totalAmount - evenAmount * (templateRows.length - 1)) * 100) / 100
            : Math.round(evenAmount * 100) / 100,
          sequence: index + 1,
          source: 'template',
          isEditing: false
        }));
      } else if (allocationMode === 'percentage') {
        // Apply percentage allocation
        let allocated = 0;
        newCategories = templateRows.map((row, index) => {
          const percentage = parseFloat(row.percentage) || 0;
          let amount = Math.round((totalAmount * percentage / 100) * 100) / 100;
          
          // Adjust last line for rounding
          if (index === templateRows.length - 1) {
            amount = Math.round((totalAmount - allocated) * 100) / 100;
          } else {
            allocated += amount;
          }
          
          return {
            categoryId: '',
            categoryName: row.category_name || row.gl_account_path || '',
            classId: '',
            className: row.class_name || row.location_name || '',
            description: row.description || '',
            amount: amount,
            sequence: index + 1,
            source: 'template',
            isEditing: false
          };
        });
      } else if (allocationMode === 'fixed_amount') {
        // Use fixed amounts from template
        const templateTotal = templateRows.reduce((sum, row) => sum + ((row.amount_cents || 0) / 100), 0);
        const scale = templateTotal > 0 ? totalAmount / templateTotal : 1;
        
        let allocated = 0;
        newCategories = templateRows.map((row, index) => {
          let amount = Math.round(((row.amount_cents || 0) / 100 * scale) * 100) / 100;
          
          // Adjust last line for rounding
          if (index === templateRows.length - 1) {
            amount = Math.round((totalAmount - allocated) * 100) / 100;
          } else {
            allocated += amount;
          }
          
          return {
            categoryId: '',
            categoryName: row.category_name || row.gl_account_path || '',
            classId: '',
            className: row.class_name || row.location_name || '',
            description: row.description || '',
            amount: amount,
            sequence: index + 1,
            source: 'template',
            isEditing: false
          };
        });
      }

      setInvoiceCategories(newCategories);
      setGlLinesModified(true);
      setSelectedTemplateId('');
      showToast(`Template "${template?.name || 'Unknown'}" applied! Review and save the GL lines.`, 'success');
    } catch (error) {
      console.error('Error applying template:', error);
      showToast('Failed to apply template', 'error');
    } finally {
      setApplyingTemplate(false);
    }
  }

  // Load templates when component mounts
  useEffect(() => {
    fetchAvailableTemplates();
  }, []);
  
  // Fetch vendor's preferred template when invoice loads
  useEffect(() => {
    if (invoice && (invoice.vendor_name || invoice.vendor)) {
      fetchVendorTemplatePreference();
    }
  }, [invoice?.vendor_name, invoice?.vendor]);

  // Check if user is admin or AP manager
  useEffect(() => {
    const checkAuth = async () => {
      const email = getUserEmail();
      if (!email) return;
      
      // Role-based access is now handled by UserRoleContext
      // The isAdminOrAP variable is derived from permissions context above
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

      // Check for location in GL Lines first (class field), then fallback to legacy office fields
      const hasGLLineLocation = invoiceCategories.some(cat => cat.className && cat.className.trim());
      const officeValue = (details?.office || invoice.office_id || invoice.office || invoice.office_location || invoice.clinic_id || '').trim();
      const hasLocation = hasGLLineLocation || (officeValue && officeValue.toLowerCase() !== 'unknown');

      // Only require location for non-admin users
      if (!isAdmin && !hasLocation) {
        showToast('Location (Class) is required before approval. Please set it in GL Lines.', 'error');
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

        // If invoice status is now 'to_be_paid', check if QBO bill was already created by transition endpoint
        if (action === 'approve' && updated.status === 'to_be_paid') {
          // Check if the transition endpoint already created the QBO bill
          if (payload?.qboBill?.created && payload?.qboBill?.billId) {
            console.log('✅ QBO bill already created by transition endpoint:', payload.qboBill.billId);
            showToast(`Invoice approved and QBO Bill created! ID: ${payload.qboBill.billId}`, 'success');
            if (onBack) onBack();
            return;
          }
          
          // QBO bill was not created by transition endpoint - try to create it now
          try {
            console.log('🔄 Invoice approved to to_be_paid - creating QuickBooks bill...');
            
            // Check QBO connection first
            const statusRes = await fetch(`/api/qbo/status?ts=${Date.now()}`, { cache: 'no-store' });
            const statusJson = await statusRes.json().catch(() => null);
            const isConnected = !!statusJson?.connected;

            if (!isConnected) {
              showToast('Invoice approved! QuickBooks not connected - bill not created automatically.', 'warning');
              if (onBack) onBack();
              return;
            }

            // Get the invoice total from amount_cents or fallback
            const totalAmount = updated.amount_cents 
              ? (updated.amount_cents / 100).toFixed(2)
              : (invoice?.amount?.replace(/[^0-9.-]/g, '') || invoice?.total || '0');

            // Create the QBO bill
            const billResponse = await fetch('/api/qbo/auto-create-bill', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                invoiceData: {
                  id: updated.id || invoice?.id,
                  invoice_number: updated.invoice_number || invoice?.invoice_number,
                  vendor: updated.vendor_name || invoice?.vendor_name || invoice?.vendor,
                  total: totalAmount,
                  invoice_date: updated.invoice_date || invoice?.invoice_date,
                  due_date: updated.due_date || invoice?.due_date,
                  pdf_path: updated.pdf_path || invoice?.pdf_path,
                  json_path: updated.json_path || invoice?.json_path,
                  office: updated.office_id || invoice?.office_id || invoice?.office,
                  line_items: invoice?.line_items || []
                }
              })
            });

            const billResult = await billResponse.json();

            if (billResult.success) {
              console.log('✅ QuickBooks bill created successfully:', billResult.billId);
              
              // Save the QBO Bill ID to the invoice record for Pay button redirect
              try {
                const invoiceIdentifier = updated.id || invoice?.id || updated.invoice_number || invoice?.invoice_number;
                const saveBillIdResponse = await csrfClient.post(
                  `/api/invoices/${encodeURIComponent(invoiceIdentifier)}/qbo-bill`,
                  { billId: billResult.billId }
                );
                if (saveBillIdResponse.ok) {
                  console.log('✅ QBO Bill ID saved to invoice record:', billResult.billId);
                } else {
                  console.warn('⚠️ Failed to save QBO Bill ID to invoice:', saveBillIdResponse.error);
                }
              } catch (saveBillIdError) {
                console.warn('⚠️ Error saving QBO Bill ID:', saveBillIdError);
              }
              
              const pdfStatus = billResult.pdfAttached ? ' PDF attached.' : '';
              showToast(`Invoice approved and QBO Bill created! ID: ${billResult.billId}${pdfStatus}`, 'success');
            } else {
              console.warn('⚠️ Failed to create QuickBooks bill:', billResult.error);
              showToast(`Invoice approved, but QBO bill failed: ${billResult.error}`, 'warning');
            }
          } catch (billError) {
            console.error('❌ Error creating QuickBooks bill:', billError);
            showToast(`Invoice approved, but QBO bill error: ${billError.message}`, 'warning');
          }
          
          if (onBack) onBack();
          return;
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
            
            // Save the QBO Bill ID to the invoice record for Pay button redirect
            try {
              const invoiceId = invoice?.id || invoice?.invoice_number;
              const saveBillIdResponse = await fetch(`${baseUrl}/api/invoices/${encodeURIComponent(invoiceId)}/qbo-bill`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ billId: billResult.billId })
              });
              if (saveBillIdResponse.ok) {
                console.log('✅ QBO Bill ID saved to invoice record');
              } else {
                console.warn('⚠️ Failed to save QBO Bill ID to invoice');
              }
            } catch (saveBillIdError) {
              console.warn('⚠️ Error saving QBO Bill ID:', saveBillIdError);
            }
            
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

  // Handle "Send" button for verifiers (Laura's workflow)
  // This does three things: 1) Train AI, 2) Create QBO bill, 3) Route to McKay for approval
  async function handleSend() {
    // Check if allocation is fully matched before allowing send
    const tolerance = 0.01;
    if (Math.abs(allocationSummary.unallocated) > tolerance) {
      setShowAllocationErrorModal(true);
      return;
    }

    const invoiceId = invoice?.id || invoice?.invoice_number;
    if (!invoiceId) {
      showToast('Missing invoice identifier', 'error');
      return;
    }

    // Show the progress modal
    setShowSendModal(true);
    setSendStep1Status('processing');
    setSendStep2Status('idle');
    setSendStep1Error(null);
    setSendStep2Error(null);

    try {
      // Parse amount from display format for the API
      const amountStr = paymentAmount.replace(/\$/g, '').replace(/,/g, '');
      const amountNum = parseFloat(amountStr) || 0;
      const amountCents = Math.round(amountNum * 100);

      // Build the corrected data payload
      const correctedData = {
        vendor_name: details.vendor,
        office_id: details.office,
        amount_cents: amountCents,
        invoice_number: details.invoice,
        invoice_date: details.invoice_date,
        due_date: details.due_date,
      };

      // Call the send-for-approval API which handles all three steps
      const response = await csrfClient.post(`/api/invoices/send-for-approval`, {
        invoiceId: invoiceId,
        correctedData: correctedData,
        invoiceCategories: invoiceCategories,
        userComment: updateComment.trim() || undefined,
      });

      // Simulate step progression based on API response
      // Step 1: AI Training
      if (response.aiTrainingResult?.success !== false) {
        setSendStep1Status('complete');
      } else {
        setSendStep1Status('error');
        setSendStep1Error(response.aiTrainingResult?.error || 'AI training failed');
      }

      // Short delay before step 2
      await new Promise(resolve => setTimeout(resolve, 500));
      setSendStep2Status('processing');

      // Step 2: QBO Bill + Route to approver
      if (response.ok) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        setSendStep2Status('complete');
        // Modal will auto-dismiss and we navigate back
      } else {
        setSendStep2Status('error');
        setSendStep2Error(response.error || 'Failed to send for approval');
      }
    } catch (err) {
      console.error('Error in handleSend:', err);
      if (sendStep1Status === 'processing') {
        setSendStep1Status('error');
        setSendStep1Error(err.message || 'Failed to update AI');
      } else {
        setSendStep2Status('error');
        setSendStep2Error(err.message || 'Failed to send for approval');
      }
    }
  }

  // Callback when send modal completes successfully
  function handleSendComplete() {
    setShowSendModal(false);
    setSendStep1Status('idle');
    setSendStep2Status('idle');
    showToast('Invoice sent for approval successfully!', 'success');
    // Navigate back to the list
    if (onBack) {
      onBack();
    }
  }

  // Handle re-parsing an invoice (for invoices with parsing errors)
  async function handleReparse() {
    const invoiceId = invoice?.id || invoice?.invoice_number;
    if (!invoiceId) {
      showToast('Missing invoice identifier', 'error');
      return;
    }

    setReparsing(true);
    setReparseResult(null);

    try {
      const response = await csrfClient.post(`/api/invoices/${encodeURIComponent(invoiceId)}/reparse`, {});

      if (!response.ok) {
        throw new Error(response.error || 'Failed to re-parse invoice');
      }

      const result = response.data;
      setReparseResult(result);
      
      if (result.parsing_status === 'success') {
        showToast(`Invoice re-parsed successfully! Amount: $${result.amount || '0.00'}`, 'success');
        // Refresh invoice data to show updated values
        setTimeout(() => refreshInvoiceData(), 1500);
      } else if (result.parsing_status === 'partial') {
        showToast(`Invoice re-parsed with partial data. ${result.parsing_error || ''}`, 'warning');
        setTimeout(() => refreshInvoiceData(), 2000);
      } else {
        showToast(`Re-parsing failed: ${result.parsing_error || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      console.error('Reparse error:', err);
      showToast(`Re-parse failed: ${err.message}`, 'error');
    } finally {
      setReparsing(false);
    }
  }

  // Handle splitting a multi-invoice PDF into individual invoices
  async function handleSplitInvoice() {
    const invoiceId = invoice?.id || invoice?.invoice_number;
    if (!invoiceId) {
      showToast('Missing invoice identifier', 'error');
      return;
    }

    setSplitting(true);
    try {
      const response = await csrfClient.post(`/api/invoices/${encodeURIComponent(invoiceId)}/reparse`, {});

      if (!response.ok) {
        throw new Error(response.error || 'Split failed');
      }

      const result = response.data;

      if (result.multi_invoice) {
        showToast(`Document split into ${result.invoices_created} invoices`, 'success');
        // Original invoice is soft-deleted, navigate back to list
        setTimeout(() => onBack?.(), 1500);
      } else {
        showToast('No additional invoices detected in this document', 'info');
      }
    } catch (err) {
      console.error('Split error:', err);
      showToast(`Split failed: ${err.message}`, 'error');
    } finally {
      setSplitting(false);
    }
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

      // Call update API with corrected fields (including invoice number and dates)
      // Also pass userComment so the API can detect reclassification intent (e.g., "this is a receipt")
      const response = await csrfClient.post(`/api/invoices/${encodeURIComponent(invoiceId)}/update`, {
        vendor_name: details.vendor,
        office_id: details.office,
        amount_cents: amountCents,
        invoice_number: details.invoice,
        invoice_date: details.invoice_date,
        due_date: details.due_date,
        userComment: updateComment.trim() || undefined
      });

      // csrfClient returns { ok, status, data, error, errorData } not a Response object
      if (!response.ok) {
        // Check for duplicate invoice error (409 Conflict)
        if (response.status === 409 && response.errorData?.existingInvoiceId) {
          console.log('⚠️ Duplicate invoice detected:', response.errorData.existingInvoiceId);
          setDuplicateInvoiceId(response.errorData.existingInvoiceId);
          // Store the pending update data for retry
          setPendingUpdateData({
            vendor_name: details.vendor,
            office_id: details.office,
            amount_cents: amountCents,
            invoice_number: details.invoice,
            invoice_date: details.invoice_date,
            due_date: details.due_date,
            userComment: updateComment.trim() || undefined
          });
          setShowDuplicateModal(true);
          setProcessing(false);
          return;
        }
        throw new Error(response.error || 'Failed to update invoice');
      }

      console.log('✅ Invoice updated successfully');

      // Check if document was reclassified (moved to Other Documents)
      const updateResult = response.data || {};
      if (updateResult.reclassified) {
        showToast(
          `Document moved to Other Documents as ${updateResult.newDocumentTypeDisplay || updateResult.newDocumentType}`,
          'success'
        );
        // Navigate back to invoice list since this document is no longer an invoice
        if (onBack) {
          onBack();
        }
        return;
      }

      // Save GL Lines automatically if they exist
      // This ensures the user doesn't have to save GL Lines separately
      if (invoiceCategories && invoiceCategories.length > 0) {
        try {
          // Check if all categories have valid amounts
          const hasValidAmounts = invoiceCategories.every(cat => cat.amount && cat.amount > 0);
          
          if (hasValidAmounts) {
            console.log('💾 Auto-saving GL Lines with Update...');
            const glResponse = await fetch(`/api/invoices/${invoiceId}/invoice-categories`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ categories: invoiceCategories })
            });
            
            if (glResponse.ok) {
              const glData = await glResponse.json();
              console.log('✅ GL Lines saved automatically');
              // Update local state with saved data
              if (glData.categories) {
                setInvoiceCategories(glData.categories.map(cat => ({ ...cat, isEditing: false })));
              }
              if (glData.summary) {
                setAllocationSummary(glData.summary);
              }
            } else {
              const glError = await glResponse.json();
              console.warn('⚠️ GL Lines auto-save failed:', glError.message || glError.error);
              // Don't fail the whole update, just warn
              showToast(`Invoice updated, but GL Lines may need re-allocation: ${glError.message || 'Amount mismatch'}`, 'warning');
            }
          }
        } catch (glErr) {
          console.warn('⚠️ GL Lines auto-save error:', glErr);
          // Don't fail the whole update
        }
      }

      // Check if allocations were reset due to amount change
      if (updateResult.allocations_reset) {
        showToast('Invoice amount updated. GL line allocations have been reset to $0 - please re-allocate.', 'warning');
      }

      // Build corrected values for AI training
      const originalValues = {
        vendor_name: invoice?.vendor_name || invoice?.vendor || '',
        office_id: invoice?.office_id || invoice?.office || '',
        amount_cents: invoice?.amount_cents || 0,
        invoice_number: invoice?.invoice_number || invoice?.invoice || '',
        invoice_date: invoice?.invoice_date || '',
        due_date: invoice?.due_date || '',
      };

      const correctedValues = {
        vendor_name: details.vendor,
        office_id: details.office,
        amount_cents: amountCents,
        invoice_number: details.invoice,
        invoice_date: details.invoice_date,
        due_date: details.due_date,
      };

      // Check if any values changed
      const changedFields = Object.keys(correctedValues).filter(
        key => originalValues[key] !== correctedValues[key]
      );

      console.log('🔍 PCS AI Knowledge Base training check:', {
        originalValues,
        correctedValues,
        changedFields,
        hasComment: !!updateComment.trim(),
        willSend: changedFields.length > 0 || !!updateComment.trim()
      });

      // Send to PCS AI Knowledge Base training when fields change or comment provided
      const shouldSend = changedFields.length > 0 || updateComment.trim();
      console.log('🤖 Will send to PCS AI for KB training?', shouldSend, '- changedFields:', changedFields.length, 'hasComment:', !!updateComment.trim());

      if (shouldSend) {
        setImprovingParser(true);
        try {
          const vendorName = details.vendor || invoice?.vendor_name || invoice?.vendor || 'Unknown';
          const pdfPath = invoice?.pdf_path || invoice?.source_file || '';
          
          console.log('🤖 Sending corrections to PCS AI Knowledge Base training...', { vendorName, pdfPath });
          
          const gptTrainResponse = await fetch('/api/gpt-train', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              vendorName: vendorName,
              pdfPath: pdfPath,
              originalParsed: originalValues,
              correctedData: correctedValues,
              userComment: updateComment.trim() || null,
            })
          });

          const gptResult = await gptTrainResponse.json();

          if (gptTrainResponse.ok && gptResult.success) {
            console.log('✅ PCS AI Knowledge Base updated:', gptResult);
            showToast(`Knowledge base for ${vendorName} updated to v${gptResult.version}!`, 'success');
            
            // Start scanning other invoices with the updated knowledge base
            console.log('🔍 Starting scan of other invoices for vendor:', vendorName);
            setShowScanModal(true);
            setScanningInvoices(true);
            setImprovingParser(false);
            
            try {
              const scanResponse = await fetch('/api/invoices/scan-and-reparse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  vendorName: vendorName,
                  updatedPdfPath: pdfPath,
                  updatedInvoiceId: invoiceId,
                })
              });
              
              const scanResult = await scanResponse.json();
              console.log('✅ Scan complete:', scanResult);
              setScanResults(scanResult);
              setScanningInvoices(false);
              
              // Don't auto-reload - let user close the modal first
              return; // Exit early, user will close modal and page will reload then
            } catch (scanError) {
              console.warn('⚠️ Scan failed:', scanError);
              setScanningInvoices(false);
              setScanResults({ 
                success: false, 
                scanned: 0, 
                matched: 0, 
                reparsed: 0, 
                fixed: 0,
                errors: [scanError?.message || 'Scan failed'] 
              });
            }
          } else {
            console.warn('⚠️ PCS AI training failed:', gptResult.error);
            // Don't show error toast for training failures - the update still succeeded
            console.log('Note: Invoice update succeeded, but knowledge base training failed');
          }
        } catch (gptError) {
          console.warn('⚠️ Error calling PCS AI training:', gptError);
          // Don't show error toast - the invoice update still succeeded
          console.log('Note: Invoice update succeeded, but PCS AI training call failed');
        } finally {
          setImprovingParser(false);
        }
      }

      // Show final success message (allocation reset message may have already been shown)
      if (!updateResult.allocations_reset) {
        showToast('Invoice updated successfully! Changes are now reflected across the system.', 'success');
      }

      // Refresh invoice data after a short delay to show the toast
      setTimeout(() => {
        refreshInvoiceData();
      }, 2000);

    } catch (error) {
      console.error('❌ Error during invoice update:', error);
      const errorMsg = error?.message || 'Unknown error';
      showToast(`Error updating invoice: ${errorMsg}`, 'error');
    } finally {
      setProcessing(false);
    }
  }

  // Handle duplicate invoice - keep this invoice and delete the duplicate
  async function handleKeepThisDeleteDuplicate() {
    if (!duplicateInvoiceId || !pendingUpdateData) {
      showToast('Missing duplicate information', 'error');
      setShowDuplicateModal(false);
      return;
    }

    try {
      setProcessing(true);
      setShowDuplicateModal(false);

      const invoiceId = invoice?.id || invoice?.invoice_number;
      
      // First, delete the duplicate invoice
      console.log('🗑️ Deleting duplicate invoice:', duplicateInvoiceId);
      const deleteResponse = await csrfClient.post(`/api/invoices/${encodeURIComponent(duplicateInvoiceId)}/update`, {
        deleted: true
      });
      
      // Even if soft delete fails, try marking it as deleted via transition
      if (!deleteResponse.ok) {
        console.log('Trying transition endpoint to mark as deleted...');
        await fetch('/api/invoices/transition-db', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoiceId: duplicateInvoiceId,
            action: 'reject',
            reason: 'Duplicate invoice - keeping other version'
          })
        });
      }

      // Now retry the original update
      console.log('🔄 Retrying update for invoice:', invoiceId);
      const updateResponse = await csrfClient.post(`/api/invoices/${encodeURIComponent(invoiceId)}/update`, pendingUpdateData);

      if (!updateResponse.ok) {
        throw new Error(updateResponse.error || 'Failed to update invoice after deleting duplicate');
      }

      showToast('Invoice updated successfully! The duplicate has been removed.', 'success');
      
      // Clear state
      setDuplicateInvoiceId(null);
      setPendingUpdateData(null);
      
      // Refresh data
      setTimeout(() => {
        refreshInvoiceData();
      }, 1000);

    } catch (error) {
      console.error('❌ Error handling duplicate:', error);
      showToast(`Error: ${error?.message || 'Failed to process duplicate'}`, 'error');
    } finally {
      setProcessing(false);
    }
  }

  // Handle duplicate invoice - delete this invoice and keep the other one
  async function handleDeleteThisKeepOther() {
    if (!invoice) {
      showToast('Missing invoice information', 'error');
      setShowDuplicateModal(false);
      return;
    }

    try {
      setProcessing(true);
      setShowDuplicateModal(false);

      const invoiceId = invoice?.id || invoice?.invoice_number;
      
      // Delete this invoice by transitioning to rejected
      console.log('🗑️ Deleting this invoice:', invoiceId);
      const response = await fetch('/api/invoices/transition-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: invoiceId,
          action: 'reject',
          reason: 'Duplicate invoice - keeping other version'
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete this invoice');
      }

      showToast('This invoice has been removed. The other invoice will be kept.', 'success');
      
      // Clear state
      setDuplicateInvoiceId(null);
      setPendingUpdateData(null);
      
      // Navigate back to the list
      if (onBack) {
        setTimeout(() => onBack(), 1500);
      }

    } catch (error) {
      console.error('❌ Error deleting invoice:', error);
      showToast(`Error: ${error?.message || 'Failed to delete invoice'}`, 'error');
    } finally {
      setProcessing(false);
    }
  }

  // Cancel the duplicate handling modal
  function handleCancelDuplicateModal() {
    setShowDuplicateModal(false);
    setDuplicateInvoiceId(null);
    setPendingUpdateData(null);
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

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to get PCS AI response');
      }

      setChatMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (error) {
      console.error('Error sending chat message:', error);
      const errorMessage = error.message || 'Sorry, I encountered an error. Please try again.';
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: errorMessage,
      }]);
      showToast(errorMessage, 'error');
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
      // Get QBO Bill Pay redirect URL
      showToast('Getting QuickBooks payment link...', 'info');
      const response = await csrfClient.post('/api/invoices/pay', { invoiceIds: [invoiceId] });
      const payload = response.data || {};
      
      if (!response.ok || !payload?.ok) {
        const errorMsg = payload?.results?.[0]?.error || payload?.error || 'Failed to get payment link';
        showToast(errorMsg, 'error');
        return;
      }

      // Check if we got a valid QBO Bill Pay URL
      const result = payload.results?.[0];
      if (result?.ok && result?.payUrl) {
        showToast('Opening QuickBooks Bill Pay in new tab...', 'success');
        // Open QBO Bill Pay in a new tab
        window.open(result.payUrl, '_blank', 'noopener,noreferrer');
        
        // Show instructions to user
        setTimeout(() => {
          showToast('Complete payment in QuickBooks. The invoice status will update automatically.', 'info');
        }, 1500);
      } else {
        showToast(`Unable to get payment link: ${result?.error || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      showToast(err?.message || 'Unexpected error while getting payment link', 'error');
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

  // Determine which buttons to show based on invoice status AND user role
  function getActionButtons() {
    const status = (invoice?.status || 'incoming').toLowerCase();
    
    // Role-based access checks
    const canUpdate = permissions.canUpdateInvoices;
    const canPay = permissions.canPayInvoices;
    const canApprove = permissions.canApproveInvoices;
    const canReject = permissions.canRejectInvoices;

    console.log('🔍 InvoiceDetailPage Debug:');
    console.log('  - Invoice Number:', invoice?.invoice_number);
    console.log('  - Status:', status);
    console.log('  - User Role:', permissions.role);
    console.log('  - Can Pay:', canPay, 'Can Update:', canUpdate);

    if (status === 'removed') {
      return []; // No buttons for removed invoices
    }

    if (status === 'completed' || status === 'paid') {
      // Only admins/AP can remove completed invoices
      if (canUpdate) {
        return [
          { label: 'Remove', onClick: handleRemoveCompletely, style: { ...actionButtonStyle, backgroundColor: '#dc2626', color: '#ffffff', borderColor: '#dc2626' } }
        ];
      }
      return [];
    }

    // For invoices ready to be paid (to_be_paid status)
    // Office managers should NOT see this status (filtered at NavBar level), but handle just in case
    if (status === 'to_be_paid') {
      const buttons = [];
      if (canPay) {
        buttons.push({ label: 'Pay', onClick: handlePaid, style: { ...actionButtonStyle, backgroundColor: '#059669', color: '#ffffff', borderColor: '#059669' } });
      }
      if (canReject) {
        buttons.push({ label: 'Reject', onClick: handleReject, style: { ...actionButtonStyle, backgroundColor: '#dc2626', color: '#ffffff', borderColor: '#dc2626' } });
      }
      if (canUpdate) {
        buttons.push({ label: 'Update', onClick: handleUpdateClick, style: { ...actionButtonStyle, backgroundColor: '#d97706', color: '#ffffff', borderColor: '#d97706' } });
      }
      return buttons;
    }

    // For all other statuses (incoming, awaiting_office_approval, awaiting_admin_approval, etc.)
    const buttons = [];
    
    // NEW: Verifier workflow (e.g., Laura with TC Dental only access)
    // Verifiers see "Send" and "Reject" buttons instead of "Approve", "Reject", "Update"
    if (isVerifier) {
      // Send button - combines AI training + QBO bill creation + route to approver
      buttons.push({ 
        label: 'Send', 
        onClick: handleSend, 
        style: { ...actionButtonStyle, backgroundColor: '#059669', color: '#ffffff', borderColor: '#059669' } 
      });
      // Reject button
      buttons.push({ 
        label: 'Reject', 
        onClick: handleReject, 
        style: { ...actionButtonStyle, backgroundColor: '#dc2626', color: '#ffffff', borderColor: '#dc2626' } 
      });
      return buttons;
    }
    
    // Standard workflow: Office managers can approve/reject but NOT update
    if (canApprove) {
      buttons.push({ label: 'Approve', onClick: handleApprove, style: { ...actionButtonStyle, backgroundColor: '#059669', color: '#ffffff', borderColor: '#059669' } });
    }
    if (canReject) {
      buttons.push({ label: 'Reject', onClick: handleReject, style: { ...actionButtonStyle, backgroundColor: '#dc2626', color: '#ffffff', borderColor: '#dc2626' } });
    }
    // Update button only for admins and AP managers
    if (canUpdate) {
      buttons.push({ label: 'Update', onClick: handleUpdateClick, style: { ...actionButtonStyle, backgroundColor: '#d97706', color: '#ffffff', borderColor: '#d97706' } });
    }

    return buttons;
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
    border: '1px solid #357ab2',
    borderRadius: '16px',
    overflow: 'hidden',
  };
  const leftColumnStyle = {
    borderRight: '1px solid #357ab2',
  };
  const rightColumnStyle = {
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
    borderCollapse: 'separate',
    borderSpacing: 0,
    borderLeft: '1px solid #357ab2',
    borderTop: '1px solid #357ab2',
    borderRadius: '16px',
    overflow: 'hidden',
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

      {/* Parsing Error Warning Banner - Show for failed/partial parses or $0 amounts */}
      {(invoice?.parsing_status === 'failed' || invoice?.parsing_status === 'partial' || 
        (invoice?.amount_cents === 0 && invoice?.pdf_path)) && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          marginBottom: '24px',
          padding: '16px 20px',
          backgroundColor: '#fef2f2',
          borderRadius: '16px',
          border: '1px solid #fca5a5',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flex: 1,
          }}>
            <span style={{ fontSize: '24px' }}>⚠️</span>
            <div>
              <div style={{ fontWeight: '600', color: '#b91c1c', marginBottom: '4px' }}>
                Parsing Issue Detected
              </div>
              <div style={{ fontSize: '14px', color: '#7f1d1d' }}>
                {invoice?.parsing_error || 'This invoice may have incomplete or missing data extracted from the PDF.'}
                {invoice?.parse_attempts > 0 && (
                  <span style={{ marginLeft: '8px', color: '#9ca3af', fontSize: '12px' }}>
                    (Attempted {invoice.parse_attempts} time{invoice.parse_attempts > 1 ? 's' : ''})
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={handleReparse}
            disabled={reparsing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: '600',
              border: 'none',
              backgroundColor: reparsing ? '#9ca3af' : '#357ab2',
              color: '#ffffff',
              cursor: reparsing ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              transition: 'background-color 0.2s ease',
            }}
          >
            {reparsing ? (
              <>
                <i className="fas fa-spinner fa-spin"></i>
                Re-parsing...
              </>
            ) : (
              <>
                <i className="fas fa-robot"></i>
                Send back to PCS AI Bot
              </>
            )}
          </button>
        </div>
      )}

      {/* Reparse Result Message */}
      {reparseResult && (
        <div style={{
          marginBottom: '16px',
          padding: '12px 16px',
          borderRadius: '12px',
          backgroundColor: reparseResult.parsing_status === 'success' ? '#d1fae5' : 
                          reparseResult.parsing_status === 'partial' ? '#fef3c7' : '#fee2e2',
          border: `1px solid ${reparseResult.parsing_status === 'success' ? '#34d399' : 
                              reparseResult.parsing_status === 'partial' ? '#fbbf24' : '#f87171'}`,
          color: reparseResult.parsing_status === 'success' ? '#047857' : 
                 reparseResult.parsing_status === 'partial' ? '#92400e' : '#b91c1c',
        }}>
          <strong>{reparseResult.message}</strong>
          {reparseResult.amount && <span style={{ marginLeft: '8px' }}>Amount: ${reparseResult.amount}</span>}
        </div>
      )}

      {/* Send-to row: left-aligned Send-to pill + right-aligned Split button */}
      {(reassignmentTargets.length > 0 || !invoice?.document_group_id) && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}>
          {/* Left side: Send-to controls (fit-content width) */}
          {reassignmentTargets.length > 0 ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px',
              backgroundColor: '#f8f9fa',
              borderRadius: '12px',
              border: '1px solid #e0e0e0',
              width: 'fit-content',
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
                  borderRadius: '12px',
                  border: '1px solid #cbd5e0',
                  fontSize: '14px',
                  backgroundColor: '#ffffff',
                  cursor: 'pointer',
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
                    borderRadius: '12px',
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
          ) : <div />}

          {/* Right side: Split button in blue pill badge (only when not already split) */}
          {!invoice?.document_group_id && (
            <div
              style={{
                backgroundColor: '#ebf8ff',
                border: '1px solid #90cdf4',
                borderRadius: '12px',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 'fit-content',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              <button
                onClick={handleSplitInvoice}
                disabled={splitting}
                title="Split if the PDF below contains multiple invoices"
                style={{
                  padding: '8px 18px',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: '600',
                  border: 'none',
                  backgroundColor: '#2b6cb0',
                  color: '#ffffff',
                  cursor: splitting ? 'not-allowed' : 'pointer',
                  opacity: splitting ? 0.6 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {splitting ? 'Splitting...' : 'Split'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Multi-invoice document banner - shown prominently when document contains multiple invoices */}
      {invoice?.document_group_id && invoice?.document_invoice_total > 1 && (
        <div style={{
          backgroundColor: '#ebf8ff',
          border: '1px solid #90cdf4',
          borderRadius: '12px',
          padding: '14px 18px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          <div>
            <span style={{ fontWeight: '600', color: '#2b6cb0', fontSize: '15px' }}>
              This is invoice {invoice.document_invoice_index} of {invoice.document_invoice_total}
            </span>
            <span style={{ color: '#4a5568', marginLeft: '8px' }}>
              presented in this document
            </span>
          </div>
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
                      {permissions.canEditInvoices ? (
                        <input
                          type="text"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          style={{
                            border: '1px solid #cbd5e0',
                            borderRadius: '12px',
                            padding: '4px 8px',
                            fontSize: '14px',
                            width: '80px',
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: '14px', color: '#2d3748' }}>{paymentAmount}</span>
                      )}
                    </td>
                    <td style={{ ...cellStyle, fontWeight: '600', color: statusMeta.fg }}>
                      {statusValue === 'paid' || statusValue === 'completed' ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: '#065f46' }}>Completed</span>
                          {invoice?.qbo_bill_id && (
                            <a
                              href={`https://app.qbo.intuit.com/app/bill?txnId=${invoice.qbo_bill_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: '#357ab2',
                                textDecoration: 'underline',
                                fontWeight: '500',
                              }}
                            >
                              View Receipt
                            </a>
                          )}
                        </span>
                      ) : (
                        statusMeta.label
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Invoice Details section */}
          <div style={{ ...sectionStyle, position: 'relative', zIndex: 100, overflow: 'visible' }}>
            <h2 style={sectionTitleStyle}>Invoice Details</h2>
            <table style={{ ...tableStyle, overflow: 'visible' }}>
              <tbody>
                <tr>
                  <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>Invoice #</td>
                  <td style={cellStyle}>
                    {permissions.canEditInvoices ? (
                      <input
                        type="text"
                        value={details.invoice}
                        onChange={(e) => handleDetailChange('invoice', e.target.value)}
                        style={{
                          border: '1px solid #cbd5e0',
                          borderRadius: '12px',
                          padding: '4px 8px',
                          fontSize: '14px',
                          width: 'calc(100% - 16px)',
                          boxSizing: 'border-box',
                        }}
                      />
                    ) : (
                      <span style={{ fontSize: '14px', color: '#2d3748' }}>{details.invoice}</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>Invoice Date</td>
                  <td style={cellStyle}>
                    {permissions.canEditInvoices ? (
                      <input
                        type="text"
                        value={details.invoice_date}
                        onChange={(e) => handleDetailChange('invoice_date', e.target.value)}
                        style={{
                          border: '1px solid #cbd5e0',
                          borderRadius: '12px',
                          padding: '4px 8px',
                          fontSize: '14px',
                          width: 'calc(100% - 16px)',
                          boxSizing: 'border-box',
                        }}
                      />
                    ) : (
                      <span style={{ fontSize: '14px', color: '#2d3748' }}>{details.invoice_date || 'N/A'}</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>Due Date</td>
                  <td style={cellStyle}>
                    {permissions.canEditInvoices ? (
                      <input
                        type="text"
                        value={details.due_date}
                        onChange={(e) => handleDetailChange('due_date', e.target.value)}
                        style={{
                          border: '1px solid #cbd5e0',
                          borderRadius: '12px',
                          padding: '4px 8px',
                          fontSize: '14px',
                          width: 'calc(100% - 16px)',
                          boxSizing: 'border-box',
                        }}
                      />
                    ) : (
                      <span style={{ fontSize: '14px', color: '#2d3748' }}>{details.due_date || 'N/A'}</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>Vendor</td>
                  <td style={{ ...cellStyle, position: 'relative', overflow: 'visible' }}>
                    {permissions.canEditInvoices ? (
                    <div style={{ position: 'relative', zIndex: 1000 }}>
                      <SearchableSelect
                        options={(() => {
                          // If current vendor exists and isn't in the QBO list, add it as a custom option
                          const currentVendor = details.vendor;
                          if (currentVendor && !qboVendors.find(v => v.name === currentVendor && v.id !== '__add_new__')) {
                            return [
                              { id: '__add_new__', name: '+ Add New Vendor', displayName: '+ Add New Vendor' },
                              { id: `__current__`, name: currentVendor, displayName: `${currentVendor} (current)` },
                              ...qboVendors.filter(v => v.id !== '__add_new__')
                            ];
                          }
                          return qboVendors;
                        })()}
                        value={(() => {
                          const currentVendor = details.vendor;
                          if (!currentVendor) return '';
                          const match = qboVendors.find(v => v.name === currentVendor && v.id !== '__add_new__');
                          if (match) return match.id;
                          // Return custom ID if vendor exists but not in QBO list
                          return '__current__';
                        })()}
                        onChange={(id, displayText) => {
                          if (id === '__add_new__') {
                            setShowAddVendorModal(true);
                          } else {
                            // Remove "(current)" suffix if present
                            const cleanName = displayText.replace(' (current)', '');
                            handleDetailChange('vendor', cleanName);
                          }
                        }}
                        placeholder={loadingVendors ? 'Loading vendors...' : 'Select vendor...'}
                        displayKey="displayName"
                        valueKey="id"
                        disabled={loadingVendors}
                        style={{ width: '100%' }}
                      />
                    </div>
                    ) : (
                      <span style={{ fontSize: '14px', color: '#2d3748' }}>{details.vendor || 'N/A'}</span>
                    )}
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
              borderRadius: '12px',
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
                  borderRadius: '20px', 
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
                  borderRadius: '20px', 
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
                      borderRadius: '12px',
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
                                  borderRadius: '9999px',
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
                                    borderRadius: '12px',
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

                          {/* Account searchable dropdown */}
                          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            <div style={{ flex: '1 1 300px' }}>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '4px' }}>
                                Account *
                              </label>
                              <SearchableSelect
                                key={`account-${index}-${cat.id || index}`}
                                options={categories}
                                value={cat.categoryId || ''}
                                initialDisplayValue={cat.categoryName || ''}
                                onChange={(id, displayText) => {
                                  updateInvoiceCategory(index, 'category', id, displayText);
                                }}
                                placeholder="Type to search accounts..."
                                valueKey="id"
                                getDisplayText={(opt) => opt?.displayText || opt?.fullName || opt?.name || ''}
                              />
                            </div>

                            {/* Class searchable dropdown */}
                            <div style={{ flex: '1 1 200px' }}>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '4px' }}>
                                Class (Location)
                              </label>
                              <SearchableSelect
                                key={`class-${index}-${cat.id || index}`}
                                options={qboClasses}
                                value={cat.classId || ''}
                                initialDisplayValue={cat.className || ''}
                                onChange={(id, displayText) => {
                                  updateInvoiceCategory(index, 'class', id, displayText);
                                }}
                                placeholder="Type to search classes..."
                                valueKey="id"
                                getDisplayText={(opt) => opt?.fullName || opt?.name || ''}
                              />
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
                                    borderRadius: '12px',
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
                                borderRadius: '12px',
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
                                  borderRadius: '12px'
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
                                  borderRadius: '12px',
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
                                    borderRadius: '12px',
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

            {/* Add GL Line, Save, and Create Template buttons */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <button
                onClick={addInvoiceCategory}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '9999px',
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
                  borderRadius: '9999px',
                  cursor: (processing || Math.abs(allocationSummary.unallocated) > 0.01) ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  opacity: (processing || Math.abs(allocationSummary.unallocated) > 0.01) ? 0.6 : 1
                }}
                title={Math.abs(allocationSummary.unallocated) > 0.01 ? 'Cannot save: Unallocated amount must be $0.00' : ''}
              >
                {processing ? 'Saving...' : 'Save GL Lines'}
              </button>

              {/* Create Template button - always show when there are GL lines */}
              {invoiceCategories.length > 0 && (
                <button
                  onClick={() => setShowCreateTemplateModal(true)}
                  disabled={Math.abs(allocationSummary.unallocated) > 0.01}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: Math.abs(allocationSummary.unallocated) > 0.01 ? '#9ca3af' : '#8b5cf6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '9999px',
                    cursor: Math.abs(allocationSummary.unallocated) > 0.01 ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    opacity: Math.abs(allocationSummary.unallocated) > 0.01 ? 0.6 : 1
                  }}
                  title={Math.abs(allocationSummary.unallocated) > 0.01 ? 'Allocate all amounts before creating a template' : 'Save current GL lines as a reusable template'}
                >
                  Create Template
                </button>
              )}
            </div>

            {/* Templates Dropdown - for applying existing templates */}
            {availableTemplates.length > 0 && (
              <div style={{
                padding: '12px 16px',
                backgroundColor: '#f3f4f6',
                borderRadius: '12px',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                    Templates:
                  </label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    disabled={loadingTemplates || applyingTemplate}
                    style={{
                      padding: '8px 12px',
                      border: suggestedTemplateId && selectedTemplateId === suggestedTemplateId ? '2px solid #10b981' : '1px solid #d1d5db',
                      borderRadius: '12px',
                      fontSize: '14px',
                      backgroundColor: 'white',
                      minWidth: '200px',
                      cursor: loadingTemplates ? 'wait' : 'pointer'
                    }}
                  >
                    <option value="">-- Select a template --</option>
                    {availableTemplates.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.allocation_mode === 'percentage' ? 'Percent' : t.allocation_mode === 'fixed_amount' ? 'Fixed' : t.allocation_mode === 'split_evenly_all_classes' ? 'All Locations' : 'Even Split'}){t.id === suggestedTemplateId ? ' - Suggested' : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleApplyTemplate}
                    disabled={!selectedTemplateId || applyingTemplate}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: (!selectedTemplateId || applyingTemplate) ? '#9ca3af' : '#2563eb',
                      color: 'white',
                      border: 'none',
                      borderRadius: '9999px',
                      cursor: (!selectedTemplateId || applyingTemplate) ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: '500',
                      opacity: (!selectedTemplateId || applyingTemplate) ? 0.6 : 1
                    }}
                  >
                    {applyingTemplate ? 'Applying...' : 'Apply Template'}
                  </button>
                  <span style={{ fontSize: '12px', color: suggestedTemplateId ? '#10b981' : '#6b7280' }}>
                    {suggestedTemplateId ? `Suggested: ${suggestedTemplateName}` : 'Apply a saved template to auto-fill GL lines'}
                  </span>
                </div>
              </div>
            )}
          </div>

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
                    borderCollapse: 'separate',
                    borderSpacing: 0,
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    overflow: 'hidden',
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
                placeholder="Add notes about this invoice parsing, categorization, or any feedback for PCS AI..."
                rows={4}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #cbd5e0',
                  borderRadius: '12px',
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
                        showToast('Notes saved and sent to PCS AI', 'success');
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
                    borderRadius: '9999px',
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
                        borderRadius: '12px',
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
                    borderRadius: '9999px',
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
                    borderRadius: '12px',
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
                            borderRadius: '16px',
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
                        borderRadius: '12px',
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
                        borderRadius: '9999px',
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
            <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '600px' }}>
              {/* Loading overlay */}
              {pdfLoadState === 'loading' && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#f8fafc',
                  zIndex: 1,
                }}>
                  <i className="fas fa-spinner fa-spin" style={{ fontSize: '32px', color: '#357ab2', marginBottom: '12px' }}></i>
                  <span style={{ color: '#666', fontSize: '14px' }}>Loading PDF...</span>
                </div>
              )}
              {/* Error state */}
              {pdfLoadState === 'error' && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#fef2f2',
                  zIndex: 1,
                }}>
                  <i className="fas fa-file-pdf" style={{ fontSize: '48px', color: '#dc2626', marginBottom: '12px' }}></i>
                  <span style={{ color: '#991b1b', fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>PDF not found</span>
                  <span style={{ color: '#666', fontSize: '13px', textAlign: 'center', maxWidth: '300px' }}>
                    The PDF file could not be loaded. It may have been moved or deleted.
                  </span>
                </div>
              )}
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
                  // Otherwise treat as relative path - extract filename and use API
                  const filename = p.split('/').pop();
                  return `/api/pdf/${filename}`;
                })()}
                onLoad={() => setPdfLoadState('loaded')}
                onError={() => setPdfLoadState('error')}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  minHeight: '600px',
                  display: pdfLoadState === 'error' ? 'none' : 'block',
                }}
                title="Invoice PDF"
              />
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              minHeight: '600px',
              backgroundColor: '#f8fafc',
            }}>
              <i className="fas fa-file-alt" style={{ fontSize: '48px', color: '#9ca3af', marginBottom: '12px' }}></i>
              <span style={{ color: '#6b7280', fontSize: '16px', fontWeight: '500' }}>No PDF attached</span>
              <span style={{ color: '#9ca3af', fontSize: '13px', marginTop: '4px' }}>
                This invoice does not have a PDF document
              </span>
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
            borderRadius: '20px',
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
                borderRadius: '16px',
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
                  borderRadius: '12px',
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
                  borderRadius: '12px',
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
            borderRadius: '20px',
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
              borderRadius: '16px',
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
                  borderRadius: '12px',
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

      {/* Duplicate Invoice Confirmation Modal */}
      {showDuplicateModal && (
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
            borderRadius: '20px',
            padding: '28px',
            maxWidth: '520px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            border: '2px solid #f59e0b',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: '#fef3c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
              }}>
                ⚠️
              </div>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '600', color: '#b45309' }}>
                Duplicate Invoice Found
              </h3>
            </div>
            
            <p style={{ margin: '0 0 20px 0', fontSize: '15px', color: '#374151', lineHeight: '1.6' }}>
              There is already an invoice with this number (<strong>{pendingUpdateData?.invoice_number}</strong>) for vendor <strong>{pendingUpdateData?.vendor_name}</strong>. 
              Would you like to proceed?
            </p>
            
            <div style={{
              backgroundColor: '#fffbeb',
              border: '1px solid #fcd34d',
              borderRadius: '16px',
              padding: '16px',
              marginBottom: '24px',
            }}>
              <p style={{ margin: 0, fontSize: '14px', color: '#92400e', lineHeight: '1.5' }}>
                <strong>Choose an option below:</strong>
              </p>
            </div>
            
            {/* Option 1: Keep this, delete duplicate */}
            <button
              onClick={handleKeepThisDeleteDuplicate}
              disabled={processing}
              style={{
                width: '100%',
                padding: '14px 20px',
                backgroundColor: '#357ab2',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: processing ? 'not-allowed' : 'pointer',
                opacity: processing ? 0.6 : 1,
                marginBottom: '12px',
                textAlign: 'left',
              }}
            >
              <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                Yes, update this invoice and delete the duplicate
              </div>
              <div style={{ fontSize: '12px', opacity: 0.9 }}>
                This invoice will be updated with your changes, and the other duplicate will be removed.
              </div>
            </button>
            
            {/* Option 2: Delete this, keep other */}
            <button
              onClick={handleDeleteThisKeepOther}
              disabled={processing}
              style={{
                width: '100%',
                padding: '14px 20px',
                backgroundColor: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: processing ? 'not-allowed' : 'pointer',
                opacity: processing ? 0.6 : 1,
                marginBottom: '12px',
                textAlign: 'left',
              }}
            >
              <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                No, delete this invoice and keep the other one
              </div>
              <div style={{ fontSize: '12px', opacity: 0.9 }}>
                This invoice will be removed, and the existing duplicate will be kept unchanged.
              </div>
            </button>
            
            {/* Option 3: Cancel */}
            <button
              onClick={handleCancelDuplicateModal}
              disabled={processing}
              style={{
                width: '100%',
                padding: '12px 20px',
                backgroundColor: 'white',
                color: '#6b7280',
                border: '2px solid #d1d5db',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: processing ? 'not-allowed' : 'pointer',
                opacity: processing ? 0.6 : 1,
              }}
            >
              Cancel - Go back without making changes
            </button>
          </div>
        </div>
      )}

      {/* Scanning Other Invoices Modal */}
      {showScanModal && (
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
            borderRadius: '20px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            border: scanningInvoices ? '2px solid #357ab2' : '2px solid #16a34a',
          }}>
            {scanningInvoices ? (
              // Scanning in progress
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: '#e8f4fc',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <i className="fas fa-sync-alt fa-spin" style={{ color: '#357ab2', fontSize: '18px' }}></i>
                  </div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#357ab2' }}>
                    Scanning Other Invoices...
                  </h3>
                </div>
                
                <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#374151', lineHeight: '1.5' }}>
                  The AI is comparing this invoice with others from the same vendor to apply the updated knowledge base.
                </p>
                
                <div style={{
                  backgroundColor: '#fef3c7',
                  border: '1px solid #fcd34d',
                  borderRadius: '16px',
                  padding: '12px 16px',
                  marginBottom: '16px',
                }}>
                  <p style={{ margin: 0, fontSize: '13px', color: '#92400e', fontWeight: '500' }}>
                    Please do not update another invoice until this scan completes.
                  </p>
                </div>
                
                <div style={{
                  height: '4px',
                  backgroundColor: '#e5e7eb',
                  borderRadius: '2px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: '100%',
                    backgroundColor: '#357ab2',
                    animation: 'scan-progress 2s ease-in-out infinite',
                  }}></div>
                </div>
                <style>{`
                  @keyframes scan-progress {
                    0% { transform: translateX(-100%); }
                    50% { transform: translateX(0%); }
                    100% { transform: translateX(100%); }
                  }
                `}</style>
              </>
            ) : (
              // Scan complete
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: '#dcfce7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                  }}>
                    ✓
                  </div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#16a34a' }}>
                    Scan Complete!
                  </h3>
                </div>
                
                {scanResults && (
                  <div style={{
                    backgroundColor: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '16px',
                    padding: '12px 16px',
                    marginBottom: '20px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
                      <span style={{ color: '#6b7280' }}>Invoices Scanned:</span>
                      <span style={{ fontWeight: '600', color: '#1f2937' }}>{scanResults.scanned}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
                      <span style={{ color: '#6b7280' }}>Similar Matches:</span>
                      <span style={{ fontWeight: '600', color: '#1f2937' }}>{scanResults.matched}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
                      <span style={{ color: '#6b7280' }}>Re-parsed:</span>
                      <span style={{ fontWeight: '600', color: '#16a34a' }}>{scanResults.reparsed}</span>
                    </div>
                    {scanResults.fixed > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', paddingTop: '8px', borderTop: '1px solid #bbf7d0' }}>
                        <span style={{ color: '#16a34a', fontWeight: '600' }}>Fixed from Failed Queue:</span>
                        <span style={{ fontWeight: '700', color: '#16a34a' }}>{scanResults.fixed}</span>
                      </div>
                    )}
                    {scanResults.errors && scanResults.errors.length > 0 && (
                      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #fecaca' }}>
                        <span style={{ color: '#dc2626', fontSize: '13px' }}>
                          {scanResults.errors.length} error(s) occurred
                        </span>
                      </div>
                    )}
                  </div>
                )}
                
                <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#6b7280' }}>
                  The updated knowledge base has been applied to similar invoices. You can now continue updating other invoices.
                </p>
                
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => {
                      setShowScanModal(false);
                      setScanResults(null);
                      // Refresh invoice data to show updated values
                      refreshInvoiceData();
                    }}
                    style={{
                      padding: '10px 24px',
                      backgroundColor: '#16a34a',
                      color: 'white',
                      border: 'none',
                      borderRadius: '12px',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer',
                    }}
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Create Template Modal */}
      {showCreateTemplateModal && (
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
            borderRadius: '20px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600', color: '#1f2937' }}>
                Create Template from GL Lines
              </h2>
              <button
                onClick={() => {
                  setShowCreateTemplateModal(false);
                  setNewTemplateName('');
                  setNewTemplateDescription('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#9ca3af',
                  padding: '0',
                  lineHeight: '1',
                }}
              >
                &times;
              </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                Template Name *
              </label>
              <input
                type="text"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="e.g., Monthly IT Split - 3 Locations"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '12px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                Description (optional)
              </label>
              <textarea
                value={newTemplateDescription}
                onChange={(e) => setNewTemplateDescription(e.target.value)}
                placeholder="Describe when to use this template..."
                rows={2}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '12px',
                  fontSize: '14px',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                Allocation Mode
              </label>
              <select
                value={newTemplateAllocationMode}
                onChange={(e) => setNewTemplateAllocationMode(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '12px',
                  fontSize: '14px',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                }}
              >
                <option value="split_evenly">Split Evenly - Divide total equally among lines</option>
                <option value="percentage">Percent Split - Use percentages from current amounts</option>
                <option value="fixed_amount">Fixed Amount - Save exact dollar amounts</option>
              </select>
            </div>

            <div style={{
              backgroundColor: '#f3f4f6',
              borderRadius: '12px',
              padding: '12px',
              marginBottom: '20px',
            }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                Template Preview ({invoiceCategories.length} GL Lines)
              </div>
              {invoiceCategories.map((cat, index) => {
                const totalAmount = invoiceCategories.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
                const percentage = totalAmount > 0 ? ((parseFloat(cat.amount) || 0) / totalAmount * 100).toFixed(1) : 0;
                return (
                  <div key={index} style={{ fontSize: '12px', color: '#6b7280', padding: '4px 0', borderBottom: index < invoiceCategories.length - 1 ? '1px solid #e5e7eb' : 'none' }}>
                    <span style={{ fontWeight: '500' }}>{cat.categoryName || 'No account'}</span>
                    {cat.className && <span> - {cat.className}</span>}
                    <span style={{ float: 'right', color: '#059669' }}>
                      {newTemplateAllocationMode === 'percentage' ? `${percentage}%` : `$${(cat.amount || 0).toFixed(2)}`}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{
              backgroundColor: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '12px',
              padding: '12px',
              marginBottom: '20px',
              fontSize: '13px',
              color: '#1e40af',
            }}>
              <strong>Note:</strong> This template will save the GL line structure with the selected allocation mode. When applied to a new invoice, amounts will be calculated based on that invoice's total.
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowCreateTemplateModal(false);
                  setNewTemplateName('');
                  setNewTemplateDescription('');
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTemplateFromInvoice}
                disabled={!newTemplateName.trim() || creatingTemplate}
                style={{
                  padding: '10px 20px',
                  backgroundColor: (!newTemplateName.trim() || creatingTemplate) ? '#9ca3af' : '#8b5cf6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: (!newTemplateName.trim() || creatingTemplate) ? 'not-allowed' : 'pointer',
                  opacity: (!newTemplateName.trim() || creatingTemplate) ? 0.6 : 1,
                }}
              >
                {creatingTemplate ? 'Creating...' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Progress Modal for Verifiers */}
      <SendProgressModal
        isOpen={showSendModal}
        onClose={() => {
          setShowSendModal(false);
          setSendStep1Status('idle');
          setSendStep2Status('idle');
        }}
        onComplete={handleSendComplete}
        step1Status={sendStep1Status}
        step2Status={sendStep2Status}
        step1Error={sendStep1Error}
        step2Error={sendStep2Error}
      />

      <Toast message={toast?.message} variant={toast?.variant} onDismiss={dismissToast} />
      
      {/* Add New Vendor Modal */}
      <AddNewVendorModal
        isOpen={showAddVendorModal}
        onClose={() => setShowAddVendorModal(false)}
      />
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
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '12px', border: '1px solid #357ab2', borderRadius: '12px', overflow: 'hidden' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f3f4f6' }}>
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
