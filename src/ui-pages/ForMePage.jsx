import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import InvoiceTable from '../components/InvoiceTable.jsx';
import { useInvoiceClick } from '../context/InvoiceClickContext';
import { fetchInvoiceQueue } from '../lib/fetchQueue';
import { useVendorAchMap } from '../ui/ach/useVendorAch';

export default function ForMePage({ searchQuery = '', filters = {} }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [qboConnected, setQboConnected] = useState(false);
  const [qboLoading, setQboLoading] = useState(true);
  const { handleInvoiceRowClick } = useInvoiceClick();
  const [selectedIds, setSelectedIds] = useState(new Set());
  const getRowId = (r, i) => r.invoice_number || r.json_path || r.pdf_path || r.source_file || `${r.vendor || 'v'}_${r.invoice || 'inv'}_${r.timestamp || i}`;

  async function reloadList() {
    try {
      const data = await fetchInvoiceQueue({ limit: 5000 });
      const transformed = data
        .filter((invoice) => {
          const status = invoice.status;
          const approved = invoice.approved;
          const isNotApproved = approved !== true;
          const isNotApprovedStatus = status !== 'approved';
          return isNotApproved && isNotApprovedStatus;
        })
        .map((invoice) => {
          const vendorName = invoice.vendor_name || invoice.vendor || 'Unknown';
          const rawInvoiceDate = invoice.invoice_date || null;
          const rawDueDate = invoice.due_date || null;
          const formatDate = (dateString) => {
            if (!dateString) return 'N/A';
            const parsed = new Date(dateString);
            if (Number.isNaN(parsed.getTime())) return 'N/A';
            return parsed.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
          };
          return {
            invoice: invoice.invoice_number || 'Unknown',
            invoice_number: invoice.invoice_number,
            vendor: vendorName,
            amount: `$${invoice.invoice_total || invoice.total || '0.00'}`,
            office: invoice.office_location || invoice.clinic_id || 'Unknown',
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
          };
        });
      setInvoices(transformed);
    } catch (_) {}
  }

  async function bulkUpdate(status, approvedVal) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const selectedRows = filteredRows.filter((r, i) => ids.includes(getRowId(r, i)));
    await Promise.all(
      selectedRows.map((r) =>
        fetch('/api/update-invoice-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoice_number: r.invoice_number, status, approved: approvedVal }),
        }).catch(() => null)
      )
    );
    setSelectedIds(new Set());
    await reloadList();
  }
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
  // Check QuickBooks connection status
  const checkQboStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/qbo/status');
      const data = await response.json();
      setQboConnected(!!data.connected);
    } catch (statusError) {
      console.error('❌ Failed to check QuickBooks status:', statusError);
      setQboConnected(false);
    } finally {
      setQboLoading(false);
    }
  }, []);
  useEffect(() => {
    checkQboStatus();
  }, [checkQboStatus]);

  useEffect(() => {
    checkQboStatus();
    const loadInvoices = async () => {
      try {
        setLoading(true);
        const data = await fetchInvoiceQueue({ limit: 5000 });

        const transformed = data
          .filter((invoice) => {
            const status = invoice.status;
            const approved = invoice.approved;
            const isNotApproved = approved !== true;
            const isNotApprovedStatus = status !== 'approved';
            return isNotApproved && isNotApprovedStatus;
          })
          .map((invoice) => {
            const vendorName = invoice.vendor_name || invoice.vendor || 'Unknown';
            const rawInvoiceDate = invoice.invoice_date || null;
            const rawDueDate = invoice.due_date || null;
            const formatDate = (dateString) => {
              if (!dateString) return 'N/A';
              const parsed = new Date(dateString);
              if (Number.isNaN(parsed.getTime())) return 'N/A';
              return parsed.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
            };

            return {
              invoice: invoice.invoice_number || 'Unknown',
              invoice_number: invoice.invoice_number,
              vendor: vendorName,
              amount: `$${invoice.invoice_total || invoice.total || '0.00'}`,
              office: invoice.office_location || invoice.clinic_id || 'Unknown',
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
            };
          });

        setInvoices(transformed);
        setError(null);
      } catch (loadError) {
        console.error('❌ ForMePage: Error loading invoices:', loadError);
        setError(loadError?.message ?? 'Failed to load invoices');
        setInvoices([]);
      } finally {
        setLoading(false);
      }
    };

    loadInvoices();
  }, [checkQboStatus]);

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">For Me</h1>
        <p className="text-gray-600 mt-2">
          {filteredRows.length} invoice{filteredRows.length !== 1 ? 's' : ''} assigned to you
        </p>
      </div>

      {selectedIds.size > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <button
            onClick={() => bulkUpdate('approved', true)}
            style={{ padding: '8px 16px', backgroundColor: '#059669', color: '#fff', borderRadius: 9999, border: '1px solid #059669', fontWeight: 600 }}
          >
            Approve
          </button>
          <button
            onClick={() => bulkUpdate('rejected', false)}
            style={{ padding: '8px 16px', backgroundColor: '#dc2626', color: '#fff', borderRadius: 9999, border: '1px solid #dc2626', fontWeight: 600 }}
          >
            Reject
          </button>
        </div>
      )}

      <div
        className={`mb-6 p-4 border rounded-lg ${
          qboConnected ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div
              className={`w-3 h-3 rounded-full mr-3 ${qboConnected ? 'bg-green-500' : 'bg-red-500'}`}
            />
            <div>
              <p className={`${qboConnected ? 'text-green-800' : 'text-red-800'} font-medium`}>
                {qboConnected ? 'QuickBooks Connected' : 'QuickBooks Not Connected'}
              </p>
              <p className={`${qboConnected ? 'text-green-700' : 'text-red-700'} text-sm`}>
                {qboConnected
                  ? 'Connection established successfully.'
                  : 'Connect to QuickBooks to enable full functionality.'}
              </p>
            </div>
          </div>
          {!qboConnected && (
            <a
              href="/api/qbo/auth"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
            >
              Connect QuickBooks
            </a>
          )}
        </div>
        <div className="mt-2 text-sm text-gray-600">
          {qboLoading
            ? 'Checking QuickBooks connection...'
            : qboConnected
              ? 'Your QuickBooks connection is active. You can proceed with invoice approvals.'
              : 'QuickBooks is currently disconnected. Connect your account to enable automated billing.'}
        </div>
      </div>

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
    </div>
  );
}
