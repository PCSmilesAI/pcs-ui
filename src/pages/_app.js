import { AuthProvider } from '../context/AuthContext.jsx';
import RequireAuth from '../components/RequireAuth.jsx';
import NavBar from '../components/NavBar.jsx';
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
