/**
 * Mock for openid-client ESM module
 * Used in E2E tests to avoid ESM compatibility issues
 */

export const discovery = jest.fn().mockResolvedValue({
  issuer: 'https://mock-issuer.com',
  authorization_endpoint: 'https://mock-issuer.com/auth',
  token_endpoint: 'https://mock-issuer.com/token',
  userinfo_endpoint: 'https://mock-issuer.com/userinfo',
  end_session_endpoint: 'https://mock-issuer.com/logout',
});

export const fetchUserInfo = jest.fn().mockResolvedValue({
  sub: 'mock-user-id',
  email: 'test@example.com',
  name: 'Test User',
});

export const authorizationCodeGrant = jest.fn().mockResolvedValue({
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  id_token: 'mock-id-token',
  token_type: 'Bearer',
  expires_in: 3600,
});

export const refreshTokenGrant = jest.fn().mockResolvedValue({
  access_token: 'new-mock-access-token',
  refresh_token: 'new-mock-refresh-token',
  id_token: 'new-mock-id-token',
  token_type: 'Bearer',
  expires_in: 3600,
});

export const buildAuthorizationUrl = jest.fn().mockReturnValue(
  new URL('https://mock-issuer.com/auth?client_id=test'),
);

export const buildEndSessionUrl = jest.fn().mockReturnValue(
  new URL('https://mock-issuer.com/logout'),
);

// Default export for compatibility
export default {
  discovery,
  fetchUserInfo,
  authorizationCodeGrant,
  refreshTokenGrant,
  buildAuthorizationUrl,
  buildEndSessionUrl,
};
