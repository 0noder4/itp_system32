// Token storage utilities for JWT authentication

import { setLanguageFromProfile, type Locale } from "./i18n";

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";

export interface TokenResponse {
  access: string;
  refresh: string;
  user_type?: string;
  username?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  language?: Locale;
}

export type UserType = "admin" | "staff" | "company";

export interface DecodedToken {
  user_type: UserType;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  language: Locale;
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
  first_name: string;
  last_name: string;
} | null => {
  const token = getAccessToken();
  if (!token) return null;

  const decoded = decodeToken(token);
  if (!decoded || !decoded.user_type) return null;

  return {
    type: decoded.user_type,
    username: decoded.username || "",
    email: decoded.email || "",
    first_name: decoded.first_name || "",
    last_name: decoded.last_name || "",
  };
};

/**
 * Get route for user type
 */
export const getUserRoute = (userType: UserType | null): string => {
  switch (userType) {
    case "admin":
      return "/panel/staff";
    case "staff":
      return "/panel/staff";
    case "company":
      return "/panel/exhibitor";
    default:
      return "/panel";
  }
};

/**
 * Store tokens in localStorage and apply user language preference
 * @param tokens - Token response from backend
 * @param notifyChange - Whether to dispatch tokens-changed event (default: false)
 *                        Only set to true when tokens change from login/initial auth
 */
export const storeTokens = (tokens: TokenResponse, notifyChange: boolean = false): void => {
  if (typeof window === "undefined") return;

  const oldToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  const oldUserType = oldToken ? decodeToken(oldToken)?.user_type : null;
  const newUserType = tokens.access ? decodeToken(tokens.access)?.user_type : null;

  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh);

  // Only dispatch event if user type changed or explicitly requested (e.g., on login)
  // Don't dispatch on token refresh (normal operation)
  if (notifyChange || (oldUserType !== newUserType && newUserType !== null)) {
    window.dispatchEvent(new Event("tokens-changed"));
  }

  // Apply language preference if provided
  if (tokens.language) {
    setLanguageFromProfile(tokens.language);
  }
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

/**
 * Check if access token is expired or will expire soon
 * @param bufferSeconds - Number of seconds before expiration to consider token as expired (default: 60)
 */
export const isTokenExpired = (bufferSeconds: number = 60): boolean => {
  const token = getAccessToken();
  if (!token) return true;

  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) return true;

  // Check if token expires within bufferSeconds
  const expirationTime = decoded.exp * 1000; // Convert to milliseconds
  const currentTime = Date.now();
  return currentTime >= expirationTime - bufferSeconds * 1000;
};

/**
 * Refresh the access token using the refresh token
 * @returns Promise with new token response or null if refresh fails
 */
export const refreshAccessToken = async (): Promise<TokenResponse | null> => {
  if (typeof window === "undefined") return null;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    // Use a plain axios instance to avoid circular dependency with apiClient
    const axios = (await import("axios")).default;
    const baseURL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    const response = await axios.post(
      `${baseURL}/api/token/refresh/`,
      { refresh: refreshToken },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    // The refresh endpoint returns { access: string } or { access: string, refresh: string }
    // depending on ROTATE_REFRESH_TOKENS setting
    // If refresh token is rotated, use the new one; otherwise keep the old one
    const newTokens: TokenResponse = {
      access: response.data.access,
      refresh: response.data.refresh || refreshToken, // Use new refresh token if provided, otherwise keep old one
    };

    // Update stored tokens
    storeTokens(newTokens);
    return newTokens;
  } catch (error) {
    console.error("Error refreshing token:", error);
    // If refresh fails, clear tokens
    clearTokens();
    return null;
  }
};
