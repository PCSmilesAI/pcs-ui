import React, { useState, useEffect } from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { fetchQboCategories } from '../lib/categoriesClient';

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
  // Guard clause for undefined invoice during static generation
  if (!invoice) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <h2>Invoice not found</h2>
        <p>This invoice could not be loaded.</p>
        {onBack && (
          <button
            onClick={onBack}
            style={{
              padding: '8px 16px',
              backgroundColor: '#357ab2',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginTop: '16px'
            }}
          >
            Go Back
          </button>
        )}
      </div>
    );
  }

  // State for editable fields. Payment amount can be modified by the
  // user. Other details and line items could be lifted into state
  // similarly; here we demonstrate for payment and details.
  const [paymentAmount, setPaymentAmount] = useState(invoice?.amount || '');
  const [details, setDetails] = useState({
    invoice: invoice?.invoice || '',
    vendor: invoice?.vendor || '',
    office: invoice?.office || '',
    category: invoice?.category || 'Dental Lab',
    invoice_date: invoice?.invoice_date || '',
    due_date: invoice?.due_date || '',
  });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [lineCategories, setLineCategories] = useState({});
  const [loadingLineCategories, setLoadingLineCategories] = useState(false);

  // Load line items from JSON data
  useEffect(() => {
    async function loadLineItems() {
      if (invoice?.json_path) {
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
                category: item.quickbooks_category || 'Not categorized',
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
  }, [invoice?.json_path]);

  // Load line categories when component mounts or invoice changes
  useEffect(() => {
    if (invoice?.id || invoice?.invoice_number) {
      loadLineCategories();
    }
  }, [invoice?.id, invoice?.invoice_number]);

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

  // This function is now imported from categoriesClient.js

  // Fetch QuickBooks categories (wrapper for existing code)
  async function fetchCategories() {
    setLoadingCategories(true);
    try {
      const result = await fetchQboCategories();
      setCategories(result.categories);
      console.log('✅ Categories loaded:', result.categories.length, 'from', result.source);
      
      // Show helpful message if no categories found
      if (result.categories.length === 0) {
        const message = result.reason || 'No expense accounts found in QuickBooks. Ask your accountant to set up Chart of Accounts.';
        console.log('ℹ️', message);
        // Don't show alert for empty results, just log it
      }
    } catch (error) {
      console.error('❌ Error fetching categories:', error);
      // Show the actual error message instead of generic "undefined"
      alert(`Failed to load QuickBooks categories: ${error.message}`);
    } finally {
      setLoadingCategories(false);
    }
  }

  // Load line categories for this invoice
  async function loadLineCategories() {
    if (!invoice?.id && !invoice?.invoice_number) return;
    
    setLoadingLineCategories(true);
    try {
      const invoiceId = invoice.id || invoice.invoice_number;
      const response = await fetch(`/api/invoices/${invoiceId}/categories`);
      
      if (response.ok) {
        const data = await response.json();
        setLineCategories(data.lineCategories || {});
        console.log('✅ Line categories loaded:', Object.keys(data.lineCategories || {}).length, 'assignments');
      } else {
        console.warn('Failed to load line categories:', response.status);
        setLineCategories({});
      }
    } catch (error) {
      console.error('❌ Error loading line categories:', error);
      setLineCategories({});
    } finally {
      setLoadingLineCategories(false);
    }
  }

  // Auto-categorize line items
  async function autoCategorize() {
    if (!invoice?.id && !invoice?.invoice_number) return;
    
    setLoadingLineCategories(true);
    try {
      const invoiceId = invoice.id || invoice.invoice_number;
      const response = await fetch(`/api/invoices/${invoiceId}/auto-categorize`, {
        method: 'POST'
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Auto-categorization complete:', data.categorizedCount, 'of', data.lineCount, 'lines categorized');
        
        // Reload the categories to show the new assignments
        await loadLineCategories();
      } else {
        const errorData = await response.json();
        console.error('❌ Auto-categorization failed:', errorData.detail || errorData.error);
        alert(`Auto-categorization failed: ${errorData.detail || errorData.error}`);
      }
    } catch (error) {
      console.error('❌ Error during auto-categorization:', error);
      alert(`Auto-categorization failed: ${error.message}`);
    } finally {
      setLoadingLineCategories(false);
    }
  }

  // Save line category changes
  async function saveLineCategories() {
    if (!invoice?.id && !invoice?.invoice_number) return;
    
    try {
      const invoiceId = invoice.id || invoice.invoice_number;
      const response = await fetch(`/api/invoices/${invoiceId}/categories`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ lineCategories })
      });
      
      if (response.ok) {
        console.log('✅ Line categories saved successfully');
      } else {
        const errorData = await response.json();
        console.error('❌ Failed to save line categories:', errorData.detail || errorData.error);
        alert(`Failed to save categories: ${errorData.detail || errorData.error}`);
      }
    } catch (error) {
      console.error('❌ Error saving line categories:', error);
      alert(`Failed to save categories: ${error.message}`);
    }
  }

  // Update a specific line category
  function updateLineCategory(index, categoryId, categoryName) {
    setLineCategories(prev => ({
      ...prev,
      [index]: {
        categoryId,
        categoryName,
        confidence: 1.0,
        source: 'manual',
        updatedAt: new Date().toISOString()
      }
    }));
  }

  // Apply intelligent categorization to line items
  async function applyIntelligentCategorization() {
    if (categories.length === 0) {
      alert('Please fetch categories first');
      return;
    }

    setProcessing(true);
    try {
      const updatedItems = items.map(item => {
        const description = item.name.toLowerCase();
        let bestCategory = 'Not categorized';
        let bestScore = 0;

        // Find best matching category
        categories.forEach(category => {
          const categoryName = category.name.toLowerCase();
          let score = 0;

          // Check for keyword matches
          if (description.includes('supply') || description.includes('material')) {
            if (categoryName.includes('supply')) score += 3;
          }
          if (description.includes('equipment') || description.includes('machine')) {
            if (categoryName.includes('equipment')) score += 3;
          }
          if (description.includes('lab') || description.includes('crown') || description.includes('bridge')) {
            if (categoryName.includes('lab')) score += 3;
          }
          if (description.includes('cleaning') || description.includes('hygiene')) {
            if (categoryName.includes('cleaning')) score += 3;
          }
          if (description.includes('filling') || description.includes('composite')) {
            if (categoryName.includes('filling')) score += 3;
          }
          if (description.includes('x-ray') || description.includes('radiograph')) {
            if (categoryName.includes('x-ray')) score += 3;
          }

          // Direct name matching
          if (categoryName.includes(description.split(' ')[0])) score += 2;
          if (description.includes(categoryName.split(' ')[0])) score += 2;

          if (score > bestScore) {
            bestScore = score;
            bestCategory = category.name;
          }
        });

        return {
          ...item,
          category: bestCategory
        };
      });

      setItems(updatedItems);
      console.log('✅ Intelligent categorization applied');
      alert('Intelligent categorization applied to all line items');
    } catch (error) {
      console.error('❌ Error applying categorization:', error);
      alert('Error applying categorization: ' + error.message);
    } finally {
      setProcessing(false);
    }
  }

  // Save categories to invoice
  async function saveCategories() {
    setProcessing(true);
    try {
      const response = await fetch('/api/qbo/update-invoice-categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invoiceNumber: invoice?.invoice_number,
          lineItems: items.map((item, index) => ({
            product_number: item.id,
            name: item.name,
            category: item.category,
            index: index
          }))
        })
      });

      const result = await response.json();
      
      if (result.success) {
        console.log('✅ Categories saved to invoice');
        alert('Categories saved to invoice successfully');
      } else {
        console.error('❌ Failed to save categories:', result.error);
        alert('Failed to save categories: ' + result.error);
      }
    } catch (error) {
      console.error('❌ Error saving categories:', error);
      alert('Error saving categories: ' + error.message);
    } finally {
      setProcessing(false);
    }
  }

  // Function to handle PDF download
  function handleDownload() {
    if (invoice?.pdf_path) {
      // Create a link element to trigger the download
      const link = document.createElement('a');
      link.href = `/${invoice.pdf_path}`;
      link.download = `${invoice?.invoice || invoice?.invoice_number || 'invoice'}_${invoice?.vendor || 'vendor'}.pdf`;
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
      console.log('Attempting to update invoice:', {
        invoice_number: invoice?.invoice_number,
        status: newStatus,
        approved: newApproved
      });

      // Load current queue
      const response = await fetch('/invoice_queue.json');
      if (!response.ok) {
        throw new Error('Failed to load invoice queue');
      }
      
      const queue = await response.json();
      
      // Find and update the specific invoice
      const updatedQueue = queue.map(inv => {
        if (inv.invoice_number === invoice?.invoice_number) {
          return {
            ...inv,
            status: newStatus,
            ...(newApproved !== null && { approved: newApproved }),
            timestamp: new Date().toISOString()
          };
        }
        return inv;
      });
      
      // Try to save to the public directory (this will work if the file is writable)
      try {
        const saveResponse = await fetch('/api/update-invoice-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            invoice_number: invoice?.invoice_number,
            status: newStatus,
            approved: newApproved
          })
        });
        
        if (saveResponse.ok) {
          console.log('API call successful');
        } else {
          console.log('API call failed, but continuing with local update');
        }
      } catch (apiError) {
        console.log('API not available, using local update only');
      }
      
      // Update the invoice prop to reflect the new status immediately
      const updatedInvoice = updatedQueue.find(inv => inv.invoice_number === invoice?.invoice_number);
      if (updatedInvoice) {
        // Update the invoice object passed from parent
        Object.assign(invoice, updatedInvoice);
      }

      // Status override functionality removed - using direct API calls
      
      // If invoice is being approved, create QuickBooks bill
      if (newStatus === 'approved' && newApproved === true) {
        try {
          console.log('🔄 Creating QuickBooks bill for approved invoice...');
          
          const billResponse = await fetch('/api/qbo/auto-create-bill', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              invoiceData: {
                invoice_number: invoice?.invoice_number,
                vendor: invoice?.vendor,
                total: invoice?.amount?.replace('$', '') || invoice?.total,
                invoice_date: invoice?.invoice_date || invoice?.invoiceDate,
                due_date: invoice?.due_date || invoice?.dueDate,
                pdf_path: invoice?.pdf_path,
                json_path: invoice?.json_path,
                line_items: invoice?.line_items || []
              }
            })
          });
          
          const billResult = await billResponse.json();
          
          if (billResult.success) {
            console.log('✅ QuickBooks bill created successfully:', billResult.billId);
            const pdfStatus = billResult.pdfAttached ? ' and PDF attached' : ' (PDF not attached)';
            alert(`Invoice approved and QuickBooks bill created! Bill ID: ${billResult.billId}${pdfStatus}`);
          } else {
            console.warn('⚠️ Failed to create QuickBooks bill:', billResult.error);
            alert(`Invoice approved, but failed to create QuickBooks bill: ${billResult.error}`);
          }
        } catch (billError) {
          console.error('❌ Error creating QuickBooks bill:', billError);
          alert(`Invoice approved, but failed to create QuickBooks bill: ${billError.message}`);
        }
      } else {
        // Show success message for non-approval actions
        alert(`Invoice ${newStatus.toLowerCase()} successfully!`);
      }
      
      // Navigate back to refresh the list
      onBack();
      
    } catch (error) {
      console.error('Error updating invoice status:', error);
      alert(`Error updating invoice status: ${error.message}`);
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
    if (invoice.status === 'completed') {
      handleRemoveCompletely();
      return;
    }
    if (confirm('Are you sure you want to remove this invoice from the system?')) {
      updateInvoiceStatus('removed', false);
    }
  }

  // Strong remove for completed invoices: delete from queue + delete files
  async function handleRemoveCompletely() {
    if (!confirm('This will permanently remove the invoice and its files. Continue?')) return;
    setProcessing(true);
    try {
      // Call API if available (local/dev)
      try {
        const resp = await fetch('/api/remove-invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoice_number: invoice?.invoice_number,
            json_path: invoice?.json_path,
            pdf_path: invoice?.pdf_path,
          })
        });
        if (!resp.ok) throw new Error('API remove failed');
      } catch (_) {
        // fall back to client-side only
      }

      // Status override functionality removed - using direct API calls

      alert('Invoice removed');
      onBack();
    } catch (e) {
      console.error(e);
      alert('Failed to remove invoice');
    } finally {
      setProcessing(false);
    }
  }

  // Determine which buttons to show based on invoice status
  function getActionButtons() {
    let status = invoice?.status || 'new';
    // If coming from Completed page and status is missing, treat as completed
    if ((!invoice?.status || invoice?.status === 'new') && invoice?._sourcePage === 'complete') {
      status = 'completed';
    }
    const approved = invoice?.approved || false;

    console.log('🔍 InvoiceDetailPage Debug:');
    console.log('  - Invoice Number:', invoice?.invoice_number);
    console.log('  - Status:', status);
    console.log('  - Approved:', approved);
    console.log('  - Full invoice object:', invoice);

    if (status === 'removed') {
      return []; // No buttons for removed invoices
    }

    if (status === 'completed') {
      return [
        { label: 'Remove', onClick: handleRemoveCompletely, style: { ...actionButtonStyle, backgroundColor: '#dc2626', color: '#ffffff', borderColor: '#dc2626' } }
      ];
    }

    if (status === 'approved') {
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
            <span>{invoice?.invoice || invoice?.invoice_number || 'N/A'}</span>
            <span>{invoice?.vendor || 'N/A'}</span>
            <span>{invoice?.amount || 'N/A'}</span>
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
                  <td style={cellStyle}>{invoice?.status || 'New'}</td>
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
                  <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>Due Date</td>
                  <td style={cellStyle}>
                    <input
                      type="text"
                      value={details.due_date}
                      onChange={(e) => handleDetailChange('due_date', e.target.value)}
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
            
            {/* Category Management Buttons */}
            <div style={{ marginBottom: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={fetchCategories}
                disabled={loadingCategories}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#357ab2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loadingCategories ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  opacity: loadingCategories ? 0.6 : 1
                }}
              >
                {loadingCategories ? 'Loading...' : 'Fetch QuickBooks Categories'}
              </button>
              
              <button
                onClick={autoCategorize}
                disabled={processing || categories.length === 0}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: (processing || categories.length === 0) ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  opacity: (processing || categories.length === 0) ? 0.6 : 1
                }}
              >
                {loadingLineCategories ? 'Processing...' : 'Auto-Categorize Items'}
              </button>
              
              <button
                onClick={saveLineCategories}
                disabled={processing}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#ffc107',
                  color: 'black',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: processing ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  opacity: processing ? 0.6 : 1
                }}
              >
                {processing ? 'Saving...' : 'Save Categories'}
              </button>
            </div>
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
                    <th style={cellHeaderStyle}>Category</th>
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
                    <td style={cellStyle}>
                      <select
                        value={lineCategories[index]?.categoryId || ''}
                        onChange={(e) => {
                          const selectedCategory = categories.find(cat => cat.id === e.target.value);
                          if (selectedCategory) {
                            updateLineCategory(index, selectedCategory.id, selectedCategory.name);
                          }
                        }}
                        style={{
                          border: '1px solid #cbd5e0',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '14px',
                          width: '100%',
                          boxSizing: 'border-box',
                          backgroundColor: lineCategories[index]?.source === 'vendor-default' ? '#f0f9ff' : 
                                         lineCategories[index]?.source === 'keyword' ? '#f0fdf4' : 'white'
                        }}
                      >
                        <option value="">{lineCategories[index]?.categoryName || 'Not categorized'}</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                      {lineCategories[index] && (
                        <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                          {lineCategories[index].source === 'vendor-default' && '🎯 Vendor default'}
                          {lineCategories[index].source === 'keyword' && '🔍 Auto-detected'}
                          {lineCategories[index].source === 'manual' && '✏️ Manual'}
                          {lineCategories[index].confidence > 0 && (
                            <span> ({(lineCategories[index].confidence * 100).toFixed(0)}%)</span>
                          )}
                        </div>
                      )}
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
          {invoice?.pdf_path ? (
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