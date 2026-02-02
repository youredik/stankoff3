export interface KeycloakUserInfo {
  sub: string; // Keycloak user ID
  email: string;
  email_verified?: boolean;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  name?: string;
  realm_access?: {
    roles: string[];
  };
  resource_access?: {
    [clientId: string]: {
      roles: string[];
    };
  };
}

export interface KeycloakTokenPayload {
  exp: number;
  iat: number;
  iss: string;
  sub: string;
  email?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  realm_access?: {
    roles: string[];
  };
}
