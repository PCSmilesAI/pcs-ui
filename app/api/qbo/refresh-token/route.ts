import { NextResponse } from 'next/server';
import { qboClient } from '@/lib/qbo/qboClient';
import { tokenRefreshService } from '@/lib/qbo/tokenRefreshService';

export async function POST() {
  try {
    console.log('🔄 Manual token refresh requested');
    
    // Force refresh through the service
    await tokenRefreshService.forceRefresh();
    
    return NextResponse.json({
      success: true,
      message: 'Token refresh completed',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    // Log full error server-side only
    console.error('❌ Manual token refresh failed:', error);
    // Return safe error message to client
    return NextResponse.json({
      success: false,
      error: 'Token refresh failed'
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    // Just check token status
    await qboClient.initialize();
    const isValid = await qboClient.testConnection();
    
    return NextResponse.json({
      connected: isValid,
      message: isValid ? 'QBO connection active' : 'QBO connection failed',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    // Log full error server-side only
    console.error('❌ QBO connection check failed:', error);
    // Return safe error message to client
    return NextResponse.json({
      connected: false,
      error: 'Connection check failed',
      timestamp: new Date().toISOString()
    });
  }
}


