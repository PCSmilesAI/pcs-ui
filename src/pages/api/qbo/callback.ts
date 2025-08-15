import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import qs from 'querystring';

const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const b64 = (id: string, sec: string) => 'Basic ' + Buffer.from(`${id}:${sec}`).toString('base64');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { code, realmId } = req.query as { code?: string; realmId?: string };
  if (!code || !realmId) return res.status(400).send('Missing code or realmId');

  try {
    const r = await axios.post(
      TOKEN_URL,
      qs.stringify({ grant_type: 'authorization_code', code, redirect_uri: process.env.QBO_REDIRECT_URI }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': b64(process.env.QBO_CLIENT_ID!, process.env.QBO_CLIENT_SECRET!)
        }
      }
    );

    // TODO: save to your DB; for now log so we can verify
    console.log('[QBO SANDBOX] realmId:', realmId);
    console.log('[QBO SANDBOX] tokens:', r.data);

    res.send('Sandbox connected. Check server logs for tokens.');
  } catch (e: any) {
    console.error('Token exchange failed:', e.response?.data || e.message);
    res.status(500).send('Token exchange failed');
  }
}
