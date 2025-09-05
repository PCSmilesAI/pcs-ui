import { AuthProvider } from '../context/AuthContext';
import RequireAuth from '../components/RequireAuth';
import NavBar from '../components/NavBar';
import '../index.css';

export default function App({ Component, pageProps, router }) {
  const isAuthPage = router.pathname === '/LoginPage' || router.pathname === '/SignupPage';

  return (
    <AuthProvider>
      <NavBar />
      {isAuthPage ? (
        <Component {...pageProps} />
      ) : (
        <RequireAuth>
          <Component {...pageProps} />
        </RequireAuth>
      )}
    </AuthProvider>
  );
}
