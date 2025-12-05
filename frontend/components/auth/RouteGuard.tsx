"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated, getUserType, type UserType } from "@/lib/auth";
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
  const [isAuthorized, setIsAuthorized] = React.useState<boolean | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const checkAuth = async () => {
      // Check if user is authenticated (client-side check)
      if (!isAuthenticated()) {
        router.push(redirectTo);
        return;
      }

      try {
        // ALWAYS verify with backend - this is the REAL security check
        // Backend validates JWT token signature and expiration
        const response = await apiClient.get("/api/token/validate/");
        const backendUserType = response.data.user_type;

        // If user types are specified, verify user type matches
        if (allowedUserTypes && allowedUserTypes.length > 0) {
          if (!backendUserType || !allowedUserTypes.includes(backendUserType)) {
            // User doesn't have the required type
            router.push(redirectTo);
            return;
          }
        }

        // All checks passed
        setIsAuthorized(true);
      } catch (error: any) {
        // Backend verification failed (token invalid, expired, unauthorized, etc.)
        // This is the critical security check - if backend rejects, user is not authorized
        console.error("Authentication verification failed:", error);
        router.push(redirectTo);
        return;
      }

      setIsLoading(false);
    };

    checkAuth();
  }, [router, allowedUserTypes, redirectTo]);

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

