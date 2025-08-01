import React from 'react';

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
  return (
    <table className="w-full border-t border-l border-primary text-sm">
      <thead className="bg-white">
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              className={`px-4 py-2 border-r border-primary font-medium text-gray-600 text-${
                col.align || 'left'
              }`}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr
            key={rowIndex}
            onClick={() => onRowClick && onRowClick(row)}
            className="cursor-pointer table-row-hover border-b border-primary"
          >
            {columns.map((col) => (
              <td
                key={col.key}
                className={`px-4 py-2 border-r border-primary text-${col.align || 'left'}`}
              >
                {row[col.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}