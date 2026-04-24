import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import PageLayout from "../components/PageLayout.jsx";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

function addressSummaryFromRow(r) {
  const a =
    (r?.full_address || "").trim() ||
    [r?.street_number, r?.street_name, r?.suburb].filter(Boolean).join(" ").trim() ||
    (r?.suburb || "").trim() ||
    "—";
  return a;
}

function Take5Register() {
  const { user } = useAuth();

const [staff, setStaff] = useState([]);
const [myDisplayName, setMyDisplayName] = useState("");
const [surveyorMode, setSurveyorMode] = useState("__my__"); // __my__ | __all__ | name
  const [rows, setRows] = useState([]);
  const [pdfMap, setPdfMap] = useState({}); // { [rowId]: signedUrl }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ✅ Job filter with autosuggest (same approach as Jobs.jsx / Take5.jsx)
 const [jobFilter, setJobFilter] = useState("");
const [selectedJob, setSelectedJob] = useState(null);
const [jobFilterSuggestions, setJobFilterSuggestions] = useState([]);
const [jobFilterLoading, setJobFilterLoading] = useState(false);
const debounceJobFilterRef = useRef(null);

const selectedSurveyor = useMemo(() => {
  if (surveyorMode === "__all__") return "__all__";
  if (surveyorMode === "__my__") return (myDisplayName || "").trim();
  return (surveyorMode || "").trim();
}, [surveyorMode, myDisplayName]);

const surveyorDropdownOptions = useMemo(() => {
  const list = (staff || []).map((p) => p.name).filter(Boolean);
  return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b));
}, [staff]);

  const [expandedJobs, setExpandedJobs] = useState({}); // { [jobNumber]: bool }

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
    const fetchData = async () => {
      setLoading(true);
      setError("");
      setPdfMap({});

      try {
        let query = supabase
          .from("take5_submissions")
          .select(
            "id, job_number, employee_name, take5_number, created_at, pdf_path, form_data"
          )
          .order("created_at", { ascending: false });

        if (jobFilter.trim()) {
          // keep your existing flexible filter behaviour
          query = query.ilike("job_number", `%${jobFilter.trim()}%`);
        }

if (selectedSurveyor !== "__all__") {
  if (!selectedSurveyor) {
    setRows([]);
    setPdfMap({});
    setLoading(false);
    return;
  }

  query = query.eq("employee_name", selectedSurveyor);
}

        const { data, error: qError } = await query;
        if (qError) throw qError;

        const fetched = data || [];
        setRows(fetched);

        // Build signed URLs for private bucket
        const map = {};
        await Promise.all(
          fetched.map(async (row) => {
            if (!row.pdf_path) return;
            try {
              const { data: signed, error: sErr } = await supabase.storage
                .from("take5-pdfs")
                .createSignedUrl(row.pdf_path, 60 * 60); // 1 hour

              if (!sErr && signed?.signedUrl) {
                map[row.id] = signed.signedUrl;
              }
            } catch (e) {
              // swallow per-row errors so list still loads
              console.warn("Signed URL error for row", row.id, e);
            }
          })
        );

        setPdfMap(map);
      } catch (err) {
        console.error(err);
        setError("Failed to load Take 5 submissions.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [jobFilter, selectedSurveyor]);

  // Group rows by job number (so PDFs sit under job number)
  const groupedByJob = useMemo(() => {
    const groups = {};
    rows.forEach((r) => {
      const job = r.job_number || "Unknown Job";
      if (!groups[job]) groups[job] = [];
      groups[job].push(r);
    });
    return groups;
  }, [rows]);

const expandSelectedJob = (jobNumber) => {
  if (!jobNumber) return;

  setExpandedJobs((prev) => ({
    ...prev,
    [String(jobNumber)]: true,
  }));
};

  const toggleJob = (job) => {
    setExpandedJobs((prev) => ({ ...prev, [job]: !prev[job] }));
  };

  return (
    <PageLayout
      data-take5-register
      icon="📋"
      title="Take 5 Register"
      subtitle="List of submitted Take 5s with links to PDFs"
    >
      <div className="card">
        <h3 className="card-title">Filter</h3>
        <p className="card-subtitle">
          Filter by job number and surveyor. Defaults to your Take 5s.
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
  expandSelectedJob(selectedJobNumber);
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
  expandSelectedJob(selectedJobNumber);
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
          {j.address}
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
        {selectedJob.address}
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
  <span className="card-row-label">Surveyor</span>

  <select
    className="maps-search-input"
    aria-label="Filter by surveyor"
    style={{ maxWidth: "260px" }}
    value={surveyorMode}
    onChange={(e) => {
  setSurveyorMode(e.target.value);
  setExpandedJobs({});
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
    <b>{rows.length}</b> Take 5{rows.length === 1 ? "" : "s"}
    {selectedSurveyor !== "__all__" && selectedSurveyor ? ` for ${selectedSurveyor}` : ""}
    {jobFilter.trim() ? ` • Job #${jobFilter.trim()}` : ""}
  </span>
</div>
      </div>



      <div className="card">
        <h3 className="card-title">Submissions</h3>
        <p className="card-subtitle">
          Expand a job to see its Take 5s. Click View PDF to open the summary.
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

        {!loading && !error && rows.length === 0 && (
          <div style={{ marginTop: "0.4rem", fontSize: "0.85rem" }}>
            No submissions found.
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <div
            style={{
              marginTop: "0.8rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.6rem",
            }}
          >
            {Object.entries(groupedByJob).map(([jobNumber, jobRows]) => {
              const expanded = !!expandedJobs[jobNumber];

              return (
                <div
                  key={jobNumber}
                  style={{
                    border: "1px solid #f3e1e1",
                    borderRadius: 8,
                    overflow: "hidden",
                  }}
                >
                  {/* Job header */}
                  <button
                    type="button"
                    aria-label={`Toggle job ${jobNumber}`}
                    onClick={() => toggleJob(jobNumber)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "0.6rem 0.8rem",
                      background: "#fff",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontWeight: 700,
                      color: "var(--pw-primary-dark)",
                    }}
                  >
                    <span>{jobNumber}</span>
                    <span style={{ fontSize: "0.8rem", color: "#777" }}>
                      {jobRows.length} Take 5{jobRows.length > 1 ? "s" : ""}{" "}
                      {expanded ? "▲" : "▼"}
                    </span>
                  </button>

                  {/* Job body */}
                  {expanded && (
                    <div style={{ padding: "0.6rem 0.8rem", background: "#fafafa" }}>
                      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
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
                            {jobRows.map((row) => {
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

                              const signedUrl = pdfMap[row.id];

                              return (
                                <tr key={row.id}>
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
                                    {signedUrl ? (
                                      <a
                                        href={signedUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="btn-pill"
                                        style={{
                                          textDecoration: "none",
                                          fontSize: "0.75rem",
                                        }}
                                      >
                                        View PDF
                                      </a>
                                    ) : row.pdf_path ? (
                                      <span style={{ color: "#999" }}>Generating…</span>
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
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageLayout>
  );
}

export default Take5Register;
