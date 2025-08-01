import React from 'react';
import InvoiceTable from '../components/InvoiceTable.jsx';

/**
 * Page for the "To Be Paid" view. Shows invoices awaiting
 * payment and includes a status column. Row clicks propagate to
 * the parent via onRowClick.
 */
export default function ToBePaidPage({ onRowClick }) {
  const rows = [
    {
      invoice: 'IN761993',
      vendor: 'Artisan Dental',
      amount: '$1,265.40',
      office: 'Roseburg',
      dueDate: '7-26-25',
      status: 'Incomplete',
    },
    {
      invoice: '4307',
      vendor: 'Exodus Dental Solutions',
      amount: '$1,349.08',
      office: 'Lebanon',
      dueDate: '7-29-25',
      status: 'Pending',
    },
    {
      invoice: '44250801',
      vendor: 'Henry Schein',
      amount: '$1,622.47',
      office: 'Eugene',
      dueDate: '7-30-25',
      status: 'Pending',
    },
  ];
  const columns = [
    { key: 'invoice', label: 'Invoice' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'amount', label: 'Amount', align: 'right' },
    { key: 'office', label: 'Office' },
    { key: 'dueDate', label: 'Due Date' },
    { key: 'status', label: 'Status' },
  ];
  const wrapperStyle = { padding: '24px' };
  return (
    <div style={wrapperStyle}>
      <InvoiceTable columns={columns} rows={rows} onRowClick={onRowClick} />
    </div>
  );
}