import { useEffect, useMemo, useRef, useState } from "react";
import PageLayout from "../components/PageLayout.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";

const STATUS_OPTIONS = ["Planned", "In progress", "On hold", "Complete", "Archived"];
const PAGE_SIZE = 30;

function addressSummaryFromRow(r) {
  const a =
    (r?.full_address || "").trim() ||
    [r?.street_number, r?.street_name, r?.suburb].filter(Boolean).join(" ").trim() ||
    (r?.suburb || "").trim() ||
    "—";
  return a;
}

function formatDateAU(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-AU");
}

function Toast({ text, kind = "ok", onClose }) {
  if (!text) return null;
  const bg = kind === "err" ? "rgba(255,0,0,0.10)" : "rgba(0,180,90,0.12)";
  return (
    <div
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 14,
        zIndex: 60,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        className="card"
        style={{
          width: "min(720px, 100%)",
          padding: "10px 12px",
          borderRadius: 14,
          background: bg,
          pointerEvents: "auto",
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 800 }}>{text}</div>
        <button className="btn-pill" type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function ReassignModal({ open, job, staffOptions, onClose, onConfirm, busy }) {
  const [nextAssignee, setNextAssignee] = useState("");

  useEffect(() => {
    if (!open) return;
    setNextAssignee(job?.assigned_to || "");
  }, [open, job]);

  if (!open) return null;

  const staff = (staffOptions || []).map((s) => s.name).filter(Boolean);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        zIndex: 55,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        className="card"
        style={{
          width: "min(640px, calc(100vw - 32px))",
          padding: "1rem",
          borderRadius: 16,
          boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <div>
            <h3 className="card-title" style={{ marginBottom: 4 }}>
              Re-assign job #{job?.job_number ?? "—"}
            </h3>
            <div style={{ fontSize: 12, opacity: 0.75 }}>{addressSummaryFromRow(job)}</div>
          </div>
          <button className="btn-pill" type="button" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>

        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 14, background: "rgba(255,255,255,0.04)" }}>
          <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 6 }}>Assign to</div>

          <select
            className="maps-search-input"
            style={{ width: "100%", maxWidth: 360 }}
            value={nextAssignee || ""}
            onChange={(e) => setNextAssignee(e.target.value)}
            disabled={busy}
          >
            <option value="">Unassigned</option>
            {staff.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn-pill" type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              className="btn-pill primary"
              type="button"
              onClick={() => onConfirm(nextAssignee)}
              disabled={busy || (nextAssignee || "") === (job?.assigned_to || "")}
              title="Update assignee"
            >
              {busy ? "Updating…" : "Confirm re-assign"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MyJobs() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [staff, setStaff] = useState([]);
  const [myDisplayName, setMyDisplayName] = useState("");

  // filters
  const [assigneeMode, setAssigneeMode] = useState("__my__"); // __my__ | __all__ | name
  const [statusFilter, setStatusFilter] = useState("__all__"); // __all__ | status

  // list
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [err, setErr] = useState("");

  // reassign
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignJob, setReassignJob] = useState(null);
  const [reassignBusy, setReassignBusy] = useState(false);

  // toast
  const [toast, setToast] = useState({ text: "", kind: "ok" });
  const toastTimerRef = useRef(null);

  const selectedAssignee = useMemo(() => {
    if (assigneeMode === "__all__") return "__all__";
    if (assigneeMode === "__my__") return (myDisplayName || "").trim();
    return (assigneeMode || "").trim();
  }, [assigneeMode, myDisplayName]);

  const staffOptions = useMemo(() => staff || [], [staff]);

  const assigneeDropdownOptions = useMemo(() => {
    const list = (staffOptions || []).map((p) => p.name).filter(Boolean);
    const uniq = Array.from(new Set(list)).sort((a, b) => a.localeCompare(b));
    return uniq;
  }, [staffOptions]);

  function showToast(text, kind = "ok") {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ text, kind });
    toastTimerRef.current = setTimeout(() => setToast({ text: "", kind: "ok" }), 2600);
  }

  useEffect(() => {
    return () => toastTimerRef.current && clearTimeout(toastTimerRef.current);
  }, []);

  // Load staff list (same pattern as Timesheets admin dropdown)
  useEffect(() => {
    if (!user) return;

    const loadStaff = async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, display_name, email, is_active")
          .eq("is_active", true)
          .order("display_name", { ascending: true });

        if (error) throw error;

        const list = (data || []).map((p) => ({
          id: p.id,
          name: (p.display_name || p.email || "Unnamed").trim(),
        }));

        setStaff(list);

        // find me
        const me = list.find((x) => x.id === user.id);
        const fallback = user?.user_metadata?.full_name || user?.email || "";
        setMyDisplayName((me?.name || fallback || "").trim());
      } catch (e) {
        console.warn("Error loading staff:", e?.message || e);
        setStaff([]);
        setMyDisplayName((user?.user_metadata?.full_name || user?.email || "").trim());
      }
    };

    loadStaff();
  }, [user]);

  async function fetchJobs({ append = false, from = 0 } = {}) {
    if (!user) return;

    if (!append) {
      setLoading(true);
      setErr("");
    } else {
      setLoadingMore(true);
    }

    try {
      let q = supabase
        .from("jobs")
        .select(
          [
            "id",
            "job_number",
            "client_name",
            "client_company",
            "status",
            "assigned_to",
            "job_type_legacy",
            "job_date_legacy",
            "lot_number",
            "plan_number",
            "ct",
            "notes",
            "full_address",
            "street_number",
            "street_name",
            "suburb",
            "local_authority",
            "place_id",
            "mga_zone",
            "mga_easting",
            "mga_northing",
            "updated_at",
          ].join(",")
        )
        .order("job_number", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (statusFilter !== "__all__") q = q.eq("status", statusFilter);

      // assignee filter
      if (selectedAssignee !== "__all__") {
        // if my name is missing (edge case), return none until we have it
        if (!selectedAssignee) {
          setRows([]);
          setHasMore(false);
          return;
        }
        q = q.eq("assigned_to", selectedAssignee);
      }

      const { data, error } = await q;
      if (error) throw error;

      const next = data || [];
      setRows((prev) => (append ? [...prev, ...next] : next));
      setHasMore(next.length === PAGE_SIZE);
    } catch (e) {
      setErr(e?.message || "Failed to load jobs.");
      setRows([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  // NEW: refresh current view after reassignment (keeps the same filters + tops up list)
  async function refreshCurrentView(keepCount = rows.length) {
    if (!user) return;

    const target = Math.max(keepCount, PAGE_SIZE);

    setLoading(true);
    setErr("");

    try {
      let q = supabase
        .from("jobs")
        .select(
          [
            "id",
            "job_number",
            "client_name",
            "client_company",
            "status",
            "assigned_to",
            "job_type_legacy",
            "job_date_legacy",
            "lot_number",
            "plan_number",
            "ct",
            "notes",
            "full_address",
            "street_number",
            "street_name",
            "suburb",
            "local_authority",
            "place_id",
            "mga_zone",
            "mga_easting",
            "mga_northing",
            "updated_at",
          ].join(",")
        )
        .order("job_number", { ascending: false })
        .range(0, target - 1);

      if (statusFilter !== "__all__") q = q.eq("status", statusFilter);

      if (selectedAssignee !== "__all__") {
        if (!selectedAssignee) {
          setRows([]);
          setHasMore(false);
          return;
        }
        q = q.eq("assigned_to", selectedAssignee);
      }

      const { data, error } = await q;
      if (error) throw error;

      const next = data || [];
      setRows(next);

      // quick hasMore check (one extra row)
      let q2 = supabase
        .from("jobs")
        .select("id")
        .order("job_number", { ascending: false })
        .range(target, target);

      if (statusFilter !== "__all__") q2 = q2.eq("status", statusFilter);
      if (selectedAssignee !== "__all__") q2 = q2.eq("assigned_to", selectedAssignee);

      const { data: extra, error: extraErr } = await q2;
      if (extraErr) {
        // don't break UX if the check fails
        setHasMore(true);
      } else {
        setHasMore((extra || []).length > 0);
      }
    } catch (e) {
      setErr(e?.message || "Failed to refresh jobs.");
    } finally {
      setLoading(false);
    }
  }

  // initial + refetch on filter changes
  useEffect(() => {
    fetchJobs({ append: false, from: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, statusFilter, selectedAssignee]);

  function openReassign(job) {
    setReassignJob(job);
    setReassignOpen(true);
  }

  async function doReassign(nextAssignee) {
    if (!reassignJob?.id) return;
    setReassignBusy(true);

    const newName = (nextAssignee || "").trim() || null;

    try {
      // Preferred: RPC (lets you keep strict RLS & only allow reassignment)
      // If you haven't created it yet, we'll fallback to direct update.
      let rpcWorked = false;

      const { error: rpcErr } = await supabase.rpc("reassign_job", {
        p_job_id: reassignJob.id,
        p_new_assigned_to: newName,
      });

      if (!rpcErr) rpcWorked = true;

      if (!rpcWorked) {
        // fallback: direct update (requires UPDATE policy allowing non-admins)
        const { error: upErr } = await supabase
          .from("jobs")
          .update({ assigned_to: newName })
          .eq("id", reassignJob.id);

        if (upErr) throw upErr;
      }

      // UI: instantly remove job if it no longer matches current assignee filter
      setRows((prev) => {
        return prev
          .map((r) => (r.id === reassignJob.id ? { ...r, assigned_to: newName } : r))
          .filter((r) => {
            if (r.id !== reassignJob.id) return true;

            // If current view is filtered to a specific assignee, and the new assignee doesn't match,
            // remove it immediately.
            if (selectedAssignee !== "__all__") {
              return (newName || "") === (selectedAssignee || "");
            }
            return true;
          });
      });

      setReassignOpen(false);
      setReassignJob(null);
      showToast("Job reassigned successfully.", "ok");

      // Refresh/top-up the list so the view stays accurate
      await refreshCurrentView(rows.length);
    } catch (e) {
      console.error("Reassign failed:", e);
      showToast(e?.message || "Reassign failed (check RLS/update permissions).", "err");
    } finally {
      setReassignBusy(false);
    }
  }

  const actions = (
    <button
      className="btn-pill"
      type="button"
      onClick={() => fetchJobs({ append: false, from: 0 })}
      disabled={loading || loadingMore}
      title="Refresh list"
    >
      Refresh
    </button>
  );

  return (
    <PageLayout title="My Jobs" subtitle="View and Manage Jobs Assigned to yourself" actions={actions}>
      <div className="card">
        <h3 className="card-title">Filters</h3>
        <p className="card-subtitle">Default is your jobs. Switch to All or another worker when needed.</p>

        <div style={{ marginTop: "0.6rem", display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
          {/* Surveyor / All dropdown (same style as timesheets dropdown) */}
          <div className="card-row">
            <span className="card-row-label">Surveyor</span>
            <select
              className="maps-search-input"
              aria-label="Filter by surveyor"
              style={{ maxWidth: "260px" }}
              value={assigneeMode}
              onChange={(e) => setAssigneeMode(e.target.value)}
              disabled={!user || loading}
            >
              <option value="__my__">My Jobs</option>
              <option value="__all__">All</option>
              <option disabled>────────</option>
              {assigneeDropdownOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Status filter */}
          <div className="card-row">
            <span className="card-row-label">Status</span>
            <select
              className="maps-search-input"
              aria-label="Filter by status"
              style={{ maxWidth: "220px" }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              disabled={loading}
            >
              <option value="__all__">All</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="card-row">
            <span className="card-row-label">Showing</span>
            <span className="card-row-value">
              <b>{rows.length}</b> job{rows.length === 1 ? "" : "s"}
              {selectedAssignee !== "__all__" && selectedAssignee ? ` for ${selectedAssignee}` : ""}
              {statusFilter !== "__all__" ? ` • ${statusFilter}` : ""}
            </span>
          </div>
        </div>

        {err ? (
          <div
            style={{
              marginTop: 12,
              padding: "0.7rem 0.8rem",
              borderRadius: 12,
              background: "rgba(255,0,0,0.08)",
              fontSize: "0.9rem",
            }}
          >
            {err}
          </div>
        ) : null}
      </div>

      {/* Results */}
      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h3 className="card-title" style={{ marginBottom: 0 }}>Jobs</h3>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            {loading ? "Loading…" : hasMore ? "More available" : "End of list"}
          </div>
        </div>

        {loading && (
          <div style={{ marginTop: 10, opacity: 0.8 }}>Loading jobs…</div>
        )}

        {!loading && rows.length === 0 && (
          <div style={{ marginTop: 10, opacity: 0.8 }}>
            No jobs found for the current filters.
          </div>
        )}

        <div style={{ marginTop: 12, display: "grid", gap: 10 }} data-myjobs-list>
          {rows.map((r) => {
            const addr = addressSummaryFromRow(r);
            const client = (r.client_company || r.client_name || "—").trim();

            return (
              <div
                key={r.id}
                style={{
                  padding: "10px 12px",
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 220 }}>
                    <div style={{ fontWeight: 950, fontSize: 14 }}>
                      #{r.job_number ?? "—"}{" "}
                      <span style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>
                        • {r.status || "—"}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
                      {addr}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                      <b>Client:</b> {client}
                      {"  "}•{" "}
                      <b>Assigned:</b> {r.assigned_to || "Unassigned"}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button
                      className="btn-pill"
                      type="button"
                      aria-label="Open job"
                      onClick={() => navigate(`/jobs?job=${encodeURIComponent(String(r.job_number || ""))}`)}
                      title="Open this job in Jobs page"
                    >
                      Open
                    </button>

                    <button
                      className="btn-pill"
                      type="button"
                      onClick={() => openReassign(r)}
                      title="Re-assign this job"
                    >
                      Re-assign
                    </button>
                  </div>
                </div>

                {/* Extra summary row (mobile-friendly wrap) */}
                <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, opacity: 0.78 }}>
                  <span><b>Job type:</b> {r.job_type_legacy || "—"}</span>
                  <span><b>Job date:</b> {formatDateAU(r.job_date_legacy)}</span>
                  <span><b>Lot/Plan:</b> {(r.lot_number || "—") + " / " + (r.plan_number || "—")}</span>
                  <span><b>C/T:</b> {r.ct || "—"}</span>
                  <span><b>LGA:</b> {r.local_authority || "—"}</span>
                </div>

                {r.notes ? (
                  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85, whiteSpace: "pre-wrap" }}>
                    <b>Notes:</b> {r.notes}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Load more */}
        {hasMore && !loading && (
          <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
            <button
              className="btn-pill primary"
              type="button"
              onClick={() => fetchJobs({ append: true, from: rows.length })}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>

      <ReassignModal
        open={reassignOpen}
        job={reassignJob}
        staffOptions={staffOptions}
        onClose={() => !reassignBusy && setReassignOpen(false)}
        onConfirm={doReassign}
        busy={reassignBusy}
      />

      <Toast
        text={toast.text}
        kind={toast.kind}
        onClose={() => setToast({ text: "", kind: "ok" })}
      />
    </PageLayout>
  );
}

export default MyJobs;
