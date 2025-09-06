import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const redirectUri = process.env.QBO_REDIRECT_URI;
    
    return NextResponse.json({
      redirectUri,
      encoded: encodeURIComponent(redirectUri || ''),
      length: redirectUri?.length || 0,
      characters: redirectUri?.split('').map((char, index) => ({ index, char, code: char.charCodeAt(0) })) || [],
      message: 'Check this exact URI in your QuickBooks Developer Portal'
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message
    }, { status: 500 });
  }
}
