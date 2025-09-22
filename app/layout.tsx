import '../src/index.css';
import AppLayout from '../src/components/AppLayout';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'PCS AI',
  description: 'PCS AI UI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={<div>Loading...</div>}>
          <AppLayout>{children}</AppLayout>
        </Suspense>
      </body>
    </html>
  );
}
