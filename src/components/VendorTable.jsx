import React from 'react';
import InvoiceTable from './InvoiceTable.jsx';

/**
 * Simple wrapper around InvoiceTable for displaying vendor
 * information. Vendors have a name, payment method, an outstanding
 * amount and a contact number. Rows are not interactive.
 */
export default function VendorTable({ rows }) {
  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'method', label: 'Payment Method' },
    { key: 'amount', label: 'Outstanding Amount', align: 'right' },
    { key: 'contact', label: 'Contact' },
  ];
  return <InvoiceTable columns={columns} rows={rows} />;
}