import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { isPathWithinBase } from '../../../../lib/security/path-validation';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { invoiceNumber, lineItems } = body;

    console.log('🔄 Updating invoice categories for:', invoiceNumber);

    if (!invoiceNumber || !lineItems) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: invoiceNumber and lineItems'
      }, { status: 400 });
    }

    // SECURITY: Validate invoiceNumber to prevent path traversal
    if (!/^[a-zA-Z0-9._-]+$/.test(invoiceNumber)) {
      console.error('❌ Invalid invoiceNumber format:', invoiceNumber);
      return NextResponse.json({
        success: false,
        error: 'Invalid invoice number format'
      }, { status: 400 });
    }

    // Find the invoice JSON file
    const baseDir = path.join(process.cwd(), 'public', 'output_jsons');
    // SECURITY: Use validated invoiceNumber to construct path
    const validatedFileName = `${invoiceNumber}.json`;
    const jsonPath = path.join(baseDir, validatedFileName);

    // SECURITY: Validate path is within base directory
    if (!isPathWithinBase(jsonPath, baseDir)) {
      console.error('❌ Path traversal attempt detected in update-invoice-categories');
      return NextResponse.json({
        success: false,
        error: 'Invalid path'
      }, { status: 400 });
    }

    if (!fs.existsSync(jsonPath)) { // lgtm[js/path-injection]
      return NextResponse.json({
        success: false,
        error: 'Invoice JSON file not found'
      }, { status: 404 });
    }

    // Read current JSON data
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); // lgtm[js/path-injection]

    // Update line items with categories
    if (jsonData.line_items && Array.isArray(jsonData.line_items)) {
      jsonData.line_items = jsonData.line_items.map((item: any, index: number) => {
        const updatedItem = lineItems.find((li: any) => 
          li.product_number === item.product_number || 
          li.name === item.product_name ||
          li.index === index
        );
        
        if (updatedItem && updatedItem.category) {
          return {
            ...item,
            quickbooks_category: updatedItem.category
          };
        }
        
        return item;
      });
    }

    // Save updated JSON data
    fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2)); // lgtm[js/path-injection]

    console.log('✅ Invoice categories updated successfully');

    return NextResponse.json({
      success: true,
      message: 'Invoice categories updated successfully',
      updatedItems: jsonData.line_items.length
    });

  } catch (error: any) {
    // Log full error server-side only
    console.error('❌ Error updating invoice categories:', error);
    // Return safe error message to client
    return NextResponse.json({
      success: false,
      error: 'Failed to update invoice categories'
    }, { status: 500 });
  }
}
