import React from 'react';
import InvoiceTable from '../components/InvoiceTable.jsx';

/**
 * Page for the "For Me" view. Displays a table of invoices
 * assigned to the user. Clicking on a row will open the detail
 * screen via the passed onRowClick handler.
 */
export default function ForMePage({ onRowClick, searchQuery = '', filters = {} }) {
  // Sample data reflecting the provided wireframe
  // Raw rows before filtering
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

  // Wrapper styles set padding around the table. Using inline styles
  // ensures the padding is applied even without a CSS framework.
  const wrapperStyle = {
    padding: '24px',
  };
  // Apply search and filter criteria. If searchQuery is non-empty,
  // include only rows where any column contains the query
  const filteredRows = rows.filter((row) => {
    // Text search across all string fields
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      const matches = Object.values(row).some((val) =>
        String(val).toLowerCase().includes(query)
      );
      if (!matches) return false;
    }
    // Vendor filter
    if (filters.vendor && row.vendor !== filters.vendor) return false;
    // Office filter
    if (filters.office && row.office !== filters.office) return false;
    // Category filter
    if (filters.category && row.category !== filters.category) return false;
    // Amount filters (strip $ and commas)
    const amt = parseFloat(row.amount.replace(/[^0-9.]/g, ''));
    if (filters.minAmount && amt < parseFloat(filters.minAmount)) return false;
    if (filters.maxAmount && amt > parseFloat(filters.maxAmount)) return false;
    // Due date filters
    if (filters.dueStart || filters.dueEnd) {
      // Convert row.dueDate (M-D-YY) to Date
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
      <InvoiceTable
        columns={columns}
        rows={filteredRows}
        onRowClick={onRowClick}
      />
    </div>
  );
}