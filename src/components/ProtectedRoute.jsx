import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, authReady, isAdmin } = useAuth();

  // Only block during first app boot (not on every navigation)
  if (!authReady) {
    return (
      <div style={{ padding: 24, textAlign: "center", fontWeight: 600 }}>
        Loading…
      </div>
    );
  }

  // Not logged in → go to login
  if (!user) {
    return <Navigate to="/login" replace state={{ from: window.location.pathname }} />;
  }

  // 🔐 NEW: Admin-only protection
  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default ProtectedRoute;