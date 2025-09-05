import { useContext, useEffect } from 'react';
import { useRouter } from 'next/router';
import { AuthContext } from '../context/AuthContext';

export default function Home() {
  const { user } = useContext(AuthContext);
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      router.replace('/LoginPage');
    } else {
      router.replace('/ForMePage'); // or your preferred dashboard page
    }
  }, [user, router]);

  return null;
}
