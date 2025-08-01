import React from 'react';
import VendorTable from '../components/VendorTable.jsx';

/**
 * Page for the "Vendors" view. Displays a list of vendors with
 * payment method, outstanding amount and contact information.
 */
export default function VendorsPage() {
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
  return (
    <div style={wrapperStyle}>
      <VendorTable rows={rows} />
    </div>
  );
}