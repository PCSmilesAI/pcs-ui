import React, { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import VendorTable from '../components/VendorTable.jsx';
import { fetchInvoiceQueue } from '../lib/fetchQueue';

/**
 * Page for the "Vendors" view. Displays a list of vendors with
 * payment method, outstanding amount and contact information.
 */
export default function VendorsPage({ searchQuery = '', filters = {}, onVendorClick }) {
  const router = useRouter();
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const spApi = useSearchParams();
  const spQuery = (spApi.get('search') || '').trim().toLowerCase();
  const spFilters = {
    vendor: spApi.get('vendor') || undefined,
    minAmount: spApi.get('minAmount') || undefined,
    maxAmount: spApi.get('maxAmount') || undefined,
  };

  // Load and aggregate vendor data from live All Invoices source
  useEffect(() => {
    const loadVendors = async () => {
      try {
        console.log('🔄 VendorsPage: Fetching invoices from /api/invoice-queue...');
        setLoading(true);
        const data = await fetchInvoiceQueue({ limit: 5000 });
        console.log('📊 VendorsPage: API returned', data.length, 'invoices');

        const vendorMap = new Map();
        data.forEach((invoice) => {
          const vendorName = invoice.vendor_name || invoice.vendor || 'Unknown';
          const amountNum = parseFloat(String(invoice.invoice_total ?? invoice.total ?? '0')); 

          if (vendorMap.has(vendorName)) {
            const existing = vendorMap.get(vendorName);
            existing.amount += (isNaN(amountNum) ? 0 : amountNum);
            existing.invoiceCount += 1;
          } else {
            vendorMap.set(vendorName, {
              name: vendorName,
              method: 'ACH',
              amount: isNaN(amountNum) ? 0 : amountNum,
              contact: 'Contact via invoice',
              invoiceCount: 1,
            });
          }
        });

        const transformedData = Array.from(vendorMap.values()).map((v) => ({
          name: v.name,
          method: v.method,
          amount: `$${v.amount.toFixed(2)}`,
          contact: v.contact,
          invoiceCount: v.invoiceCount,
        }));

        setVendors(transformedData);
        setError(null);
      } catch (err) {
        console.error('❌ VendorsPage: Error loading vendor data:', err);
        setError(err.message);
        setVendors([]);
      } finally {
        setLoading(false);
      }
    };

    loadVendors();
  }, []);

  const wrapperStyle = { padding: '24px' };

  // Filter rows by search and filters (merge URL filters too)
  const effectiveQuery = (spQuery || searchQuery || '').trim().toLowerCase();
  const effectiveFilters = { ...filters, ...Object.fromEntries(Object.entries(spFilters).filter(([_, v]) => v !== undefined)) };
  const filteredRows = useMemo(() => vendors.filter((row) => {
    const query = effectiveQuery;
    if (query) {
      const matches = Object.values(row).some((val) =>
        String(val).toLowerCase().includes(query)
      );
      if (!matches) return false;
    }
    const f = effectiveFilters;
    if (f.vendor && row.name !== f.vendor) return false;
    const amt = parseFloat(String(row.amount).replace(/[^0-9.]/g, ''));
    if (f.minAmount && !isNaN(parseFloat(f.minAmount)) && amt < parseFloat(f.minAmount)) return false;
    if (f.maxAmount && !isNaN(parseFloat(f.maxAmount)) && amt > parseFloat(f.maxAmount)) return false;
    // office filter not available on vendors list
    return true;
  }), [vendors, effectiveQuery, filters]);

  console.log('🎨 VendorsPage: Rendering with', filteredRows.length, 'vendors, loading:', loading, 'error:', error);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">Loading vendors...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-red-600">Error loading vendors: {error}</div>
      </div>
    );
  }

  return (
    <div style={wrapperStyle}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Vendors</h1>
        <p className="text-gray-600 mt-2">
          {filteredRows.length} vendor{filteredRows.length !== 1 ? 's' : ''} with outstanding invoices
        </p>
      </div>
      <VendorTable
        rows={filteredRows}
        onRowClick={(row) => {
          try {
            const name = row?.name || '';
            if (onVendorClick) onVendorClick(row);
            if (name) router.push(`/VendorDetailPage?vendor=${encodeURIComponent(name)}`);
          } catch (_) {}
        }}
      />
    </div>
  );
}