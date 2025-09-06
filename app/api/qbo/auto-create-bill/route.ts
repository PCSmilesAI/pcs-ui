import { NextRequest, NextResponse } from 'next/server';
import { autoBillService } from '../../../../lib/qbo/autoBillService';

export async function POST(req: NextRequest) {
  try {
    const { invoiceData } = await req.json();

    if (!invoiceData) {
      return NextResponse.json({
        success: false,
        error: 'Invoice data is required'
      }, { status: 400 });
    }

    console.log('🔄 Auto-create bill request for invoice:', invoiceData.invoice_number);

    // Process the approved invoice
    const result = await autoBillService.processApprovedInvoice(invoiceData);

    if (result.success) {
      return NextResponse.json({
        success: true,
        billId: result.billId,
        message: 'Bill created successfully in QuickBooks'
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error || 'Failed to create bill'
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error('❌ Auto-create bill error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
}

// Test connection endpoint
export async function GET(req: NextRequest) {
  try {
    const isConnected = await autoBillService.testConnection();
    const categories = await autoBillService.getDentalCategories();

    return NextResponse.json({
      connected: isConnected,
      categories: categories.length,
      message: isConnected ? 'QuickBooks connected successfully' : 'QuickBooks not connected'
    });

  } catch (error: any) {
    console.error('❌ Connection test error:', error);
    return NextResponse.json({
      connected: false,
      error: error.message || 'Connection test failed'
    }, { status: 500 });
  }
}
