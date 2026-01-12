"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { isAuthenticated, getUserType, type UserType, getUserRoute } from "@/lib/auth";
import { apiClient } from "@/lib/api";

interface RouteGuardProps {
  children: React.ReactNode;
  allowedUserTypes?: UserType[];
  redirectTo?: string;
}

/**
 * RouteGuard component that protects routes based on authentication and user type
 * 
 * IMPORTANT: This is a CLIENT-SIDE guard only. Real security must be enforced
 * on the backend. This component provides UX improvements and prevents accidental
 * access, but should never be the only security measure.
 */
export function RouteGuard({
  children,
  allowedUserTypes,
  redirectTo = "/auth/login",
}: RouteGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthorized, setIsAuthorized] = React.useState<boolean | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [currentUserType, setCurrentUserType] = React.useState<UserType | null>(null);

  const checkAuth = React.useCallback(async () => {
    setIsLoading(true);
    
    // Check if user is authenticated (client-side check)
    if (!isAuthenticated()) {
      setIsAuthorized(false);
      setIsLoading(false);
      router.replace(redirectTo);
      return;
    }

    try {
      // ALWAYS verify with backend - this is the REAL security check
      // Backend validates JWT token signature and expiration
      const response = await apiClient.get("/api/token/validate/");
      const backendUserType = response.data.user_type as UserType | null;
      
      // Update current user type to detect changes
      setCurrentUserType(backendUserType);

      // If user types are specified, verify user type matches
      if (allowedUserTypes && allowedUserTypes.length > 0) {
        if (!backendUserType || !allowedUserTypes.includes(backendUserType)) {
          // User doesn't have the required type - redirect to appropriate dashboard
          setIsAuthorized(false);
          setIsLoading(false);
          const userRoute = getUserRoute(backendUserType);
          router.replace(userRoute || redirectTo);
          return;
        }
      }

      // All checks passed
      setIsAuthorized(true);
    } catch (error: any) {
      // Backend verification failed (token invalid, expired, unauthorized, etc.)
      // This is the critical security check - if backend rejects, user is not authorized
      console.error("Authentication verification failed:", error);
      setCurrentUserType(null);
      setIsAuthorized(false);
      setIsLoading(false);
      router.replace(redirectTo);
      return;
    }

    setIsLoading(false);
  }, [router, allowedUserTypes, redirectTo]);

  React.useEffect(() => {
    checkAuth();
  }, [checkAuth, pathname]); // Re-check when pathname changes

  // Listen for storage events (when tokens change in another tab/window)
  // and custom events for same-tab token changes (only on login/user switch)
  React.useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      // Only react to token changes from other tabs/windows
      if (e.key === "access_token" || e.key === "refresh_token") {
        checkAuth();
      }
    };

    // Custom event for same-tab token changes (only dispatched on login/user switch)
    const handleTokenChange = () => {
      checkAuth();
    };

    // Listen for storage events (cross-tab communication)
    window.addEventListener("storage", handleStorageChange);
    
    // Listen for custom event for same-tab token changes (user login/switch)
    window.addEventListener("tokens-changed", handleTokenChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("tokens-changed", handleTokenChange);
    };
  }, [checkAuth]);

  if (isLoading || isAuthorized === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return null; // Will redirect, so return nothing
  }

  return <>{children}</>;
}

