import React from 'react';
import VendorTable from '../components/VendorTable.jsx';

/**
 * Page for the "Vendors" view. Displays a list of vendors with
 * payment method, outstanding amount and contact information.
 */
export default function VendorsPage({ searchQuery = '', filters = {} }) {
  const rows = [
    {
      name: 'Artisan Dental',
      method: 'ACH',
      amount: '$1,265.40',
      contact: '123-456-7890',
    },
    {
      name: 'Epic Dental Lab',
      method: 'ACH',
      amount: '$349.08',
      contact: '123-456-7890',
    },
    {
      name: 'Henry Schein',
      method: 'ACH',
      amount: '$622.47',
      contact: '123-456-7890',
    },
  ];
  const wrapperStyle = { padding: '24px' };
  // Filter rows by search and filters
  const filteredRows = rows.filter((row) => {
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
  return (
    <div style={wrapperStyle}>
      <VendorTable rows={filteredRows} />
    </div>
  );
}