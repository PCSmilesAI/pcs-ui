import React from 'react';
import InvoiceTable from '../components/InvoiceTable.jsx';

/**
 * Page for the "For Me" view. Displays a table of invoices
 * assigned to the user. Clicking on a row will open the detail
 * screen via the passed onRowClick handler.
 */
export default function ForMePage({ onRowClick }) {
  // Sample data reflecting the provided wireframe
  const rows = [
    {
      invoice: 'IN761993',
      vendor: 'Artisan Dental',
      amount: '$1,265.40',
      office: 'Roseburg',
      dueDate: '7-26-25',
      category: 'Dental Lab',
    },
    {
      invoice: '4307',
      vendor: 'Exodus Dental Solutions',
      amount: '$349.08',
      office: 'Lebanon',
      dueDate: '7-29-25',
      category: 'Dental Lab',
    },
    {
      invoice: '44250801',
      vendor: 'Henry Schein',
      amount: '$622.47',
      office: 'Eugene',
      dueDate: '7-30-25',
      category: 'Dental Supplies',
    },
  ];

  const columns = [
    { key: 'invoice', label: 'Invoice' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'amount', label: 'Amount', align: 'right' },
    { key: 'office', label: 'Office' },
    { key: 'dueDate', label: 'Due Date' },
    { key: 'category', label: 'Category' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <InvoiceTable columns={columns} rows={rows} onRowClick={onRowClick} />
    </div>
  );
}