import React, { useState, useEffect } from 'react';
import VendorTable from '../components/VendorTable.jsx';

/**
 * Page for the "Vendors" view. Displays a list of vendors with
 * payment method, outstanding amount and contact information.
 */
export default function VendorsPage({ searchQuery = '', filters = {}, onVendorClick }) {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load and aggregate vendor data from invoices
  useEffect(() => {
    const loadVendors = async () => {
      try {
        console.log('🔄 VendorsPage: Starting to load vendor data...');
        setLoading(true);
        const response = await fetch('/invoice_queue.json');
        console.log('📡 VendorsPage: Fetch response status:', response.status);
        
        if (!response.ok) {
          throw new Error(`Failed to load invoices: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📊 VendorsPage: Raw data received:', data.length, 'invoices');
        
        // Aggregate vendor data from invoices
        const vendorMap = new Map();
        
        data.forEach(invoice => {
          const vendorName = invoice.vendor || 'Unknown';
          const amount = parseFloat(invoice.total || '0.00');
          
          if (vendorMap.has(vendorName)) {
            const existing = vendorMap.get(vendorName);
            existing.amount += amount;
            existing.invoiceCount += 1;
          } else {
            vendorMap.set(vendorName, {
              name: vendorName,
              method: 'ACH', // Default payment method
              amount: amount,
              contact: 'Contact via invoice', // Default contact
              invoiceCount: 1
            });
          }
        });
        
        // Convert to array and format amounts
        const transformedData = Array.from(vendorMap.values()).map(vendor => ({
          name: vendor.name,
          method: vendor.method,
          amount: `$${vendor.amount.toFixed(2)}`,
          contact: vendor.contact,
          invoiceCount: vendor.invoiceCount
        }));
        
        console.log('✅ VendorsPage: Vendor data aggregated successfully:', transformedData.length, 'vendors');
        setVendors(transformedData);
        setError(null);
      } catch (err) {
        console.error('❌ VendorsPage: Error loading vendor data:', err);
        setError(err.message);
        // Fallback to empty array if loading fails
        setVendors([]);
      } finally {
        console.log('🏁 VendorsPage: Loading complete');
        setLoading(false);
      }
    };

    loadVendors();
  }, []);

  const wrapperStyle = { padding: '24px' };

  // Filter rows by search and filters
  const filteredRows = vendors.filter((row) => {
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      const matches = Object.values(row).some((val) =>
        String(val).toLowerCase().includes(query)
      );
      if (!matches) return false;
    }
    // vendor filter (row.name)
    if (filters.vendor && row.name !== filters.vendor) return false;
    // amount filters
    const amt = parseFloat(row.amount.replace(/[^0-9.]/g, ''));
    if (filters.minAmount && amt < parseFloat(filters.minAmount)) return false;
    if (filters.maxAmount && amt > parseFloat(filters.maxAmount)) return false;
    // office filter not available on vendors list
    return true;
  });

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
          if (onVendorClick) onVendorClick(row);
        }}
      />
    </div>
  );
}