import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function Page() {
  // Alias /roles to the existing /RolesPage to avoid case-sensitive 404s
  redirect('/RolesPage');
}


