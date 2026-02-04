/**
 * Mock for jose ESM module
 * Used in E2E tests to avoid ESM compatibility issues
 */

export const jwtVerify = jest.fn().mockResolvedValue({
  payload: {
    sub: 'mock-user-id',
    email: 'test@example.com',
    name: 'Test User',
    iss: 'https://mock-issuer.com',
    aud: 'mock-client-id',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  },
  protectedHeader: {
    alg: 'RS256',
    typ: 'JWT',
  },
});

export const createRemoteJWKSet = jest.fn().mockReturnValue(jest.fn());

export const decodeJwt = jest.fn().mockReturnValue({
  sub: 'mock-user-id',
  email: 'test@example.com',
  name: 'Test User',
});

export const SignJWT = jest.fn().mockImplementation(() => ({
  setProtectedHeader: jest.fn().mockReturnThis(),
  setIssuedAt: jest.fn().mockReturnThis(),
  setIssuer: jest.fn().mockReturnThis(),
  setAudience: jest.fn().mockReturnThis(),
  setExpirationTime: jest.fn().mockReturnThis(),
  setSubject: jest.fn().mockReturnThis(),
  sign: jest.fn().mockResolvedValue('mock-signed-jwt'),
}));

export const importSPKI = jest.fn().mockResolvedValue({});
export const importPKCS8 = jest.fn().mockResolvedValue({});

// Default export for compatibility
export default {
  jwtVerify,
  createRemoteJWKSet,
  decodeJwt,
  SignJWT,
  importSPKI,
  importPKCS8,
};
