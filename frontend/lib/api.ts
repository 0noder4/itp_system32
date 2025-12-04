import axios, {
  AxiosError,
  InternalAxiosRequestConfig,
  AxiosResponse,
} from "axios";
import {
  getAccessToken,
  clearTokens,
  refreshAccessToken,
  isTokenExpired,
} from "./auth";

// Get API base URL from environment variable or use default
// For client-side requests, always use the hostname (browser can't access Docker service names)
// Set NEXT_PUBLIC_API_URL environment variable to override (e.g., http://localhost:8000)
// NOTE: NEXT_PUBLIC_* variables are replaced at BUILD TIME, not runtime!
const getApiBaseUrl = () => {
  // Check for the environment variable (replaced at build time by Next.js)
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (apiUrl && apiUrl !== "undefined" && apiUrl.trim() !== "") {
    return apiUrl;
  }

  // Default to localhost:8000 for development
  // In production, set NEXT_PUBLIC_API_URL to your backend URL at BUILD TIME
  return typeof window !== "undefined"
    ? "http://localhost:8000"
    : "http://backend:8000"; // Server-side can use service name in Docker
};

const baseURL = getApiBaseUrl();

// Log for debugging (will show in browser console)
if (typeof window !== "undefined") {
  console.log("API Base URL:", baseURL);
  console.log("NEXT_PUBLIC_API_URL:", process.env.NEXT_PUBLIC_API_URL);
}

// Create axios instance with default config
export const apiClient = axios.create({
  baseURL: baseURL,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Important for session authentication
});

// Flag to prevent multiple simultaneous refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;
let failedQueue: Array<{
  resolve: (value?: any) => void;
  reject: (reason?: any) => void;
}> = [];

const processQueue = (
  error: AxiosError | null,
  token: string | null = null
) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Request interceptor to add token to headers and refresh if needed
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Skip token refresh for refresh endpoint and login endpoint
    if (
      config.url?.includes("/api/token/refresh/") ||
      (config.url?.includes("/api/token/") && config.method === "post")
    ) {
      return config;
    }

    // Check if token is expired or about to expire, refresh proactively
    if (isTokenExpired(60)) {
      // Token expires within 60 seconds, try to refresh
      if (!isRefreshing && !refreshPromise) {
        isRefreshing = true;
        refreshPromise = (async () => {
          try {
            const newTokens = await refreshAccessToken();
            if (newTokens) {
              processQueue(null, newTokens.access);
              return newTokens.access;
            } else {
              // Refresh failed, clear tokens
              processQueue(null, null);
              clearTokens();
              if (
                typeof window !== "undefined" &&
                window.location.pathname !== "/auth/login"
              ) {
                window.location.href = "/auth/login";
              }
              return null;
            }
          } catch (error) {
            processQueue(null, null);
            clearTokens();
            if (
              typeof window !== "undefined" &&
              window.location.pathname !== "/auth/login"
            ) {
              window.location.href = "/auth/login";
            }
            return null;
          } finally {
            isRefreshing = false;
            refreshPromise = null;
          }
        })();
      }

      // Wait for ongoing refresh to complete
      if (refreshPromise) {
        const newToken = await refreshPromise;
        if (newToken && config.headers) {
          config.headers.Authorization = `Bearer ${newToken}`;
        }
      } else {
        // Fallback: use current token if refresh is not in progress
        const token = getAccessToken();
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
    } else {
      // Token is still valid, use it
      const token = getAccessToken();
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle token expiration
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Skip refresh logic for refresh endpoint and login endpoint
    if (
      originalRequest?.url?.includes("/api/token/refresh/") ||
      (originalRequest?.url?.includes("/api/token/") &&
        originalRequest?.method === "post")
    ) {
      return Promise.reject(error);
    }

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry
    ) {
      // Token expired, try to refresh
      if (isRefreshing) {
        // Wait for ongoing refresh
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (token && originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return apiClient(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const newTokens = await refreshAccessToken();
        if (newTokens) {
          // Update the original request with new token
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newTokens.access}`;
          }
          processQueue(null, newTokens.access);
          // Retry the original request
          return apiClient(originalRequest);
        } else {
          // Refresh failed
          processQueue(error, null);
          clearTokens();
          if (
            typeof window !== "undefined" &&
            window.location.pathname !== "/auth/login"
          ) {
            window.location.href = "/auth/login";
          }
          return Promise.reject(error);
        }
      } catch (refreshError) {
        processQueue(refreshError as AxiosError, null);
        clearTokens();
        if (
          typeof window !== "undefined" &&
          window.location.pathname !== "/auth/login"
        ) {
          window.location.href = "/auth/login";
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// Fetcher function for SWR
export const fetcher = async <T>(url: string): Promise<T> => {
  const response = await apiClient.get<T>(url);
  return response.data;
};
