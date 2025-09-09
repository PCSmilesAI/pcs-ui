import '../src/index.css';
import AppLayout from '../src/components/AppLayout';

export const metadata = {
  title: 'PCS AI',
  description: 'PCS AI UI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  );
}
