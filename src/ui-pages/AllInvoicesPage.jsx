import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import '@fortawesome/fontawesome-free/css/all.min.css';
import InvoiceTable from '../components/InvoiceTable.jsx';
import { fetchInvoiceQueue } from '../lib/fetchQueue';
import { useInvoiceClick } from '../context/InvoiceClickContext';
import { useVendorAchMap } from '../ui/ach/useVendorAch';

export default function AllInvoicesPage({ onRowClick, searchQuery = '', filters = {} }) {
  const searchParams = useSearchParams();
  const { handleInvoiceRowClick } = useInvoiceClick();
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
  const { getStatusForVendor } = useVendorAchMap();

  useEffect(() => {
    const loadInvoices = async () => {
      try {
        setLoading(true);
        const data = await fetchInvoiceQueue({ limit: 5000 });

        const transformed = data.map((invoice) => {
          const formatDate = (dateString) => {
            if (!dateString) return 'N/A';
            const parsed = new Date(dateString);
            if (Number.isNaN(parsed.getTime())) return 'N/A';
            return parsed.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
          };

          return {
            invoice: invoice.invoice_number || 'Unknown',
            invoice_number: invoice.invoice_number,
            vendor: invoice.vendor_name || invoice.vendor || 'Unknown',
            amount: `$${invoice.invoice_total || invoice.total || '0.00'}`,
            office: invoice.office_location || invoice.clinic_id || 'Unknown',
            status: invoice.status || 'New',
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
      } catch (loadError) {
        console.error('❌ AllInvoicesPage: Error loading invoices:', loadError);
        setError(loadError?.message || 'Failed to load invoices');
        setInvoices([]);
      } finally {
        setLoading(false);
      }
    };

    loadInvoices();
  }, []);

  async function reloadList() {
    try {
      setLoading(true);
      const data = await fetchInvoiceQueue({ limit: 5000 });
      const transformed = data.map((invoice) => {
        const formatDate = (dateString) => {
          if (!dateString) return 'N/A';
          const parsed = new Date(dateString);
          if (Number.isNaN(parsed.getTime())) return 'N/A';
          return parsed.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
        };
        return {
          invoice: invoice.invoice_number || 'Unknown',
          invoice_number: invoice.invoice_number,
          vendor: invoice.vendor_name || invoice.vendor || 'Unknown',
          amount: `$${invoice.invoice_total || invoice.total || '0.00'}`,
          office: invoice.office_location || invoice.clinic_id || 'Unknown',
          status: invoice.status || 'New',
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
    await Promise.all(
      selectedRows.map((r) =>
        fetch('/api/update-invoice-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoice_number: r.invoice_number, status: 'removed', approved: false }),
        }).catch(() => null)
      )
    );
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

  return (
    <div style={{ padding: '24px' }}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">All Invoices</h1>
        <p className="text-gray-600 mt-2">
          {filteredData.length} invoice{filteredData.length !== 1 ? 's' : ''} found
        </p>
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
    </div>
  );
}
