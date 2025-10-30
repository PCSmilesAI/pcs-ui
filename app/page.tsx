'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Immediate redirect using window.location for better Safari compatibility
    if (typeof window !== 'undefined') {
      window.location.replace('/LoginPage');
    }
  }, [router]);

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      color: '#357ab2'
    }}>
      Redirecting...
    </div>
  );
}
