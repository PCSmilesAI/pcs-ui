import React from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';

/**
 * Detail view for a single invoice. Displays high level summary
 * information at the top along with actions (approve, reject,
 * repair). Below the summary the left column shows invoice
 * status, details and line items. The right column contains a
 * placeholder for the invoice PDF. A back arrow returns the user
 * to the previous list. This version uses only inline styles so
 * that the layout and colours appear even if no CSS preprocessor
 * is available.
 */
export default function InvoiceDetailPage({ invoice, onBack }) {
  // Line items used for every invoice. In a real application this
  // data would come from an API.
  const lineItems = [
    { id: '1185', name: 'Z360 Anterior', qty: 3, unit: '$173.00', total: '$519.00' },
    { id: '3039', name: 'Flipper with Wire 4-6 Teeth', qty: 2, unit: '$238.00', total: '$476.00' },
    { id: '3255', name: 'Strengthner Bar', qty: 1, unit: '$41.00', total: '$41.00' },
  ];

  // Basic styles used throughout the detail page
  const wrapperStyle = { padding: '24px' };
  const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
  };
  const summaryStyle = {
    display: 'flex',
    alignItems: 'baseline',
    gap: '12px',
    fontSize: '18px',
    fontWeight: '600',
    color: '#357ab2',
  };
  const buttonRowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '24px',
  };
  const actionButtonStyle = {
    padding: '8px 16px',
    borderRadius: '9999px',
    fontSize: '14px',
    fontWeight: '500',
    border: '1px solid #357ab2',
    color: '#357ab2',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
  };
  const mainGridStyle = {
    display: 'grid',
    // On larger screens mimic a two-thirds / one-third layout by
    // explicitly defining two columns. On smaller screens this
    // naturally stacks because overflow is allowed and width
    // collapses. Using percentages avoids reliance on media queries.
    gridTemplateColumns: '2fr 1fr',
    borderTop: '1px solid #357ab2',
    borderLeft: '1px solid #357ab2',
  };
  const leftColumnStyle = {
    borderRight: '1px solid #357ab2',
  };
  const rightColumnStyle = {
    borderRight: '1px solid #357ab2',
    display: 'flex',
    flexDirection: 'column',
    padding: '16px',
    justifyContent: 'flex-start',
    alignItems: 'center',
  };
  // Section styles within left column
  const sectionStyle = {
    borderBottom: '1px solid #357ab2',
    padding: '16px',
  };
  const sectionTitleStyle = {
    fontSize: '18px',
    fontWeight: '600',
    color: '#357ab2',
    marginBottom: '8px',
  };
  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    borderLeft: '1px solid #357ab2',
    borderTop: '1px solid #357ab2',
    fontSize: '14px',
  };
  const cellHeaderStyle = {
    padding: '8px 12px',
    borderRight: '1px solid #357ab2',
    borderBottom: '1px solid #357ab2',
    fontWeight: '500',
    color: '#5a5a5a',
    backgroundColor: '#ffffff',
    textAlign: 'left',
  };
  const cellStyle = {
    padding: '8px 12px',
    borderRight: '1px solid #357ab2',
    borderBottom: '1px solid #357ab2',
    color: '#1f1f1f',
    backgroundColor: '#ffffff',
  };

  return (
    <div style={wrapperStyle}>
      {/* Header with back arrow and invoice summary */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={onBack}
            aria-label="Back"
            style={{
              color: '#357ab2',
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
            }}
          >
            <i className="fas fa-arrow-left"></i>
          </button>
          <div style={summaryStyle}>
            <span>{invoice.invoice}</span>
            <span>{invoice.vendor}</span>
            <span>{invoice.amount}</span>
            <span>{invoice.office}</span>
          </div>
        </div>
        {/* Download icon on right */}
        <button
          aria-label="Download"
          style={{
            color: '#357ab2',
            background: 'none',
            border: 'none',
            fontSize: '20px',
            cursor: 'pointer',
          }}
        >
          <i className="fas fa-download"></i>
        </button>
      </div>

      {/* Action buttons */}
      <div style={buttonRowStyle}>
        {['Approve', 'Reject', 'Repair'].map((action) => (
          <button
            key={action}
            style={actionButtonStyle}
          >
            {action}
          </button>
        ))}
      </div>

      {/* Main content: two columns using grid. On small screens it
          stacks; on larger screens we allow it to span 2/3 and 1/3
          implicitly via the parent container. */}
      <div style={mainGridStyle}>
        {/* Left column: invoice status, details and line items */}
        <div style={leftColumnStyle}>
          {/* Invoice Status section */}
          <div style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Invoice Status</h2>
            <table style={tableStyle}>
              <tbody>
                <tr>
                  <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>Approval</td>
                  <td style={cellStyle}>McKay  Mckaym@pacificcrestsmiles.com</td>
                </tr>
                <tr>
                  <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>Payment</td>
                  <td style={cellStyle}>
                    {invoice.amount} — To Be Paid
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {/* Invoice Details section */}
          <div style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Invoice Details</h2>
            <table style={tableStyle}>
              <tbody>
                <tr>
                  <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>Invoice #</td>
                  <td style={cellStyle}>{invoice.invoice}</td>
                </tr>
                <tr>
                  <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>Vendor</td>
                  <td style={cellStyle}>{invoice.vendor}</td>
                </tr>
                <tr>
                  <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>Office</td>
                  <td style={cellStyle}>{invoice.office}</td>
                </tr>
                <tr>
                  <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>Category</td>
                  <td style={cellStyle}>{invoice.category || 'Dental Lab'}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {/* Line Items section */}
          <div style={{ padding: '16px' }}>
            <h2 style={sectionTitleStyle}>Line Items</h2>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...cellHeaderStyle, textAlign: 'left' }}>ID</th>
                  <th style={{ ...cellHeaderStyle, textAlign: 'left' }}>Name</th>
                  <th style={{ ...cellHeaderStyle, textAlign: 'center' }}>QTY</th>
                  <th style={{ ...cellHeaderStyle, textAlign: 'right' }}>Unit Price</th>
                  <th style={{ ...cellHeaderStyle, textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, idx) => (
                  <tr key={idx}>
                    <td style={cellStyle}>{item.id}</td>
                    <td style={cellStyle}>{item.name}</td>
                    <td style={{ ...cellStyle, textAlign: 'center' }}>{item.qty}</td>
                    <td style={{ ...cellStyle, textAlign: 'right' }}>{item.unit}</td>
                    <td style={{ ...cellStyle, textAlign: 'right' }}>{item.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {/* Right column: PDF placeholder */}
        <div style={rightColumnStyle}>
          <div
            style={{
              width: '100%',
              height: '100%',
              border: '1px solid #357ab2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ color: '#a0aec0' }}>Invoice PDF</span>
          </div>
        </div>
      </div>
    </div>
  );
}