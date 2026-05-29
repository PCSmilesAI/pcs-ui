/**
 * lib/receipts/receipt-service.ts
 *
 * Business logic for the credit card receipts module.
 * Route handlers call this; this calls db-store.ts and AI/LLM helpers.
 *
 * Three responsibilities (mirrors the Python receipt-agent's extraction.py +
 * matcher.py + categorization logic, ported to the pcs-ui stack):
 *
 *   parseReceiptImage()              — LLM vision extraction of vendor/amount/date
 *   categorizeReceipt()              — pick a GL account from the chart of accounts
 *   matchReceiptToAmexTransaction()  — fuzzy match a receipt to an Amex charge
 *
 * MODEL CONVENTION — never hard-code a model. Read from env (see
 * context/modules/credit_card_receipts.md):
 *   process.env.PCS_LLM_PROVIDER  // 'openai' | 'anthropic' | 'local'  (default 'openai')
 *   process.env.PCS_LLM_MODEL     // e.g. 'gpt-4o'                       (default 'gpt-4o')
 */

import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { convertPdfToBase64Images, formatImagesForOpenAI } from '../gpt/pdfToImages';

// ─── Model configuration (env-driven; never hard-code) ────────────────────
function getProvider(): string {
  return (process.env.PCS_LLM_PROVIDER || 'openai').toLowerCase();
}
function getModel(): string {
  return process.env.PCS_LLM_MODEL || 'gpt-4o';
}

// Lazy OpenAI client (mirrors lib/gpt/parseInvoice.ts) so build/import never
// fails when no key is configured.
let _openai: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required for receipt parsing');
    }
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

// ============================================================================
// 1. Receipt extraction
// ============================================================================

export interface ReceiptParseResult {
  vendor: string;
  amount: number;
  date: string; // ISO 8601 (YYYY-MM-DD)
  confidence: number; // 0.0 – 1.0
  card_last4?: string | null;
  raw_response?: string;
}

const RECEIPT_EXTRACTION_PROMPT = `You are an expert at reading credit card receipts for a dental practice group.

Extract these fields from the receipt image(s) and return ONLY a JSON object:
{
  "vendor": "string — the merchant / business name",
  "amount": number — the grand total paid, as a decimal with no currency symbol,
  "date": "YYYY-MM-DD — the transaction date",
  "card_last4": "string — last 4 digits of the card if visible, else null",
  "confidence": number between 0 and 1 (1 = certain, 0.5 = uncertain)
}

Rules:
- Return ONLY valid JSON, no explanation.
- "amount" must be the final total charged (include tax and tip).
- If a field is not present, use null (or "" for vendor).`;

/**
 * Read a receipt file (image or PDF) and return base64 PNG/JPEG image(s)
 * suitable for an OpenAI vision call.
 */
