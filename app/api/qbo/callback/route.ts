import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { AuthorizationCode } from "simple-oauth2";
import { promises as fs } from "fs";
import path from "path";

// Force dynamic rendering
export const dynamic = 'force-dynamic';

const oauth2 = new AuthorizationCode({
  client: { id: process.env.QBO_CLIENT_ID!, secret: process.env.QBO_CLIENT_SECRET! },
  auth: {
    tokenHost: "https://appcenter.intuit.com",
    authorizePath: "/connect/oauth2",
    tokenPath: "/oauth2/v1/tokens/bearer",
  },
  options: {
    authorizationMethod: "body",
    bodyFormat: "form"
  }
});

async function saveTokens(realmId: string, token: any) {
  const dir = path.join(process.cwd(), "pcs_ai_data");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, `qbo_tokens_${realmId}.json`),
    JSON.stringify({
      realmId,
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? null,
      expires_in: token.expires_in,
      obtained_at: Date.now(),
    }, null, 2),
    "utf8"
  );
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const state = url.searchParams.get("state");
  if (!code || !realmId) return NextResponse.json({ error: "Missing code or realmId" }, { status: 400 });

  const jar = cookies();
  const savedState = jar.get("qbo_state")?.value || "";
  const verifier = jar.get("qbo_verifier")?.value || "";
  if (!state || state !== savedState) return NextResponse.json({ error: "Invalid state" }, { status: 400 });

  try {
    const params: any = {
      code,
      redirect_uri: process.env.QBO_REDIRECT_URI!,
      scope: process.env.QBO_SCOPES!,
    };
    if (verifier) params.code_verifier = verifier;

    const result = await oauth2.getToken(params);
    const token = result.token as any;

    await saveTokens(realmId, token);
    jar.delete("qbo_state");
    jar.delete("qbo_verifier");
    return NextResponse.redirect(new URL("/?qbo_connected=true", req.url), 302);
  } catch (e: any) {
    return NextResponse.json({ error: "OAuth error", detail: e?.message || String(e) }, { status: 500 });
  }
}