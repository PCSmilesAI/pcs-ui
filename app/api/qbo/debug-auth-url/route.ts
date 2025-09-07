import { NextResponse } from "next/server";
import crypto from "crypto";

// Force dynamic rendering
export const dynamic = 'force-dynamic';

function b64url(b: Buffer) {
  return b.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

export async function GET() {
  const { QBO_CLIENT_ID, QBO_REDIRECT_URI, QBO_SCOPES } = process.env;
  const state = b64url(crypto.randomBytes(8));
  const u = new URL("https://appcenter.intuit.com/connect/oauth2");
  u.searchParams.set("client_id", QBO_CLIENT_ID ?? "");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", QBO_SCOPES ?? "");
  u.searchParams.set("redirect_uri", QBO_REDIRECT_URI ?? "");
  u.searchParams.set("state", state);
  u.searchParams.set("access_type", "offline");
  
  return NextResponse.json({ 
    client_id: QBO_CLIENT_ID, 
    redirect_uri_env: QBO_REDIRECT_URI, 
    auth_url: u.toString() 
  });
}