async function loadReceiptAsImages(imagePath: string): Promise<string[]> {
  const abs = path.isAbsolute(imagePath) ? imagePath : path.join(process.cwd(), imagePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Receipt file not found: ${abs}`);
  }
  const ext = path.extname(abs).toLowerCase();
  if (ext === '.pdf') {
    return convertPdfToBase64Images(abs);
  }
  // Treat everything else as an image; embed raw bytes as base64.
  const buf = fs.readFileSync(abs);
  return [buf.toString('base64')];
}

function extractJson(raw: string): any | null {
  if (!raw) return null;
  let jsonStr = raw.trim();
  const block = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (block) jsonStr = block[1].trim();
  else {
    const obj = jsonStr.match(/\{[\s\S]*\}/);
    if (obj) jsonStr = obj[0];
  }
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

function normalizeAmount(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = parseFloat(value.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export async function parseReceiptImage(imagePath: string): Promise<ReceiptParseResult> {
  const provider = getProvider();
  if (provider !== 'openai') {
    // Only the OpenAI path is wired up in pcs-ui today (the `openai` SDK ships
    // with the app). Anthropic/local can be added here following the same shape.
    throw new Error(`PCS_LLM_PROVIDER='${provider}' is not yet supported for receipt parsing`);
  }

  const images = await loadReceiptAsImages(imagePath);
  if (images.length === 0) {
    throw new Error('Could not render the receipt file to an image');
  }

  const response = await getOpenAIClient().chat.completions.create({
    model: getModel(),
    max_completion_tokens: 600,
    messages: [
      { role: 'system', content: RECEIPT_EXTRACTION_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract the receipt fields. Return only JSON.' },
          ...formatImagesForOpenAI(images, 'low'),
        ],
      },
    ],
  });

  const raw = response.choices[0]?.message?.content || '';
  const parsed = extractJson(raw);
  if (!parsed) {
    throw new Error('LLM did not return parseable JSON for the receipt');
  }

  return {
    vendor: typeof parsed.vendor === 'string' ? parsed.vendor : '',
    amount: normalizeAmount(parsed.amount),
    date: typeof parsed.date === 'string' ? parsed.date : '',
    card_last4: parsed.card_last4 ? String(parsed.card_last4).replace(/\D/g, '').slice(-4) : null,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    raw_response: raw,
  };
}

// ============================================================================
// 2. GL categorization
// ============================================================================

// Keyword → GL account fragment. Mirrors the table in
// context/modules/credit_card_receipts.md. The fragment is matched against the
// full chart of accounts so the canonical leaf string is returned.
const CATEGORY_KEYWORDS: Array<{ patterns: RegExp; gl: string }> = [
  { patterns: /\b(uber eats|doordash|grubhub|restaurant|cafe|coffee|lunch|dinner|catering|pizza|grill|bistro)\b/i, gl: '53232 Office Business Meals' },
  { patterns: /\b(hotel|motel|inn|lodging|marriott|hilton|hyatt|airbnb)\b/i, gl: '53234 Lodging' },
  { patterns: /\b(uber|lyft|airline|airlines|delta|united|southwest|flight|parking|taxi|rental car|hertz|avis)\b/i, gl: '53233 Office Travel' },
  { patterns: /\b(scrub|scrubs|uniform|uniforms|landau|cherokee)\b/i, gl: '53224 Uniforms & Cleaning' },
  { patterns: /\b(usps|fedex|ups|postage|shipping|stamps)\b/i, gl: '53226 Postage' },
  { patterns: /\b(dental supply|dental supplies|henry schein|patterson dental|benco|darby|ultradent|dentsply)\b/i, gl: '52110 Dental Supplies' },
  { patterns: /\b(software|subscription|saas|adobe|microsoft|google workspace|zoom|dropbox|slack)\b/i, gl: '53334 Software' },
  { patterns: /\b(staples|office depot|office max|amazon|paper|pens|printer ink|toner|supplies)\b/i, gl: '53223 Office Supplies' },
];

const DEFAULT_GL = '59000 Uncategorized Expense';

let _chartCache: string[] | null = null;
function loadChartOfAccounts(): string[] {
  if (_chartCache) return _chartCache;
  try {
    const file = path.join(process.cwd(), 'pcs_ai_data', 'chart_of_accounts.json');
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw);
    _chartCache = Array.isArray(parsed) ? parsed : [];
  } catch {
    _chartCache = [];
  }
  return _chartCache;
}

/**
 * Return the canonical (leaf) chart-of-accounts entry whose final segment
 * contains the given fragment, e.g. "53223 Office Supplies" →
 * "50000 Expenses: …: 53223 Office Supplies". Falls back to the fragment itself.
 */
function resolveGlFromChart(fragment: string): string {
  const chart = loadChartOfAccounts();
  const needle = fragment.toLowerCase();
  const match = chart.find((entry) => {
    const leaf = entry.split(':').pop()?.trim().toLowerCase() || '';
    return leaf === needle || leaf.includes(needle);
  });
  if (match) return match.split(':').pop()!.trim();
  return fragment;
}

/**
 * Pick a GL account for a receipt. Deterministic keyword heuristic first
 * (no API dependency); returns a chart-of-accounts leaf string.
 */
export async function categorizeReceipt(vendor: string, amount: number): Promise<string> {
  const haystack = (vendor || '').toLowerCase();
  for (const rule of CATEGORY_KEYWORDS) {
    if (rule.patterns.test(haystack)) {
      // Capital-equipment override: clinical-supply purchases over $500 are
      // capitalized as Dental Equipment (see credit_card_receipts.md).
      if (rule.gl === '52110 Dental Supplies' && amount > 500) {
        return resolveGlFromChart('53210 Dental Equipment');
      }
      return resolveGlFromChart(rule.gl);
    }
  }
  return DEFAULT_GL;
}

// ============================================================================
// 3. Amex transaction matching
// ============================================================================
//
// Tolerances from context/modules/credit_card_receipts.md:
//   amount: ±$0.01 exact preferred, ±$1.00 for tax variance
//   date:   ±2 calendar days
//   vendor: fuzzy (Levenshtein < 3) or substring
//   confidence: 0.95+ auto, 0.70–0.94 suggest, <0.70 unmatched

export interface AmexCandidate {
  id: string;
  amount: number;
  date: string;
  vendor: string;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

function normalizeVendor(v: string): string {
  return (v || '')
    .toLowerCase()
    .replace(/\b(inc|llc|corp|co|ltd|company)\b/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (!Number.isFinite(da) || !Number.isFinite(db)) return Infinity;
  return Math.abs(da - db) / (1000 * 60 * 60 * 24);
}

/**
 * Score one receipt against one Amex candidate. Returns 0–1 confidence.
 */
function scoreMatch(
  receiptAmount: number,
  receiptDate: string,
  receiptVendor: string,
  cand: AmexCandidate
): number {
  // Amount (max 0.5)
  const amountDiff = Math.abs(receiptAmount - cand.amount);
  let amountScore = 0;
  if (amountDiff <= 0.01) amountScore = 0.5;
  else if (amountDiff <= 1.0) amountScore = 0.35;
  else return 0; // outside tolerance → not a match

  // Date (max 0.3)
  const dd = daysBetween(receiptDate, cand.date);
  let dateScore = 0;
  if (dd === 0) dateScore = 0.3;
  else if (dd <= 1) dateScore = 0.22;
  else if (dd <= 2) dateScore = 0.12;
  else return 0; // outside ±2 day tolerance

  // Vendor (max 0.2)
  const rv = normalizeVendor(receiptVendor);
  const cv = normalizeVendor(cand.vendor);
  let vendorScore = 0;
  if (rv && cv) {
    if (rv === cv || rv.includes(cv) || cv.includes(rv)) vendorScore = 0.2;
    else if (levenshtein(rv, cv) < 3) vendorScore = 0.15;
    else vendorScore = 0;
  }

  return Math.min(1, amountScore + dateScore + vendorScore);
}

export interface MatchResult {
  id: string;
  confidence: number;
}

/**
 * Find the best-matching Amex transaction for a receipt.
 * Returns the best candidate above the unmatched threshold (0.70), or null.
 */
export async function matchReceiptToAmexTransaction(
  receiptAmount: number,
  receiptDate: string,
  receiptVendor: string,
  transactions: AmexCandidate[]
): Promise<MatchResult | null> {
  let best: MatchResult | null = null;
  for (const cand of transactions) {
    const confidence = scoreMatch(receiptAmount, receiptDate, receiptVendor, cand);
    if (confidence >= 0.7 && (!best || confidence > best.confidence)) {
      best = { id: cand.id, confidence: Math.round(confidence * 100) / 100 };
    }
  }
  return best;
}
