'use client';
import { Suspense } from 'react';
import ToBePaidPage from '../../src/ui-pages/ToBePaidPage.jsx';

export const dynamic = 'force-dynamic';

export default function Page(props: any) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ToBePaidPage {...props} />
    </Suspense>
  );
}
