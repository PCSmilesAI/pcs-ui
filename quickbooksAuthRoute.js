const { authProvider } = require('./quickbooksAuth');

function getQuickBooksAuthUrl(req, res) {
  const authUrl = authProvider.generateAuthUrl();
  res.redirect(authUrl.toString());
}

module.exports = { getQuickBooksAuthUrl };