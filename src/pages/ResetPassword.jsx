import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import PageLayout from "../components/PageLayout.jsx";

function ResetPassword() {
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    let mounted = true;

    const setupRecoverySession = async () => {
      try {
        const hash = window.location.hash.startsWith("#")
          ? window.location.hash.substring(1)
          : "";

        const params = new URLSearchParams(hash);
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        const type = params.get("type");

        if (type !== "recovery" || !accessToken || !refreshToken) {
          setError("This password reset link is invalid or has expired.");
          return;
        }

        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          setError(error.message || "Could not verify reset link.");
          return;
        }

        if (mounted) {
          setReady(true);
        }
      } catch (err) {
        setError(err?.message || "Could not verify reset link.");
      }
    };

    setupRecoverySession();

    return () => {
      mounted = false;
    };
  }, []);

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setToast("");

    if (!password || !confirmPassword) {
      setError("Please enter and confirm your new password.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        setError(error.message || "Could not reset password.");
        return;
      }

      setToast("Password updated successfully.");
      setMessage("Your password has been changed. Redirecting to login...");

      setTimeout(async () => {
        await supabase.auth.signOut();
        navigate("/login", { replace: true });
      }, 1800);
    } catch (err) {
      setError(err?.message || "Could not reset password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageLayout
      icon="🔑"
      title="Reset Password"
      subtitle="Choose a new password for your account"
    >
      <div style={{ maxWidth: "400px", margin: "0 auto", position: "relative" }}>
        {toast && (
          <div
            style={{
              position: "fixed",
              top: "20px",
              right: "20px",
              zIndex: 2000,
              background: "#2e7d32",
              color: "#fff",
              padding: "0.8rem 1rem",
              borderRadius: "10px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
              fontSize: "0.9rem",
              fontWeight: 600,
            }}
          >
            {toast}
          </div>
        )}

        <div className="card">
          {!ready && !error ? (
            <p>Verifying reset link…</p>
          ) : (
            <>
              <h3 className="card-title">Set new password</h3>
              <p className="card-subtitle">Enter your new password below.</p>

              <form onSubmit={handleResetPassword} style={{ marginTop: "0.8rem" }}>
                <div className="card-row">
                  <span className="card-row-label">New password</span>
                  <input
                    type="password"
                    aria-label="New password"
                    className="maps-search-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    disabled={!ready || submitting}
                  />
                </div>

                <div className="card-row" style={{ marginTop: "0.6rem" }}>
                  <span className="card-row-label">Confirm password</span>
                  <input
                    type="password"
                    aria-label="Confirm password"
                    className="maps-search-input"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    disabled={!ready || submitting}
                  />
                </div>

                {error && (
                  <div
                    style={{
                      marginTop: "0.6rem",
                      fontSize: "0.8rem",
                      color: "#b71c1c",
                    }}
                  >
                    {error}
                  </div>
                )}

                {message && (
                  <div
                    style={{
                      marginTop: "0.6rem",
                      fontSize: "0.8rem",
                      color: "#2e7d32",
                    }}
                  >
                    {message}
                  </div>
                )}

                <button
                  type="submit"
                  className="btn-pill primary"
                  style={{ marginTop: "0.9rem", width: "100%" }}
                  disabled={!ready || submitting}
                >
                  {submitting ? "Updating password..." : "Update password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </PageLayout>
  );
}

export default ResetPassword;