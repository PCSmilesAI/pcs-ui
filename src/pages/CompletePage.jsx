import React from 'react';
import InvoiceTable from '../components/InvoiceTable.jsx';

/**
 * Page for the "Complete" view. Lists invoices that have been
 * paid or otherwise completed along with the date they were
 * completed. Rows are interactive.
 */
export default function CompletePage({ onRowClick }) {
  const rows = [
    {
      invoice: 'IN761993',
      vendor: 'Artisan Dental',
      amount: '$1,265.40',
      office: 'Roseburg',
      dateCompleted: '7-30-25',
    },
    {
      invoice: '4307',
      vendor: 'Exodus Dental Solutions',
      amount: '$1,349.08',
      office: 'Lebanon',
      dateCompleted: '7-30-25',
    },
    {
      invoice: '44250801',
      vendor: 'Henry Schein',
      amount: '$1,622.47',
      office: 'Eugene',
      dateCompleted: '8-13-25',
    },
  ];
  const columns = [
    { key: 'invoice', label: 'Invoice' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'amount', label: 'Amount', align: 'right' },
    { key: 'office', label: 'Office' },
    { key: 'dateCompleted', label: 'Date Completed' },
  ];
  return (
    <div className="px-6 py-4">
      <InvoiceTable columns={columns} rows={rows} onRowClick={onRowClick} />
    </div>
  );
}