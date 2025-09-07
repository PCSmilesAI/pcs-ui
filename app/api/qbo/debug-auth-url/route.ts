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
  const url = new URL("https://appcenter.intuit.com/connect/oauth2");
  url.searchParams.set("client_id", QBO_CLIENT_ID ?? "");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", QBO_SCOPES ?? "");
  url.searchParams.set("redirect_uri", QBO_REDIRECT_URI ?? "");
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "offline");
  
  return NextResponse.json({
    redirect_uri_env: QBO_REDIRECT_URI,
    auth_url: url.toString(),
  });
}
