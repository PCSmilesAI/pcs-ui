'use client';
import { Suspense } from 'react';
import QboExportPageImpl from '../../src/ui-pages/QboExportPage.jsx';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <QboExportPageImpl />
    </Suspense>
  );
}
