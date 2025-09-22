import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const { 
      invoice_number, 
      original_data, 
      corrected_data, 
      pdf_path, 
      vendor_name 
    } = body;

    console.log('🔧 Repair API: Processing repair for invoice:', invoice_number);

    // Determine the parser name based on vendor
    let parser_name = 'generic_parser.py';
    if (vendor_name?.toLowerCase().includes('henry')) {
      parser_name = 'henry_parser.py';
    } else if (vendor_name?.toLowerCase().includes('patterson')) {
      parser_name = 'patterson_parser.py';
    } else if (vendor_name?.toLowerCase().includes('tc dental')) {
      parser_name = 'multipage_invoice_processor.py';
    }

    // Create temporary files for the repair logging
    const tempDir = path.join(process.cwd(), 'temp_repair');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const originalJsonPath = path.join(tempDir, `${invoice_number}_original.json`);
    const correctedJsonPath = path.join(tempDir, `${invoice_number}_corrected.json`);
    
    // Write the JSON files
    fs.writeFileSync(originalJsonPath, JSON.stringify(original_data, null, 2));
    fs.writeFileSync(correctedJsonPath, JSON.stringify(corrected_data, null, 2));

    // Determine the PDF path
    let actualPdfPath = pdf_path;
    if (pdf_path?.startsWith('/api/pdf/')) {
      // Convert API path to actual file path
      const filename = pdf_path.replace('/api/pdf/', '');
      actualPdfPath = path.join(process.cwd(), 'pcs_ai_data', 'pdfs', filename);
    }

    // Call the Python repair logging function
    const { spawn } = require('child_process');
    
    const pythonProcess = spawn('python3', [
      '-c',
      `
import sys
sys.path.append('${process.cwd()}')
from repair_loop.capture_repair_event import capture_repair_event
import json

try:
    result = capture_repair_event(
        invoice_number='${invoice_number}',
        vendor_name='${vendor_name || 'Unknown'}',
        parser_name='${parser_name}',
        original_output_path='${originalJsonPath}',
        corrected_output_path='${correctedJsonPath}',
        invoice_pdf_path='${actualPdfPath}'
    )
    print(f"SUCCESS:{result}")
except Exception as e:
    print(f"ERROR:{str(e)}")
    sys.exit(1)
      `
    ]);

    let output = '';
    let error = '';

    pythonProcess.stdout.on('data', (data: Buffer) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data: Buffer) => {
      error += data.toString();
    });

    return await new Promise<Response>((resolve) => {
      pythonProcess.on('close', (code: number) => {
        // Clean up temporary files
        try {
          fs.unlinkSync(originalJsonPath);
          fs.unlinkSync(correctedJsonPath);
        } catch (e) {
          console.warn('Could not clean up temp files:', e);
        }

        if (code === 0 && output.includes('SUCCESS:')) {
          const resultPath = output.split('SUCCESS:')[1].trim();
          console.log('✅ Repair data logged successfully:', resultPath);
          resolve(NextResponse.json({ 
            success: true, 
            message: 'Repair data logged successfully',
            repair_case_path: resultPath
          }));
        } else {
          console.error('❌ Repair logging failed:', error || output);
          resolve(NextResponse.json({ 
            success: false, 
            error: error || output || 'Unknown error'
          }, { status: 500 }));
        }
      });
    });

  } catch (error) {
    console.error('❌ Repair API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
