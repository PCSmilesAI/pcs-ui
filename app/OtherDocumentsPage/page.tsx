'use client';
import { Suspense } from 'react';
import OtherDocumentsPageImpl from '../../src/ui-pages/OtherDocumentsPage.jsx';

export const dynamic = 'force-dynamic';

export default function Page(props: any) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <OtherDocumentsPageImpl {...props} />
    </Suspense>
  );
}
