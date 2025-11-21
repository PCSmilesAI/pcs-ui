import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import InvoiceTable from '../components/InvoiceTable.jsx';
import { useInvoiceClick } from '../context/InvoiceClickContext';
import { useInvoiceData } from '../context/InvoiceDataContext';
import { useVendorAchMap } from '../ui/ach/useVendorAch';
import Toast from '../components/Toast.jsx';
import { formatStatusForDisplay } from '../../lib/invoices/stateMachine';
import { getDisplayVendorName } from '../lib/vendorUtils';

// Dynamically import the modal to avoid SSR issues
const CreateInvoiceModal = dynamic(() => import('../../components/invoices/CreateInvoiceModal'), { ssr: false });

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

function ForMePageImpl({ searchQuery = '', filters = {} }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { handleInvoiceRowClick } = useInvoiceClick();
  const { setInvoices: setContextInvoices } = useInvoiceData();
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [toast, setToast] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const getRowId = (r, i) =>
    r.id ||
    r.invoice_number ||
    r.json_path ||
    r.pdf_path ||
    r.source_file ||
    `${r.vendor || 'v'}_${r.invoice || 'inv'}_${r.timestamp || i}`;

  const showToast = useCallback((message, variant = 'info') => {
    setToast({ message, variant, at: Date.now() });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  const transformInvoice = useCallback((invoice) => {
    const vendorName = getDisplayVendorName(invoice.vendor_name || invoice.vendor);
    const rawInvoiceDate = invoice.invoice_date || null;
    const rawDueDate = invoice.due_date || null;
    const officeRaw = invoice.office_location || invoice.office || invoice.clinic_id || '';
    const formatDate = (dateString) => {
      if (!dateString) return 'N/A';
      const parsed = new Date(dateString);
      if (Number.isNaN(parsed.getTime())) return 'N/A';
      return parsed.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
    };
    // Amount is stored in cents in the database, convert to dollars
    const amountCents = invoice.amount_cents ?? invoice.invoice_total ?? invoice.total ?? invoice.amount ?? 0;
    const parsedAmount =
      typeof amountCents === 'number'
        ? amountCents / 100  // Convert cents to dollars
        : Number.parseFloat(String(amountCents || '0').replace(/[^0-9.-]/g, '')) / 100;

    return {
      id: invoice.id || invoice.invoice_number || invoice.invoice || invoice.source_file || null,
      invoice: invoice.invoice_number || invoice.invoice || 'Unknown',
      invoice_number: invoice.invoice_number,
      vendor: vendorName,
      amount: `$${parsedAmount.toFixed(2)}`,
      office: officeRaw || 'Unknown',
      rawOffice: officeRaw,
      dueDate: formatDate(rawDueDate || rawInvoiceDate),
      invoiceDate: formatDate(rawInvoiceDate),
      category: invoice.category || 'Other',
      invoice_date: rawInvoiceDate,
      due_date: rawDueDate,
      json_path: invoice.json_path,
      source_file: invoice.source_file,
      pdf_path: invoice.pdf_path,
      timestamp: invoice.timestamp,
      assigned_to: invoice.assigned_to,
      approved: invoice.approved,
      status: invoice.status,
      line_items: invoice.line_items || [],
      approvals: invoice.approvals || {},
    };
  }, []);

  const [refreshing, setRefreshing] = useState(false);

  const fetchVisibleInvoices = useCallback(async () => {
    // Propagate any query params from the page (e.g., ?email=...) to the API call
    const params = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
    params.set('limit', '5000');
    const res = await fetch(`/api/invoices/visible?${params.toString()}`, {
      cache: 'no-store',
      credentials: 'include',
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload?.error || `Failed to load invoices (HTTP ${res.status})`);
    }
    const payload = await res.json();
    if (!payload?.ok) {
      throw new Error(payload?.error || 'Failed to load invoices');
    }
    const list = Array.isArray(payload.invoices) ? payload.invoices : [];
    return list
      .filter((invoice) => {
        if (invoice.deleted || invoice.workflow_deleted_at) return false;
        const status = (invoice.status || '').toLowerCase();
        // Show invoices waiting for AP approval (incoming, categorized, pending)
        // Also show awaiting_admin_approval for admins to approve
        // Hide invoices that have already been paid or rejected
        if (status === 'paid' || status === 'rejected' || status === 'removed') return false;
        if (invoice.approved === true) return false;
        return true;
      })
      .map(transformInvoice);
  }, [transformInvoice]);

  const reloadList = useCallback(async () => {
    try {
      const data = await fetchVisibleInvoices();
      setInvoices(data);
    } catch (reloadError) {
      console.error('❌ ForMePage: reload failed', reloadError);
      showToast(reloadError?.message || 'Failed to refresh invoices', 'error');
    }
  }, [fetchVisibleInvoices, showToast]);

  const searchParams = useSearchParams();
  const { getStatusForVendor } = useVendorAchMap();

  const spQuery = useMemo(() => (searchParams.get('search') || '').trim().toLowerCase(), [searchParams]);
  const spFilters = useMemo(() => ({
    vendor: searchParams.get('vendor') || undefined,
    office: searchParams.get('office') || undefined,
    category: searchParams.get('category') || undefined,
    minAmount: searchParams.get('minAmount') || undefined,
    maxAmount: searchParams.get('maxAmount') || undefined,
    dueWithin: searchParams.get('dueWithin') || undefined,
    ach: searchParams.get('ach') || undefined,
  }), [searchParams]);

  const effectiveQuery = useMemo(() => (spQuery || searchQuery || '').trim().toLowerCase(), [spQuery, searchQuery]);
  const effectiveFilters = useMemo(() => ({
    ...filters,
    ...Object.fromEntries(
      Object.entries(spFilters).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    ),
  }), [filters, spFilters]);

  useEffect(() => {
    const loadInvoices = async () => {
      try {
        setLoading(true);
        const visible = await fetchVisibleInvoices();
        setInvoices(visible);
        setContextInvoices(visible);
        setError(null);
      } catch (loadError) {
        console.error('❌ ForMePage: Error loading invoices:', loadError);
        setError(loadError?.message ?? 'Failed to load invoices');
        setInvoices([]);
        setContextInvoices([]);
      } finally {
        setLoading(false);
      }
    };

    loadInvoices();
  }, [fetchVisibleInvoices, setContextInvoices]);

  // Refresh invoice list when page comes back into focus
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('📄 ForMePage: Page came into focus, refreshing invoice list');
        reloadList();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [reloadList]);

  const filteredRows = useMemo(() => {
    const query = effectiveQuery;
    const filterConfig = effectiveFilters;

    const parseAmount = (value) => Number.parseFloat(String(value).replace(/[^0-9.]/g, '')) || 0;
    const parseDate = (value) => {
      if (!value || value === 'N/A') return null;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    return invoices.filter((row) => {
      try {
        if (query) {
          const matches = Object.values(row).some((val) => String(val).toLowerCase().includes(query));
          if (!matches) return false;
        }

        if (filterConfig.vendor && row.vendor !== filterConfig.vendor) return false;
        if (filterConfig.office && row.office !== filterConfig.office) return false;
        if (filterConfig.category && row.category !== filterConfig.category) return false;

        // Vendor ACH Status filter
        if (filterConfig.ach) {
          const status = (getStatusForVendor(row.vendor) || '').toLowerCase();
          if (status !== String(filterConfig.ach).toLowerCase()) return false;
        }

        const amount = parseAmount(String(row.amount));
        if (filterConfig.minAmount && amount < Number(filterConfig.minAmount)) return false;
        if (filterConfig.maxAmount && amount > Number(filterConfig.maxAmount)) return false;

        if (filterConfig.dueWithin) {
          const days = Number.parseInt(String(filterConfig.dueWithin), 10);
          if (!Number.isNaN(days)) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const dueDate = parseDate(row.due_date || row.invoice_date) || parseDate(row.dueDate) || parseDate(row.invoiceDate);
            if (!dueDate) return false;
            dueDate.setHours(0, 0, 0, 0);
            const daysDiff = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
            if (daysDiff < 0 || daysDiff > days) return false;
          }
        }
        return true;
      } catch (filterError) {
        console.error('❌ Error applying filters for row:', row, filterError);
        return true;
      }
    });
  }, [invoices, effectiveQuery, effectiveFilters]);

  // Define bulkUpdate after filteredRows is available
  const bulkUpdate = useCallback(async (action) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const selectedRows = filteredRows.filter((r, i) => ids.includes(getRowId(r, i)));

    if (action === 'approve') {
      // Check if the user is an admin
      const userEmail = getUserEmail();
      const isAdmin = await checkIfAdmin(userEmail);
      
      // Only require office for non-admin users
      if (!isAdmin) {
        const missingOffice = selectedRows.find((row) => !row.rawOffice);
        if (missingOffice) {
          showToast('Office is required before approval.', 'error');
          return;
        }
      }
    }

    let hadError = false;
    let officeError = false;
    for (const row of selectedRows) {
      try {
        const response = await fetch('/api/invoices/transition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: row.id || row.invoice_number,
            action,
            ...(action === 'approve' ? { office: row.rawOffice || row.office || '' } : {}),
            ...(action === 'reject' ? { reason: 'Rejected from For Me page' } : {}),
          }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          const message = data?.error || `Request failed (HTTP ${response.status})`;
          if (message.toLowerCase().includes('office required')) {
            officeError = true;
          } else {
            hadError = true;
            showToast(message, 'error');
          }
        }
      } catch (err) {
        hadError = true;
        showToast(err?.message || 'Network error while updating invoice', 'error');
      }
    }

    if (officeError) {
      showToast('Office is required before approval.', 'error');
    }

    if (!hadError && !officeError) {
      showToast(action === 'approve' ? 'Invoices approved.' : 'Invoices rejected.', 'success');
    }

    setSelectedIds(new Set());
    await reloadList();
  }, [selectedIds, filteredRows, getRowId, showToast, reloadList]);

  // Define all handlers BEFORE any conditional returns
  const handleRefreshInbox = useCallback(async () => {
    setRefreshing(true);
    try {
      const params = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
      const email = params.get('email') || 'user@pcsmilesai.com';

      const res = await fetch('/api/inbox/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, full_scan: true }),
      });

      const result = await res.json();

      if (!result.ok) {
        showToast(result.message || result.error || 'Failed to refresh inbox', 'error');
        return;
      }

      showToast(
        `Inbox refreshed! Added ${result.added || 0} new invoice(s), skipped ${result.skipped || 0}`,
        'success'
      );

      // Reload the invoice list
      await reloadList();
    } catch (err) {
      console.error('Error refreshing inbox:', err);
      showToast('Failed to refresh inbox', 'error');
    } finally {
      setRefreshing(false);
    }
  }, [reloadList, showToast]);

  // Now do conditional returns AFTER all handlers are defined
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">Loading invoices...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-red-600">Error loading invoices: {error}</div>
      </div>
    );
  }

  const columns = [
    { key: 'invoice', label: 'Invoice' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'amount', label: 'Amount', align: 'right' },
    { key: 'office', label: 'Office' },
    { key: 'invoiceDate', label: 'Invoice Date' },
    { key: 'dueDate', label: 'Due Date' },
    { key: 'category', label: 'Category' },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">For Me</h1>
          <p className="text-gray-600 mt-2">
            {filteredRows.length} invoice{filteredRows.length !== 1 ? 's' : ''} assigned to you
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            title="Create a new invoice from a template"
          >
            <i className="fas fa-plus"></i>
            Create Invoice
          </button>
          <button
            onClick={handleRefreshInbox}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            title="Check inbox for new invoices"
          >
            <i className={`fas fa-sync-alt ${refreshing ? 'fa-spin' : ''}`}></i>
            {refreshing ? 'Refreshing...' : 'Refresh Inbox'}
          </button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <button
            onClick={() => bulkUpdate('approve')}
            style={{ padding: '8px 16px', backgroundColor: '#059669', color: '#fff', borderRadius: 9999, border: '1px solid #059669', fontWeight: 600 }}
          >
            Approve
          </button>
          <button
            onClick={() => bulkUpdate('reject')}
            style={{ padding: '8px 16px', backgroundColor: '#dc2626', color: '#fff', borderRadius: 9999, border: '1px solid #dc2626', fontWeight: 600 }}
          >
            Reject
          </button>
        </div>
      )}


      <InvoiceTable
        rows={filteredRows}
        columns={columns}
        onRowClick={handleInvoiceRowClick}
        selectable
        selectedIds={selectedIds}
        getRowId={getRowId}
        onToggleRow={(id, row, checked) => {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            if (checked) next.add(id); else next.delete(id);
            return next;
          });
        }}
        onToggleAll={(_allSelected, ids) => {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            const currentlyAllSelected = ids.every((id) => next.has(id));
            if (currentlyAllSelected) {
              ids.forEach((id) => next.delete(id));
            } else {
              ids.forEach((id) => next.add(id));
            }
            return next;
          });
        }}
      />
      <Toast message={toast?.message} variant={toast?.variant} onDismiss={dismissToast} />

      {/* Create Invoice Modal */}
      <CreateInvoiceModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          reloadList();
          showToast('Invoice created successfully!', 'success');
        }}
      />
    </div>
  );
}

export default function ForMePage(props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div className="text-lg text-gray-600">Loading invoices...</div>
      </div>
    );
  }

  return <ForMePageImpl {...props} />;
}
