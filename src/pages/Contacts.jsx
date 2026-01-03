import { useEffect, useMemo, useState } from "react";
import PageLayout from "../components/PageLayout.jsx";
import { supabase } from "../lib/supabaseClient";

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (
    (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
  );
}

function normalizeSpace(s) {
  return (s || "").toString().trim().replace(/\s+/g, " ");
}

function buildClientDisplay(row) {
  const first = normalizeSpace(row.first_name);
  const last = normalizeSpace(row.surname);
  const company = normalizeSpace(row.company);

  const hasPerson = Boolean(first || last);
  const personName = normalizeSpace(`${first} ${last}`).trim();

  let name = "Unnamed";
  if (company && !hasPerson) name = company;
  else if (personName) name = personName;
  else if (company) name = company;
  else if (row.email) name = row.email;

  let role = "";
  if (personName && company) role = company;
  else if (company && !hasPerson) role = "Client";
  else role = "Client";

  return { name, role };
}

function emptyClientForm() {
  return {
    first_name: "",
    surname: "",
    company: "",
    phone: "",
    mobile: "",
    email: "",
    is_active: true,
    show_in_contacts: true,
  };
}

function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Source toggles
  const [showStaff, setShowStaff] = useState(true);
  const [showClients, setShowClients] = useState(false);

  // Role / permissions
  const [userRole, setUserRole] = useState("basic");
  const isAdmin = userRole === "admin";

  // Admin client CRUD UI
  const [clientFormOpen, setClientFormOpen] = useState(false);
  const [clientFormMode, setClientFormMode] = useState("add"); // add | edit
  const [clientForm, setClientForm] = useState(emptyClientForm());
  const [savingClient, setSavingClient] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Fetch current user role from profiles
  useEffect(() => {
    let cancelled = false;

    const loadRole = async () => {
      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;

        const user = authData?.user;
        if (!user) {
          if (!cancelled) setUserRole("basic");
          return;
        }

        const { data: profile, error: profErr } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (profErr) throw profErr;

        if (!cancelled) setUserRole(profile?.role || "basic");
      } catch (e) {
        console.error("Error loading user role:", e);
        if (!cancelled) setUserRole("basic");
      }
    };

    loadRole();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load contacts from Supabase
  useEffect(() => {
    let cancelled = false;

    const loadContacts = async () => {
      setLoading(true);
      setError("");

      if (!showStaff && !showClients) {
        setContacts([]);
        setSelectedId(null);
        setLoading(false);
        return;
      }

      try {
        const tasks = [];

        if (showStaff) {
          tasks.push(
            supabase
              .from("profiles")
              .select(
                "id, display_name, job_title, mobile, email, is_active, show_in_contacts"
              )
              .eq("is_active", true)
              .eq("show_in_contacts", true)
              .order("display_name", { ascending: true })
          );
        }

        if (showClients) {
          tasks.push(
            supabase
              .from("clients")
              .select(
                "id, first_name, surname, company, phone, mobile, email, is_active, show_in_contacts"
              )
              .eq("is_active", true)
              .eq("show_in_contacts", true)
              .order("company", { ascending: true })
              .order("surname", { ascending: true })
              .order("first_name", { ascending: true })
          );
        }

        const results = await Promise.all(tasks);
        if (cancelled) return;

        for (const r of results) {
          if (r.error) throw r.error;
        }

        let merged = [];
        let idx = 0;

        if (showStaff) {
          const staffRes = results[idx++];
          const mappedStaff = (staffRes.data || []).map((row) => ({
            id: `staff:${row.id}`,
            source: "staff",
            source_id: row.id,
            name: row.display_name || row.email || "Unnamed",
            role: row.job_title || "",
            mobile: row.mobile || "",
            email: row.email || "",
          }));
          merged = merged.concat(mappedStaff);
        }

        if (showClients) {
          const clientRes = results[idx++];
          const mappedClients = (clientRes.data || []).map((row) => {
            const { name, role } = buildClientDisplay(row);
            return {
              id: `client:${row.id}`,
              source: "client",
              source_id: row.id,
              name,
              role,
              // keep both available for admin edit form
              first_name: row.first_name || "",
              surname: row.surname || "",
              company: row.company || "",
              phone: row.phone || "",
              mobile: row.mobile || "",
              email: row.email || "",
            };
          });
          merged = merged.concat(mappedClients);
        }

        merged.sort((a, b) =>
          (a.name || "").localeCompare(b.name || "", undefined, {
            sensitivity: "base",
          })
        );

        setContacts(merged);

        if (selectedId && !merged.some((c) => c.id === selectedId)) {
          setSelectedId(null);
        }
      } catch (e) {
        console.error("Error loading contacts:", e);
        setError("Could not load contacts.");
        setContacts([]);
        setSelectedId(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadContacts();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showStaff, showClients, reloadKey]);

  // Filter for search
  const filteredContacts = useMemo(() => {
    if (!contacts.length) return [];
    if (!query.trim()) return contacts;

    const q = query.toLowerCase();
    return contacts.filter((c) => {
      const name = (c.name || "").toLowerCase();
      const role = (c.role || "").toLowerCase();
      const mobile = (c.mobile || "").toLowerCase();
      const email = (c.email || "").toLowerCase();
      return (
        name.includes(q) ||
        role.includes(q) ||
        mobile.includes(q) ||
        email.includes(q)
      );
    });
  }, [contacts, query]);

  // Suggestions only when typing
  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    return filteredContacts.slice(0, 6);
  }, [filteredContacts, query]);

  const selectedContact = useMemo(() => {
    if (!selectedId) return null;
    return contacts.find((c) => c.id === selectedId) || null;
  }, [contacts, selectedId]);

  const selectedIsClient = selectedContact?.source === "client";

  const handleSelect = (contact) => {
    setSelectedId(contact.id);
    setQuery(contact.name || "");
    setClientFormOpen(false);
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setQuery(value);
    if (!value.trim()) {
      setSelectedId(null);
      setClientFormOpen(false);
    }
  };

  // Admin actions
  const openAddClient = () => {
    setClientFormMode("add");
    setClientForm(emptyClientForm());
    setClientFormOpen(true);
  };

  const openEditClient = () => {
    if (!selectedContact || selectedContact.source !== "client") return;

    setClientFormMode("edit");
    setClientForm({
      first_name: selectedContact.first_name || "",
      surname: selectedContact.surname || "",
      company: selectedContact.company || "",
      phone: selectedContact.phone || "",
      mobile: selectedContact.mobile || "",
      email: selectedContact.email || "",
      is_active: true,
      show_in_contacts: true,
    });
    setClientFormOpen(true);
  };

  const saveClient = async () => {
    if (!isAdmin) return;

    setSavingClient(true);
    setError("");

    try {
      const payload = {
        first_name: normalizeSpace(clientForm.first_name),
        surname: normalizeSpace(clientForm.surname),
        company: normalizeSpace(clientForm.company),
        phone: normalizeSpace(clientForm.phone),
        mobile: normalizeSpace(clientForm.mobile),
        email: normalizeSpace(clientForm.email),
        is_active: Boolean(clientForm.is_active),
        show_in_contacts: Boolean(clientForm.show_in_contacts),
      };

      if (clientFormMode === "add") {
        const { error: insErr } = await supabase.from("clients").insert(payload);
        if (insErr) throw insErr;
      } else {
        if (!selectedContact || selectedContact.source !== "client") return;
        const clientId = selectedContact.source_id;

        const { error: updErr } = await supabase
          .from("clients")
          .update(payload)
          .eq("id", clientId);

        if (updErr) throw updErr;
      }

      setClientFormOpen(false);
      setClientForm(emptyClientForm());
      setReloadKey((k) => k + 1);
    } catch (e) {
      console.error("Error saving client:", e);
      setError(
        e?.message ||
          "Could not save client. If you are not admin, you may not have permission."
      );
    } finally {
      setSavingClient(false);
    }
  };

  const deleteClient = async () => {
    if (!isAdmin) return;
    if (!selectedContact || selectedContact.source !== "client") return;

    const ok = window.confirm("Delete this client contact?");
    if (!ok) return;

    setSavingClient(true);
    setError("");

    try {
      const clientId = selectedContact.source_id;

      const { error: delErr } = await supabase
        .from("clients")
        .delete()
        .eq("id", clientId);

      if (delErr) throw delErr;

      setSelectedId(null);
      setClientFormOpen(false);
      setReloadKey((k) => k + 1);
    } catch (e) {
      console.error("Error deleting client:", e);
      setError(
        e?.message ||
          "Could not delete client. If you are not admin, you may not have permission."
      );
    } finally {
      setSavingClient(false);
    }
  };

  return (
    <PageLayout
      icon="📇"
      title="Contacts"
      subtitle="Key Pro West staff contact details"
    >
      {/* Search + suggestions card */}
      <div className="card">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
          }}
        >
          <h3 className="card-title" style={{ margin: 0 }}>
            Search contacts
          </h3>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.8rem",
              flexWrap: "wrap",
              fontSize: "0.95rem",
              color: "#444",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                aria-label="Show staff contacts"
                checked={showStaff}
                onChange={(e) => setShowStaff(e.target.checked)}
              />
              Staff
            </label>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                aria-label="Show client contacts"
                checked={showClients}
                onChange={(e) => setShowClients(e.target.checked)}
              />
              Clients
            </label>

            {/* Admin-only: Add Client (only makes sense when Clients are enabled) */}
            {isAdmin && showClients && (
              <button
                type="button"
                onClick={openAddClient}
                style={{
                  padding: "0.35rem 0.6rem",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.15)",
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: "0.92rem",
                }}
              >
                + Add client
              </button>
            )}
          </div>
        </div>

        <p className="card-subtitle">
          Start typing a name, role, mobile or email to find a staff member or
          client.
        </p>

        <div style={{ marginTop: "0.4rem" }}>
          <input
            type="text"
            aria-label="Search contacts"
            inputMode="search"
            className="maps-search-input"
            value={query}
            onChange={handleSearchChange}
            placeholder={
              !showStaff && !showClients
                ? "Tick Staff and/or Clients to search..."
                : "Search by name, role, mobile or email..."
            }
          />
        </div>

        {error && (
          <div style={{ marginTop: "0.6rem", color: "#b00020" }}>{error}</div>
        )}

        {query.trim() && (
          <div
            className="contacts-suggestions"
            style={{
              marginTop: "0.4rem",
              maxHeight: "200px",
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              display: "flex",
              flexDirection: "column",
              gap: "0.35rem",
            }}
          >
            {suggestions.length === 0 && !loading && (
              <div style={{ padding: "0.6rem", color: "#666" }}>
                No contacts found.
              </div>
            )}

            {suggestions.map((c) => (
              <button
                key={c.id}
                type="button"
                className="contacts-suggestion"
                onClick={() => handleSelect(c)}
              >
                <div className="contacts-suggestion-header">
                  <div className="contacts-avatar">{getInitials(c.name)}</div>
                  <div>
                    <div className="contacts-suggestion-name">{c.name}</div>
                    {c.role && (
                      <div className="contacts-suggestion-role">{c.role}</div>
                    )}
                  </div>
                </div>
                <div className="contacts-suggestion-meta">
                  <span>{c.mobile || "No mobile"}</span>
                  <span style={{ opacity: 0.6 }}>•</span>
                  <span>{c.email || "No email"}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Admin-only Client Add/Edit form (uses same "card" styling) */}
      {isAdmin && clientFormOpen && showClients && (
        <div className="card">
          <h3 className="card-title">
            {clientFormMode === "add" ? "Add client" : "Edit client"}
          </h3>
          <p className="card-subtitle">
            Admin only. Basic users can view clients, but can’t edit them.
          </p>

          <div style={{ display: "grid", gap: "0.5rem" }}>
            <input
              type="text"
              className="maps-search-input"
              placeholder="First name"
              value={clientForm.first_name}
              onChange={(e) =>
                setClientForm((p) => ({ ...p, first_name: e.target.value }))
              }
            />
            <input
              type="text"
              className="maps-search-input"
              placeholder="Surname"
              value={clientForm.surname}
              onChange={(e) =>
                setClientForm((p) => ({ ...p, surname: e.target.value }))
              }
            />
            <input
              type="text"
              className="maps-search-input"
              placeholder="Company"
              value={clientForm.company}
              onChange={(e) =>
                setClientForm((p) => ({ ...p, company: e.target.value }))
              }
            />
            <input
              type="text"
              className="maps-search-input"
              placeholder="Phone"
              inputMode="tel"
              value={clientForm.phone}
              onChange={(e) =>
                setClientForm((p) => ({ ...p, phone: e.target.value }))
              }
            />
            <input
              type="text"
              className="maps-search-input"
              placeholder="Mobile"
              inputMode="tel"
              value={clientForm.mobile}
              onChange={(e) =>
                setClientForm((p) => ({ ...p, mobile: e.target.value }))
              }
            />
            <input
              type="email"
              className="maps-search-input"
              placeholder="Email"
              value={clientForm.email}
              onChange={(e) =>
                setClientForm((p) => ({ ...p, email: e.target.value }))
              }
            />

            <div
              style={{
                display: "flex",
                gap: "1rem",
                alignItems: "center",
                flexWrap: "wrap",
                color: "#444",
                fontSize: "0.95rem",
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={clientForm.is_active}
                  onChange={(e) =>
                    setClientForm((p) => ({ ...p, is_active: e.target.checked }))
                  }
                />
                Active
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={clientForm.show_in_contacts}
                  onChange={(e) =>
                    setClientForm((p) => ({
                      ...p,
                      show_in_contacts: e.target.checked,
                    }))
                  }
                />
                Show in contacts
              </label>
            </div>

            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={saveClient}
                disabled={savingClient}
                style={{
                  padding: "0.45rem 0.8rem",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.15)",
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                {savingClient ? "Saving…" : "Save"}
              </button>

              <button
                type="button"
                onClick={() => setClientFormOpen(false)}
                disabled={savingClient}
                style={{
                  padding: "0.45rem 0.8rem",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.15)",
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selected contact details */}
      {selectedContact && (
        <div className="card">
          <h3 className="card-title">Selected contact</h3>

          <div className="contacts-selected">
            <div className="contacts-avatar-large">
              {getInitials(selectedContact.name)}
            </div>

            <div style={{ flex: 1 }}>
              <div className="contacts-selected-name">{selectedContact.name}</div>

              {selectedContact.role && (
                <div className="contacts-selected-role">{selectedContact.role}</div>
              )}

              <div className="contacts-selected-lines">
                <div>
                  <strong>Mobile:</strong>{" "}
                  {selectedContact.mobile ? (
                    <a
                      href={`tel:${selectedContact.mobile}`}
                      style={{ textDecoration: "none" }}
                    >
                      {selectedContact.mobile}
                    </a>
                  ) : (
                    "No mobile"
                  )}
                </div>

                {selectedContact.email && (
                  <div>
                    <strong>Email:</strong>{" "}
                    <a
                      href={`mailto:${selectedContact.email}`}
                      style={{ textDecoration: "none" }}
                    >
                      {selectedContact.email}
                    </a>
                  </div>
                )}
              </div>

              {/* Admin-only actions for CLIENT contacts */}
              {isAdmin && selectedIsClient && (
                <div style={{ marginTop: "0.8rem", display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={openEditClient}
                    style={{
                      padding: "0.4rem 0.8rem",
                      borderRadius: 10,
                      border: "1px solid rgba(0,0,0,0.15)",
                      background: "#fff",
                      cursor: "pointer",
                      fontSize: "0.92rem",
                    }}
                  >
                    Edit client
                  </button>

                  <button
                    type="button"
                    onClick={deleteClient}
                    style={{
                      padding: "0.4rem 0.8rem",
                      borderRadius: 10,
                      border: "1px solid rgba(0,0,0,0.15)",
                      background: "#fff",
                      cursor: "pointer",
                      fontSize: "0.92rem",
                    }}
                  >
                    Delete client
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* All contacts list */}
      <div className="card">
        <h3 className="card-title">All contacts</h3>
        <p className="card-subtitle">
          Quick reference list of everyone in Pro West Portal.
        </p>

        {loading ? (
          <div style={{ padding: "0.8rem", color: "#666" }}>Loading…</div>
        ) : !showStaff && !showClients ? (
          <div style={{ padding: "0.8rem", color: "#666" }}>
            Tick <strong>Staff</strong> and/or <strong>Clients</strong> to show contacts.
          </div>
        ) : filteredContacts.length === 0 ? (
          <div style={{ padding: "0.8rem", color: "#666" }}>
            No contacts to show.
          </div>
        ) : (
          <div
            className="contacts-list"
            style={{
              marginTop: "0.6rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.35rem",
            }}
          >
            {filteredContacts.map((c) => (
              <div
                key={c.id}
                className="contacts-list-item"
                onClick={() => handleSelect(c)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") handleSelect(c);
                }}
              >
                <div className="contacts-suggestion-header">
                  <div className="contacts-avatar">{getInitials(c.name)}</div>
                  <div>
                    <div className="contacts-suggestion-name">{c.name}</div>
                    {c.role && (
                      <div className="contacts-suggestion-role">{c.role}</div>
                    )}
                  </div>
                </div>

                <div className="contacts-suggestion-meta">
                  <span style={{ color: "#444" }}>{c.mobile || "No mobile"}</span>
                  <span style={{ opacity: 0.6 }}>•</span>
                  <div style={{ color: "#777" }}>{c.email || "No email"}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}

export default Contacts;
