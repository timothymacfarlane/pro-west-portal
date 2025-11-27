import { useEffect, useState } from "react";
import PageLayout from "../components/PageLayout.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";

function Admin() {
  const { role } = useAuth();
  const isAdmin = role === "ADMIN";

  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAdmin) return;

    const loadProfiles = async () => {
      setLoading(true);
      setError("");

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, email, display_name, role, is_active, show_in_contacts, show_in_schedule, show_in_timesheets"
        )
        .order("email", { ascending: true });

      if (error) {
        console.error("Error loading profiles:", error);
        setError("Could not load user list.");
        setProfiles([]);
      } else {
        setProfiles(data || []);
      }

      setLoading(false);
    };

    loadProfiles();
  }, [isAdmin]);

  const handleUpdate = async (id, patch) => {
    setSavingId(id);
    setError("");

    const { error } = await supabase.from("profiles").update(patch).eq("id", id);

    if (error) {
      console.error("Error updating profile:", error);
      setError("Could not update user – please try again.");
    } else {
      setProfiles((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...patch } : p))
      );
    }

    setSavingId(null);
  };

  if (!isAdmin) {
    return (
      <PageLayout icon="🚫" title="Administration">
        <div className="card">
          <p>You do not have permission to view this page.</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      icon="🛠"
      title="Administration"
      subtitle="Manage staff accounts and access levels"
    >
      <div className="card">
        {loading ? (
          <p>Loading users…</p>
        ) : (
          <>
            {error && (
              <p style={{ color: "#b71c1c", fontSize: "0.8rem" }}>{error}</p>
            )}

            <div className="admin-users-table">
              <div className="admin-users-header">
                <span>Name</span>
                <span>Email</span>
                <span>Access</span>
                <span>Visible in</span>
                <span>Active</span>
              </div>

              {profiles.map((p) => (
                <div key={p.id} className="admin-users-row">
                  {/* Name */}
                  <span>{p.display_name || p.email}</span>

                  {/* Email */}
                  <span>{p.email}</span>

                  {/* Access level (Basic / Admin) */}
                  <span>
                    <label style={{ marginRight: "0.5rem" }}>
                      <input
                        type="radio"
                        name={`role-${p.id}`}
                        value="BASIC"
                        checked={p.role !== "ADMIN"}
                        onChange={() =>
                          handleUpdate(p.id, { role: "BASIC" })
                        }
                        disabled={savingId === p.id}
                      />{" "}
                      Basic
                    </label>
                    <label>
                      <input
                        type="radio"
                        name={`role-${p.id}`}
                        value="ADMIN"
                        checked={p.role === "ADMIN"}
                        onChange={() =>
                          handleUpdate(p.id, { role: "ADMIN" })
                        }
                        disabled={savingId === p.id}
                      />{" "}
                      Admin
                    </label>
                  </span>

                  {/* Visibility flags */}
                  <span>
                    <label style={{ marginRight: "0.5rem", fontSize: "0.8rem" }}>
                      <input
                        type="checkbox"
                        checked={!!p.show_in_contacts}
                        onChange={(e) =>
                          handleUpdate(p.id, {
                            show_in_contacts: e.target.checked,
                          })
                        }
                        disabled={savingId === p.id}
                      />{" "}
                      Contacts
                    </label>
                    <label style={{ marginRight: "0.5rem", fontSize: "0.8rem" }}>
                      <input
                        type="checkbox"
                        checked={!!p.show_in_schedule}
                        onChange={(e) =>
                          handleUpdate(p.id, {
                            show_in_schedule: e.target.checked,
                          })
                        }
                        disabled={savingId === p.id}
                      />{" "}
                      Schedule
                    </label>
                    <label style={{ fontSize: "0.8rem" }}>
                      <input
                        type="checkbox"
                        checked={!!p.show_in_timesheets}
                        onChange={(e) =>
                          handleUpdate(p.id, {
                            show_in_timesheets: e.target.checked,
                          })
                        }
                        disabled={savingId === p.id}
                      />{" "}
                      Timesheets
                    </label>
                  </span>

                  {/* Active toggle */}
                  <span>
                    <input
                      type="checkbox"
                      checked={!!p.is_active}
                      onChange={(e) =>
                        handleUpdate(p.id, { is_active: e.target.checked })
                      }
                      disabled={savingId === p.id}
                    />
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </PageLayout>
  );
}

export default Admin;
