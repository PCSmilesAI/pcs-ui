import React, { useState } from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';
import InvoiceTable from '../components/InvoiceTable.jsx';

/**
 * The All Invoices page aggregates every invoice into a single
 * list. Columns are sortable; when the filter panel is open the
 * sort icons become visible and clicking on a header cycles
 * through ascending/descending/unsorted states. Sorting logic is
 * performed locally on the array of row objects.
 */
export default function AllInvoicesPage({ onRowClick, isFilterOpen }) {
  // Local state for sorting configuration
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });

  // Original unsorted data
  const data = [
    {
      invoice: 'IN761993',
      vendor: 'Artisan Dental',
      amount: '$1,265.40',
      office: 'Roseburg',
      status: 'To Be Paid',
    },
    {
      invoice: '4307',
      vendor: 'Exodus Dental Solutions',
      amount: '$1,349.08',
      office: 'Lebanon',
      status: 'Approval',
    },
    {
      invoice: '44250801',
      vendor: 'Henry Schein',
      amount: '$1,622.47',
      office: 'Eugene',
      status: 'Complete',
    },
  ];

  // Column definitions. Align right for the amount column.
  const columns = [
    { key: 'invoice', label: 'Invoice' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'amount', label: 'Amount', align: 'right' },
    { key: 'office', label: 'Office' },
    { key: 'status', label: 'Status' },
  ];

  /**
   * Sorting comparator used when a column is active. It strips
   * non‑numeric characters for the amount column so numeric
   * comparisons work as expected.
   */
  function compare(a, b, key, direction) {
    let valA = a[key];
    let valB = b[key];
    // Remove dollar sign and commas for numeric comparison
    if (key === 'amount') {
      valA = parseFloat(valA.replace(/[^0-9.]/g, ''));
      valB = parseFloat(valB.replace(/[^0-9.]/g, ''));
    }
    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  }

  // Derive a sorted version of the data based on the current
  // sorting configuration. When no sorting is active return
  // the original ordering.
  const sortedRows = React.useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) return data;
    const sorted = [...data].sort((a, b) =>
      compare(a, b, sortConfig.key, sortConfig.direction)
    );
    return sorted;
  }, [data, sortConfig]);

  /**
   * Handler invoked when a header cell is clicked. Cycles
   * sorting through ascending → descending → none. When the
   * user clicks a new column the sorting starts in ascending
   * order.
   */
  function handleSort(key) {
    setSortConfig((current) => {
      if (current.key !== key) {
        return { key, direction: 'asc' };
      }
      if (current.direction === 'asc') {
        return { key, direction: 'desc' };
      }
      // Reset sorting
      return { key: null, direction: null };
    });
  }

  // Wrapper style replicates padding around the table
  const wrapperStyle = { padding: '24px' };

  // Render header cells with sort icons when the filter panel is open
  const headerRows = (
    <tr>
      {columns.map((col) => {
        const isSorted = sortConfig.key === col.key;
        return (
          <th
            key={col.key}
            style={{
              padding: '12px 16px',
              borderRight: '1px solid #357ab2',
              borderBottom: '1px solid #357ab2',
              backgroundColor: '#ffffff',
              fontWeight: 500,
              color: '#5a5a5a',
              fontSize: '14px',
              textAlign: col.align || 'left',
            }}
          >
            <button
              onClick={() => handleSort(col.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                font: 'inherit',
                color: '#5a5a5a',
              }}
            >
              <span style={{ pointerEvents: 'none' }}>{col.label}</span>
              {isFilterOpen && (
                <span style={{ color: '#357ab2', fontSize: '12px' }}>
                  {isSorted ? (
                    sortConfig.direction === 'asc' ? (
                      <i className="fas fa-sort-up"></i>
                    ) : sortConfig.direction === 'desc' ? (
                      <i className="fas fa-sort-down"></i>
                    ) : (
                      <i className="fas fa-sort"></i>
                    )
                  ) : (
                    <i className="fas fa-sort"></i>
                  )}
                </span>
              )}
            </button>
          </th>
        );
      })}
    </tr>
  );

  return (
    <div style={wrapperStyle}>
      {/* We cannot easily reuse InvoiceTable here because of the sort
          icons in the header. Instead we manually construct a table
          with inline styles and call the existing onRowClick handler
          for row selection. */}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          borderLeft: '1px solid #357ab2',
          borderTop: '1px solid #357ab2',
        }}
      >
        <thead>{headerRows}</thead>
        <tbody>
          {sortedRows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              onClick={() => onRowClick && onRowClick(row)}
              style={{
                cursor: onRowClick ? 'pointer' : 'default',
                backgroundColor: '#ffffff',
              }}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{
                    padding: '12px 16px',
                    borderRight: '1px solid #357ab2',
                    borderBottom: '1px solid #357ab2',
                    fontSize: '14px',
                    color: '#1f1f1f',
                    textAlign: col.align || 'left',
                  }}
                >
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}