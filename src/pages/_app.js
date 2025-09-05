import { AuthProvider } from '../context/AuthContext.jsx';
import NavBar from '../components/NavBar.jsx';
import '../index.css'; // If you have global styles

export default function App({ Component, pageProps }) {
  return (
    <AuthProvider>
      <NavBar />
      <Component {...pageProps} />
    </AuthProvider>
  );
}
