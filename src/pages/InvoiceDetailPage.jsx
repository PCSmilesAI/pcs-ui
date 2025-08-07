import React, { useState, useEffect } from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';

/**
 * Detail view for a single invoice. Displays high level summary
 * information at the top along with actions (approve, reject,
 * repair). Below the summary the left column shows invoice
 * status, details and line items. The right column contains the
 * actual invoice PDF. A back arrow returns the user to the
 * previous list. This version uses only inline styles so
 * that the layout and colours appear even if no CSS preprocessor
 * is available.
 */
export default function InvoiceDetailPage({ invoice, onBack }) {
  // State for editable fields. Payment amount can be modified by the
  // user. Other details and line items could be lifted into state
  // similarly; here we demonstrate for payment and details.
  const [paymentAmount, setPaymentAmount] = useState(invoice.amount);
  const [details, setDetails] = useState({
    invoice: invoice.invoice,
    vendor: invoice.vendor,
    office: invoice.office,
    category: invoice.category || 'Dental Lab',
    invoice_date: invoice.invoice_date || '',
  });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // Load line items from JSON data
  useEffect(() => {
    async function loadLineItems() {
      if (invoice.json_path) {
        try {
          const response = await fetch(`/${invoice.json_path}`);
          if (response.ok) {
            const jsonData = await response.json();
            if (jsonData.line_items && Array.isArray(jsonData.line_items)) {
              // Transform the line items to match the UI format
              const transformedItems = jsonData.line_items.map((item, index) => ({
                id: item.product_number || `item-${index}`,
                name: item.product_name || '',
                qty: item.Quantity || '1',
                unit: `$${item.unit_price || '0.00'}`,
                total: `$${item.line_item_total || '0.00'}`,
              }));
              setItems(transformedItems);
            } else {
              // Fallback to empty array if no line items
              setItems([]);
            }
          } else {
            console.warn('Failed to load JSON data for line items');
            setItems([]);
          }
        } catch (error) {
          console.error('Error loading line items:', error);
          setItems([]);
        }
      } else {
        // Fallback to empty array if no JSON path
        setItems([]);
      }
      setLoading(false);
    }

    loadLineItems();
  }, [invoice.json_path]);

  function handleDetailChange(field, value) {
    setDetails((prev) => ({ ...prev, [field]: value }));
  }

  function handleItemChange(index, field, value) {
    setItems((prev) => {
      const updated = prev.slice();
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  // Function to handle PDF download
  function handleDownload() {
    if (invoice.pdf_path) {
      // Create a link element to trigger the download
      const link = document.createElement('a');
      link.href = `/${invoice.pdf_path}`;
      link.download = `${invoice.invoice || invoice.invoice_number}_${invoice.vendor}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      console.warn('No PDF path available for download');
    }
  }

  // Function to update invoice status in the queue
  async function updateInvoiceStatus(newStatus, newApproved = null) {
    setProcessing(true);
    try {
      // Call the API to update the invoice status
      const response = await fetch('/api/update-invoice-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invoice_number: invoice.invoice_number,
          status: newStatus,
          approved: newApproved
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update invoice status');
      }

      const result = await response.json();
      console.log('Invoice status updated:', result);
      
      // Show success message
      alert(`Invoice ${newStatus.toLowerCase()} successfully!`);
      
      // Navigate back to refresh the list
      onBack();
      
    } catch (error) {
      console.error('Error updating invoice status:', error);
      alert('Error updating invoice status. Please try again.');
    } finally {
      setProcessing(false);
    }
  }

  // Button click handlers
  function handleApprove() {
    updateInvoiceStatus('approved', true);
  }

  function handleReject() {
    updateInvoiceStatus('rejected', false);
  }

  function handleRepair() {
    updateInvoiceStatus('repair', false);
  }

  function handlePaid() {
    updateInvoiceStatus('completed', true);
  }

  function handleRemove() {
    if (confirm('Are you sure you want to remove this invoice from the system?')) {
      updateInvoiceStatus('removed', false);
    }
  }

  // Determine which buttons to show based on invoice status
  function getActionButtons() {
    const status = invoice.status || 'new';
    const approved = invoice.approved || false;

    if (status === 'removed') {
      return []; // No buttons for removed invoices
    }

    if (status === 'completed') {
      return [
        { label: 'Remove', onClick: handleRemove, style: { ...actionButtonStyle, backgroundColor: '#dc2626', color: '#ffffff', borderColor: '#dc2626' } }
      ];
    }

    if (approved && status === 'approved') {
      return [
        { label: 'Paid', onClick: handlePaid, style: { ...actionButtonStyle, backgroundColor: '#059669', color: '#ffffff', borderColor: '#059669' } },
        { label: 'Reject', onClick: handleReject, style: { ...actionButtonStyle, backgroundColor: '#dc2626', color: '#ffffff', borderColor: '#dc2626' } },
        { label: 'Repair', onClick: handleRepair, style: { ...actionButtonStyle, backgroundColor: '#d97706', color: '#ffffff', borderColor: '#d97706' } }
      ];
    }

    // Default buttons for new/unapproved invoices
    return [
      { label: 'Approve', onClick: handleApprove, style: { ...actionButtonStyle, backgroundColor: '#059669', color: '#ffffff', borderColor: '#059669' } },
      { label: 'Reject', onClick: handleReject, style: { ...actionButtonStyle, backgroundColor: '#dc2626', color: '#ffffff', borderColor: '#dc2626' } },
      { label: 'Repair', onClick: handleRepair, style: { ...actionButtonStyle, backgroundColor: '#d97706', color: '#ffffff', borderColor: '#d97706' } }
    ];
  }

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
    gap: '24px', // more spacing between data points
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
    transition: 'all 0.2s ease',
  };
  const mainGridStyle = {
    display: 'grid',
    // Use equal columns to center the divider on the page. Each column
    // takes up half of the available width so the vertical line sits
    // precisely in the middle.
    gridTemplateColumns: '1fr 1fr',
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
            <span>{invoice.invoice || invoice.invoice_number}</span>
            <span>{invoice.vendor}</span>
            <span>{invoice.amount}</span>
          </div>
        </div>
        <button
          onClick={handleDownload}
          aria-label="Download PDF"
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
        {getActionButtons().map((button) => (
          <button
            key={button.label}
            onClick={button.onClick}
            disabled={processing}
            style={{
              ...button.style,
              opacity: processing ? 0.6 : 1,
              cursor: processing ? 'not-allowed' : 'pointer',
            }}
          >
            {processing ? 'Processing...' : button.label}
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
                {/* Row 1: Approval with name and email */}
                <tr>
                  <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>Approval</td>
                  <td style={cellStyle}>McKay</td>
                  <td style={cellStyle}>mckaym@pacificcrestsmiles.com</td>
                </tr>
                {/* Row 2: Payment with editable amount and status */}
                <tr>
                  <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>Payment</td>
                  <td style={cellStyle}>
                    <input
                      type="text"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      style={{
                        border: '1px solid #cbd5e0',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '14px',
                        width: '80px',
                      }}
                    />
                  </td>
                  <td style={cellStyle}>{invoice.status || 'New'}</td>
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
                  <td style={cellStyle}>
                    <input
                      type="text"
                      value={details.invoice}
                      onChange={(e) => handleDetailChange('invoice', e.target.value)}
                      style={{
                        border: '1px solid #cbd5e0',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '14px',
                        width: 'calc(100% - 16px)',
                        boxSizing: 'border-box',
                      }}
                    />
                  </td>
                </tr>
                <tr>
                  <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>Invoice Date</td>
                  <td style={cellStyle}>
                    <input
                      type="text"
                      value={details.invoice_date}
                      onChange={(e) => handleDetailChange('invoice_date', e.target.value)}
                      style={{
                        border: '1px solid #cbd5e0',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '14px',
                        width: 'calc(100% - 16px)',
                        boxSizing: 'border-box',
                      }}
                    />
                  </td>
                </tr>
                <tr>
                  <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>Vendor</td>
                  <td style={cellStyle}>
                    <input
                      type="text"
                      value={details.vendor}
                      onChange={(e) => handleDetailChange('vendor', e.target.value)}
                      style={{
                        border: '1px solid #cbd5e0',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '14px',
                        width: 'calc(100% - 16px)',
                        boxSizing: 'border-box',
                      }}
                    />
                  </td>
                </tr>
                <tr>
                  <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>Office</td>
                  <td style={cellStyle}>
                    <input
                      type="text"
                      value={details.office}
                      onChange={(e) => handleDetailChange('office', e.target.value)}
                      style={{
                        border: '1px solid #cbd5e0',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '14px',
                        width: 'calc(100% - 16px)',
                        boxSizing: 'border-box',
                      }}
                    />
                  </td>
                </tr>
                <tr>
                  <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>Category</td>
                  <td style={cellStyle}>
                    <input
                      type="text"
                      value={details.category}
                      onChange={(e) => handleDetailChange('category', e.target.value)}
                      style={{
                        border: '1px solid #cbd5e0',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '14px',
                        width: 'calc(100% - 16px)',
                        boxSizing: 'border-box',
                      }}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {/* Line Items section */}
          <div style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Line Items</h2>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>Loading line items...</div>
            ) : items.length > 0 ? (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={cellHeaderStyle}>Item</th>
                    <th style={cellHeaderStyle}>Qty</th>
                    <th style={cellHeaderStyle}>Unit</th>
                    <th style={cellHeaderStyle}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id || index}>
                      <td style={cellStyle}>
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => handleItemChange(index, 'name', e.target.value)}
                          style={{
                            border: '1px solid #cbd5e0',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '14px',
                            width: 'calc(100% - 16px)',
                            boxSizing: 'border-box',
                          }}
                        />
                      </td>
                      <td style={cellStyle}>
                        <input
                          type="text"
                          value={item.qty}
                          onChange={(e) => handleItemChange(index, 'qty', e.target.value)}
                          style={{
                            border: '1px solid #cbd5e0',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '14px',
                            width: '60px',
                            textAlign: 'center',
                          }}
                        />
                      </td>
                      <td style={cellStyle}>
                        <input
                          type="text"
                          value={item.unit}
                          onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                          style={{
                            border: '1px solid #cbd5e0',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '14px',
                            width: '80px',
                            textAlign: 'right',
                          }}
                        />
                      </td>
                      <td style={cellStyle}>
                        <input
                          type="text"
                          value={item.total}
                          onChange={(e) => handleItemChange(index, 'total', e.target.value)}
                          style={{
                            border: '1px solid #cbd5e0',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '14px',
                            width: '80px',
                            textAlign: 'right',
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                No line items available
              </div>
            )}
          </div>
        </div>
        {/* Right column: PDF viewer */}
        <div style={rightColumnStyle}>
          {invoice.pdf_path ? (
            <iframe
              src={`/${invoice.pdf_path}`}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                minHeight: '600px',
              }}
              title="Invoice PDF"
            />
          ) : (
            <div style={{ textAlign: 'center', color: '#666' }}>
              No PDF available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}