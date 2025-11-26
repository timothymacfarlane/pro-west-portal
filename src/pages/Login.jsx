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
  const [error, setError] = useState("");

  // If already logged in, send to home
  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setSubmitting(false);

    if (error) {
      setError(error.message || "Login failed");
      return;
    }

    navigate("/");
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
              className="maps-search-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
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
