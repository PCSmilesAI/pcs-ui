'use client';
import { Suspense, useEffect, useState } from 'react';
import IncomingQueuePageImpl from '../../src/ui-pages/IncomingQueuePage.jsx';

export const dynamic = 'force-dynamic';

function IncomingQueueContent() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) {
    return <div style={{ padding: '24px', textAlign: 'center' }}>Loading...</div>;
  }
  return <IncomingQueuePageImpl />;
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: '24px', textAlign: 'center' }}>Loading...</div>}>
      <IncomingQueueContent />
    </Suspense>
  );
}
