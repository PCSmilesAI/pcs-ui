'use client';
import SignupPageImpl from '../../src/ui-pages/SignupPage.jsx';

export const dynamic = 'force-dynamic';

export default function Page(props: any) {
  return <SignupPageImpl {...props} />;
}


