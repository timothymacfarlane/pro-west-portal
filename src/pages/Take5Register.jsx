import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import PageLayout from "../components/PageLayout.jsx";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";
import { cleanDisplayAddress } from "../lib/displayFormatters.js";
import {
  isCurrentEmployeeProfile,
  profileEmployeeOption,
} from "../lib/profileVisibility.js";

function addressSummaryFromRow(r) {
  const a =
    (r?.full_address || "").trim() ||
    [r?.street_number, r?.street_name, r?.suburb].filter(Boolean).join(" ").trim() ||
    (r?.suburb || "").trim() ||
    "—";
  return cleanDisplayAddress(a) || "—";
}

const PAGE_SIZE = 25;

function Take5Register() {
  const location = useLocation();
  const { user } = useAuth();

const [staff, setStaff] = useState([]);
const [myDisplayName, setMyDisplayName] = useState("");
const [surveyorMode, setSurveyorMode] = useState("__my__"); // __my__ | __all__ | name
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [openingPdfId, setOpeningPdfId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // ✅ Job filter with autosuggest (same approach as Jobs.jsx / Take5.jsx)
 const [jobFilter, setJobFilter] = useState("");
const [searchJobFilter, setSearchJobFilter] = useState("");
const [selectedJob, setSelectedJob] = useState(null);
const [jobFilterSuggestions, setJobFilterSuggestions] = useState([]);
const [jobFilterLoading, setJobFilterLoading] = useState(false);
const [dateFilter, setDateFilter] = useState("");
const debounceJobFilterRef = useRef(null);
const requestIdRef = useRef(0);

useEffect(() => {
  const frame = requestAnimationFrame(() => {
    const scrollOwner = document.querySelector(".main-content");
    if (scrollOwner && typeof scrollOwner.scrollTo === "function") {
      scrollOwner.scrollTo({ top: 0, left: 0, behavior: "auto" });
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  });

  return () => cancelAnimationFrame(frame);
}, [location.key, location.pathname]);

const selectedSurveyor = useMemo(() => {
  if (surveyorMode === "__all__") return "__all__";
  if (surveyorMode === "__my__") return (myDisplayName || "").trim();
  return (surveyorMode || "").trim();
}, [surveyorMode, myDisplayName]);

const surveyorDropdownOptions = useMemo(() => {
  const list = (staff || []).map((p) => p.name).filter(Boolean);
  return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b));
}, [staff]);

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

      const list = (data || [])
        .filter(isCurrentEmployeeProfile)
        .map(profileEmployeeOption)
        .filter((p) => p.name);

      setStaff(list);

      const me = list.find((x) => x.id === user.id);
      const fallback = user?.user_metadata?.full_name || user?.email || "";
      setMyDisplayName((me?.name || fallback || "").trim());
    } catch (e) {
      console.warn("Error loading surveyors:", e?.message || e);
      setStaff([]);
      setMyDisplayName((user?.user_metadata?.full_name || user?.email || "").trim());
    }
  };

  loadStaff();
}, [user]);

  const runJobFilterSuggest = useCallback(async (query) => {
    const q = (query || "").trim();
    if (!q || !/^\d+$/.test(q)) {
      setJobFilterSuggestions([]);
      return;
    }

    setJobFilterLoading(true);
    try {
      const { data, error: sErr } = await supabase
        .from("jobs")
        .select("id, job_number, full_address, street_number, street_name, suburb")
        .like("job_number_text", `${q}%`)
        .order("job_number", { ascending: false })
        .limit(20);

      if (sErr) throw sErr;

      setJobFilterSuggestions(
        (data || []).map((r) => ({
          id: r.id,
          job_number: r.job_number,
          address: addressSummaryFromRow(r),
        }))
      );
    } catch (e) {
      console.warn("Job filter suggest error", e);
      setJobFilterSuggestions([]);
    } finally {
      setJobFilterLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceJobFilterRef.current) clearTimeout(debounceJobFilterRef.current);
    debounceJobFilterRef.current = setTimeout(() => runJobFilterSuggest(jobFilter), 160);
    return () => debounceJobFilterRef.current && clearTimeout(debounceJobFilterRef.current);
  }, [jobFilter, runJobFilterSuggest]);

  useEffect(() => {
    const timer = setTimeout(() => setSearchJobFilter(jobFilter.trim()), 250);
    return () => clearTimeout(timer);
  }, [jobFilter]);

  const fetchData = useCallback(async (from = 0) => {
      const loadMore = from > 0;
      const requestId = ++requestIdRef.current;
      if (loadMore) setLoadingMore(true);
      else {
        setLoading(true);
        setLoadingMore(false);
        setRows([]);
        setHasMore(false);
        setTotalCount(0);
      }
      setError("");
      setPdfError("");

      try {
        let query = supabase
          .from("take5_submissions")
          .select(
            "id, job_number, employee_name, take5_number, created_at, pdf_path, form_data",
            { count: "exact" }
          )
          .order("created_at", { ascending: false })
          .order("id", { ascending: false });

        if (searchJobFilter) {
          query = query.ilike("job_number", `%${searchJobFilter}%`);
        }

        if (dateFilter) {
          const start = new Date(`${dateFilter}T00:00:00`);
          const end = new Date(start);
          end.setDate(end.getDate() + 1);

          query = query
            .gte("created_at", start.toISOString())
            .lt("created_at", end.toISOString());
        }

if (selectedSurveyor !== "__all__") {
  if (!selectedSurveyor) {
    setRows([]);
    setHasMore(false);
    setTotalCount(0);
    return;
  }

  query = query.eq("employee_name", selectedSurveyor);
}

        const { data, count, error: qError } = await query.range(from, from + PAGE_SIZE);
        if (qError) throw qError;
        if (requestId !== requestIdRef.current) return;

        const fetched = data || [];
        setRows((current) => loadMore ? [...current, ...fetched.slice(0, PAGE_SIZE)] : fetched.slice(0, PAGE_SIZE));
        setHasMore(fetched.length > PAGE_SIZE);
        setTotalCount(count ?? 0);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        console.error(err);
        setError("Failed to load Take 5 submissions.");
      } finally {
        if (requestId === requestIdRef.current) {
          if (loadMore) setLoadingMore(false);
          else setLoading(false);
        }
      }
    }, [searchJobFilter, selectedSurveyor, dateFilter]);

  useEffect(() => {
    fetchData(0);
  }, [fetchData, refreshKey]);

  const openPdf = async (row) => {
    if (!row.pdf_path || openingPdfId) return;
    setOpeningPdfId(row.id);
    setPdfError("");
    const pdfTab = window.open("about:blank", "_blank");
    if (pdfTab) pdfTab.opener = null;
    try {
      const { data, error: signedError } = await supabase.storage
        .from("take5-pdfs")
        .createSignedUrl(row.pdf_path, 60 * 60);
      if (signedError) throw signedError;
      if (!data?.signedUrl) throw new Error("No signed PDF URL returned.");
      if (pdfTab) pdfTab.location.replace(data.signedUrl);
      else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      pdfTab?.close();
      console.warn("Take 5 Register PDF open failed:", err);
      setPdfError("The PDF could not be opened. Please try again.");
    } finally {
      setOpeningPdfId("");
    }
  };

  const handleRefresh = useCallback(() => {
    if (debounceJobFilterRef.current) {
      clearTimeout(debounceJobFilterRef.current);
      debounceJobFilterRef.current = null;
    }

    setJobFilter("");
    setSearchJobFilter("");
    setSelectedJob(null);
    setJobFilterSuggestions([]);
    setJobFilterLoading(false);
    setDateFilter("");
    setSurveyorMode("__my__");
    setRefreshKey((key) => key + 1);
  }, []);

  return (
    <PageLayout
      data-take5-register
      icon="📋"
      title="Take 5 Register"
      subtitle="List of submitted Take 5s with links to PDFs"
      actions={
        <button
          className="btn-pill"
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          title="Refresh Take 5 register"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      }
    >
      <div className="card">
        <h3 className="card-title">Filter</h3>
        <p className="card-subtitle">
          Filter by job number, surveyor, and submission date. Defaults to your Take 5s.
        </p>

        <div className="card-row" style={{ marginTop: "0.4rem", alignItems: "flex-start" }}>
          <span className="card-row-label" style={{ paddingTop: 8 }}>Job number</span>

          <div style={{ width: "100%", maxWidth: 320, position: "relative" }}>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              aria-label="Filter by job number"
              value={jobFilter}
              onChange={(e) => {
  const v = e.target.value;
  setJobFilter(v);
  setSelectedJob(null);
}}
onFocus={() => runJobFilterSuggest(jobFilter)}
onBlur={() => {
  setTimeout(() => setJobFilterSuggestions([]), 150);
}}
onKeyDown={(e) => {
  if (e.key === "Enter") {
    const matched = jobFilterSuggestions.find(
      (j) => String(j.job_number) === String(jobFilter).trim()
    );

  if (matched) {
  const selectedJobNumber = String(matched.job_number);

  setSelectedJob(matched);
  setJobFilter(selectedJobNumber);
}

    setJobFilterSuggestions([]);
  }

  if (e.key === "Escape") setJobFilterSuggestions([]);
}}
placeholder={`Type job number…${jobFilterLoading ? "…" : ""}`}
className="maps-search-input"
              style={{ width: "100%" }}
            />

            {jobFilterSuggestions.length > 0 && (
  <div
    style={{
      position: "absolute",
      top: "calc(100% + 6px)",
      left: 0,
      right: 0,
      zIndex: 20,
      borderRadius: 12,
      overflow: "hidden",
      border: "1px solid var(--pw-border-soft, #eadada)",
      background: "#fff",
      boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
      maxHeight: 260,
      overflowY: "auto",
      WebkitOverflowScrolling: "touch",
    }}
  >
    {jobFilterSuggestions.map((j, idx) => (
      <button
        key={j.id}
        type="button"
      onClick={() => {
  const selectedJobNumber = String(j.job_number);

  setJobFilter(selectedJobNumber);
  setSelectedJob(j);
  setJobFilterSuggestions([]);
}}
        style={{
          width: "100%",
          display: "block",
          padding: "0.7rem 0.85rem",
          textAlign: "left",
          background: "#fff",
          border: "none",
          borderBottom:
            idx === jobFilterSuggestions.length - 1
              ? "none"
              : "1px solid #f3e1e1",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#fff5f5";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#fff";
        }}
      >
        <div
          style={{
            fontWeight: 700,
            fontSize: "0.9rem",
            color: "var(--pw-primary-dark, #b71c1c)",
            lineHeight: 1.2,
          }}
        >
          Job #{j.job_number}
        </div>

        <div
          style={{
            fontSize: "0.78rem",
            color: "#666",
            marginTop: 3,
            lineHeight: 1.35,
          }}
        >
          {cleanDisplayAddress(j.address)}
        </div>
      </button>
    ))}
  </div>
)}

{selectedJob && (
  <div
    style={{
      marginTop: 6,
      padding: "0.5rem 0.7rem",
      borderRadius: 8,
      background: "#e8f5e9",
      border: "1px solid #c8e6c9",
      fontSize: "0.8rem",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "0.5rem",
    }}
  >
    <div>
      <div style={{ fontWeight: 700, color: "#2e7d32" }}>
        ✓ Job #{selectedJob.job_number} selected
      </div>
      <div style={{ fontSize: "0.75rem", color: "#555" }}>
        {cleanDisplayAddress(selectedJob.address)}
      </div>
    </div>

    <button
      type="button"
      className="btn-pill"
      style={{ fontSize: "0.7rem", padding: "0.15rem 0.5rem" }}
      onClick={() => {
        setSelectedJob(null);
        setJobFilter("");
        setJobFilterSuggestions([]);
      }}
    >
      Clear
    </button>
  </div>
)}

          </div>
        </div>
        <div className="card-row" style={{ marginTop: "0.6rem" }}>
  <span className="card-row-label">Date</span>

  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
    <input
      type="date"
      className="maps-search-input"
      aria-label="Filter by submission date"
      value={dateFilter}
      onChange={(e) => setDateFilter(e.target.value)}
      disabled={loading}
      style={{ maxWidth: "180px" }}
    />
    {dateFilter && (
      <button
        type="button"
        className="btn-pill"
        onClick={() => setDateFilter("")}
        disabled={loading}
        style={{ fontSize: "0.75rem", padding: "0.2rem 0.6rem" }}
      >
        Clear date
      </button>
    )}
  </div>
</div>
<div className="card-row" style={{ marginTop: "0.6rem" }}>
  <span className="card-row-label">Surveyor</span>

  <select
    className="maps-search-input"
    aria-label="Filter by surveyor"
    style={{ maxWidth: "260px" }}
    value={surveyorMode}
    onChange={(e) => {
  setSurveyorMode(e.target.value);
}}
    disabled={!user || loading}
  >
    <option value="__my__">My Take 5s</option>
    <option value="__all__">All</option>
    <option disabled>────────</option>

    {surveyorDropdownOptions.map((name) => (
      <option key={name} value={name}>
        {name}
      </option>
    ))}
  </select>
</div>
<div className="card-row" style={{ marginTop: "0.6rem" }}>
  <span className="card-row-label">Showing</span>
  <span className="card-row-value">
    <b>{rows.length}</b> of <b>{totalCount}</b> Take 5{totalCount === 1 ? "" : "s"}
    {selectedSurveyor !== "__all__" && selectedSurveyor ? ` for ${selectedSurveyor}` : ""}
    {jobFilter.trim() ? ` • Job #${jobFilter.trim()}` : ""}
    {dateFilter ? ` • ${new Date(`${dateFilter}T00:00:00`).toLocaleDateString("en-AU")}` : ""}
  </span>
</div>
      </div>



      <div className="card">
        <h3 className="card-title">Submissions</h3>
        <p className="card-subtitle">
          Newest submissions are shown first. Click View PDF to open the summary.
        </p>

        {loading && (
          <div style={{ marginTop: "0.4rem", fontSize: "0.85rem" }}>
            Loading…
          </div>
        )}

        {error && (
          <div
            style={{
              marginTop: "0.4rem",
              fontSize: "0.85rem",
              color: "#b71c1c",
            }}
          >
            {error}
          </div>
        )}

        {pdfError && (
          <div role="alert" style={{ marginTop: "0.4rem", fontSize: "0.85rem", color: "#b71c1c" }}>
            {pdfError}
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div style={{ marginTop: "0.4rem", fontSize: "0.85rem" }}>
            No submissions found.
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div
            style={{
              marginTop: "0.8rem",
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.8rem",
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      borderBottom: "1px solid #f3e1e1",
                      textAlign: "left",
                      padding: "0.35rem",
                    }}
                  >
                    Job #
                  </th>
                  <th
                    style={{
                      borderBottom: "1px solid #f3e1e1",
                      textAlign: "left",
                      padding: "0.35rem",
                    }}
                  >
                    Take 5 #
                  </th>
                  <th
                    style={{
                      borderBottom: "1px solid #f3e1e1",
                      textAlign: "left",
                      padding: "0.35rem",
                    }}
                  >
                    Employee
                  </th>
                  <th
                    style={{
                      borderBottom: "1px solid #f3e1e1",
                      textAlign: "left",
                      padding: "0.35rem",
                    }}
                  >
                    Date
                  </th>
                  <th
                    style={{
                      borderBottom: "1px solid #f3e1e1",
                      textAlign: "left",
                      padding: "0.35rem",
                    }}
                  >
                    PDF
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const submittedAt = row.form_data?.submittedAt || row.created_at;
                  const dateStr = submittedAt
                    ? new Date(submittedAt).toLocaleString("en-AU", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })
                    : "-";

                  return (
                    <tr key={row.id}>
                      <td
                        style={{
                          borderBottom: "1px solid #f8e0e0",
                          padding: "0.35rem",
                          fontWeight: 700,
                          color: "var(--pw-primary-dark)",
                        }}
                      >
                        {row.job_number || "-"}
                      </td>
                      <td
                        style={{
                          borderBottom: "1px solid #f8e0e0",
                          padding: "0.35rem",
                        }}
                      >
                        {row.take5_number || "-"}
                      </td>
                      <td
                        style={{
                          borderBottom: "1px solid #f8e0e0",
                          padding: "0.35rem",
                        }}
                      >
                        {row.employee_name}
                      </td>
                      <td
                        style={{
                          borderBottom: "1px solid #f8e0e0",
                          padding: "0.35rem",
                        }}
                      >
                        {dateStr}
                      </td>
                      <td
                        style={{
                          borderBottom: "1px solid #f8e0e0",
                          padding: "0.35rem",
                        }}
                      >
                        {row.pdf_path ? (
                          <button
                            type="button"
                            className="btn-pill"
                            style={{ fontSize: "0.75rem" }}
                            onClick={() => openPdf(row)}
                            disabled={Boolean(openingPdfId)}
                          >
                            {openingPdfId === row.id ? "Opening..." : "View PDF"}
                          </button>
                        ) : (
                          <span style={{ color: "#999" }}>No PDF</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && hasMore && (
          <div style={{ marginTop: "0.8rem", textAlign: "center" }}>
            <button
              type="button"
              className="btn-pill"
              onClick={() => fetchData(rows.length)}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          </div>
        )}
      </div>
    </PageLayout>
  );
}

export default Take5Register;
