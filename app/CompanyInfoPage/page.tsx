'use client';
import { Suspense } from 'react';
import CompanyInfoPageImpl from '../../src/ui-pages/CompanyInfoPage.jsx';

export const dynamic = 'force-dynamic';

export default function Page(props: any) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CompanyInfoPageImpl {...props} />
    </Suspense>
  );
}


