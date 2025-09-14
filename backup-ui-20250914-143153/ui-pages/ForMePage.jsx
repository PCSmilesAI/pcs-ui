'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import InvoiceTable from '../components/InvoiceTable.jsx';
import { fetchInvoiceQueue } from '../lib/fetchQueue';

export default function ForMePage() {
  const sp = useSearchParams();
  const q = (sp.get('search') || '').trim().toLowerCase();

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await fetchInvoiceQueue({ limit: 5000 });
        if (cancelled) return;
        // transform to production row shape
        const rows = (Array.isArray(data) ? data : []).map((invoice) => ({
          invoice: invoice?.invoice_number || 'Unknown',
          invoice_number: invoice?.invoice_number,
          id: invoice?.id,
          vendor: invoice?.vendor_name || invoice?.vendor || 'Unknown',
          amount: `$${invoice?.total || invoice?.invoice_total || '0.00'}`,
          office: invoice?.office_location || invoice?.clinic_id || 'Unknown',
          status: invoice?.status || 'New',
          category: invoice?.category || 'Other',
          invoice_date: invoice?.invoice_date,
          due_date: invoice?.due_date,
          json_path: invoice?.json_path,
          pdf_path: invoice?.pdf_path,
          timestamp: invoice?.timestamp,
          assigned_to: invoice?.assigned_to,
          approved: invoice?.approved,
          line_items: invoice?.line_items || []
        }));
        setInvoices(rows);
        setError(null);
      } catch (err) {
        console.error('❌ ForMePage: Error loading invoices:', err);
        if (cancelled) return;
        setError(err.message || 'Failed to load');
        setInvoices([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filteredRows = useMemo(() => {
    if (!q) return invoices;
    return invoices.filter((row) =>
      Object.values(row).some((val) => String(val).toLowerCase().includes(q))
    );
  }, [invoices, q]);

  const columns = [
    { key: 'invoice', label: 'Invoice' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'amount', label: 'Amount', align: 'right' },
    { key: 'office', label: 'Office' },
    { key: 'category', label: 'Category' },
    { key: 'status', label: 'Status' },
  ];

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
        <h1 className="text-2xl font-bold text-gray-900">For Me</h1>
        <p className="text-gray-600 mt-2">{filteredRows.length} invoice{filteredRows.length !== 1 ? 's' : ''} found</p>
      </div>
      <InvoiceTable rows={filteredRows} columns={columns} />
    </div>
  );
}