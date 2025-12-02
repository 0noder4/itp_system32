// Token storage utilities for JWT authentication

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";

export interface TokenResponse {
  access: string;
  refresh: string;
  user_type?: string;
  username?: string;
  email?: string;
}

export type UserType = "admin" | "staff" | "company";

export interface DecodedToken {
  user_type: UserType;
  username: string;
  email: string;
  exp: number;
  iat: number;
  [key: string]: any;
}

/**
 * Decode JWT token without verification (client-side only)
 * Note: This doesn't verify the signature, only decodes the payload
 */
export const decodeToken = (token: string): DecodedToken | null => {
  try {
    const base64Url = token.split(".")[1];
    if (!base64Url) return null;

    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );

    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error("Error decoding token:", error);
    return null;
  }
};

/**
 * Get user type from stored token
 */
export const getUserType = (): UserType | null => {
  const token = getAccessToken();
  if (!token) return null;

  const decoded = decodeToken(token);
  return decoded?.user_type || null;
};

/**
 * Get user info from stored token
 */
export const getUserInfo = (): {
  type: UserType;
  username: string;
  email: string;
} | null => {
  const token = getAccessToken();
  if (!token) return null;

  const decoded = decodeToken(token);
  if (!decoded || !decoded.user_type) return null;

  return {
    type: decoded.user_type,
    username: decoded.username || "",
    email: decoded.email || "",
  };
};

/**
 * Get route for user type
 */
export const getUserRoute = (userType: UserType | null): string => {
  switch (userType) {
    case "admin":
      return "/panel/fr";
    case "staff":
      return "/panel/fr";
    case "company":
      return "/panel/partner";
    default:
      return "/panel";
  }
};

/**
 * Store tokens in localStorage
 */
export const storeTokens = (tokens: TokenResponse): void => {
  if (typeof window === "undefined") return;

  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh);
};

/**
 * Get access token from localStorage
 */
export const getAccessToken = (): string | null => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
};

/**
 * Get refresh token from localStorage
 */
export const getRefreshToken = (): string | null => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
};

/**
 * Remove tokens from localStorage
 */
export const clearTokens = (): void => {
  if (typeof window === "undefined") return;

  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

/**
 * Check if user is authenticated (has access token)
 */
export const isAuthenticated = (): boolean => {
  return getAccessToken() !== null;
};
