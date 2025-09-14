'use client';
import { Suspense } from 'react';
import VendorsPageImpl from '../../src/ui-pages/VendorsPage.jsx';

export const dynamic = 'force-dynamic';

export default function Page(props: any) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <VendorsPageImpl {...props} />
    </Suspense>
  );
}


