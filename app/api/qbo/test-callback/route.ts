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
  
  console.log('🔄 Test Callback received:', { code: !!code, realmId, state });
  
  if (!code || !realmId) {
    return NextResponse.json({ 
      error: "Missing code or realmId",
      received_params: {
        code: !!code,
        realmId,
        state,
        all_params: Object.fromEntries(url.searchParams.entries())
      }
    }, { status: 400 });
  }

  try {
    const params: any = {
      code,
      redirect_uri: process.env.QBO_REDIRECT_URI!,
      scope: process.env.QBO_SCOPES!,
    };

    console.log('🔄 Exchanging code for tokens...');
    const result = await oauth2.getToken(params);
    const token = result.token as any;

    console.log('✅ Tokens received, saving...');
    await saveTokens(realmId, token);
    
    console.log('🎉 Successfully connected to QuickBooks!');
    console.log('📊 Realm ID:', realmId);
    console.log('⏰ Token expires in:', token.expires_in, 'seconds');

    return NextResponse.json({
      success: true,
      message: "Successfully connected to QuickBooks!",
      realmId,
      token_info: {
        has_access_token: !!token.access_token,
        has_refresh_token: !!token.refresh_token,
        expires_in: token.expires_in
      }
    });
  } catch (e: any) {
    console.error('❌ OAuth error:', e);
    return NextResponse.json({ 
      error: "OAuth error", 
      detail: e?.message || String(e),
      stack: e?.stack
    }, { status: 500 });
  }
}
