import axios from "axios";

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

// Fetcher function for SWR
export const fetcher = async <T>(url: string): Promise<T> => {
  const response = await apiClient.get<T>(url);
  return response.data;
};
