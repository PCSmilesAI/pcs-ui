import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { saveTokens } from "@/lib/qbo/tokenStorage";

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const state = url.searchParams.get("state");
  
  console.log('🔄 Working Callback received:', { code: !!code, realmId, state });
  
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

  // Validate state if provided
  if (state) {
    const jar = cookies();
    const savedState = jar.get("qbo_state")?.value || "";
    if (state !== savedState) {
      console.log('❌ State validation failed:', { received: state, saved: savedState });
      return NextResponse.json({ error: "Invalid state" }, { status: 400 });
    }
  }

  try {
    // Direct HTTP request to QuickBooks token endpoint
    const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
    
    // Create Basic Auth header
    const clientId = process.env.QBO_CLIENT_ID || '';
    const clientSecret = process.env.QBO_CLIENT_SECRET || '';
    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    const tokenData = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: 'https://www.pcsmilesai.com/api/qbo/callback'
    });

    console.log('🔄 Making direct token request...');
    console.log('🔄 Token URL:', tokenUrl);
    console.log('🔄 Client ID:', clientId.substring(0, 8) + '...');
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Authorization': `Basic ${authString}`
      },
      body: tokenData.toString()
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('❌ Token request failed:', tokenResponse.status, errorText);
      return NextResponse.json({ 
        error: "Token request failed", 
        status: tokenResponse.status,
        response: errorText
      }, { status: 500 });
    }

    const token = await tokenResponse.json();
    console.log('✅ Tokens received:', { 
      has_access_token: !!token.access_token,
      has_refresh_token: !!token.refresh_token,
      expires_in: token.expires_in
    });

    await saveTokens(realmId, {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_in: token.expires_in,
      obtained_at: Date.now(),
    });
    
    // Clear state cookies
    const jar = cookies();
    jar.delete("qbo_state");
    jar.delete("qbo_verifier");
    
    console.log('🎉 Successfully connected to QuickBooks!');
    console.log('📊 Realm ID:', realmId);

    return NextResponse.redirect(new URL("/?qbo_connected=true", req.url), 302);
  } catch (e: any) {
    console.error('❌ OAuth error:', e);
    return NextResponse.json({ 
      error: "OAuth error", 
      detail: e?.message || String(e),
      stack: e?.stack
    }, { status: 500 });
  }
}
