import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Converts a PDF file to an array of base64-encoded PNG images.
 * Uses pdftoppm (from poppler-utils) for conversion.
 * 
 * Each page of the PDF becomes one image.
 */
export async function convertPdfToImages(pdfPath: string): Promise<string[]> {
  // Validate input
  if (!pdfPath) {
    throw new Error('PDF path is required');
  }

  // Resolve to absolute path
  const absolutePath = path.isAbsolute(pdfPath) 
    ? pdfPath 
    : path.join(process.cwd(), pdfPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`PDF file not found: ${absolutePath}`);
  }

  // Create a temporary directory for output images
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-images-'));
  const outputPrefix = path.join(tempDir, 'page');

  try {
    // Use pdftoppm to convert PDF to PNG images
    // -png: output PNG format
    // -r 150: 150 DPI resolution (good balance of quality and size)
    execSync(`pdftoppm -png -r 150 "${absolutePath}" "${outputPrefix}"`, {
      timeout: 60000, // 60 second timeout
      stdio: 'pipe'
    });

    // Read all generated images
    const files = fs.readdirSync(tempDir)
      .filter(f => f.endsWith('.png'))
      .sort(); // Sort to maintain page order

    const base64Images: string[] = [];

    for (const file of files) {
      const imagePath = path.join(tempDir, file);
      const imageBuffer = fs.readFileSync(imagePath);
      const base64 = imageBuffer.toString('base64');
      base64Images.push(base64);
    }

    if (base64Images.length === 0) {
      throw new Error('No images were generated from PDF');
    }

    return base64Images;
  } finally {
    // Clean up temporary directory
    try {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        fs.unlinkSync(path.join(tempDir, file));
      }
      fs.rmdirSync(tempDir);
    } catch (cleanupError) {
      console.warn('[PDF] Failed to clean up temp directory:', cleanupError);
    }
  }
}

/**
 * Alternative conversion using pdf-poppler npm package.
 * Falls back to this if pdftoppm system command isn't available.
 */
export async function convertPdfToImagesWithPoppler(pdfPath: string): Promise<string[]> {
  try {
    // Dynamic import to handle if package isn't installed
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfPoppler = require('pdf-poppler') as { convert: (path: string, options: object) => Promise<void> };
    
    const absolutePath = path.isAbsolute(pdfPath) 
      ? pdfPath 
      : path.join(process.cwd(), pdfPath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`PDF file not found: ${absolutePath}`);
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-images-'));

    const options = {
      format: 'png',
      out_dir: tempDir,
      out_prefix: 'page',
      page: null, // All pages
      scale: 1200, // Width in pixels
    };

    await pdfPoppler.convert(absolutePath, options);

    // Read all generated images
    const files = fs.readdirSync(tempDir)
      .filter(f => f.endsWith('.png'))
      .sort();

    const base64Images: string[] = [];

    for (const file of files) {
      const imagePath = path.join(tempDir, file);
      const imageBuffer = fs.readFileSync(imagePath);
      const base64 = imageBuffer.toString('base64');
      base64Images.push(base64);
    }

    // Clean up
    for (const file of files) {
      fs.unlinkSync(path.join(tempDir, file));
    }
    fs.rmdirSync(tempDir);

    return base64Images;
  } catch (error: any) {
    if (error.code === 'MODULE_NOT_FOUND') {
      throw new Error('pdf-poppler package not installed. Run: npm install pdf-poppler');
    }
    throw error;
  }
}

/**
 * Smart conversion that tries system command first, then falls back to npm package.
 */
export async function convertPdfToBase64Images(pdfPath: string): Promise<string[]> {
  try {
    // First, try using system pdftoppm (faster if available)
    return await convertPdfToImages(pdfPath);
  } catch (error: any) {
    // If pdftoppm not found, try pdf-poppler package
    if (error.message?.includes('command not found') || error.message?.includes('ENOENT')) {
      console.log('[PDF] pdftoppm not found, trying pdf-poppler package...');
      return await convertPdfToImagesWithPoppler(pdfPath);
    }
    throw error;
  }
}

/**
 * Get the number of pages in a PDF without converting.
 */
export function getPdfPageCount(pdfPath: string): number {
  const absolutePath = path.isAbsolute(pdfPath) 
    ? pdfPath 
    : path.join(process.cwd(), pdfPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`PDF file not found: ${absolutePath}`);
  }

  try {
    // Use pdfinfo to get page count
    const output = execSync(`pdfinfo "${absolutePath}"`, {
      timeout: 10000,
      encoding: 'utf-8'
    });

    const match = output.match(/Pages:\s*(\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }
    return 1; // Default to 1 if can't determine
  } catch {
    // If pdfinfo not available, just return 1
    return 1;
  }
}

/**
 * Formats base64 images for OpenAI API vision request.
 */
export function formatImagesForOpenAI(base64Images: string[], detailLevel: 'high' | 'low' | 'auto' = 'low'): Array<{
  type: 'image_url';
  image_url: { url: string; detail: 'high' | 'low' | 'auto' };
}> {
  // Default to 'low' detail to reduce token usage (65 tokens vs 170+ tokens per tile)
  // 'high' detail can cause context limit issues with multi-page PDFs
  return base64Images.map(base64 => ({
    type: 'image_url' as const,
    image_url: {
      url: `data:image/png;base64,${base64}`,
      detail: detailLevel
    }
  }));
}
