import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Extract specific pages from a source PDF and write them to a new file.
 * Pure, deterministic operation — no AI, no external CLI tools.
 *
 * @param sourcePdfPath - Absolute path to the source PDF
 * @param pageIndices   - 0-based page indices to extract
 * @param outputPath    - Absolute path for the new PDF
 */
export async function extractPdfPages(
  sourcePdfPath: string,
  pageIndices: number[],
  outputPath: string
): Promise<void> {
  const pdfBytes = fs.readFileSync(sourcePdfPath);
  const srcDoc = await PDFDocument.load(pdfBytes);
  const newDoc = await PDFDocument.create();
  const pages = await newDoc.copyPages(srcDoc, pageIndices);
  for (const page of pages) {
    newDoc.addPage(page);
  }
  const newPdfBytes = await newDoc.save();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, newPdfBytes);
}

/**
 * Build a deterministic output filename for a per-invoice PDF.
 *
 * Pattern: {originalBase}_inv{index}of{total}_{hash8}.pdf
 * Example: TC_Dental_1_invoice_6f8b5485_inv3of7_a1b2c3d4.pdf
 */
export function buildPerInvoiceFilename(
  originalFilename: string,
  invoiceIndex: number,
  totalInvoices: number
): string {
  const ext = path.extname(originalFilename);
  const base = path.basename(originalFilename, ext);
  const hash = crypto.randomBytes(4).toString('hex');
  return `${base}_inv${invoiceIndex}of${totalInvoices}_${hash}.pdf`;
}
