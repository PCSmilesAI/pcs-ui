'use client';
import { Suspense } from 'react';
import RolesPageImpl from '../../src/ui-pages/RolesPage.jsx';

export const dynamic = 'force-dynamic';

export default function Page(props: any) {
  return (
    <Suspense fallback={<div style={{ padding: '24px', textAlign: 'center' }}>Loading...</div>}>
      <RolesPageImpl {...props} />
    </Suspense>
  );
}
