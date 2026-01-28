import React from 'react';

export default function PaymentHistoryTable({ rows, onReceiptClick, loading, error }) {
  if (loading) {
    return <div style={{ padding: '16px', color: '#357ab2' }}>Loading payment history...</div>;
  }

  if (error) {
    return <div style={{ padding: '16px', color: '#dc2626' }}>Error: {error}</div>;
  }

  if (!rows || rows.length === 0) {
    return <div style={{ padding: '16px', color: '#5a5a5a' }}>No payment history found</div>;
  }

  const tableStyle = {
    width: '100%',
    borderCollapse: 'separate',
    borderSpacing: 0,
    border: '1px solid #357ab2',
    borderRadius: '16px',
    overflow: 'hidden',
    marginTop: '12px',
  };

  const headerStyle = {
    backgroundColor: '#f3f4f6',
    padding: '12px',
    textAlign: 'left',
    fontWeight: 600,
    color: '#357ab2',
    fontSize: '14px',
  };

  const cellStyle = {
    padding: '12px',
    borderBottom: '1px solid #e5e7eb',
    fontSize: '14px',
    color: '#374151',
  };

  const rowHoverStyle = {
    backgroundColor: '#f9fafb',
  };

  const linkStyle = {
    color: '#357ab2',
    textDecoration: 'none',
    cursor: 'pointer',
    fontWeight: 500,
  };

  return (
    <div style={{ overflowX: 'auto', marginTop: '16px' }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={headerStyle}>Date Paid</th>
            <th style={headerStyle}>Amount</th>
            <th style={headerStyle}>Receipt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} style={{ ':hover': rowHoverStyle }}>
              <td style={cellStyle}>
                {new Date(row.date).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </td>
              <td style={cellStyle}>
                <strong>${row.amount.toFixed(2)}</strong>
              </td>
              <td style={cellStyle}>
                <a
                  href="#"
                  style={linkStyle}
                  onClick={(e) => {
                    e.preventDefault();
                    onReceiptClick(row);
                  }}
                >
                  View Receipt
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

