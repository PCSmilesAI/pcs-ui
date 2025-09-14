'use client';
import { Suspense } from 'react';
import AllInvoicesPageImpl from '../../src/ui-pages/AllInvoicesPage.jsx';

export const dynamic = 'force-dynamic';

export default function Page(props: any) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AllInvoicesPageImpl {...props} />
    </Suspense>
  );
}


