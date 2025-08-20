/**
 * Send PCS AI Invoice to QuickBooks
 * Creates a bill in QuickBooks and optionally attaches the PDF
 */

const QuickBooksAPI = require('./api-client.cjs');

module.exports = async (req, res) => {
  try {
    console.log('💰 Starting invoice send to QuickBooks...');
    
    // Only allow POST requests
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { invoiceData, attachPDF } = req.body;
    
    if (!invoiceData) {
      return res.status(400).json({ error: 'Invoice data is required' });
    }

    // Validate required invoice fields
    const requiredFields = ['invoiceNumber', 'vendorId', 'lineItems', 'invoiceDate'];
    for (const field of requiredFields) {
      if (!invoiceData[field]) {
        return res.status(400).json({ error: `Missing required field: ${field}` });
      }
    }

    console.log(`📋 Processing invoice: ${invoiceData.invoiceNumber}`);

    // Create bill in QuickBooks
    const bill = await QuickBooksAPI.createBill(invoiceData);
    
    let attachment = null;
    
    // Attach PDF if requested and available
    if (attachPDF && invoiceData.pdfBuffer) {
      try {
        attachment = await QuickBooksAPI.attachPDF(
          bill.Id, 
          invoiceData.pdfBuffer, 
          `${invoiceData.invoiceNumber}.pdf`
        );
        console.log(`📎 PDF attached successfully: ${attachment.Id}`);
      } catch (pdfError) {
        console.warn(`⚠️ PDF attachment failed: ${pdfError.message}`);
        // Don't fail the whole request if PDF attachment fails
      }
    }

    // Return success response
    return res.status(200).json({
      success: true,
      message: `Invoice ${invoiceData.invoiceNumber} sent to QuickBooks successfully`,
      quickbooks: {
        billId: bill.Id,
        billNumber: bill.DocNumber,
        attachmentId: attachment?.Id || null
      },
      invoice: {
        number: invoiceData.invoiceNumber,
        vendor: invoiceData.vendorId,
        total: invoiceData.total || invoiceData.lineItems.reduce((sum, item) => sum + item.amount, 0)
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Invoice send failed:', error.message);
    
    return res.status(500).json({
      error: 'Failed to send invoice to QuickBooks',
      details: error.message
    });
  }
};
