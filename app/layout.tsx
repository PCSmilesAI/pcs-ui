import '../src/index.css';

export const metadata = {
  title: 'PCS AI',
  description: 'PCS AI UI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
