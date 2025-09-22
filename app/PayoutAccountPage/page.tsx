'use client';
import { Suspense } from 'react';
import PayoutAccountPageImpl from '../../src/ui-pages/PayoutAccountPage.jsx';

export const dynamic = 'force-dynamic';

export default function Page(props: any) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PayoutAccountPageImpl {...props} />
    </Suspense>
  );
}


