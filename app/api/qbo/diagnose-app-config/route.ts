import { NextResponse } from "next/server";

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    diagnosis: "All redirect URIs are being rejected by AppCenter",
    possible_causes: [
      "QuickBooks app is not in Production mode",
      "Redirect URIs are in Development list instead of Production",
      "App is in Sandbox mode but using Production endpoints",
      "Client ID is not authorized for Production",
      "App needs to be approved for Production use"
    ],
    quickbooks_app_checklist: [
      "1. Go to https://developer.intuit.com/app/developer/myapps",
      "2. Select your app",
      "3. Check the 'App Status' - should be 'Production' or 'Live'",
      "4. Go to 'Keys & OAuth' tab",
      "5. Verify you're looking at 'Production' section (not Development)",
      "6. Check that redirect URIs are in the Production list",
      "7. Verify Client ID matches your environment variable"
    ],
    environment_check: {
      QBO_ENV: process.env.QBO_ENV,
      QBO_CLIENT_ID: process.env.QBO_CLIENT_ID?.substring(0, 8) + "...",
      expected_environment: "production"
    },
    test_without_redirect_uri: "Try this URL to see if the app itself is working:",
    test_url: `https://appcenter.intuit.com/connect/oauth2?client_id=${process.env.QBO_CLIENT_ID}&response_type=code&scope=${process.env.QBO_SCOPES}&redirect_uri=https://example.com/callback&state=test123&access_type=offline`,
    next_steps: [
      "1. Verify your QuickBooks app is in Production mode",
      "2. Check that redirect URIs are in Production list (not Development)",
      "3. Test the URL above with example.com redirect (should work if app is configured correctly)",
      "4. If that works, the issue is specifically with your redirect URI registration"
    ],
    timestamp: new Date().toISOString()
  });
}
