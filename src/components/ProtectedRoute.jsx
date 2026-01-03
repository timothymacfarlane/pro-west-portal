import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function ProtectedRoute({ children }) {
  const { user, authReady } = useAuth();

  // Only block during first app boot (not on every navigation)
  if (!authReady) {
    return (
      <div style={{ padding: 24, textAlign: "center", fontWeight: 600 }}>
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: window.location.pathname }} />;
  }

  return children;
}

export default ProtectedRoute;
