import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

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

    // Find the invoice JSON file
    const jsonPath = path.join(process.cwd(), 'public', 'output_jsons', `${invoiceNumber}.json`);
    
    if (!fs.existsSync(jsonPath)) {
      return NextResponse.json({
        success: false,
        error: 'Invoice JSON file not found'
      }, { status: 404 });
    }

    // Read current JSON data
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

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
    fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));

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
