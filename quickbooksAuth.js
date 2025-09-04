const { AuthProvider, AuthScopes } = require('quickbooks-api');

const CLIENT_ID = process.env.QBO_CLIENT_ID;
const CLIENT_SECRET = process.env.QBO_CLIENT_SECRET;
const REDIRECT_URI = process.env.QBO_REDIRECT_URI;

const authProvider = new AuthProvider(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI,
  [
    AuthScopes.Accounting,
    AuthScopes.OpenId,
  ]
);

module.exports = { authProvider };