"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated, getUserType, getUserRoute } from "@/lib/auth";

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const checkAuthAndRedirect = () => {
      if (isAuthenticated()) {
        // User is logged in, redirect to their dashboard
        const userType = getUserType();
        const dashboardRoute = getUserRoute(userType);
        router.push(dashboardRoute);
      } else {
        // User is not logged in, redirect to login
        router.push("/auth/login");
      }
    };

    checkAuthAndRedirect();
    setIsLoading(false);
  }, [router]);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return null;
}
