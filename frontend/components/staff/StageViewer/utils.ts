/**
 * Helper function to get full URL for file fields
 */
export function getFileUrl(fileUrl: string | undefined): string | null {
  if (!fileUrl) return null;
  // If already a full URL, return as is
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
    return fileUrl;
  }
  // Get API base URL
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const base = apiBaseUrl.replace(/\/$/, "");

  // DRF FileField returns paths relative to MEDIA_URL
  // If MEDIA_URL is configured, it includes /media/ prefix
  // If not, it might return just the filename or relative path
  let path = fileUrl;

  // If path doesn't start with /, prepend /media/
  if (!path.startsWith("/")) {
    path = `/media/${path}`;
  }
  // If path starts with / but not /media/, and looks like a media file path
  else if (!path.startsWith("/media/")) {
    // Check if it's a known media file pattern (logos, fire_certs, etc.)
    if (path.startsWith("/logos/") || path.startsWith("/fire_certs/")) {
      path = `/media${path}`;
    }
    // Otherwise assume it needs /media/ prefix
    else if (!path.startsWith("/static/") && !path.startsWith("/api/")) {
      path = `/media${path}`;
    }
  }

  return `${base}${path}`;
}

