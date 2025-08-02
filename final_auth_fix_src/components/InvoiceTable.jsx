import React, { useState } from 'react';

/**
 * Generic table component for rendering invoice-like data. It
 * accepts a column definition and an array of row objects. Each
 * column definition must specify a `key` corresponding to the
 * property on the row and a `label` used for the header. Optionally
 * an `align` property ('left', 'center', or 'right') can be
 * provided to control text alignment. A click handler can be
 * supplied to respond when rows are selected.
 *
 * Example usage:
 * <InvoiceTable
 *   columns=[{ key: 'invoice', label: 'Invoice' }, ...]
 *   rows={[{ invoice:'IN123', vendor:'Acme' }, ...]}
 *   onRowClick={(row) => {...}}
 * />
 */
export default function InvoiceTable({ columns, rows, onRowClick }) {
  // Track which row the mouse is hovering over so we can change
  // its background colour without relying on CSS hover rules.
  const [hoverIndex, setHoverIndex] = useState(null);

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

  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          {columns.map((col) => {
            // Determine alignment; default left
            let textAlign = col.align || 'left';
            return (
              <th
                key={col.key}
                style={{ ...headerCellBase, textAlign }}
              >
                {col.label}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => {
          // Background colour for hover effect
          const backgroundColor =
            hoverIndex === rowIndex ? '#f0f7fc' : '#ffffff';
          return (
            <tr
              key={rowIndex}
              onClick={() => onRowClick && onRowClick(row)}
              onMouseEnter={() => setHoverIndex(rowIndex)}
              onMouseLeave={() => setHoverIndex(null)}
              style={{ backgroundColor, cursor: onRowClick ? 'pointer' : 'default' }}
            >
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