import React from 'react';
import InvoiceTable from '../components/InvoiceTable.jsx';

/**
 * Page for the "To Be Paid" view. Shows invoices awaiting
 * payment and includes a status column. Row clicks propagate to
 * the parent via onRowClick.
 */
export default function ToBePaidPage({ onRowClick, searchQuery = '', filters = {} }) {
  // Original rows
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
  // Apply search and filter
  const filteredRows = rows.filter((row) => {
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      const matches = Object.values(row).some((val) =>
        String(val).toLowerCase().includes(query)
      );
      if (!matches) return false;
    }
    // vendor
    if (filters.vendor && row.vendor !== filters.vendor) return false;
    // office
    if (filters.office && row.office !== filters.office) return false;
    // amount filters
    const amt = parseFloat(row.amount.replace(/[^0-9.]/g, ''));
    if (filters.minAmount && amt < parseFloat(filters.minAmount)) return false;
    if (filters.maxAmount && amt > parseFloat(filters.maxAmount)) return false;
    // dueDate filters
    if (filters.dueStart || filters.dueEnd) {
      const [m, d, y] = row.dueDate.split('-');
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
      <InvoiceTable columns={columns} rows={filteredRows} onRowClick={onRowClick} />
    </div>
  );
}