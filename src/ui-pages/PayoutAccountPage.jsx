import React from 'react';

/**
 * Payout Account page presents the mock payout method used by the
 * company to pay vendors. This section is not editable except by
 * administrators. For now we display static sample details and a
 * note indicating edit restrictions.
 */
export default function PayoutAccountPage() {
  const containerStyle = { padding: '24px' };
  const titleStyle = { fontSize: '24px', fontWeight: '600', color: '#357ab2', marginBottom: '16px' };
  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    borderLeft: '1px solid #357ab2',
    borderTop: '1px solid #357ab2',
    fontSize: '14px',
    marginBottom: '16px',
  };
  const headerCellStyle = {
    padding: '8px 12px',
    borderRight: '1px solid #357ab2',
    borderBottom: '1px solid #357ab2',
    backgroundColor: '#f7fafc',
    fontWeight: '600',
    color: '#357ab2',
  };
  const cellStyle = {
    padding: '8px 12px',
    borderRight: '1px solid #357ab2',
    borderBottom: '1px solid #357ab2',
    color: '#1f1f1f',
  };
  const noteStyle = { fontSize: '14px', color: '#4a5568' };

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Payout Account</h1>
      <table style={tableStyle}>
        <tbody>
          <tr>
            <td style={headerCellStyle}>Bank Name</td>
            <td style={cellStyle}>Example Bank</td>
          </tr>
          <tr>
            <td style={headerCellStyle}>Account Number</td>
            <td style={cellStyle}>•••• 4321</td>
          </tr>
          <tr>
            <td style={headerCellStyle}>Routing Number</td>
            <td style={cellStyle}>123456789</td>
          </tr>
          <tr>
            <td style={headerCellStyle}>Account Type</td>
            <td style={cellStyle}>Checking</td>
          </tr>
        </tbody>
      </table>
      <p style={noteStyle}>This section is view only. Only Admin accounts can update payout details.</p>
    </div>
  );
}