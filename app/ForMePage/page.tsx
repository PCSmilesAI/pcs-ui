'use client';
import ForMePageImpl from '../../src/ui-pages/ForMePage.jsx';

export const dynamic = 'force-dynamic';

export default function Page(props: any) {
  console.log('🔍 ForMePage Page component props:', props);
  return <ForMePageImpl {...props} />;
}


