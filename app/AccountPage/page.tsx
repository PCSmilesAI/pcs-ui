'use client';
import { Suspense } from 'react';
import AccountPageImpl from '../../src/ui-pages/AccountPage.jsx';

export const dynamic = 'force-dynamic';

export default function Page(props: any) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AccountPageImpl {...props} />
    </Suspense>
  );
}


