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

// Helper function to check if an endpoint is public (doesn't require authentication)
const isPublicEndpoint = (
  url: string | undefined,
  method: string | undefined
): boolean => {
  if (!url) return false;

  // Token endpoints (login, refresh) are public
  if (
    url.includes("/api/token/refresh/") ||
    (url.includes("/api/token/") && method === "post")
  ) {
    return true;
  }

  // Registration endpoint is public
  if (url.includes("/api/register/")) {
    return true;
  }

  // Password reset endpoints are public
  if (url.includes("/api/password-reset/")) {
    return true;
  }

  return false;
};

// Helper function to check if current path is a public auth route
const isPublicAuthRoute = (): boolean => {
  if (typeof window === "undefined") return false;
  const pathname = window.location.pathname;
  return (
    pathname === "/auth/login" ||
    pathname === "/auth/register" ||
    pathname.startsWith("/auth/reset-password")
  );
};

// Request interceptor to add token to headers and refresh if needed
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // If data is FormData, remove Content-Type header to let browser set it with boundary
    if (config.data instanceof FormData && config.headers) {
      delete config.headers["Content-Type"];
    }

    // Skip token logic for public endpoints
    if (isPublicEndpoint(config.url, config.method)) {
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
              if (typeof window !== "undefined" && !isPublicAuthRoute()) {
                window.location.href = "/auth/login";
              }
              return null;
            }
          } catch (error) {
            processQueue(null, null);
            clearTokens();
            if (typeof window !== "undefined" && !isPublicAuthRoute()) {
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

    // Skip refresh logic for public endpoints
    if (isPublicEndpoint(originalRequest?.url, originalRequest?.method)) {
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
          if (typeof window !== "undefined" && !isPublicAuthRoute()) {
            window.location.href = "/auth/login";
          }
          return Promise.reject(error);
        }
      } catch (refreshError) {
        processQueue(refreshError as AxiosError, null);
        clearTokens();
        if (typeof window !== "undefined" && !isPublicAuthRoute()) {
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

// Stage deadlines response type
export interface StageDeadlinesResponse {
  stage_1_deadline: string | null;
  stage_2_deadline: string | null;
  stage_3_deadline: string | null;
  stage_4_deadline: string | null;
  stage_5_deadline: string | null;
}

// Download order summary PDF
export const downloadOrderSummaryPDF = async (
  companyId: number
): Promise<void> => {
  try {
    const response = await apiClient.get(
      `/api/company/${companyId}/order-summary-pdf/`,
      {
        responseType: "blob",
      }
    );

    // Create blob from response
    const blob = new Blob([response.data], { type: "application/pdf" });

    // Create download link
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;

    // Extract filename from Content-Disposition header if available
    const contentDisposition = response.headers["content-disposition"];
    let filename = `order_summary_${companyId}.pdf`;
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
      if (filenameMatch) {
        filename = filenameMatch[1];
      }
    }

    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();

    // Cleanup
    link.parentNode?.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error: any) {
    const errorMessage =
      error.response?.data?.detail ||
      error.response?.data?.message ||
      "An error occurred while downloading the PDF";

    // If response is a blob (error PDF), try to read it as text
    if (error.response?.data instanceof Blob) {
      const text = await error.response.data.text();
      try {
        const jsonError = JSON.parse(text);
        throw new Error(jsonError.detail || errorMessage);
      } catch {
        throw new Error(errorMessage);
      }
    }

    throw new Error(errorMessage);
  }
};

// Download companies CSV export
export const downloadCompaniesCSV = async (): Promise<void> => {
  try {
    const response = await apiClient.get("/api/export/csv/", {
      responseType: "blob",
    });

    // Create blob from response with UTF-8 encoding
    const blob = new Blob([response.data], {
      type: "text/csv;charset=utf-8;",
    });

    // Create download link
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;

    // Extract filename from Content-Disposition header if available
    const contentDisposition = response.headers["content-disposition"];
    let filename = "companies_export.csv";
    if (contentDisposition) {
      // Handle both regular filename and RFC 5987 encoded filename (filename*=UTF-8''...)
      const filenameMatch =
        contentDisposition.match(/filename\*=UTF-8''(.+)/i) ||
        contentDisposition.match(/filename="?(.+)"?/i);
      if (filenameMatch) {
        filename = decodeURIComponent(filenameMatch[1]);
      }
    }

    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();

    // Cleanup
    link.parentNode?.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error: any) {
    const errorMessage =
      error.response?.data?.detail ||
      error.response?.data?.message ||
      "An error occurred while downloading the CSV file";

    // If response is a blob (error response), try to read it as text
    if (error.response?.data instanceof Blob) {
      const text = await error.response.data.text();
      try {
        const jsonError = JSON.parse(text);
        throw new Error(jsonError.detail || jsonError.error || errorMessage);
      } catch {
        // If not JSON, it might be plain text error
        if (text) {
          throw new Error(text);
        }
        throw new Error(errorMessage);
      }
    }

    throw new Error(errorMessage);
  }
};

// Download media files export
export const downloadMediaFiles = async (): Promise<void> => {
  try {
    const response = await apiClient.get("/api/export/media/", {
      responseType: "blob",
    });

    // Create blob from response
    const blob = new Blob([response.data], {
      type: "application/zip",
    });

    // Create download link
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;

    // Extract filename from Content-Disposition header if available
    const contentDisposition = response.headers["content-disposition"];
    let filename = "media_files.zip";
    if (contentDisposition) {
      const filenameMatch =
        contentDisposition.match(/filename\*=UTF-8''(.+)/i) ||
        contentDisposition.match(/filename="?(.+)"?/i);
      if (filenameMatch) {
        filename = decodeURIComponent(filenameMatch[1]);
      }
    }

    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();

    // Cleanup
    link.parentNode?.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error: any) {
    const errorMessage =
      error.response?.data?.detail ||
      error.response?.data?.message ||
      "An error occurred while downloading the media files";

    // If response is a blob (error response), try to read it as text
    if (error.response?.data instanceof Blob) {
      const text = await error.response.data.text();
      try {
        const jsonError = JSON.parse(text);
        throw new Error(jsonError.detail || jsonError.error || errorMessage);
      } catch {
        // If not JSON, it might be plain text error
        if (text) {
          throw new Error(text);
        }
        throw new Error(errorMessage);
      }
    }

    throw new Error(errorMessage);
  }
};
