import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, profile, authReady, profileLoading, isAdmin } = useAuth();
  const location = useLocation();

  // Only block during first app boot (not on every navigation)
 if (!authReady || profileLoading) {
  return (
    <div style={{ padding: 24, textAlign: "center", fontWeight: 600 }}>
      Loading…
    </div>
  );
}

 // Allow reset password page without being logged in
if (!user && location.pathname !== "/reset-password") {
  return <Navigate to="/login" replace state={{ from: location.pathname }} />;
}

  // 🔐 NEW: Admin-only protection
 // Wait until profile is loaded before deciding admin access
if (adminOnly && user && (profileLoading || !profile)) {
  return (
    <div style={{ padding: 24, textAlign: "center", fontWeight: 600 }}>
      Loading…
    </div>
  );
}

if (adminOnly && !isAdmin) {
  return <Navigate to="/" replace />;
}

  return children;
}

export default ProtectedRoute;