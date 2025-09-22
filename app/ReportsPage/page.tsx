'use client';
import { Suspense } from 'react';
import ReportsPageImpl from '../../src/ui-pages/ReportsPage.jsx';

export const dynamic = 'force-dynamic';

export default function Page(props: any) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ReportsPageImpl {...props} />
    </Suspense>
  );
}


