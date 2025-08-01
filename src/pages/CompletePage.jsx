import React from 'react';
import InvoiceTable from '../components/InvoiceTable.jsx';

/**
 * Page for the "Complete" view. Lists invoices that have been
 * paid or otherwise completed along with the date they were
 * completed. Rows are interactive.
 */
export default function CompletePage({ onRowClick, searchQuery = '', filters = {} }) {
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
  const wrapperStyle = { padding: '24px' };
  // Filter logic
  const filteredRows = rows.filter((row) => {
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      const matches = Object.values(row).some((val) =>
        String(val).toLowerCase().includes(query)
      );
      if (!matches) return false;
    }
    // vendor filter
    if (filters.vendor && row.vendor !== filters.vendor) return false;
    // office filter
    if (filters.office && row.office !== filters.office) return false;
    // amount filter
    const amt = parseFloat(row.amount.replace(/[^0-9.]/g, ''));
    if (filters.minAmount && amt < parseFloat(filters.minAmount)) return false;
    if (filters.maxAmount && amt > parseFloat(filters.maxAmount)) return false;
    // dueStart/dueEnd apply to dateCompleted
    if (filters.dueStart || filters.dueEnd) {
      const [m, d, y] = row.dateCompleted.split('-');
      const rowDate = new Date(`20${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
      if (filters.dueStart) {
        const startDate = new Date(filters.dueStart);
        if (rowDate < startDate) return false;
      }
      if (filters.dueEnd) {
        const endDate = new Date(filters.dueEnd);
        if (rowDate > endDate) return false;
      }
    }
    return true;
  });
  return (
    <div style={wrapperStyle}>
      <InvoiceTable
        columns={columns}
        rows={filteredRows}
        onRowClick={onRowClick}
      />
    </div>
  );
}