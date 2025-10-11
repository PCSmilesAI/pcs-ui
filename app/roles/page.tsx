export const dynamic = 'force-dynamic';
export default function Page() {
  // Alias /roles to the existing /RolesPage to avoid case-sensitive 404s
  if (typeof window !== 'undefined') {
    window.location.replace('/RolesPage');
  }
  return null;
}


