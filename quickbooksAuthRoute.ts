import { authProvider } from './quickbooksAuth'; // Update path if needed

export function getQuickBooksAuthUrl(req, res) {
  const authUrl = authProvider.generateAuthUrl();
  res.redirect(authUrl.toString());
}
