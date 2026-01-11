import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import PageLayout from "../components/PageLayout.jsx";
import { supabase } from "../lib/supabaseClient";

function addressSummaryFromRow(r) {
  const a =
    (r?.full_address || "").trim() ||
    [r?.street_number, r?.street_name, r?.suburb].filter(Boolean).join(" ").trim() ||
    (r?.suburb || "").trim() ||
    "—";
  return a;
}

function Take5Register() {
  const [rows, setRows] = useState([]);
  const [pdfMap, setPdfMap] = useState({}); // { [rowId]: signedUrl }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ✅ Job filter with autosuggest (same approach as Jobs.jsx / Take5.jsx)
  const [jobFilter, setJobFilter] = useState("");
  const [jobFilterSuggestions, setJobFilterSuggestions] = useState([]);
  const [jobFilterLoading, setJobFilterLoading] = useState(false);
  const debounceJobFilterRef = useRef(null);

  const [expandedJobs, setExpandedJobs] = useState({}); // { [jobNumber]: bool }

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
  }, [jobFilter]);

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
          Filter by job number. Leave blank to show all.
        </p>

        <div className="card-row" style={{ marginTop: "0.4rem", alignItems: "flex-start" }}>
          <span className="card-row-label" style={{ paddingTop: 8 }}>Job number</span>

          <div style={{ width: "100%", maxWidth: 320 }}>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              aria-label="Filter by job number"
              value={jobFilter}
              onChange={(e) => setJobFilter(e.target.value)}
              onFocus={() => runJobFilterSuggest(jobFilter)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setJobFilterSuggestions([]);
                if (e.key === "Escape") setJobFilterSuggestions([]);
              }}
              className="maps-search-input"
              placeholder={`e.g. 101441${jobFilterLoading ? "…" : ""}`}
              style={{ width: "100%" }}
            />

            {jobFilterSuggestions.length > 0 && (
              <div
                style={{
                  marginTop: 8,
                  borderRadius: 14,
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(20,20,25,0.95)",
                  boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
                  maxHeight: 280,
                  overflowY: "auto",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                {jobFilterSuggestions.map((j) => (
                  <button
                    key={j.id}
                    className="btn-pill"
                    style={{
                      width: "100%",
                      justifyContent: "flex-start",
                      borderRadius: 0,
                      padding: "10px 12px",
                      background: "transparent",
                      textAlign: "left",
                      whiteSpace: "normal",
                    }}
                    type="button"
                    onClick={() => {
                      setJobFilter(String(j.job_number));
                      setJobFilterSuggestions([]);
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 950, color: "#fff" }}>#{j.job_number}</div>
                      <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2, color: "#fff" }}>
                        {j.address}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {jobFilter.trim() && (
              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn-pill"
                  onClick={() => {
                    setJobFilter("");
                    setJobFilterSuggestions([]);
                  }}
                  style={{ fontSize: "0.8rem" }}
                >
                  Clear filter
                </button>
              </div>
            )}
          </div>
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
