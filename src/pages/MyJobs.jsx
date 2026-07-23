import { useEffect, useMemo, useRef, useState } from "react";
import PageLayout from "../components/PageLayout.jsx";
import JobChecklistModal from "../components/JobChecklistModal.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { getJobAddressWarning } from "../lib/jobAddress.js";
import {
  JOB_CATEGORY_OPTIONS,
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  getPriorityBadgeStyle,
  getPriorityColor,
  toggleFilterValue,
} from "../lib/jobOptions.js";
import { getChecklistDefinition } from "../lib/jobChecklists.js";

const PAGE_SIZE = 30;

const JOB_SELECT_COLUMNS = [
  "id",
  "job_number",
  "client_name",
  "client_company",
  "client_first_name",
  "client_surname",
  "status",
  "assigned_to",
  "priority",
  "job_category",
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
].join(",");

function addressSummaryFromRow(r) {
  return getJobAddressWarning(r).displayAddress;
}

function formatDateAU(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-AU");
}

function getStatusTextStyle(status) {
  const value = String(status || "").trim().toLowerCase();
  let color = "#f0f0f0";
  if (value === "in progress") color = "#4da3ff";
  if (value === "on hold") color = "#ff9800";
  if (value === "complete") color = "#4caf50";

  return {
    color,
    fontWeight: 900,
    fontSize: 12,
    lineHeight: 1.2,
    overflowWrap: "anywhere",
  };
}

function priorityLabel(priority) {
  const value = String(priority || "").trim();
  return value ? "Priority " + value : "";
}

