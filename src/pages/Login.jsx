import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import PageLayout from "../components/PageLayout.jsx";
import { useAuth } from "../context/AuthContext.jsx";

function Login() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [resetMessage, setResetMessage] = useState("");

  // If already logged in, send to home
  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setResetMessage("");
    setSubmitting(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setError(error.message || "Login failed");
        return;
      }

      const user = data?.user;
      if (!user?.id) {
        setError("Login failed");
        return;
      }

      // Check if the profile is active
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("is_active")
        .eq("id", user.id)
        .single();

               if (profileError || !profile?.is_active) {
        await supabase.auth.signOut();
        setError("Your account is inactive. Please contact an administrator.");
        return;
      }

      navigate("/");
    } catch (err) {
      setError(err?.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    setError("");
    setResetMessage("");

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError("Please enter your email address first.");
      return;
    }

    setResetSubmitting(true);

    try {
      const redirectTo =
        window.location.hostname === "localhost"
          ? "http://localhost:5173/reset-password"
          : "https://pro-west-portal.netlify.app/reset-password";

      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo,
      });

      if (error) {
        setError(error.message || "Could not send reset email.");
        return;
      }

      setResetMessage(
        "Password reset email sent. Please check your inbox and spam folder."
      );
    } catch (err) {
      setError(err?.message || "Could not send reset email.");
    } finally {
      setResetSubmitting(false);
    }
  };

  return (
    <PageLayout icon="🔐" title="Login" subtitle="Sign in to Pro West Portal">
      <div className="card" style={{ maxWidth: "400px", margin: "0 auto" }}>
        <h3 className="card-title">Staff login</h3>
        <p className="card-subtitle">
          Use your Pro West work email and password.
        </p>

        <form onSubmit={handleLogin} style={{ marginTop: "0.8rem" }}>
          <div className="card-row">
            <span className="card-row-label">Email</span>
            <input
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              aria-label="Email address"
              className="maps-search-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@prowestsurveying.com.au"
              required
            />
          </div>

          <div className="card-row" style={{ marginTop: "0.6rem" }}>
            <span className="card-row-label">Password</span>
            <input
              type="password"
              aria-label="Password"
              className="maps-search-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <div style={{ marginTop: "0.5rem", textAlign: "right" }}>
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={resetSubmitting}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: "#1565c0",
                cursor: "pointer",
                fontSize: "0.85rem",
                textDecoration: "underline",
              }}
            >
              {resetSubmitting ? "Sending reset email..." : "Forgot password?"}
            </button>
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

          {resetMessage && (
            <div
              style={{
                marginTop: "0.6rem",
                fontSize: "0.8rem",
                color: "#2e7d32",
              }}
            >
              {resetMessage}
            </div>
          )}

          <button
            type="submit"
            className="btn-pill primary"
            style={{ marginTop: "0.9rem", width: "100%" }}
            disabled={submitting}
          >
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </PageLayout>
  );
}

export default Login;