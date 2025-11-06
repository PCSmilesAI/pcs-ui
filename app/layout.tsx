import '../src/index.css';
import AppLayoutWrapper from '../src/components/AppLayoutWrapper';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'PCS AI',
  description: 'PCS AI UI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppLayoutWrapper>{children}</AppLayoutWrapper>
      </body>
    </html>
  );
}
