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

  // Edition number (app name / browser title) is public
  if (url.includes("/api/edition/")) {
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

export interface LunchPriceResponse {
  lunch_price: string;
  lunches_free_per_day?: number;
  lunches_free_basic?: number;
  lunches_free_partner?: number;
  lunches_free_main?: number;
  day1: string;
  day2: string;
  /** DD.MM.YYYY — day1 minus 4 weeks; null if day1_date unset */
  fire_cert_deadline?: string | null;
  /** DD.MM.YYYY — day1 minus 6 weeks; auto-reject job starts */
  fire_cert_auto_reject_date?: string | null;
}

export interface JobwallPriceResponse {
  jobwall_price: string;
  jobwall_free_count: number;
  jobwall_pack_2_price?: string;
  jobwall_pack_3_price?: string;
  jobwall_max_extra_offers?: number;
  jobwall_early_deadline?: string | null;
  jobwall_free_basic_early?: number;
  jobwall_free_basic_late?: number;
  jobwall_free_partner?: number;
  jobwall_free_main?: number;
}

export function extractDownloadFilename(
  contentDisposition: string | undefined,
  fallback: string
): string {
  if (!contentDisposition) return fallback;

  const utf8Match = contentDisposition.match(
    /filename\*\s*=\s*(?:UTF-8''|utf-8'')([^;]+)/i
  );
  if (utf8Match?.[1]) {
    const raw = utf8Match[1].trim().replace(/^["']|["']$/g, "");
    try {
      const decoded = decodeURIComponent(raw).replace(/[/\\]/g, "");
      if (decoded) return decoded;
    } catch {
      const cleaned = raw.replace(/[/\\]/g, "");
      if (cleaned) return cleaned;
    }
  }

  const quotedMatch = contentDisposition.match(/filename\s*=\s*"([^"]+)"/i);
  if (quotedMatch?.[1]) {
    const cleaned = quotedMatch[1].trim().replace(/[/\\]/g, "");
    if (cleaned) return cleaned;
  }

  const plainMatch = contentDisposition.match(/filename\s*=\s*([^;\s]+)/i);
  if (plainMatch?.[1]) {
    const cleaned = plainMatch[1].trim().replace(/^["']|["']$/g, "").replace(/[/\\]/g, "");
    if (cleaned) return cleaned;
  }

  return fallback;
}

const LEGAL_SUFFIX_RE =
  /(?:,?\s*(?:spółka\s+z\s+ograniczoną\s+odpowiedzialnością|spolka\s+z\s+ograniczona\s+odpowiedzialnoscia|spółka\s+z\s*o\.?\s*o\.?|spolka\s+z\s*o\.?\s*o\.?|sp\.?\s*z\s*o\.?\s*o\.?|spółka\s+akcyjna|spolka\s+akcyjna|s\.?\s*a\.?))\s*$/i;

export function sanitizeCompanySlug(name: string): string {
  const trimmed = name.trim();
  const withoutLegal = trimmed.replace(LEGAL_SUFFIX_RE, "").trim() || trimmed;
  let slug = withoutLegal
    .replace(/[<>:"/\\|?*]+/g, "")
    .replace(/\s+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "");
  if (slug.length > 20) {
    let cut = slug.slice(0, 20);
    const lastSep = cut.lastIndexOf("_");
    if (lastSep >= 8) {
      cut = cut.slice(0, lastSep);
    }
    slug = cut.replace(/^[._-]+|[._-]+$/g, "");
  }
  return slug;
}

export type CompanyExportSection =
  | "basic"
  | "stage_1"
  | "stage_2"
  | "stage_3"
  | "stage_4"
  | "stage_5"
  | "billing";

export type CompanyExportCombine = "merge" | "separate";

export type CompanyMediaCategory =
  | "logo_sign"
  | "catalogue_logo"
  | "stand_visualization"
  | "fire_cert"
  | "order_pdf";

export interface CompanyExportOptions {
  sections?: CompanyExportSection[];
  combine?: CompanyExportCombine;
}

export interface MediaDownloadOptions {
  companyIds?: number[];
  categories?: CompanyMediaCategory[];
}

export interface MediaDownloadResult {
  downloaded: boolean;
  filesCount: number;
  pdfIncluded: number;
  pdfSkipped: number;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.parentNode?.removeChild(link);
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

async function throwBlobDownloadError(error: any, fallback: string): Promise<never> {
  let message =
    error.response?.data?.detail || error.response?.data?.message || fallback;

  if (error.response?.data instanceof Blob) {
    const text = await error.response.data.text();
    if (text) {
      try {
        const jsonError = JSON.parse(text);
        message = jsonError.detail || jsonError.error || message;
      } catch {
        message = text;
      }
    }
  }

  throw new Error(message);
}

function parseHeaderCount(headers: Record<string, any> | undefined, key: string): number {
  const raw = headers?.[key];
  if (raw === undefined || raw === null) return 0;
  const num = Number(raw);
  return Number.isFinite(num) && num >= 0 ? num : 0;
}

// Download order summary PDF
export const downloadOrderSummaryPDF = async (
  companyId: number,
  companyName?: string
): Promise<void> => {
  try {
    const response = await apiClient.get(
      `/api/company/${companyId}/order-summary-pdf/`,
      {
        responseType: "blob",
      }
    );

    const blob = new Blob([response.data], { type: "application/pdf" });
    const slug = companyName ? sanitizeCompanySlug(companyName) : "";
    const fallback = slug
      ? `podsumowanie_${slug}.pdf`
      : `podsumowanie_${companyId}.pdf`;
    const filename = extractDownloadFilename(
      response.headers["content-disposition"],
      fallback
    );

    triggerBlobDownload(blob, filename);
  } catch (error: any) {
    await throwBlobDownloadError(error, "An error occurred while downloading the PDF");
  }
};

// Download companies CSV (or ZIP of per-section CSVs) for selected company IDs
export const downloadCompaniesCSV = async (
  companyIds: number[],
  options?: CompanyExportOptions
): Promise<void> => {
  try {
    const response = await apiClient.post(
      "/api/export/csv/",
      {
        company_ids: companyIds,
        ...(options?.sections ? { sections: options.sections } : {}),
        ...(options?.combine ? { combine: options.combine } : {}),
      },
      {
        responseType: "blob",
      }
    );

    const contentType = String(response.headers["content-type"] || "").toLowerCase();
    const isZip = contentType.includes("zip");
    const blob = new Blob([response.data], {
      type: isZip ? "application/zip" : "text/csv;charset=utf-8;",
    });
    const filename = extractDownloadFilename(
      response.headers["content-disposition"],
      isZip ? "companies_export_csv.zip" : "companies_export.csv"
    );

    triggerBlobDownload(blob, filename);
  } catch (error: any) {
    await throwBlobDownloadError(
      error,
      "An error occurred while downloading the CSV file"
    );
  }
};

// Download companies styled XLSX workbook for selected company IDs
export const downloadCompaniesXLSX = async (
  companyIds: number[],
  options?: CompanyExportOptions
): Promise<void> => {
  try {
    const response = await apiClient.post(
      "/api/export/xlsx/",
      {
        company_ids: companyIds,
        ...(options?.sections ? { sections: options.sections } : {}),
        ...(options?.combine ? { combine: options.combine } : {}),
      },
      {
        responseType: "blob",
      }
    );

    const blob = new Blob([response.data], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const filename = extractDownloadFilename(
      response.headers["content-disposition"],
      "companies_export.xlsx"
    );

    triggerBlobDownload(blob, filename);
  } catch (error: any) {
    await throwBlobDownloadError(
      error,
      "An error occurred while downloading the XLSX file"
    );
  }
};

// Download media files (and optionally order summary PDFs) as ZIP
export const downloadMediaFiles = async (
  options?: MediaDownloadOptions
): Promise<MediaDownloadResult> => {
  try {
    const response = options
      ? await apiClient.post(
          "/api/export/media/",
          {
            ...(options.companyIds ? { company_ids: options.companyIds } : {}),
            ...(options.categories ? { categories: options.categories } : {}),
          },
          { responseType: "blob" }
        )
      : await apiClient.get("/api/export/media/", {
          responseType: "blob",
        });

    const filesCount = parseHeaderCount(response.headers, "x-export-files-count");
    const pdfIncluded = parseHeaderCount(response.headers, "x-export-pdf-included");
    const pdfSkipped = parseHeaderCount(response.headers, "x-export-pdf-skipped");

    if (response.status === 204) {
      return {
        downloaded: false,
        filesCount: 0,
        pdfIncluded: 0,
        pdfSkipped,
      };
    }

    const blob = new Blob([response.data], {
      type: "application/zip",
    });
    const filename = extractDownloadFilename(
      response.headers["content-disposition"],
      "media_files.zip"
    );

    triggerBlobDownload(blob, filename);
    return {
      downloaded: true,
      filesCount,
      pdfIncluded,
      pdfSkipped,
    };
  } catch (error: any) {
    return await throwBlobDownloadError(
      error,
      "An error occurred while downloading the media files"
    );
  }
};
