'use client';
import { Suspense, useEffect, useState } from 'react';
import ForMePageImpl from '../../src/ui-pages/ForMePage.jsx';

export const dynamic = 'force-dynamic';

function ForMePageContent(props: any) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div style={{ padding: '24px', textAlign: 'center' }}>Loading...</div>;
  }

  return <ForMePageImpl {...props} />;
}

export default function Page(props: any) {
  console.log('🔍 ForMePage Page component props:', props);
  return (
    <Suspense fallback={<div style={{ padding: '24px', textAlign: 'center' }}>Loading...</div>}>
      <ForMePageContent {...props} />
    </Suspense>
  );
}


