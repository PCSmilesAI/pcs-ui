import React, { useState, useMemo } from 'react';

/**
 * Generic table component for rendering invoice-like data. It
 * accepts a column definition and an array of row objects. Each
 * column definition must specify a `key` corresponding to the
 * property on the row and a `label` used for the header. Optionally
 * an `align` property ('left', 'center', or 'right') can be
 * provided to control text alignment. A click handler can be
 * supplied to respond when rows are selected.
 *
 * Columns can now be sorted by clicking on the header. The sort
 * direction cycles through: unsorted → ascending → descending → unsorted
 *
 * Example usage:
 * <InvoiceTable
 *   columns=[{ key: 'invoice', label: 'Invoice' }, ...]
 *   rows={[{ invoice:'IN123', vendor:'Acme' }, ...]}
 *   onRowClick={(row) => {...}}
 * />
 */
export default function InvoiceTable({ columns, rows, onRowClick, selectable = false, selectedIds = new Set(), onToggleRow, onToggleAll, getRowId }) {
  // Track which row the mouse is hovering over so we can change
  // its background colour without relying on CSS hover rules.
  const [hoverIndex, setHoverIndex] = useState(null);

  // Default: newest invoice date first
  const [sortConfig, setSortConfig] = useState({ key: 'invoiceDate', direction: 'desc' });

  // Define reusable styles for table, header and cells. Using
  // JavaScript objects ensures the styles are always applied even
  // when no external stylesheet is available. Colours and spacing
  // are chosen to approximate the provided wireframes.
  const tableStyle = {
    width: '100%',
    borderCollapse: 'separate',
    borderSpacing: 0,
    borderLeft: '1px solid #357ab2',
    borderTop: '1px solid #357ab2',
    borderRadius: '16px',
    overflow: 'hidden',
    tableLayout: 'fixed',
  };
  const headerCellBase = {
    padding: '12px 16px',
    borderRight: '1px solid #357ab2',
    borderBottom: '1px solid #357ab2',
    backgroundColor: '#ffffff',
    fontWeight: 500,
    color: '#5a5a5a',
    fontSize: '14px',
  };
  const rowCellBase = {
    padding: '12px 16px',
    borderRight: '1px solid #357ab2',
    borderBottom: '1px solid #357ab2',
    fontSize: '14px',
    color: '#1f1f1f',
    wordWrap: 'break-word',
    overflowWrap: 'break-word',
    whiteSpace: 'normal',
  };

  const getId = (row, index) => {
    if (typeof getRowId === 'function') return getRowId(row, index);
    // Robust defaults to avoid collisions when values like "Unknown" repeat
    return (
      row.invoice_number ||
      row.json_path ||
      row.pdf_path ||
      row.source_file ||
      row.id ||
      `${row.invoice || 'row'}_${index}`
    );
  };

  const RAW_DATE_KEYS = {
    invoiceDate: '_invoiceDateRaw',
    dueDate: '_dueDateRaw',
    dateCompleted: '_dateCompletedRaw',
  };

  function parseDateToTimestamp(val) {
    if (!val) return NaN;
    const d = new Date(val);
    return d.getTime();
  }

  // Sort rows based on current sort configuration
  const sortedRows = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) {
      return rows;
    }

    const rawKey = RAW_DATE_KEYS[sortConfig.key];

    const sorted = [...rows].sort((a, b) => {
      // For date columns, parse the raw value into a real timestamp
      if (rawKey) {
        const aTs = parseDateToTimestamp(a[rawKey]);
        const bTs = parseDateToTimestamp(b[rawKey]);
        const aValid = !isNaN(aTs);
        const bValid = !isNaN(bTs);
        if (!aValid && !bValid) return 0;
        if (!aValid) return sortConfig.direction === 'asc' ? 1 : -1;
        if (!bValid) return sortConfig.direction === 'asc' ? -1 : 1;
        return sortConfig.direction === 'asc' ? aTs - bTs : bTs - aTs;
      }

      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];

      // Handle null/undefined values
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortConfig.direction === 'asc' ? 1 : -1;
      if (bVal == null) return sortConfig.direction === 'asc' ? -1 : 1;

      // Try numeric comparison first
      const aNum = parseFloat(String(aVal).replace(/[^0-9.-]/g, ''));
      const bNum = parseFloat(String(bVal).replace(/[^0-9.-]/g, ''));

      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
      }

      // Fall back to string comparison
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();

      if (sortConfig.direction === 'asc') {
        return aStr.localeCompare(bStr);
      } else {
        return bStr.localeCompare(aStr);
      }
    });

    return sorted;
  }, [rows, sortConfig]);

  const DATE_COLUMNS = new Set(['invoiceDate', 'dueDate', 'dateCompleted']);
  const DEFAULT_SORT = { key: 'invoiceDate', direction: 'desc' };

  const isDefaultSort = (cfg) =>
    cfg.key === DEFAULT_SORT.key && cfg.direction === DEFAULT_SORT.direction;

  const handleHeaderClick = (columnKey) => {
    setSortConfig((prev) => {
      if (DATE_COLUMNS.has(columnKey)) {
        // Date columns: two states -- default (desc, newest first) and asc (oldest first)
        if (prev.key === columnKey && prev.direction === 'asc') {
          return { key: columnKey, direction: 'desc' };
        }
        return { key: columnKey, direction: 'asc' };
      }
      // Non-date columns: cycle asc -> desc -> back to default
      if (prev.key === columnKey) {
        if (prev.direction === 'asc') {
          return { key: columnKey, direction: 'desc' };
        } else if (prev.direction === 'desc') {
          return DEFAULT_SORT;
        }
      }
      return { key: columnKey, direction: 'asc' };
    });
  };

  const getSortArrow = (columnKey) => {
    if (sortConfig.key !== columnKey) return null;
    // Date columns in their default desc state show no arrow
    if (DATE_COLUMNS.has(columnKey) && sortConfig.direction === 'desc') return null;
    if (sortConfig.direction === 'asc') return ' ↑';
    if (sortConfig.direction === 'desc') return ' ↓';
    return null;
  };

  const isColumnHighlighted = (columnKey) => {
    if (sortConfig.key !== columnKey) return false;
    // Date columns in their default desc state look normal (no highlight)
    if (DATE_COLUMNS.has(columnKey) && sortConfig.direction === 'desc') return false;
    return true;
  };

  const allVisibleIds = selectable ? sortedRows.map((r, i) => getId(r, i)) : [];
  const allSelected = selectable && allVisibleIds.length > 0 && allVisibleIds.every((id) => (selectedIds instanceof Set ? selectedIds.has(id) : (selectedIds || []).includes(id)));

  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          {selectable && (
            <th
              key="__select"
              style={{ ...headerCellBase, textAlign: 'center', width: 56 }}
            >
              <input
                type="checkbox"
                className="pcs-checkbox"
                checked={allSelected}
                onChange={() => {
                  if (typeof onToggleAll === 'function') onToggleAll(allSelected, allVisibleIds);
                }}
              />
            </th>
          )}
          {columns.map((col) => {
            // Center all columns by default
            let textAlign = col.align || 'center';
            const sortArrow = getSortArrow(col.key);
            return (
              <th
                key={col.key}
                style={{
                  ...headerCellBase,
                  textAlign,
                  cursor: 'pointer',
                  userSelect: 'none',
                  backgroundColor: isColumnHighlighted(col.key) ? '#f0f7fc' : '#ffffff',
                  fontWeight: isColumnHighlighted(col.key) ? 600 : 500,
                  ...(col.width ? { width: col.width } : {}),
                }}
                onClick={() => handleHeaderClick(col.key)}
                title="Click to sort"
              >
                {col.label}
                {sortArrow && <span style={{ marginLeft: '4px', color: '#357ab2' }}>{sortArrow}</span>}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {sortedRows.map((row, rowIndex) => {
          const hasParsingIssue = row.parsing_status === 'failed' || row.parsing_status === 'partial';
          
          // Background colour for hover effect, with red tint for parsing issues
          const backgroundColor = hasParsingIssue
            ? (hoverIndex === rowIndex ? '#fef2f2' : '#fff5f5')
            : (hoverIndex === rowIndex ? '#f0f7fc' : '#ffffff');
          
          const rowId = getId(row, rowIndex);
          const isChecked = selectable && (selectedIds instanceof Set ? selectedIds.has(rowId) : (selectedIds || []).includes(rowId));
          return (
            <tr
              key={rowIndex}
              onClick={() => {
                console.log('🔍 InvoiceTable: Row clicked:', row);
                console.log('🔍 InvoiceTable: onRowClick function:', onRowClick);
                if (onRowClick) {
                  onRowClick(row);
                } else {
                  console.warn('⚠️ InvoiceTable: onRowClick is not defined');
                }
              }}
              onMouseEnter={() => setHoverIndex(rowIndex)}
              onMouseLeave={() => setHoverIndex(null)}
              style={{ backgroundColor, cursor: onRowClick ? 'pointer' : 'default' }}
            >
              {selectable && (
                <td key="__select" style={{ ...rowCellBase, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    className="pcs-checkbox"
                    checked={!!isChecked}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      if (typeof onToggleRow === 'function') onToggleRow(rowId, row, e.target.checked);
                    }}
                  />
                </td>
              )}
              {columns.map((col, colIndex) => {
                // Center all columns by default
                let textAlign = col.align || 'center';
                
                // Apply red text color for parsing issues
                const textColor = hasParsingIssue ? '#dc2626' : '#1f1f1f';
                
                // Add warning icon to first column if parsing failed
                const showWarningIcon = hasParsingIssue && colIndex === 0;
                
                // Support custom render function for column
                const cellContent = col.render 
                  ? col.render(row)
                  : row[col.key];
                
                return (
                  <td
                    key={col.key}
                    style={{ ...rowCellBase, textAlign, color: textColor }}
                  >
                    {showWarningIcon && (
                      <span 
                        style={{ marginRight: '6px', color: '#dc2626' }} 
                        title={row.parsing_error || 'Parsing issue - data may be incomplete'}
                      >
                        ⚠️
                      </span>
                    )}
                    {cellContent}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
