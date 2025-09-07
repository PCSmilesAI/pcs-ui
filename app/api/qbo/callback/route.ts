import { NextRequest, NextResponse } from 'next/server';
import { oauth2 } from '../../../../lib/qbo/oauthClient';
import { tokenStorage } from '../../../../lib/qbo/tokenStorage';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const realmId = url.searchParams.get('realmId');
    const state = url.searchParams.get('state');

    console.log('🔄 QBO Callback received:', { code: !!code, realmId, state });

    if (!code || !realmId) {
      return NextResponse.redirect(new URL('/qbo-test?error=missing_params', req.url), 302);
    }

    try {
      console.log('🔄 QBO Callback: Exchanging code for tokens...');
      const { token } = await oauth2.getToken({
        code,
        redirect_uri: process.env.QBO_REDIRECT_URI!,
      });

      console.log('✅ QBO Callback: Tokens received, storing in database...');
      
      // Store tokens securely in database with obtained_at timestamp
      await tokenStorage.saveTokens({
        realmId,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresIn: token.expires_in,
        obtained_at: Math.floor(Date.now() / 1000)
      });

      console.log('🎉 QBO Callback: Successfully connected to QuickBooks!');
      console.log('📊 Realm ID:', realmId);
      console.log('⏰ Token expires in:', token.expires_in, 'seconds');

      // Redirect to success page or return success response
      return NextResponse.redirect(new URL('/?qbo_connected=true', req.url), 302);
      
    } catch (error: any) {
      console.error('❌ QBO Callback Error:', error);
      return NextResponse.json({ 
        error: error.message || 'OAuth error',
        details: 'Failed to complete QuickBooks connection'
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('❌ QBO Callback Error:', error);
    return NextResponse.json({ 
      error: error.message || 'OAuth error',
      details: 'Failed to complete QuickBooks connection'
    }, { status: 500 });
  }
}
