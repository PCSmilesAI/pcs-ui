'use client';
import { useSearchParams } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function VendorOnboardingSuccessPage() {
  const sp = useSearchParams();
  const vendor = sp.get('vendor') || 'Vendor';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#f3f4f6',
      padding: '20px',
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
    }}>
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '12px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        padding: '40px',
        maxWidth: '500px',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: '48px',
          marginBottom: '20px',
        }}>
          ✓
        </div>

        <h1 style={{
          fontSize: '28px',
          fontWeight: 'bold',
          color: '#166534',
          marginBottom: '12px',
        }}>
          ACH Onboarding Complete!
        </h1>

        <p style={{
          fontSize: '16px',
          color: '#6b7280',
          marginBottom: '24px',
          lineHeight: '1.6',
        }}>
          Thank you for completing your ACH onboarding, <strong>{vendor}</strong>. Your banking information has been securely submitted and verified.
        </p>

        <p style={{
          fontSize: '14px',
          color: '#9ca3af',
          marginBottom: '32px',
          lineHeight: '1.6',
        }}>
          You can now receive payments via ACH transfer. If you have any questions, please contact support.
        </p>
      </div>
    </div>
  );
}

