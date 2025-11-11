import { NextRequest, NextResponse } from 'next/server';
import { tokenStorage } from '../../../../lib/qbo/tokenStorage';
import { createBillFromInvoice, InvoiceData as ServiceInvoiceData } from '../../../../lib/qbo/billCreationService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseAmount(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseFloat(value.replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      invoiceData,
      vendorName,
      invoiceNumber,
      invoiceDate,
      dueDate,
      pdfPath,
      totalAmount,
    } = body || {};

    if (!invoiceData) {
      return NextResponse.json({
        success: false,
        error: 'Invoice data is required',
      }, { status: 400 });
    }

    const tokens = await tokenStorage.getLatestTokens();
    if (!tokens) {
      return NextResponse.json({
        success: false,
        error: 'QuickBooks not connected. Please connect to QuickBooks first.',
      }, { status: 400 });
    }

    const mergedInvoiceData: ServiceInvoiceData = {
      ...invoiceData,
      invoice_number: invoiceData.invoice_number ?? invoiceNumber,
      invoiceNumber: invoiceData.invoiceNumber ?? invoiceNumber,
      vendor: invoiceData.vendor ?? invoiceData.vendor_name ?? vendorName,
      vendorName: invoiceData.vendorName ?? vendorName,
      pdf_path: invoiceData.pdf_path ?? pdfPath,
      pdfPath: invoiceData.pdfPath ?? pdfPath,
      invoice_date: invoiceData.invoice_date ?? invoiceDate,
      invoiceDate: invoiceData.invoiceDate ?? invoiceDate,
      due_date: invoiceData.due_date ?? dueDate,
      dueDate: invoiceData.dueDate ?? dueDate,
    };

    const amount = parseAmount(totalAmount ?? invoiceData.total ?? invoiceData.amount ?? invoiceData.totalAmount);
 
    const result = await createBillFromInvoice({
      invoiceData: mergedInvoiceData,
      vendorName: vendorName || invoiceData.vendor || invoiceData.vendorName,
      invoiceNumber: invoiceNumber || invoiceData.invoice_number || invoiceData.invoiceNumber,
      invoiceDate: invoiceDate || invoiceData.invoice_date || invoiceData.invoiceDate,
      dueDate: dueDate || invoiceData.due_date || invoiceData.dueDate,
      pdfPath: pdfPath || invoiceData.pdf_path || invoiceData.pdfPath,
      totalAmount: typeof amount === 'number' ? amount : undefined,
 
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        billId: result.billId,
        pdfAttached: result.pdfAttached ?? false,
        categories: result.categories ?? [],
        message: 'Bill created successfully in QuickBooks',
      });
    }

    return NextResponse.json({
      success: false,
      error: result.error || 'Failed to create bill',
    }, { status: 500 });

  } catch (error: any) {
    // Log full error server-side only
    console.error('❌ Error creating QBO Bill:', error);
    // Return safe error message to client
    return NextResponse.json({
      success: false,
      error: 'Failed to create bill in QuickBooks',
    }, { status: 500 });
  }
}
