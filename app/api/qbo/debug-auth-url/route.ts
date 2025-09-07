import { NextResponse } from "next/server";
import crypto from "crypto";

// Force dynamic rendering
export const dynamic = 'force-dynamic';

function b64url(b: Buffer) {
  return b.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

export async function GET() {
  const s = b64url(crypto.randomBytes(8));
  const url = new URL("https://appcenter.intuit.com/connect/oauth2");
  url.searchParams.set("client_id", process.env.QBO_CLIENT_ID!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", process.env.QBO_SCOPES!);
  url.searchParams.set("redirect_uri", process.env.QBO_REDIRECT_URI!);
  url.searchParams.set("state", s);
  url.searchParams.set("access_type", "offline");
  
  return NextResponse.json({
    auth: url.toString(), 
    redirect_uri: process.env.QBO_REDIRECT_URI,
    client_id: process.env.QBO_CLIENT_ID?.substring(0, 8) + "...",
    scope: process.env.QBO_SCOPES,
    state: s,
    analysis: {
      redirect_uri_encoded: encodeURIComponent(process.env.QBO_REDIRECT_URI || ""),
      has_client_id: !!process.env.QBO_CLIENT_ID,
      has_redirect_uri: !!process.env.QBO_REDIRECT_URI,
      has_scope: !!process.env.QBO_SCOPES,
      has_state: !!s
    }
  });
}
