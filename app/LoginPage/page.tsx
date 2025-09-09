'use client';
import LoginPageImpl from '../../src/ui-pages/LoginPage.jsx';

export const dynamic = 'force-dynamic';

export default function Page(props: any) {
  return <LoginPageImpl {...props} />;
}


