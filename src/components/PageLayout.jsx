import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

const APP_VERSION = "0.0.0-beta";

function HeaderActions({ extraActions }) {
  // useAuth() might return null if AuthProvider is not set up yet,
  // so we don't destructure directly.
  const auth = useAuth();
  const user = auth?.user || null;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    // AuthContext will clear the user and ProtectedRoute will send them to /login
  };

  return (
    <div className="page-actions" role="group" aria-label="Page actions">
      {/* Page-specific actions (e.g. "Start Over") */}
      {extraActions}

      {/* Global Logout button – only when logged in */}
      {user && (
        <button className="btn-pill" type="button" onClick={handleLogout} aria-label="Log out" title="Log out">
          Logout
        </button>
      )}
    </div>
  );
}

function PageLayout({ icon, title, subtitle, actions, children }) {
  return (
    <div className="page" data-layout="page">
      <header className="page-header" role="banner">
        <div className="page-title-group">
          {icon && <span className="page-icon">{icon}</span>}
          <div>
            <h2 className="page-title">{title}</h2>
            {subtitle && <p className="page-subtitle">{subtitle}</p>}
          </div>
        </div>

        <HeaderActions extraActions={actions} />
      </header>

            <div className="page-body">{children}</div>

      <footer className="page-footer" role="contentinfo" aria-label="Footer">
        <span className="page-footer-version">v{APP_VERSION}</span>
      </footer>
    </div>
  );
}


export default PageLayout;
