import type { NextApiRequest, NextApiResponse } from 'next';
import qs from 'querystring';

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const url = 'https://appcenter.intuit.com/connect/oauth2?' + qs.stringify({
    client_id: process.env.QBO_CLIENT_ID,
    scope: process.env.QBO_SCOPES,
    redirect_uri: process.env.QBO_REDIRECT_URI,
    response_type: 'code',
    state: 'sandbox'
  });
  res.redirect(url);
}
