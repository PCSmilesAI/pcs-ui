import { NextRequest, NextResponse } from 'next/server';
import { qboClient, QBOBill } from '../../../../lib/qbo/qboClient';
import fs from 'fs';
import path from 'path';

// Dental category mapping based on common dental terms
const DENTAL_CATEGORY_MAPPING = {
  // Supplies
  'supplies': ['supply', 'supplies', 'material', 'materials', 'consumable'],
  'dental_supplies': ['dental', 'tooth', 'teeth', 'oral', 'mouth'],
  'instruments': ['instrument', 'tool', 'drill', 'scalpel', 'probe'],
  'disposables': ['disposable', 'glove', 'mask', 'gauze', 'cotton'],
  
  // Equipment
  'equipment': ['equipment', 'machine', 'device', 'unit', 'system'],
  'xray_equipment': ['x-ray', 'xray', 'radiograph', 'imaging'],
  'dental_chairs': ['chair', 'seat', 'unit'],
  
  // Lab work
  'lab_work': ['lab', 'laboratory', 'crown', 'bridge', 'implant', 'denture'],
  'crowns': ['crown', 'cap', 'restoration'],
  'bridges': ['bridge', 'fixed'],
  'dentures': ['denture', 'partial', 'complete'],
  
  // Services
  'cleaning': ['cleaning', 'prophylaxis', 'hygiene', 'scaling'],
  'filling': ['filling', 'composite', 'amalgam', 'restoration'],
  'extraction': ['extraction', 'removal', 'surgery'],
  'orthodontic': ['orthodontic', 'braces', 'aligner', 'retainer'],
  
  // Medications
  'anesthesia': ['anesthesia', 'numbing', 'lidocaine', 'novocaine'],
  'medication': ['medication', 'drug', 'prescription', 'antibiotic']
};

function categorizeLineItem(description: string, amount: number): string {
  const desc = description.toLowerCase();
  
  // Find the best matching category
  for (const [category, keywords] of Object.entries(DENTAL_CATEGORY_MAPPING)) {
    if (keywords.some(keyword => desc.includes(keyword))) {
      return category;
    }
  }
  
  // Default categorization based on amount
  if (amount > 1000) return 'equipment';
  if (amount > 100) return 'lab_work';
  if (amount > 10) return 'dental_supplies';
  return 'supplies';
}

function mapToQBOItem(category: string): string {
  // Map our categories to QBO item names
  const categoryMap: { [key: string]: string } = {
    'supplies': 'Dental Supplies',
    'dental_supplies': 'Dental Supplies',
    'instruments': 'Dental Instruments',
    'disposables': 'Disposable Items',
    'equipment': 'Dental Equipment',
    'xray_equipment': 'X-Ray Equipment',
    'dental_chairs': 'Dental Chairs',
    'lab_work': 'Lab Work',
    'crowns': 'Crowns',
    'bridges': 'Bridges',
    'dentures': 'Dentures',
    'cleaning': 'Cleaning Services',
    'filling': 'Filling Materials',
    'extraction': 'Extraction Services',
    'orthodontic': 'Orthodontic Services',
    'anesthesia': 'Anesthesia',
    'medication': 'Medications'
  };
  
  return categoryMap[category] || 'Dental Supplies';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      invoiceData, 
      pdfPath, 
      vendorName, 
      invoiceNumber, 
      totalAmount, 
      invoiceDate, 
      dueDate 
    } = body;

    console.log('🔄 Creating QBO Bill for invoice:', invoiceNumber);

    // Initialize QBO client
    await qboClient.initialize();

    // Test connection first
    const isConnected = await qboClient.testConnection();
    if (!isConnected) {
      throw new Error('QuickBooks connection failed. Please reconnect.');
    }

    // Get available items for category mapping
    const dentalItems = await qboClient.getDentalItems();
    console.log('📋 Found', dentalItems.length, 'dental items in QBO');

    // Parse line items from invoice data
    const lineItems = invoiceData.line_items || [];
    const qboLines = lineItems.map((item: any, index: number) => {
      const description = item.description || item.name || `Item ${index + 1}`;
      const amount = parseFloat(item.amount || item.total || '0');
      const quantity = parseFloat(item.quantity || '1');
      const unitPrice = amount / quantity;

      // Categorize the line item
      const category = categorizeLineItem(description, amount);
      const qboItemName = mapToQBOItem(category);

      // Find matching QBO item or use default
      const matchingItem = dentalItems.find(item => 
        item.Name.toLowerCase().includes(qboItemName.toLowerCase())
      );

      return {
        Id: (index + 1).toString(),
        LineNum: index + 1,
        Amount: amount,
        DetailType: 'ItemBasedExpenseLineDetail',
        ItemBasedExpenseLineDetail: {
          ItemRef: {
            value: matchingItem?.Id || '1', // Default to first item if no match
            name: matchingItem?.Name || qboItemName
          },
          Qty: quantity,
          UnitPrice: unitPrice
        }
      };
    });

    // Create the bill
    const bill: QBOBill = {
      DocNumber: invoiceNumber,
      TxnDate: invoiceDate,
      DueDate: dueDate,
      VendorRef: {
        value: '1', // You'll need to map vendor names to QBO vendor IDs
        name: vendorName
      },
      Line: qboLines
    };

    // Create the bill in QuickBooks
    const createdBill = await qboClient.createBill(bill);
    console.log('✅ QBO Bill created successfully:', createdBill.Id);

    // Handle PDF attachment if provided
    if (pdfPath && fs.existsSync(pdfPath)) {
      try {
        const pdfBuffer = fs.readFileSync(pdfPath);
        const fileName = path.basename(pdfPath);
        
        await qboClient.uploadAttachment(
          createdBill.Id!,
          fileName,
          pdfBuffer,
          'application/pdf'
        );
        
        console.log('📎 PDF attachment added to bill');
      } catch (attachmentError) {
        console.warn('⚠️ Failed to attach PDF:', attachmentError);
        // Don't fail the entire operation for attachment issues
      }
    }

    return NextResponse.json({
      success: true,
      billId: createdBill.Id,
      message: 'Bill created successfully in QuickBooks',
      categories: lineItems.map((item: any, index: number) => ({
        description: item.description || item.name || `Item ${index + 1}`,
        category: categorizeLineItem(item.description || item.name || `Item ${index + 1}`, parseFloat(item.amount || item.total || '0'))
      }))
    });

  } catch (error: any) {
    console.error('❌ Error creating QBO Bill:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to create bill in QuickBooks'
    }, { status: 500 });
  }
}
