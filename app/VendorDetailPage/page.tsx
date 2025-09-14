'use client';
import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import VendorDetailPageImpl from '../../src/ui-pages/VendorDetailPage.jsx';

export const dynamic = 'force-dynamic';

function Inner() {
  const sp = useSearchParams();
  const router = useRouter();
  const vendor = sp.get('vendor') || '';
  return (
    <VendorDetailPageImpl
      vendor={vendor}
      onBack={() => router.push('/VendorsPage')}
      onRowClick={(row: any) => {
        const inv = row?.invoice_number || row?.invoice;
        if (inv) router.push(`/InvoiceDetailPage?invoice=${encodeURIComponent(inv)}`);
      }}
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Inner />
    </Suspense>
  );
}
