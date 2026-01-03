import { useEffect, useState } from "react";
import PageLayout from "../components/PageLayout.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";

function normalizeRole(role) {
  const r = String(role || "").trim().toLowerCase();
  return r === "admin" ? "admin" : "basic";
}

function Admin() {
  const { isAdmin } = useAuth();

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
        setProfiles(
          (data || []).map((p) => ({ ...p, role: normalizeRole(p.role) }))
        );
      }

      setLoading(false);
    };

    loadProfiles();
  }, [isAdmin]);

  const handleUpdate = async (id, patch) => {
    setSavingId(id);
    setError("");

    const safePatch = { ...patch };
    if ("role" in safePatch) safePatch.role = normalizeRole(safePatch.role);

    const { error } = await supabase.from("profiles").update(safePatch).eq("id", id);

    if (error) {
      console.error("Error updating profile:", error);
      setError("Could not update user – please try again.");
    } else {
      setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, ...safePatch } : p)));
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
            {error && <p style={{ color: "#b71c1c", fontSize: "0.8rem" }}>{error}</p>}

            <div className="admin-users-table" role="table">
              <div className="admin-users-header">
                <span>Name</span>
                <span>Email</span>
                <span>Access</span>
                <span>Visible in</span>
                <span>Active</span>
              </div>

              {profiles.map((p) => (
                <div key={p.id} className="admin-users-row">
                  <span>{p.display_name || p.email}</span>
                  <span>{p.email}</span>

                  <span>
                    <label style={{ marginRight: "0.5rem" }}>
                      <input
                        type="radio"
                        name={`role-${p.id}`}
                        value="basic"
                        checked={normalizeRole(p.role) !== "admin"}
                        onChange={() => handleUpdate(p.id, { role: "basic" })}
                        disabled={savingId === p.id}
                      />{" "}
                      Basic
                    </label>
                    <label>
                      <input
                        type="radio"
                        name={`role-${p.id}`}
                        value="admin"
                        checked={normalizeRole(p.role) === "admin"}
                        onChange={() => handleUpdate(p.id, { role: "admin" })}
                        disabled={savingId === p.id}
                      />{" "}
                      Admin
                    </label>
                  </span>

                  <span>
                    <label style={{ marginRight: "0.5rem", fontSize: "0.8rem" }}>
                      <input
                        type="checkbox"
                        checked={!!p.show_in_contacts}
                        onChange={(e) =>
                          handleUpdate(p.id, { show_in_contacts: e.target.checked })
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
                          handleUpdate(p.id, { show_in_schedule: e.target.checked })
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
                          handleUpdate(p.id, { show_in_timesheets: e.target.checked })
                        }
                        disabled={savingId === p.id}
                      />{" "}
                      Timesheets
                    </label>
                  </span>

                  <span>
                    <input
                      type="checkbox"
                      checked={!!p.is_active}
                      onChange={(e) => handleUpdate(p.id, { is_active: e.target.checked })}
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
