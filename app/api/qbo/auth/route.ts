import { NextRequest, NextResponse } from 'next/server';
import { oauth2 } from '../../../../lib/qbo/oauthClient';

export async function GET(req: NextRequest) {
  const authorizationUri = oauth2.authorizeURL({
    redirect_uri: process.env.QBO_REDIRECT_URI!,
    scope: process.env.QBO_SCOPES!,
    state: 'secureRandomState123', // Use a secure random value in production!
  });

  return NextResponse.redirect(authorizationUri, 302);
}
