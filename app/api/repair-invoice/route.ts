import { NextResponse, NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getCurrentUser } from '../../../lib/auth/currentUser';
import { rateLimitByUser } from '../../../lib/ratelimit/rateLimiter';
import { isString } from '../../../lib/security/type-validation';
import { sanitizeErrorMessage } from '../../../lib/security/error-handling';
import { isPathWithinBase } from '../../../lib/security/path-validation';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  const user = getCurrentUser(request);

  // Apply rate limiting per user (200 repair requests per minute)
  const rateLimitResult = rateLimitByUser(user.email, { maxRequests: 200, windowSeconds: 60 });
  if (!rateLimitResult.allowed) {
    console.warn('[API][REPAIR]', 'rate_limit_exceeded', { userEmail: user.email });
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimitResult.retryAfter),
          'X-RateLimit-Limit': '200',
          'X-RateLimit-Remaining': String(rateLimitResult.remaining),
          'X-RateLimit-Reset': String(rateLimitResult.resetAt),
        },
      }
    );
  }

  try {
    const body = await request.json();
    const {
      invoice_number,
      original_data,
      corrected_data,
      pdf_path,
      vendor_name
    } = body;

    // Validate input types
    if (!isString(invoice_number) || !invoice_number.trim()) {
      return NextResponse.json({ error: 'Invalid invoice_number' }, { status: 400 });
    }
    if (!isString(vendor_name) || !vendor_name.trim()) {
      return NextResponse.json({ error: 'Invalid vendor_name' }, { status: 400 });
    }
    if (!isString(pdf_path) || !pdf_path.trim()) {
      return NextResponse.json({ error: 'Invalid pdf_path' }, { status: 400 });
    }

    console.log('🔧 Repair API: Processing repair for invoice:', invoice_number);

    // Determine the parser name based on vendor (whitelist approach)
    let parser_name = 'generic_parser.py';
    const vendorLower = vendor_name.toLowerCase();
    if (vendorLower.includes('henry')) {
      parser_name = 'henry_parser.py';
    } else if (vendorLower.includes('patterson')) {
      parser_name = 'patterson_parser.py';
    } else if (vendorLower.includes('tc dental')) {
      parser_name = 'multipage_invoice_processor.py';
    }

    // Create temporary files for the repair logging
    const tempDir = path.join(process.cwd(), 'temp_repair');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // SECURITY: Validate invoice_number to prevent path traversal
    if (!invoice_number || !/^[a-zA-Z0-9._-]+$/.test(invoice_number)) {
      console.error('❌ Invalid invoice_number format:', invoice_number);
      return NextResponse.json(
        { error: 'Invalid invoice number format' },
        { status: 400 }
      );
    }

    const originalJsonPath = path.join(tempDir, `${invoice_number}_original.json`);
    const correctedJsonPath = path.join(tempDir, `${invoice_number}_corrected.json`);

    // SECURITY: Validate paths are within tempDir
    if (!isPathWithinBase(originalJsonPath, tempDir) || !isPathWithinBase(correctedJsonPath, tempDir)) {
      console.error('❌ Path traversal attempt detected in repair-invoice');
      return NextResponse.json(
        { error: 'Invalid path' },
        { status: 400 }
      );
    }

    // Write the JSON files
    fs.writeFileSync(originalJsonPath, JSON.stringify(original_data, null, 2)); // lgtm[js/path-injection]
    fs.writeFileSync(correctedJsonPath, JSON.stringify(corrected_data, null, 2)); // lgtm[js/path-injection]

    // Determine the PDF path
    let actualPdfPath = pdf_path;
    if (pdf_path?.startsWith('/api/pdf/')) {
      // Convert API path to actual file path
      const filename = pdf_path.replace('/api/pdf/', '');

      // SECURITY: Validate filename to prevent path traversal
      if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
        console.error('❌ Invalid PDF filename format:', filename);
        return NextResponse.json(
          { error: 'Invalid PDF filename format' },
          { status: 400 }
        );
      }

      actualPdfPath = path.join(process.cwd(), 'pcs_ai_data', 'pdfs', filename);

      // SECURITY: Validate PDF path is within safe directory
      if (!isPathWithinBase(actualPdfPath, path.join(process.cwd(), 'pcs_ai_data', 'pdfs'))) {
        console.error('❌ Path traversal attempt detected in PDF path');
        return NextResponse.json(
          { error: 'Invalid PDF path' },
          { status: 400 }
        );
      }
    }

    // Call the Python repair logging function using proper argument passing
    const { spawn } = require('child_process');

    // Create a Python script that reads arguments from environment variables
    // This prevents shell injection attacks
    const pythonScript = `
import sys
import os
import json

sys.path.append(os.environ.get('SCRIPT_PATH', ''))
from repair_loop.capture_repair_event import capture_repair_event

try:
    result = capture_repair_event(
        invoice_number=os.environ.get('INVOICE_NUMBER'),
        vendor_name=os.environ.get('VENDOR_NAME', 'Unknown'),
        parser_name=os.environ.get('PARSER_NAME'),
        original_output_path=os.environ.get('ORIGINAL_PATH'),
        corrected_output_path=os.environ.get('CORRECTED_PATH'),
        invoice_pdf_path=os.environ.get('PDF_PATH')
    )
    print(f"SUCCESS:{result}")
except Exception as e:
    print(f"ERROR:{str(e)}")
    sys.exit(1)
    `;

    const pythonProcess = spawn('python3', ['-c', pythonScript], {
      env: {
        ...process.env,
        SCRIPT_PATH: process.cwd(),
        INVOICE_NUMBER: invoice_number,
        VENDOR_NAME: vendor_name,
        PARSER_NAME: parser_name,
        ORIGINAL_PATH: originalJsonPath,
        CORRECTED_PATH: correctedJsonPath,
        PDF_PATH: actualPdfPath
      }
    });

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
          // Log full error server-side only
          console.error('❌ Repair logging failed:', error || output);
          // Return safe error message to client
          resolve(NextResponse.json({
            success: false,
            error: 'Failed to log repair data'
          }, { status: 500 }));
        }
      });
    });

  } catch (error) {
    // Log full error server-side only
    console.error('❌ Repair API error:', error);
    // Return safe error message to client
    return NextResponse.json({
      success: false,
      error: 'An error occurred while processing the repair request'
    }, { status: 500 });
  }
}
