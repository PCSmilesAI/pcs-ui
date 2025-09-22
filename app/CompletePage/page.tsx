'use client';
import { Suspense } from 'react';
import CompletePageImpl from '../../src/ui-pages/CompletePage.jsx';

export const dynamic = 'force-dynamic';

export default function Page(props: any) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CompletePageImpl {...props} />
    </Suspense>
  );
}