function calculateChecklistProgress(job, checklistRows = []) {
  const definition = getChecklistDefinition(job?.job_category || "") || [];

  if (!definition.length) {
    return {
      configured: false,
      completed: 0,
      total: 0,
      label: "—",
      title: "No checklist is configured for this job category.",
      complete: false,
    };
  }

  const definitionKeys = new Set(definition.map((item) => item.key));
  const completed = (checklistRows || []).filter(
    (row) =>
      row.job_category === job.job_category &&
      definitionKeys.has(row.item_key) &&
      row.is_completed === true
  ).length;
  const total = definition.length;

  return {
    configured: true,
    completed,
    total,
    label: `${completed}/${total}`,
    title: `Checklist progress: ${completed} of ${total} items completed`,
    complete: completed === total && total > 0,
  };
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
            {(() => {
              const addressState = getJobAddressWarning(job);
              return (
                <div className={addressState.label ? "manual-address-warning" : ""} style={{ fontSize: 12, opacity: 0.85 }}>
                  {addressState.displayAddress}
                  {addressState.label && <span className="manual-address-badge">{addressState.label}</span>}
                </div>
              );
            })()}
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
  const [assigneeMode, setAssigneeMode] = useState("__my__"); // __my__ | __all__ | __unassigned__ | name
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [jobCategoryFilter, setJobCategoryFilter] = useState([]);
  const [statusFilter, setStatusFilter] = useState([]);
  const [priorityFilter, setPriorityFilter] = useState([]);

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
  const [checklistJob, setChecklistJob] = useState(null);
  const [checklistProgressByJobId, setChecklistProgressByJobId] = useState({});
  const [checklistProgressLoading, setChecklistProgressLoading] = useState(false);
  const [checklistProgressFailed, setChecklistProgressFailed] = useState(false);

  // toast
  const [toast, setToast] = useState({ text: "", kind: "ok" });
  const toastTimerRef = useRef(null);
  const fetchSeqRef = useRef(0);
  const checklistProgressSeqRef = useRef(0);
  const skipNextFilterFetchRef = useRef(false);

  const selectedAssignee = useMemo(() => {
    if (assigneeMode === "__all__") return "__all__";
    if (assigneeMode === "__unassigned__") return "__unassigned__";
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

  function currentFilterValues(overrides = {}) {
    return {
      selectedAssignee: overrides.selectedAssignee ?? selectedAssignee,
      search: overrides.search ?? appliedSearch,
      jobCategory: overrides.jobCategory ?? jobCategoryFilter,
      status: overrides.status ?? statusFilter,
      priority: overrides.priority ?? priorityFilter,
    };
  }

  function applyMyJobsFilters(query, filters = currentFilterValues()) {
    let q = query;

    if (filters.selectedAssignee === "__unassigned__") {
      q = q.or("assigned_to.is.null,assigned_to.eq.,assigned_to.eq.{}");
    } else if (filters.selectedAssignee !== "__all__") {
      q = q.eq("assigned_to", filters.selectedAssignee);
    }

    if (filters.status.length > 0) {
      q = q.in("status", filters.status);
    }

    if (filters.jobCategory.length > 0) {
      q = q.in("job_category", filters.jobCategory);
    }

    if (filters.priority.length > 0) {
      q = q.in("priority", filters.priority.map((p) => Number(p)).filter((p) => Number.isFinite(p)));
    }

    const globalTrim = (filters.search || "").trim().replace(/^#/, "");
    if (globalTrim.length >= 3) {
      const isNumeric = /^\d+$/.test(globalTrim);

      if (isNumeric) {
        const like = "%" + globalTrim + "%";
        q = q.or(
          [
            "job_number_text.ilike." + like,
            "street_number.ilike." + like,
            "full_address.ilike." + like,
            "suburb.ilike." + like,
            "lot_number.ilike." + like,
            "plan_number.ilike." + like,
            "notes.ilike." + like,
            "client_company.ilike." + like,
          ].join(",")
        );
      } else {
        const ts = globalTrim
          .split(/\s+/)
          .filter(Boolean)
          .map((w) => w + ":*")
          .join(" & ");

        q = q.textSearch("search_tsv", ts, { type: "tsquery" });
      }
    }

    return q;
  }

  useEffect(() => {
    return () => toastTimerRef.current && clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(searchInput);
    }, 450);

    return () => clearTimeout(timer);
  }, [searchInput]);

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

  async function fetchJobs({ append = false, from = 0, filters: filterOverrides = null } = {}) {
    if (!user) return;

    const requestId = ++fetchSeqRef.current;
    const filters = currentFilterValues(filterOverrides || {});
    const isLatest = () => requestId === fetchSeqRef.current;

    if (!append) {
      setLoading(true);
      setErr("");
    } else {
      setLoadingMore(true);
    }

    try {
      if (filters.selectedAssignee !== "__all__" && filters.selectedAssignee !== "__unassigned__" && !filters.selectedAssignee) {
        if (isLatest()) {
          setRows([]);
          setHasMore(false);
        }
        return;
      }

      let q = supabase
        .from("jobs")
        .select(JOB_SELECT_COLUMNS)
        .order("job_number", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      q = applyMyJobsFilters(q, filters);

      const { data, error } = await q;
      if (error) throw error;
      if (!isLatest()) return;

      const next = data || [];
      setRows((prev) => (append ? [...prev, ...next] : next));
      setHasMore(next.length === PAGE_SIZE);
    } catch (e) {
      if (!isLatest()) return;
      setErr(e?.message || "Failed to load jobs.");
      setRows([]);
      setHasMore(false);
    } finally {
      if (isLatest()) {
        setLoading(false);
        setLoadingMore(false);
      }
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
        .select(JOB_SELECT_COLUMNS)
        .order("job_number", { ascending: false })
        .range(0, target - 1);

      if (selectedAssignee !== "__all__" && selectedAssignee !== "__unassigned__" && !selectedAssignee) {
        setRows([]);
        setHasMore(false);
        return;
      }

      q = applyMyJobsFilters(q);

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

      q2 = applyMyJobsFilters(q2);

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
    if (skipNextFilterFetchRef.current) {
      skipNextFilterFetchRef.current = false;
      return;
    }

    fetchJobs({ append: false, from: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedAssignee, appliedSearch, jobCategoryFilter, statusFilter, priorityFilter]);

  useEffect(() => {
    const jobIds = rows.map((row) => row.id).filter(Boolean);

    if (!user || jobIds.length === 0) {
      setChecklistProgressByJobId({});
      setChecklistProgressLoading(false);
      setChecklistProgressFailed(false);
      return;
    }

    const requestId = ++checklistProgressSeqRef.current;
    const isLatest = () => requestId === checklistProgressSeqRef.current;

    setChecklistProgressLoading(true);
    setChecklistProgressFailed(false);

    (async () => {
      try {
        const { data, error } = await supabase
          .from("job_checklist_items")
          .select("job_id, job_category, item_key, is_completed")
          .in("job_id", jobIds);

        if (error) throw error;
        if (!isLatest()) return;

        const rowsByJobId = new Map();
        (data || []).forEach((item) => {
          const existing = rowsByJobId.get(item.job_id) || [];
          existing.push(item);
          rowsByJobId.set(item.job_id, existing);
        });

        const nextProgress = {};
        rows.forEach((job) => {
          nextProgress[job.id] = calculateChecklistProgress(job, rowsByJobId.get(job.id) || []);
        });

        setChecklistProgressByJobId(nextProgress);
      } catch (e) {
        if (!isLatest()) return;
        console.warn("Checklist progress failed:", e?.message || e);
        setChecklistProgressFailed(true);
        setChecklistProgressByJobId({});
      } finally {
        if (isLatest()) setChecklistProgressLoading(false);
      }
    })();
  }, [rows, user]);

  function openReassign(job) {
    setReassignJob(job);
    setReassignOpen(true);
  }

  function openChecklist(job) {
    if (!job?.id || checklistJob) return;
    setChecklistJob(job);
  }

  function updateChecklistProgress(job, checklistRows) {
    if (!job?.id) return;
    setChecklistProgressByJobId((prev) => ({
      ...prev,
      [job.id]: calculateChecklistProgress(job, checklistRows),
    }));
  }

  function getChecklistProgressDisplay(job) {
    const definition = getChecklistDefinition(job?.job_category || "") || [];

    if (!definition.length) {
      return calculateChecklistProgress(job, []);
    }

    if (checklistProgressFailed && !checklistProgressByJobId[job.id]) {
      return {
        configured: true,
        completed: 0,
        total: definition.length,
        label: "—",
        title: "Checklist progress unavailable.",
        complete: false,
      };
    }

    if (checklistProgressLoading && !checklistProgressByJobId[job.id]) {
      return {
        configured: true,
        completed: 0,
        total: definition.length,
        label: "…/…",
        title: "Checklist progress loading.",
        complete: false,
      };
    }

    return checklistProgressByJobId[job.id] || calculateChecklistProgress(job, []);
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
            if (selectedAssignee === "__unassigned__") {
              return !newName;
            }
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

  async function handleRefresh() {
    if (loading || loadingMore) return;

    const defaultSelectedAssignee = (myDisplayName || "").trim();
    const defaultFilters = {
      selectedAssignee: defaultSelectedAssignee,
      search: "",
      jobCategory: [],
      status: [],
      priority: [],
    };

    skipNextFilterFetchRef.current = true;
    setSearchInput("");
    setAppliedSearch("");
    setAssigneeMode("__my__");
    setJobCategoryFilter([]);
    setStatusFilter([]);
    setPriorityFilter([]);

    await fetchJobs({ append: false, from: 0, filters: defaultFilters });
  }

  const actions = (
    <button
      className="btn-pill"
      type="button"
      onClick={handleRefresh}
      disabled={loading || loadingMore}
      title="Reset filters and refresh list"
    >
      Refresh
    </button>
  );

  return (
    <PageLayout title="My Jobs" subtitle="View and Manage Jobs Assigned to yourself" actions={actions}>
      <div className="card">
        <h3 className="card-title">Filters</h3>
        <p className="card-subtitle">Default is your jobs. Switch to All or another worker when needed.</p>

        <div className="jobs-search-row" style={{ marginTop: 10 }}>
          <div className="jobs-mobile-card">
            <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 6 }}>Global Search</div>
            <input
              className="maps-search-input"
              placeholder="Search…(client, suburb, lot/plan, address, etc.)"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          <div className="jobs-mobile-card">
            <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 6 }}>Surveyor</div>
            <select
              className="maps-search-input"
              aria-label="Filter by surveyor"
              style={{ width: "100%" }}
              value={assigneeMode}
              onChange={(e) => setAssigneeMode(e.target.value)}
              disabled={!user || loading}
            >
              <option value="__my__">My Jobs</option>
              <option value="__all__">All</option>
              <option value="__unassigned__">Unassigned</option>
              <option disabled>────────</option>
              {assigneeDropdownOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="jobs-filters-wrap jobs-filters-full">
            <div className="jobs-filters-row">
              <div className="jobs-filters-group">
                <div className="jobs-filters-label">
                  Category{jobCategoryFilter.length > 0 ? ` (${jobCategoryFilter.length})` : ""}
                </div>
                <div className="jobs-filter-pills">
                  <button
                    type="button"
                    className={`jobs-filter-pill ${jobCategoryFilter.length === 0 ? "is-active" : ""}`}
                    onClick={() => setJobCategoryFilter([])}
                    disabled={loading}
                  >
                    All
                  </button>
                  {JOB_CATEGORY_OPTIONS.filter((o) => o !== "").map((o) => (
                    <button
                      key={o}
                      type="button"
                      className={`jobs-filter-pill ${jobCategoryFilter.includes(o) ? "is-active" : ""}`}
                      onClick={() => toggleFilterValue(jobCategoryFilter, o, setJobCategoryFilter)}
                      disabled={loading}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>

              <div className="jobs-filters-group">
                <div className="jobs-filters-label">
                  Status{statusFilter.length > 0 ? ` (${statusFilter.length})` : ""}
                </div>
                <div className="jobs-filter-pills">
                  <button
                    type="button"
                    className={`jobs-filter-pill ${statusFilter.length === 0 ? "is-active" : ""}`}
                    onClick={() => setStatusFilter([])}
                    disabled={loading}
                  >
                    All
                  </button>
                  {STATUS_OPTIONS.map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={`jobs-filter-pill ${statusFilter.includes(status) ? "is-active" : ""}`}
                      onClick={() => toggleFilterValue(statusFilter, status, setStatusFilter)}
                      disabled={loading}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              <div className="jobs-filters-group">
                <div className="jobs-filters-label">
                  Priority{priorityFilter.length > 0 ? ` (${priorityFilter.length})` : ""}
                </div>
                <div className="jobs-filter-pills">
                  <button
                    type="button"
                    className={`jobs-filter-pill ${priorityFilter.length === 0 ? "is-active" : ""}`}
                    onClick={() => setPriorityFilter([])}
                    disabled={loading}
                  >
                    All Priorities
                  </button>
                  {PRIORITY_OPTIONS.filter((p) => p !== "").map((priority) => (
                    <button
                      key={priority}
                      type="button"
                      className={`jobs-filter-pill ${priorityFilter.includes(priority) ? "is-active" : ""}`}
                      onClick={() => toggleFilterValue(priorityFilter, priority, setPriorityFilter)}
                      disabled={loading}
                      style={{
                        borderColor: priorityFilter.includes(priority) ? getPriorityColor(priority) : undefined,
                        boxShadow: priorityFilter.includes(priority) ? `inset 0 0 0 1px ${getPriorityColor(priority)}` : undefined,
                      }}
                    >
                      <span className="myjobs-priority-filter-content">
                        <span
                          className="myjobs-priority-filter-number"
                          style={{ background: getPriorityColor(priority) }}
                        >
                          {priority}
                        </span>
                        <span>Priority {priority}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="card-row jobs-filters-full" style={{ marginTop: 0 }}>
            <span className="card-row-label">Showing</span>
            <span className="card-row-value">
              <b>{rows.length}</b> job{rows.length === 1 ? "" : "s"}
              {selectedAssignee === "__unassigned__"
                ? " for Unassigned"
                : selectedAssignee !== "__all__" && selectedAssignee
                  ? ` for ${selectedAssignee}`
                  : ""}
              {appliedSearch.trim() ? ` • Search: ${appliedSearch.trim()}` : ""}
              {jobCategoryFilter.length > 0 ? ` • Categories: ${jobCategoryFilter.join(", ")}` : ""}
              {statusFilter.length > 0 ? ` • Status: ${statusFilter.join(", ")}` : ""}
              {priorityFilter.length > 0 ? ` • Priorities: ${priorityFilter.join(", ")}` : ""}
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
            const addressState = getJobAddressWarning(r);
            const clientPerson = [r.client_first_name, r.client_surname].filter(Boolean).join(" ").trim();
            const client = (r.client_company || clientPerson || r.client_name || "—").trim();
            const checklistProgress = getChecklistProgressDisplay(r);

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
                  <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        flexWrap: "wrap",
                        fontWeight: 950,
                        fontSize: 14,
                        lineHeight: 1.25,
                        overflowWrap: "anywhere",
                      }}
                    >
                      <span>#{r.job_number ?? "—"}</span>
                      <span style={{ opacity: 0.55 }}>-</span>
                      <span style={getStatusTextStyle(r.status)}>{r.status || "—"}</span>
                      {r.priority ? (
                        <>
                          <span style={{ opacity: 0.55 }}>-</span>
                          <span style={getPriorityBadgeStyle(r.priority)}>{priorityLabel(r.priority)}</span>
                        </>
                      ) : null}
                    </div>
                    <div className={addressState.label ? "manual-address-warning" : ""} style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
                      {addr}
                      {addressState.label && <span className="manual-address-badge">{addressState.label}</span>}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                      <b>Client:</b> {client}
                      {"  "}•{" "}
                      <b>Assigned:</b> {r.assigned_to || "Unassigned"}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
                    <span
                      aria-label={checklistProgress.title}
                      title={checklistProgress.title}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minHeight: 30,
                        minWidth: 44,
                        padding: "0.22rem 0.52rem",
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: checklistProgress.complete ? "rgba(76,175,80,0.14)" : "rgba(255,255,255,0.04)",
                        color: checklistProgress.configured ? "inherit" : "rgba(255,255,255,0.68)",
                        fontSize: 12,
                        fontWeight: 900,
                        lineHeight: 1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {checklistProgress.label}
                    </span>

                    <button
                      className="btn-pill"
                      type="button"
                      onClick={() => openChecklist(r)}
                      disabled={Boolean(checklistJob)}
                      title="Open this job's checklist"
                    >
                      Checklist
                    </button>

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
                  <span><b>Job Category:</b> {r.job_category || "—"}</span>
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

      <JobChecklistModal
        open={Boolean(checklistJob)}
        jobId={checklistJob?.id || null}
        jobNumber={checklistJob?.job_number || null}
        category={checklistJob?.job_category || ""}
        onClose={() => setChecklistJob(null)}
        onSaved={({ rows: checklistRows }) => updateChecklistProgress(checklistJob, checklistRows)}
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
