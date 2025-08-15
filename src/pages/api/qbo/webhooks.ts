import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';

export const config = { api: { bodyParser: false } }; // disable body parsing

function getRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const raw = await getRawBody(req);
  const verifier = process.env.QBO_WEBHOOK_VERIFIER || '';
  const signature = req.headers['intuit-signature'] as string | undefined;

  const expected = crypto.createHmac('sha256', verifier).update(raw).digest('base64');
  if (!signature || signature !== expected) {
    console.warn('Invalid webhook signature');
    return res.status(401).send('Invalid signature');
  }

  const body = JSON.parse(raw.toString('utf8'));
  const events = body?.eventNotifications || [];
  for (const n of events) {
    const realmId = n.realmId;
    for (const e of (n.dataChangeEvent?.entities || [])) {
      console.log(`[QBO] ${e.name} ${e.operation} id=${e.id} realm=${realmId}`);
      // TODO: Fetch this entity from QBO and sync to PCS DB
    }
  }

  return res.status(200).send('OK');
}
