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

function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Load contacts from Supabase profiles (active + in contacts)
  useEffect(() => {
    let cancelled = false;

    const loadContacts = async () => {
      setLoading(true);
      setError("");

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, display_name, job_title, mobile, email, is_active, show_in_contacts"
        )
        .eq("is_active", true)
        .eq("show_in_contacts", true)
        .order("display_name", { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error("Error loading contacts:", error);
        setError("Could not load contacts.");
        setContacts([]);
      } else {
        const mapped = (data || []).map((row) => ({
          id: row.id,
          name: row.display_name || row.email || "Unnamed",
          role: row.job_title || "",
          mobile: row.mobile || "",
          email: row.email || "",
        }));
        setContacts(mapped);
      }

      setLoading(false);
    };

    loadContacts();

    return () => {
      cancelled = true;
    };
  }, []);

  // Filter for search
  const filteredContacts = useMemo(() => {
    if (!contacts.length) return [];
    if (!query.trim()) return contacts; // used for "All contacts" grid

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

  const selectedContact =
    selectedId != null
      ? contacts.find((c) => c.id === selectedId) || null
      : null;

  const handleSelect = (contact) => {
    setSelectedId(contact.id);
    setQuery(contact.name);
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setQuery(value);

    // When search cleared, hide selected details
    if (!value.trim()) {
      setSelectedId(null);
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
        <h3 className="card-title">Search contacts</h3>
        <p className="card-subtitle">
          Start typing a name, role, mobile or email to find a worker.
        </p>

        <div style={{ marginTop: "0.4rem" }}>
          <input
            type="text"
            className="maps-search-input"
            value={query}
            onChange={handleSearchChange}
            placeholder={
              loading
                ? "Loading contacts…"
                : "Search by name, role, mobile or email"
            }
            disabled={loading}
          />
        </div>

        {error && (
          <div
            style={{
              marginTop: "0.5rem",
              fontSize: "0.8rem",
              color: "#b71c1c",
            }}
          >
            {error}
          </div>
        )}

        {/* Suggestions list – only appears once you start typing */}
        {query.trim() && (
          <div
            className="contacts-suggestions"
            style={{
              marginTop: "0.4rem",
              maxHeight: "200px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "0.35rem",
            }}
          >
            {suggestions.length === 0 && !loading && (
              <div
                className="contacts-no-results"
                style={{ fontSize: "0.8rem", color: "#777" }}
              >
                No contacts match this search.
              </div>
            )}

            {suggestions.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelect(c)}
                className={`contacts-suggestion ${
                  selectedId === c.id ? "selected" : ""
                }`}
              >
                <div className="contacts-suggestion-header">
                  <div className="contacts-avatar">
                    {getInitials(c.name)}
                  </div>
                  <div>
                    <div className="contacts-suggestion-name">{c.name}</div>
                    {c.role && (
                      <div className="contacts-suggestion-role">
                        {c.role}
                      </div>
                    )}
                  </div>
                </div>
                <div className="contacts-suggestion-meta">
                  {(c.mobile || "No mobile") +
                    " · " +
                    (c.email || "No email")}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected contact details – only when a contact has been chosen */}
      {selectedContact && (
        <div className="card">
          <h3 className="card-title">Contact details</h3>
          <p className="card-subtitle">
            Tap a name in the search suggestions or list to see details.
          </p>

          <div
            style={{
              marginTop: "0.4rem",
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
            }}
          >
            <div className="contacts-avatar">
              {getInitials(selectedContact.name)}
            </div>

            <div style={{ flex: 1 }}>
              <div className="card-row">
                <span className="card-row-label">Name</span>
                <span className="card-row-value">{selectedContact.name}</span>
              </div>

              {selectedContact.role && (
                <div className="card-row">
                  <span className="card-row-label">Role</span>
                  <span className="card-row-value">
                    {selectedContact.role}
                  </span>
                </div>
              )}

              {selectedContact.mobile && (
                <div className="card-row">
                  <span className="card-row-label">Mobile</span>
                  <a
                    href={`tel:${selectedContact.mobile.replace(/\s+/g, "")}`}
                    className="card-row-value"
                    style={{ textDecoration: "none" }}
                  >
                    {selectedContact.mobile}
                  </a>
                </div>
              )}

              {selectedContact.email && (
                <div className="card-row">
                  <span className="card-row-label">Email</span>
                  <a
                    href={`mailto:${selectedContact.email}`}
                    className="card-row-value"
                    style={{ textDecoration: "none" }}
                  >
                    {selectedContact.email}
                  </a>
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

        {loading && <p>Loading contacts…</p>}

        {!loading && contacts.length === 0 && !error && (
          <p>No contacts found. Add or activate staff from the Administration page.</p>
        )}

        {!loading && contacts.length > 0 && (
          <div className="contacts-list-grid">
            {filteredContacts.map((c) => (
              <div
                key={c.id}
                className="contacts-list-item"
                onClick={() => handleSelect(c)}
              >
                <div className="contacts-suggestion-header">
                  <div className="contacts-avatar">{getInitials(c.name)}</div>
                  <div>
                    <div className="contacts-suggestion-name">{c.name}</div>
                    {c.role && (
                      <div className="contacts-suggestion-role">
                        {c.role}
                      </div>
                    )}
                  </div>
                </div>
                <div className="contacts-suggestion-meta">
                  <div>{c.mobile || "No mobile"}</div>
                  <div style={{ color: "#777" }}>
                    {c.email || "No email"}
                  </div>
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
