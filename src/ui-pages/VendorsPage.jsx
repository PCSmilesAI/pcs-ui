import React, { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import InvoiceTable from '../components/InvoiceTable.jsx';
import { fetchInvoiceQueue } from '../lib/fetchQueue';
import ACHBadge from '../ui/ach/ACHBadge';
import { useVendorAchMap } from '../ui/ach/useVendorAch';
import { normalizeVendorName, getDisplayVendorName, getNormalizedVendorFromInvoice } from '../lib/vendorUtils';

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

  const { getStatusForVendor, path, version } = useVendorAchMap();

  // Track refresh counter to force re-fetch
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Load and aggregate vendor data from live All Invoices source
  useEffect(() => {
    const loadVendors = async () => {
      try {
        console.log('🔄 VendorsPage: Fetching invoices from database...');
        setLoading(true);
        // Fetch ALL invoices (no status filter) to show all vendors including historical ones
        const data = await fetchInvoiceQueue({ limit: 5000 });
        console.log('📊 VendorsPage: API returned', data.length, 'invoices');

        const vendorMap = new Map();
        data.forEach((invoice) => {
          // Use normalized vendor name as the key to prevent duplicates
          const normalizedName = getNormalizedVendorFromInvoice(invoice);
          const displayName = getDisplayVendorName(invoice.vendor_name || invoice.vendor);

          // Parse amount - handle both cents and dollar formats
          let amountNum = 0;
          const amountStr = String(invoice.amount_cents ?? invoice.invoice_total ?? invoice.total ?? '0');
          if (amountStr.includes('.')) {
            // Dollar format
            amountNum = parseFloat(amountStr);
          } else {
            // Cents format - convert to dollars
            amountNum = parseInt(amountStr, 10) / 100;
          }
          amountNum = isNaN(amountNum) ? 0 : amountNum;

          // Only count outstanding (unpaid) invoices for the outstanding amount
          // Paid invoices should not be included in the outstanding total
          const isPaid = invoice.status === 'paid';
          const outstandingAmount = isPaid ? 0 : amountNum;

          if (vendorMap.has(normalizedName)) {
            const existing = vendorMap.get(normalizedName);
            existing.amount += outstandingAmount;
            existing.totalAmount += amountNum;  // Track total for reference
            existing.invoiceCount += 1;
            existing.paidCount += isPaid ? 1 : 0;
          } else {
            vendorMap.set(normalizedName, {
              name: displayName,  // Use display name for UI
              normalizedName: normalizedName,  // Store normalized name for filtering
              method: 'ACH',
              amount: outstandingAmount,  // Outstanding amount (unpaid only)
              totalAmount: amountNum,  // Total amount (all invoices)
              contact: 'Contact via invoice',
              invoiceCount: 1,
              paidCount: isPaid ? 1 : 0,
            });
          }
        });

        const transformedData = Array.from(vendorMap.values()).map((v) => ({
          name: v.name,
          method: v.method,
          amount: `$${v.amount.toFixed(2)}`,  // Outstanding amount
          contact: v.contact,
          invoiceCount: v.invoiceCount,
          paidCount: v.paidCount,
          ach: getStatusForVendor(v.name)
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
  }, [refreshCounter]); // Re-fetch when refreshCounter changes

  const wrapperStyle = { padding: '24px' };

  // Filter rows by search and filters (merge URL filters too)
  const effectiveQuery = (spQuery || searchQuery || '').trim().toLowerCase();
  const effectiveFilters = { ...filters, ...Object.fromEntries(Object.entries(spFilters).filter(([, value]) => value !== undefined)) };
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

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'method', label: 'Payment Method' },
    { key: 'amount', label: 'Outstanding Amount', align: 'right' },
    { key: 'contact', label: 'Contact' },
    { key: 'achBadge', label: '', align: 'right' },
  ];

  return (
    <div style={wrapperStyle}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vendors</h1>
          <p className="text-gray-600 mt-2">
            {filteredRows.length} vendor{filteredRows.length !== 1 ? 's' : ''} with outstanding invoices
          </p>
        </div>
        <button
          onClick={() => setRefreshCounter(c => c + 1)}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? 'Refreshing...' : 'Refresh Vendors'}
        </button>
      </div>
      <InvoiceTable
        rows={filteredRows.map((row) => ({
          ...row,
          achBadge: <ACHBadge status={row.ach} />,
        }))}
        columns={columns}
        onRowClick={(row) => {
          try {
            // Use the normalized name for URL to ensure consistent matching
            const normalizedName = row?.normalizedName || normalizeVendorName(row?.name || '');
            if (onVendorClick) onVendorClick(row);
            if (normalizedName) router.push(`/VendorDetailPage?vendor=${encodeURIComponent(normalizedName)}`);
          } catch (navigationError) {
            console.error('Failed to navigate to vendor detail:', navigationError);
          }
        }}
      />
      <div className="mt-4 text-xs text-gray-500">
        Runtime path: {path || 'unknown'} · Version: {String(version || 'n/a')}
      </div>
    </div>
  );
}
