import { NextResponse } from "next/server";
import crypto from "crypto";

// Force dynamic rendering
export const dynamic = 'force-dynamic';

function b64url(b: Buffer) {
  return b.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

export async function GET() {
  const redirectUri = process.env.QBO_REDIRECT_URI || '';
  const encoded = encodeURIComponent(redirectUri);
  
  return NextResponse.json({
    redirect_uri_original: redirectUri,
    redirect_uri_encoded: encoded,
    redirect_uri_decoded: decodeURIComponent(encoded),
    redirect_uri_length: redirectUri.length,
    redirect_uri_char_codes: redirectUri.split('').map(c => c.charCodeAt(0)),
    redirect_uri_hex: Buffer.from(redirectUri, 'utf8').toString('hex'),
    analysis: {
      has_trailing_slash: redirectUri.endsWith('/'),
      has_www: redirectUri.includes('www.'),
      protocol: redirectUri.startsWith('https://') ? 'https' : redirectUri.startsWith('http://') ? 'http' : 'unknown',
      domain: redirectUri.replace(/^https?:\/\//, '').split('/')[0],
      path: redirectUri.replace(/^https?:\/\/[^\/]+/, ''),
      exact_match_test: {
        'https://pcsmilesai.com/api/qbo/callback': redirectUri === 'https://pcsmilesai.com/api/qbo/callback',
        'https://www.pcsmilesai.com/api/qbo/callback': redirectUri === 'https://www.pcsmilesai.com/api/qbo/callback',
        'https://pcsmilesai.com/api/qbo/callback/': redirectUri === 'https://pcsmilesai.com/api/qbo/callback/',
        'https://www.pcsmilesai.com/api/qbo/callback/': redirectUri === 'https://www.pcsmilesai.com/api/qbo/callback/',
      }
    },
    oauth_url: `https://appcenter.intuit.com/connect/oauth2?client_id=${process.env.QBO_CLIENT_ID}&response_type=code&scope=${process.env.QBO_SCOPES}&redirect_uri=${encoded}&state=${b64url(crypto.randomBytes(8))}&access_type=offline`,
    timestamp: new Date().toISOString()
  });
}
