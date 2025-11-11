import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import '@fortawesome/fontawesome-free/css/all.min.css';
import InvoiceTable from '../components/InvoiceTable.jsx';
import { useInvoiceClick } from '../context/InvoiceClickContext';
import { useInvoiceData } from '../context/InvoiceDataContext';
import { useVendorAchMap } from '../ui/ach/useVendorAch';
import Toast from '../components/Toast.jsx';
import { formatStatusForDisplay } from '../../lib/invoices/stateMachine';
import { getDisplayVendorName } from '../lib/vendorUtils';

export default function AllInvoicesPage({ onRowClick, searchQuery = '', filters = {} }) {
  const searchParams = useSearchParams();
  const { handleInvoiceRowClick } = useInvoiceClick();
  const { setInvoices: setContextInvoices } = useInvoiceData();
  const rowClickHandler = onRowClick || handleInvoiceRowClick;
  const [selectedIds, setSelectedIds] = useState(new Set());
  const getRowId = (r, i) => r.invoice_number || r.json_path || r.pdf_path || r.source_file || `${r.vendor || 'v'}_${r.invoice || 'inv'}_${r.timestamp || i}`;
  const spQuery = (searchParams.get('search') || '').trim().toLowerCase();
  const spFilters = {
    vendor: searchParams.get('vendor') || undefined,
    office: searchParams.get('office') || undefined,
    category: searchParams.get('category') || undefined,
    minAmount: searchParams.get('minAmount') || undefined,
    maxAmount: searchParams.get('maxAmount') || undefined,
    dueWithin: searchParams.get('dueWithin') || undefined,
    ach: searchParams.get('ach') || undefined,
  };

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState(null);
  const { getStatusForVendor } = useVendorAchMap();

  const showToast = useCallback((message, variant = 'info') => {
    setToast({ message, variant, at: Date.now() });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  async function fetchVisibleInvoices() {
    // Include current page query params (e.g., ?email=...) so preview works without cookies
    const params = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
    params.set('limit', '5000');
    const res = await fetch(`/api/invoices/visible?${params.toString()}`, { cache: 'no-store', credentials: 'include' });
    if (!res.ok) throw new Error(`Failed to load invoices (HTTP ${res.status})`);
    const payload = await res.json();
    if (!payload?.ok) throw new Error(payload?.error || 'Failed to load invoices');
    return Array.isArray(payload.invoices) ? payload.invoices : [];
  }

  useEffect(() => {
    const loadInvoices = async () => {
      try {
        setLoading(true);
        const data = await fetchVisibleInvoices();

        const transformed = data.map((invoice) => {
          const formatDate = (dateString) => {
            if (!dateString) return 'N/A';
            const parsed = new Date(dateString);
            if (Number.isNaN(parsed.getTime())) return 'N/A';
            return parsed.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
          };
          const rawTotal = (invoice.invoice_total ?? invoice.total);
          const numericTotal =
            typeof rawTotal === 'number'
              ? rawTotal
              : parseFloat(String(rawTotal ?? '0').replace(/[^0-9.-]/g, '')) || 0;

          return {
            invoice: invoice.invoice_number || 'Unknown',
            invoice_number: invoice.invoice_number,
            vendor: getDisplayVendorName(invoice.vendor_name || invoice.vendor),
            amount: `$${numericTotal.toFixed(2)}`,
            office: invoice.office_location || invoice.office || invoice.clinic_id || 'Unknown',
            status: formatStatusForDisplay(invoice.status),
            category: invoice.category || 'Other',
            invoiceDate: formatDate(invoice.invoice_date || null),
            dueDate: formatDate(invoice.due_date || invoice.invoice_date || null),
            invoice_date: invoice.invoice_date,
            due_date: invoice.due_date,
            json_path: invoice.json_path,
            pdf_path: invoice.pdf_path,
            timestamp: invoice.timestamp,
            assigned_to: invoice.assigned_to,
            approved: invoice.approved,
          };
        });

        setInvoices(transformed);
        setContextInvoices(transformed);
        setError(null);
      } catch (loadError) {
        console.error('❌ AllInvoicesPage: Error loading invoices:', loadError);
        setError(loadError?.message || 'Failed to load invoices');
        setInvoices([]);
        setContextInvoices([]);
      } finally {
        setLoading(false);
      }
    };

    loadInvoices();
  }, []);

  // Refresh invoice list when page comes back into focus
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('📄 AllInvoicesPage: Page came into focus, refreshing invoice list');
        reloadList();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [reloadList]);

  async function reloadList() {
    try {
      setLoading(true);
      const data = await fetchVisibleInvoices();
      const transformed = data.map((invoice) => {
        const formatDate = (dateString) => {
          if (!dateString) return 'N/A';
          const parsed = new Date(dateString);
          if (Number.isNaN(parsed.getTime())) return 'N/A';
          return parsed.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
        };
        const rawTotal = (invoice.invoice_total ?? invoice.total);
        const numericTotal =
          typeof rawTotal === 'number'
            ? rawTotal
            : parseFloat(String(rawTotal ?? '0').replace(/[^0-9.-]/g, '')) || 0;
        return {
          invoice: invoice.invoice_number || 'Unknown',
          invoice_number: invoice.invoice_number,
          vendor: invoice.vendor_name || invoice.vendor || 'Unknown',
          amount: `$${numericTotal.toFixed(2)}`,
          office: invoice.office_location || invoice.office || invoice.clinic_id || 'Unknown',
          status: formatStatusForDisplay(invoice.status),
          category: invoice.category || 'Other',
          invoiceDate: formatDate(invoice.invoice_date || null),
          dueDate: formatDate(invoice.due_date || invoice.invoice_date || null),
          invoice_date: invoice.invoice_date,
          due_date: invoice.due_date,
          json_path: invoice.json_path,
          pdf_path: invoice.pdf_path,
          timestamp: invoice.timestamp,
          assigned_to: invoice.assigned_to,
          approved: invoice.approved,
        };
      });
      setInvoices(transformed);
      setError(null);
    } catch (e) {
      setError(e?.message || 'Failed to load invoices');
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }

  async function bulkRemove() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const selectedRows = filteredData.filter((r, i) => ids.includes(getRowId(r, i)));
    for (const r of selectedRows) {
      await fetch('/api/invoices/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.invoice_number || r.invoice, action: 'reject', reason: 'Removed from All Invoices' }),
      }).catch(() => null);
    }
    setSelectedIds(new Set());
    await reloadList();
  }

  const columns = [
    { key: 'invoice', label: 'Invoice' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'amount', label: 'Amount', align: 'right' },
    { key: 'office', label: 'Office' },
    { key: 'category', label: 'Category' },
    { key: 'status', label: 'Status' },
  ];

  const effectiveQuery = (spQuery || searchQuery || '').trim().toLowerCase();
  const effectiveFilters = { ...filters, ...Object.fromEntries(Object.entries(spFilters).filter(([, value]) => value !== undefined && value !== null && value !== '')) };

  const filteredData = useMemo(() => {
    const parseAmount = (value) => Number.parseFloat(String(value).replace(/[^0-9.]/g, '')) || 0;
    const parseDate = (value) => {
      if (!value || value === 'N/A') return null;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    return invoices.filter((row) => {
      try {
        if (effectiveQuery) {
          const matches = Object.values(row).some((val) => String(val).toLowerCase().includes(effectiveQuery));
          if (!matches) return false;
        }

        if (effectiveFilters.vendor && row.vendor !== effectiveFilters.vendor) return false;
        if (effectiveFilters.office && row.office !== effectiveFilters.office) return false;
        if (effectiveFilters.category && row.category !== effectiveFilters.category) return false;

        // Vendor ACH Status filter
        if (effectiveFilters.ach) {
          const status = (getStatusForVendor(row.vendor) || '').toLowerCase();
          if (status !== String(effectiveFilters.ach).toLowerCase()) return false;
        }

        const amount = parseAmount(row.amount);
        if (effectiveFilters.minAmount && amount < Number(effectiveFilters.minAmount)) return false;
        if (effectiveFilters.maxAmount && amount > Number(effectiveFilters.maxAmount)) return false;

        if (effectiveFilters.dueWithin) {
          const days = Number.parseInt(String(effectiveFilters.dueWithin), 10);
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

  const handleRefreshInbox = async () => {
    setRefreshing(true);
    try {
      const params = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
      const email = params.get('email') || 'user@pcsmilesai.com';

      const res = await fetch('/api/inbox/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
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
  };

  return (
    <div style={{ padding: '24px' }}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Invoices</h1>
          <p className="text-gray-600 mt-2">
            {filteredData.length} invoice{filteredData.length !== 1 ? 's' : ''} found
          </p>
        </div>
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
      {selectedIds.size > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <button
            onClick={bulkRemove}
            style={{ padding: '8px 16px', backgroundColor: '#dc2626', color: '#fff', borderRadius: 9999, border: '1px solid #dc2626', fontWeight: 600 }}
          >
            Remove
          </button>
        </div>
      )}
      <InvoiceTable
        rows={filteredData}
        columns={columns}
        onRowClick={rowClickHandler}
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
            if (currentlyAllSelected) ids.forEach((id) => next.delete(id));
            else ids.forEach((id) => next.add(id));
            return next;
          });
        }}
      />
      <Toast message={toast?.message} variant={toast?.variant} onDismiss={dismissToast} />
    </div>
  );
}
