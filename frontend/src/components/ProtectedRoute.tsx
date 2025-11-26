// Protects admin pages: redirects to login if not authenticated
// Also checks for development phase protected routes
"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

const DEVELOPMENT_PHASE_ROUTES: Record<string, string> = {
  '/admin/coordinator/time-table': 'Time Table Management',
  '/admin/teachers/result': 'Teacher Results',
  '/admin/teachers/request': 'Teacher Requests',
  '/admin/teachers/timetable': 'Teacher Timetable',
  // '/admin/students/leaving-certificate': 'Leaving Certificate',
  // '/admin/students/termination-certificate': 'Termination Certificate',
  '/admin/coordinator/result-approval': 'Result Approval',
  '/admin/coordinator/subject-assign': 'Subject Assignment',
  // '/admin/principals/transfers': 'Transfer Management',
  // '/admin/principals/transfers/create': 'Create Transfer',
  '/admin/coordinator/requests' : 'Requests Management',

};

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isProtectedRoute = !!DEVELOPMENT_PHASE_ROUTES[pathname || ""];
  const isClient = typeof window !== 'undefined';
  const hasToken = isClient ? !!window.localStorage.getItem('sis_access_token') : true;
  
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Persist last safe (non-protected) route for reliable back navigation
      const isProtected = !!DEVELOPMENT_PHASE_ROUTES[pathname || ""];
      const isDevPhase = (pathname === "/development-phase");
      if (pathname && !isProtected && !isDevPhase) {
        sessionStorage.setItem("last-safe-route", pathname);
      }

      // First check authentication
      const token = window.localStorage.getItem("sis_access_token");
      if (!token) {
        router.replace("/Universal_Login");
        return;
      }

      // Then check if current route is in development phase
      if (pathname && DEVELOPMENT_PHASE_ROUTES[pathname]) {
        const featureName = DEVELOPMENT_PHASE_ROUTES[pathname];
        const currentRoute = pathname;
        // Prefer last safe route stored in session; fallback to referrer; then /admin
        const stored = sessionStorage.getItem("last-safe-route");
        const ref = document.referrer ? new URL(document.referrer).pathname : "";
        let previousRoute = stored || ref || '/admin';
        if (!previousRoute || previousRoute === currentRoute || DEVELOPMENT_PHASE_ROUTES[previousRoute]) {
          previousRoute = '/admin';
        }
        
        // Redirect to development phase page with route info
        router.replace(
          `/development-phase?feature=${encodeURIComponent(featureName)}&route=${encodeURIComponent(currentRoute)}&previous=${encodeURIComponent(previousRoute)}`
        );
        return;
      }
    }
  }, [router, pathname]);
  
  // Ultra-fast block: avoid rendering the target page even for a frame
  if (!hasToken || isProtectedRoute) {
    return null;
  }
  return <>{children}</>;
}
