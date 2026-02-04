import { useContext, useEffect } from 'react';
import { useRouter } from 'next/router';
import { AuthContext } from '../context/AuthContext';

export default function RequireAuth({ children }) {
  const { user, loading } = useContext(AuthContext);
  const router = useRouter();
  const isAuthPage = router.pathname === '/LoginPage' || router.pathname === '/SignupPage';

  useEffect(() => {
    if (!loading && !user && !isAuthPage) {
      router.push('/LoginPage');
    }
  }, [user, loading, router, isAuthPage]);

  if (loading) return <div>Loading...</div>;
  if (!user && !isAuthPage) return null;

  return children;
}
