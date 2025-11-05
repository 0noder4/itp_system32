import axios from "axios";

// Get API base URL from environment variable or use default
// For client-side requests, always use the hostname (browser can't access Docker service names)
// Set NEXT_PUBLIC_API_URL environment variable to override (e.g., http://localhost:8000)
const getApiBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  // Default to localhost:8000 for development
  // In production, set NEXT_PUBLIC_API_URL to your backend URL
  return typeof window !== "undefined"
    ? "http://localhost:8000"
    : "http://backend:8000"; // Server-side can use service name in Docker
};

// Create axios instance with default config
export const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
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
