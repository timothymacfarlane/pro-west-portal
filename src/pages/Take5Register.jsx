import { useEffect, useMemo, useState } from "react";
import PageLayout from "../components/PageLayout.jsx";
import { supabase } from "../lib/supabaseClient";

function Take5Register() {
  const [rows, setRows] = useState([]);
  const [pdfMap, setPdfMap] = useState({}); // { [rowId]: signedUrl }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [jobFilter, setJobFilter] = useState("");
  const [expandedJobs, setExpandedJobs] = useState({}); // { [jobNumber]: bool }

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
    <PageLayout data-take5-register
      icon="📋"
      title="Take 5 Register"
      subtitle="List of submitted Take 5s with links to PDFs"
    >
      <div className="card">
        <h3 className="card-title">Filter</h3>
        <p className="card-subtitle">
          Filter by job number. Leave blank to show all.
        </p>
        <div className="card-row" style={{ marginTop: "0.4rem" }}>
          <span className="card-row-label">Job number</span>
          <input
            type="text"
            inputMode="numeric"
            aria-label="Filter by job number"
            value={jobFilter}
            onChange={(e) => setJobFilter(e.target.value)}
            className="maps-search-input"
            placeholder="e.g. 101441"
            style={{ maxWidth: "200px" }}
          />
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
          <div style={{ marginTop: "0.8rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
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
                              const submittedAt =
                                row.form_data?.submittedAt || row.created_at;
                            const dateStr = submittedAt
  ? new Date(submittedAt).toLocaleString("en-AU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
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
                                      <span style={{ color: "#999" }}>
                                        Generating…
                                      </span>
                                    ) : (
                                      <span style={{ color: "#999" }}>
                                        No PDF
                                      </span>
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
