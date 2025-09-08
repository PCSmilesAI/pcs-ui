import { AuthorizationCode } from 'simple-oauth2';

export const oauth2 = new AuthorizationCode({
  client: {
    id: process.env.QBO_CLIENT_ID!,
    secret: process.env.QBO_CLIENT_SECRET!,
  },
  auth: {
    tokenHost: 'https://appcenter.intuit.com',
    authorizePath: '/connect/oauth2',
    tokenPath: '/oauth2/v1/tokens/bearer',
  },
  options: {
    authorizationMethod: "body",
    bodyFormat: "form"
  }
});
