import OpenAI from 'openai';

let _openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

const COMPOSE_MODEL = process.env.GPT_COMPOSE_MODEL || process.env.GPT_MODEL || 'gpt-4o-mini';

export type PipelineLocation =
  | 'already in your For Me queue'
  | 'sent to McKay, awaiting his approval'
  | 'approved, waiting to be paid'
  | 'already paid'
  | 'rejected / removed'
  | 'already in PCS AI (status unknown)';

export type SkippedFact = {
  invoice_number: string;
  location: PipelineLocation;
  existing_status?: string | null;
  existing_assigned_to?: string | null;
};

export type CreatedFact = {
  invoice_number: string;
  vendor?: string | null;
  amount?: number | null;
};

export type IngestReportFacts = {
  sender_email: string;
  subject: string;
  status: 'ok' | 'partial' | 'failed';
  created: CreatedFact[];
  skipped: SkippedFact[];
  failed: Array<{ reason?: string }>;
  unaccounted: number;
  invoices_detected: number;
};

export function mapStatusToLocation(
  status: string | null | undefined,
  assignedTo: string | null | undefined
): PipelineLocation {
  const s = (status || '').toLowerCase();
  const assignee = (assignedTo || '').toLowerCase();

  if (s === 'paid' || s === 'completed') return 'already paid';
  if (s === 'to_be_paid') return 'approved, waiting to be paid';
  if (s === 'awaiting_admin_approval' || s === 'awaiting_office_approval') {
    return 'sent to McKay, awaiting his approval';
  }
  if (s === 'rejected' || s === 'removed') return 'rejected / removed';
  if (s === 'incoming' || s === 'categorized' || s === 'coded' || s === 'needs_review') {
    return 'already in your For Me queue';
  }
  return 'already in PCS AI (status unknown)';
}

function groupSkippedByLocation(skipped: SkippedFact[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const item of skipped) {
    const loc = item.location;
    if (!groups[loc]) groups[loc] = [];
    if (item.invoice_number) groups[loc].push(item.invoice_number);
  }
  return groups;
}

/** Deterministic template — always used as fallback if GPT fails or hallucinates numbers. */
export function composeDeterministicReport(facts: IngestReportFacts): { subject: string; body: string } {
  const createdNums = facts.created.map(c => c.invoice_number).filter(Boolean);
  const skippedNums = facts.skipped.map(s => s.invoice_number).filter(Boolean);
  const groups = groupSkippedByLocation(facts.skipped);

  const subject =
    facts.status === 'failed'
      ? `PCS AI could not process: ${facts.subject || 'your invoices'}`
      : skippedNums.length > 0
        ? `PCS AI update: ${createdNums.length} added, ${skippedNums.length} already in the system`
        : `PCS AI update: ${createdNums.length} invoice(s) added to your queue`;

  const lines: string[] = [];
  lines.push('Hi,');
  lines.push('');
  lines.push(`This is an automatic report from PCS AI about the email you sent to invoices@pcsmilesai.com.`);
  lines.push(`Original subject: ${facts.subject || '(none)'}`);
  lines.push('');

  if (facts.status === 'failed') {
    lines.push('Unfortunately PCS AI was unable to finish processing this email after several attempts.');
    if (facts.failed.length) {
      lines.push(`Reason(s): ${facts.failed.map(f => f.reason || 'unknown').join('; ')}`);
    }
    lines.push('The PDF(s) were kept on the server. Please reply or contact support if you need them re-processed.');
    lines.push('');
  }

  if (createdNums.length > 0) {
    lines.push(`Added to your For Me queue (${createdNums.length}):`);
    lines.push(createdNums.map(n => `  • ${n}`).join('\n'));
    lines.push('');
  } else if (facts.status !== 'failed') {
    lines.push('No new invoices were added to your queue from this email.');
    lines.push('');
  }

  if (skippedNums.length > 0) {
    lines.push(`Some invoices were not published because they are already in PCS AI (${skippedNums.length}):`);
    for (const [location, nums] of Object.entries(groups)) {
      lines.push(`  — ${location}:`);
      lines.push(nums.map(n => `      • ${n}`).join('\n'));
    }
    lines.push('');
  }

  if (facts.unaccounted > 0) {
    lines.push(`${facts.unaccounted} page(s)/invoice(s) in the PDF could not be fully read. The original PDF is still stored in PCS AI.`);
    lines.push('');
  }

  lines.push('You can also see this summary under the bell icon in PCS AI.');
  lines.push('');
  lines.push('— PCS AI');

  return { subject, body: lines.join('\n') };
}

function allInvoiceNumbersPresent(text: string, numbers: string[]): boolean {
  const lower = text.toLowerCase();
  return numbers.every(n => lower.includes(String(n).toLowerCase()));
}

/** GPT-composed message with deterministic fallback + number verification. */
export async function composeIngestReportMessage(
  facts: IngestReportFacts
): Promise<{ subject: string; body: string; used_gpt: boolean }> {
  const fallback = composeDeterministicReport(facts);
  const allNumbers = [
    ...facts.created.map(c => c.invoice_number),
    ...facts.skipped.map(s => s.invoice_number),
  ].filter(Boolean);

  try {
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: COMPOSE_MODEL,
      temperature: 0.2,
      max_tokens: 1200,
      messages: [
        {
          role: 'system',
          content: `You write clear, friendly email reports for Laura (AP) about invoice emails she sent to invoices@pcsmilesai.com.
Rules:
- Use ONLY the invoice numbers and pipeline locations provided in the facts JSON. Never invent numbers.
- Every invoice number in the facts MUST appear in your body.
- Group omitted (duplicate) invoices by their pipeline location.
- Be concise and professional. Plain text only (no markdown).
- Start with a short summary line, then lists.
- Return JSON only: {"subject":"...","body":"..."}`,
        },
        {
          role: 'user',
          content: JSON.stringify(facts, null, 2),
        },
      ],
    });

    const raw = response.choices[0]?.message?.content || '';
    let jsonStr = raw.trim();
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) jsonStr = fence[1].trim();

    const parsed = JSON.parse(jsonStr) as { subject?: string; body?: string };
    const subject = (parsed.subject || '').trim() || fallback.subject;
    const body = (parsed.body || '').trim();

    if (!body || (allNumbers.length > 0 && !allInvoiceNumbersPresent(body, allNumbers))) {
      console.warn('[INGEST_REPORT][GPT] Number verification failed — using deterministic template');
      return { ...fallback, used_gpt: false };
    }

    return { subject, body, used_gpt: true };
  } catch (err: any) {
    console.warn('[INGEST_REPORT][GPT] Compose failed, using template:', err?.message);
    return { ...fallback, used_gpt: false };
  }
}
