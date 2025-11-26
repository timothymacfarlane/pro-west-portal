import { useEffect, useState } from "react";
import PageLayout from "../components/PageLayout.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient";

function Profile() {
  const { user } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");

  // Load current display name from user_metadata (if any)
  useEffect(() => {
    if (user?.user_metadata?.full_name) {
      setDisplayName(user.user_metadata.full_name);
    }
  }, [user]);

  if (!user) {
    // ProtectedRoute should prevent this, but just in case
    return (
      <PageLayout icon="👤" title="My Profile">
        <div className="card">
          <p>You must be logged in to view this page.</p>
        </div>
      </PageLayout>
    );
  }

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMessage("");

    const trimmedName = displayName.trim();

    const { error } = await supabase.auth.updateUser({
      data: { full_name: trimmedName || null },
    });

    setSavingProfile(false);

    if (error) {
      console.error(error);
      setProfileMessage("Could not save changes. Please try again.");
    } else {
      setProfileMessage("Profile updated.");
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordMessage("");

    if (!newPassword || !confirmPassword) {
      setPasswordMessage("Please enter and confirm your new password.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage("Passwords do not match.");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordMessage("Password should be at least 8 characters long.");
      return;
    }

    setSavingPassword(true);

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setSavingPassword(false);

    if (error) {
      console.error(error);
      setPasswordMessage(
        error.message || "Could not update password. Please try again."
      );
    } else {
      setPasswordMessage("Password updated successfully.");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  return (
    <PageLayout
      icon="👤"
      title="My Profile"
      subtitle="Manage your Pro West Portal account"
    >
      {/* Account info card */}
      <div className="card">
        <h3 className="card-title">Account</h3>
        <p className="card-subtitle">
          These details are linked to your Pro West Surveying login.
        </p>

        <div className="card-row" style={{ marginTop: "0.5rem" }}>
          <span className="card-row-label">Email</span>
          <span className="card-row-value">{user.email}</span>
        </div>

        <div className="card-row">
          <span className="card-row-label">User ID</span>
          <span
            className="card-row-value"
            style={{ fontFamily: "monospace", fontSize: "0.75rem" }}
          >
            {user.id}
          </span>
        </div>
      </div>

      {/* Display name card */}
      <div className="card">
        <h3 className="card-title">Profile</h3>
        <p className="card-subtitle">
          Set a display name that can be shown on timesheets, Take 5s, etc.
        </p>

        <form onSubmit={handleSaveProfile} style={{ marginTop: "0.6rem" }}>
          <div className="card-row">
            <span className="card-row-label">Display name</span>
            <input
              type="text"
              className="maps-search-input"
              style={{ maxWidth: "260px" }}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Tim Macfarlane"
            />
          </div>

          <button
            type="submit"
            className="btn-pill primary"
            style={{ marginTop: "0.6rem" }}
            disabled={savingProfile}
          >
            {savingProfile ? "Saving…" : "Save changes"}
          </button>

          {profileMessage && (
            <div
              style={{
                marginTop: "0.4rem",
                fontSize: "0.8rem",
                color: profileMessage.includes("updated")
                  ? "#2e7d32"
                  : "#b71c1c",
              }}
            >
              {profileMessage}
            </div>
          )}
        </form>
      </div>

      {/* Change password card */}
      <div className="card">
        <h3 className="card-title">Security</h3>
        <p className="card-subtitle">
          Change your password for the Pro West Portal.
        </p>

        <form onSubmit={handleChangePassword} style={{ marginTop: "0.6rem" }}>
          <div className="card-row">
            <span className="card-row-label">New password</span>
            <input
              type="password"
              className="maps-search-input"
              style={{ maxWidth: "260px" }}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>

          <div className="card-row">
            <span className="card-row-label">Confirm password</span>
            <input
              type="password"
              className="maps-search-input"
              style={{ maxWidth: "260px" }}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-type new password"
            />
          </div>

          <button
            type="submit"
            className="btn-pill primary"
            style={{ marginTop: "0.6rem" }}
            disabled={savingPassword}
          >
            {savingPassword ? "Updating…" : "Update password"}
          </button>

          {passwordMessage && (
            <div
              style={{
                marginTop: "0.4rem",
                fontSize: "0.8rem",
                color: passwordMessage.includes("successfully")
                  ? "#2e7d32"
                  : "#b71c1c",
              }}
            >
              {passwordMessage}
            </div>
          )}
        </form>
      </div>
    </PageLayout>
  );
}

export default Profile;
