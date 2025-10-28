import { Suspense } from 'react';
import ConnectionsPage from '../../../src/ui-pages/ConnectionsPage';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ConnectionsPage />
    </Suspense>
  );
}
