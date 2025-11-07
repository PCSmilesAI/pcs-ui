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

  // Track sorting state: { key: column key, direction: 'asc' | 'desc' | null }
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });

  // Define reusable styles for table, header and cells. Using
  // JavaScript objects ensures the styles are always applied even
  // when no external stylesheet is available. Colours and spacing
  // are chosen to approximate the provided wireframes.
  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    borderLeft: '1px solid #357ab2',
    borderTop: '1px solid #357ab2',
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

  // Sort rows based on current sort configuration
  const sortedRows = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) {
      return rows;
    }

    const sorted = [...rows].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];

      // Handle null/undefined values
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortConfig.direction === 'asc' ? 1 : -1;
      if (bVal == null) return sortConfig.direction === 'asc' ? -1 : 1;

      // Try numeric comparison first
      const aNum = parseFloat(String(aVal).replace(/[^0-9.\-]/g, ''));
      const bNum = parseFloat(String(bVal).replace(/[^0-9.\-]/g, ''));

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

  // Handle column header click to toggle sort
  const handleHeaderClick = (columnKey) => {
    setSortConfig((prev) => {
      if (prev.key === columnKey) {
        // Cycle through: asc -> desc -> null
        if (prev.direction === 'asc') {
          return { key: columnKey, direction: 'desc' };
        } else if (prev.direction === 'desc') {
          return { key: null, direction: null };
        }
      }
      // Start with ascending
      return { key: columnKey, direction: 'asc' };
    });
  };

  // Get sort arrow for a column
  const getSortArrow = (columnKey) => {
    if (sortConfig.key !== columnKey) return null;
    if (sortConfig.direction === 'asc') return ' ↑';
    if (sortConfig.direction === 'desc') return ' ↓';
    return null;
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
              style={{ ...headerCellBase, textAlign: 'center', width: 36 }}
            >
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => {
                  if (typeof onToggleAll === 'function') onToggleAll(allSelected, allVisibleIds);
                }}
              />
            </th>
          )}
          {columns.map((col) => {
            // Determine alignment; default left
            let textAlign = col.align || 'left';
            const sortArrow = getSortArrow(col.key);
            return (
              <th
                key={col.key}
                style={{
                  ...headerCellBase,
                  textAlign,
                  cursor: 'pointer',
                  userSelect: 'none',
                  backgroundColor: sortConfig.key === col.key ? '#f0f7fc' : '#ffffff',
                  fontWeight: sortConfig.key === col.key ? 600 : 500,
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
          // Background colour for hover effect
          const backgroundColor =
            hoverIndex === rowIndex ? '#f0f7fc' : '#ffffff';
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
                    checked={!!isChecked}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      if (typeof onToggleRow === 'function') onToggleRow(rowId, row, e.target.checked);
                    }}
                  />
                </td>
              )}
              {columns.map((col) => {
                let textAlign = col.align || 'left';
                return (
                  <td
                    key={col.key}
                    style={{ ...rowCellBase, textAlign }}
                  >
                    {row[col.key]}
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
