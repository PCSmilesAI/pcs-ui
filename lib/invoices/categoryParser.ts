import { InvoiceData, InvoiceLineItem } from '../qbo/billCreationService';
import { getDatabase } from '../db/client';
import { loadChartOfAccounts } from '../qbo/chartOfAccounts';
import { getVendorCategoryCandidates } from '../qbo/vendorCategoryMap';

export interface InvoiceCategoryAssignment {
  categoryId: string;
  categoryName: string;
  className?: string | null;
  confidenceScore: number;
  flaggedForReview?: boolean;
  reason?: string;
  source: 'vendor_mapping' | 'keyword_matching' | 'smart_guess' | 'manual';
}

export async function categorizeInvoice(
  invoiceData: InvoiceData,
  vendorName: string
): Promise<InvoiceCategoryAssignment[]> {
  const lineItems = invoiceData.line_items || invoiceData.lineItems || [];
  const normalizedVendor = (vendorName || '').trim().toLowerCase();

  // Step 1: Vendor mapping from QBO export (includes account + class)
  if (normalizedVendor) {
    const candidates = getVendorCategoryCandidates(normalizedVendor);
    if (candidates.length > 0) {
      const primary = candidates[0];
      return [{
        categoryId: '',
        categoryName: primary.accountFullName,
        className: primary.class || undefined,
        confidenceScore: primary.confidence,
        flaggedForReview: false,
        reason: `Matched vendor: ${primary.source}`,
        source: 'vendor_mapping',
      }];
    }
  }

  // Step 2: Analyze all line items together for keyword matching (fallback)
  const categoryScores = analyzeLineItemsForCategories(lineItems);
  const sortedCategories = Object.entries(categoryScores)
    .sort((a, b) => b[1] - a[1])
    .map(([category, score]) => ({ category, score }));

  if (sortedCategories.length === 0) {
    return [{
      categoryId: '',
      categoryName: 'Uncategorized',
      confidenceScore: 0,
      flaggedForReview: true,
      reason: 'no_matches',
      source: 'smart_guess',
    }];
  }

  const topScore = sortedCategories[0].score;
  const secondScore = sortedCategories[1]?.score || 0;

  if (topScore > 0.8 || (topScore - secondScore) > 0.3) {
    return [{
      categoryId: '',
      categoryName: sortedCategories[0].category,
      confidenceScore: topScore,
      flaggedForReview: false,
      source: topScore > 0.7 ? 'keyword_matching' : 'smart_guess',
    }];
  } else {
    return [
      {
        categoryId: '',
        categoryName: sortedCategories[0].category,
        confidenceScore: topScore,
        flaggedForReview: true,
        reason: 'mixed_signals',
        source: 'keyword_matching',
      },
      {
        categoryId: '',
        categoryName: sortedCategories[1].category,
        confidenceScore: secondScore,
        flaggedForReview: true,
        reason: 'mixed_signals',
        source: 'keyword_matching',
      },
    ];
  }
}

/**
 * Analyze line items and return category scores
 */
function analyzeLineItemsForCategories(lineItems: InvoiceLineItem[]): Record<string, number> {
  const categoryScores: Record<string, number> = {};
  const chartOfAccounts = loadChartOfAccounts();

  // Collect all text from line items
  const allText = lineItems
    .map(item => `${item.description || ''} ${item.product_name || ''} ${item.name || ''}`)
    .join(' ')
    .toLowerCase();

  // Match against chart of accounts
  for (const accountPath of chartOfAccounts) {
    const normalizedPath = accountPath.toLowerCase();
    const pathParts = normalizedPath.split(':').map(p => p.trim());

    // Score based on keyword matching
    let score = 0;
    for (const part of pathParts) {
      if (allText.includes(part)) {
        score += 0.2;
      }
    }

    // Boost score for specific dental keywords
    const dentalKeywords = ['dental', 'supplies', 'lab', 'cleaning', 'equipment'];
    for (const keyword of dentalKeywords) {
      if (allText.includes(keyword)) {
        score += 0.3;
      }
    }

    if (score > 0) {
      categoryScores[accountPath] = Math.min(score, 1.0);
    }
  }

  // Also check common category patterns
  const commonCategories: Record<string, string[]> = {
    'Dental Supplies': ['dental', 'supplies', 'material', 'consumable'],
    'Cleaning Supplies': ['cleaning', 'disinfectant', 'sanitizer', 'soap'],
    'Dental Lab Fees': ['lab', 'laboratory', 'crown', 'bridge', 'denture', 'implant'],
    'Medical Gases': ['gas', 'oxygen', 'nitrous'],
    'Drugs': ['drug', 'medication', 'prescription', 'antibiotic'],
  };

  for (const [categoryName, keywords] of Object.entries(commonCategories)) {
    const matchCount = keywords.filter(kw => allText.includes(kw.toLowerCase())).length;
    if (matchCount > 0) {
      const score = Math.min(matchCount / keywords.length, 1.0);
      const existingScore = categoryScores[categoryName] || 0;
      categoryScores[categoryName] = Math.max(existingScore, score);
    }
  }

  return categoryScores;
}

/**
 * Store invoice-level category assignment in database
 */
export async function storeInvoiceCategories(
  invoiceId: string,
  categories: InvoiceCategoryAssignment[]
): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();

  db.prepare('DELETE FROM invoice_categories WHERE invoice_id = ?').run(invoiceId);

  for (const category of categories) {
    const categoryId = category.categoryId || `cat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    db.prepare(`
      INSERT INTO invoice_categories (id, invoice_id, category_id, category_name, class_name, confidence_score, flagged_for_review, reason, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `${invoiceId}_${categoryId}`,
      invoiceId,
      categoryId,
      category.categoryName,
      category.className || null,
      category.confidenceScore ?? 0,
      category.flaggedForReview ? 1 : 0,
      category.reason || null,
      category.source,
      now
    );
  }
}

export function getInvoiceCategories(invoiceId: string): InvoiceCategoryAssignment[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT category_id, category_name, class_name, confidence_score, flagged_for_review, reason, source
    FROM invoice_categories
    WHERE invoice_id = ?
    ORDER BY created_at
  `).all(invoiceId) as Array<{
    category_id: string;
    category_name: string;
    class_name: string | null;
    confidence_score: number | null;
    flagged_for_review: number | null;
    reason: string | null;
    source: string;
  }>;

  return rows.map(row => ({
    categoryId: row.category_id,
    categoryName: row.category_name,
    className: row.class_name || undefined,
    confidenceScore: row.confidence_score ?? 0.8,
    flaggedForReview: !!row.flagged_for_review,
    reason: row.reason || undefined,
    source: row.source as InvoiceCategoryAssignment['source'],
  }));
}
