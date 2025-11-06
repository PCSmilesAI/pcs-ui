import { NextRequest, NextResponse } from 'next/server';
import { getFeatureFlags, setFeatureFlag, resetFeatureFlags, enableEmergencyMode, FeatureFlags } from '@/lib/featureFlags';
import { getCurrentUser } from '@/lib/auth/currentUser';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/feature-flags
 * Get current feature flags (admin only)
 */
export async function GET(req: NextRequest) {
  try {
    // Check admin authorization
    const user = getCurrentUser(req);
    
    if (!user.email || !user.isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized: Admin access required' },
        { status: 403 }
      );
    }
    
    const flags = getFeatureFlags();
    return NextResponse.json({ flags });
  } catch (error: any) {
    console.error('[FEATURE_FLAGS] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to get feature flags' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/feature-flags
 * Update feature flags (admin only)
 */
export async function PUT(req: NextRequest) {
  try {
    // Check admin authorization
    const user = getCurrentUser(req);
    
    if (!user.email || !user.isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized: Admin access required' },
        { status: 403 }
      );
    }
    
    const body = await req.json();
    const { flag, value, emergency } = body;
    
    // Emergency mode - disable all risky operations
    if (emergency === true) {
      enableEmergencyMode();
      return NextResponse.json({ 
        message: 'Emergency mode enabled - all risky operations disabled',
        flags: getFeatureFlags()
      });
    }
    
    // Reset to defaults
    if (body.reset === true) {
      resetFeatureFlags();
      return NextResponse.json({ 
        message: 'Feature flags reset to defaults',
        flags: getFeatureFlags()
      });
    }
    
    // Update specific flag
    if (flag && typeof value === 'boolean') {
      if (!isValidFlag(flag)) {
        return NextResponse.json(
          { error: `Invalid flag: ${flag}` },
          { status: 400 }
        );
      }
      
      setFeatureFlag(flag as keyof FeatureFlags, value);
      return NextResponse.json({ 
        message: `Flag ${flag} set to ${value}`,
        flags: getFeatureFlags()
      });
    }
    
    // Bulk update
    if (body.flags && typeof body.flags === 'object') {
      const flags = body.flags as Partial<FeatureFlags>;
      for (const [key, value] of Object.entries(flags)) {
        if (isValidFlag(key) && typeof value === 'boolean') {
          setFeatureFlag(key as keyof FeatureFlags, value);
        }
      }
      return NextResponse.json({ 
        message: 'Feature flags updated',
        flags: getFeatureFlags()
      });
    }
    
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('[FEATURE_FLAGS] PUT error:', error);
    return NextResponse.json(
      { error: 'Failed to update feature flags' },
      { status: 500 }
    );
  }
}

/**
 * Validate flag name
 */
function isValidFlag(flag: string): flag is keyof FeatureFlags {
  const validFlags: (keyof FeatureFlags)[] = [
    'qboSyncEnabled',
    'qboBillCreationEnabled',
    'qboTokenRefreshEnabled',
    'stripeWebhooksEnabled',
    'stripePaymentProcessingEnabled',
    'emailIngestionEnabled',
    'emailParserEnabled',
    'invoiceAutoCategorizationEnabled',
    'invoiceAutoApprovalEnabled',
    'backgroundJobsEnabled',
    'queueProcessingEnabled',
    'adminBulkOperationsEnabled',
    'adminDataExportEnabled',
    'adminSystemConfigEnabled',
  ];
  return validFlags.includes(flag as keyof FeatureFlags);
}

