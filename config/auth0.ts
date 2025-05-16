import { initAuth0 } from '@auth0/nextjs-auth0';

// Debug log all environment variables
console.log('Environment Variables:', {
  AUTH0_SECRET: process.env.AUTH0_SECRET ? 'Set' : 'Not Set',
  AUTH0_ISSUER_BASE_URL: process.env.AUTH0_ISSUER_BASE_URL,
  AUTH0_BASE_URL: process.env.AUTH0_BASE_URL,
  AUTH0_CLIENT_ID: process.env.AUTH0_CLIENT_ID ? 'Set' : 'Not Set',
  AUTH0_CLIENT_SECRET: process.env.AUTH0_CLIENT_SECRET ? 'Set' : 'Not Set',
  NODE_ENV: process.env.NODE_ENV
});

export const auth0Config = {
  secret: process.env.AUTH0_SECRET,
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
  baseURL: process.env.AUTH0_BASE_URL,
  clientID: process.env.AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
  routes: {
    callback: '/api/auth/callback',
    postLogoutRedirect: '/',
  },
  authorizationParams: {
    response_type: 'code' as const,
    scope: 'openid profile email'
  }
};

// Debug log
console.log('Auth0 Config in auth0.ts:', {
  issuerBaseURL: auth0Config.issuerBaseURL,
  baseURL: auth0Config.baseURL,
  clientID: auth0Config.clientID ? 'Set' : 'Not Set',
  clientSecret: auth0Config.clientSecret ? 'Set' : 'Not Set'
});
console.log('Raw AUTH0_ISSUER_BASE_URL:', process.env.AUTH0_ISSUER_BASE_URL);
console.log('Full Auth0 Config:', auth0Config);

export const auth0 = initAuth0(auth0Config); 