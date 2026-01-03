import { useEffect, useMemo, useState } from "react";
import PageLayout from "../components/PageLayout.jsx";
import { supabase } from "../lib/supabaseClient";

function VehiclePrestartRegister() {
  const [rows, setRows] = useState([]);
  const [pdfMap, setPdfMap] = useState({}); // { [rowId]: signedUrl }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [expandedVehicles, setExpandedVehicles] = useState({}); // { [vehicleLabel]: bool }

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError("");
      setPdfMap({});

      try {
        let query = supabase
          .from("vehicle_prestart_submissions")
          .select(
            "id, vehicle_label, employee_name, odometer, created_at, form_data, pdf_path"
          )
          .order("created_at", { ascending: false });

        if (vehicleFilter.trim()) {
          query = query.ilike("vehicle_label", `%${vehicleFilter.trim()}%`);
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
                .from("vehicle-prestart-pdfs")
                .createSignedUrl(row.pdf_path, 60 * 60); // 1 hour

              if (!sErr && signed?.signedUrl) {
                map[row.id] = signed.signedUrl;
              }
            } catch (e) {
              console.warn("Signed URL error for row", row.id, e);
            }
          })
        );

        setPdfMap(map);
      } catch (err) {
        console.error(err);
        setError("Failed to load Vehicle Pre Start submissions.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [vehicleFilter]);

  // Group rows by vehicle
  const groupedByVehicle = useMemo(() => {
    const groups = {};
    rows.forEach((r) => {
      const veh = r.vehicle_label || "Unknown Vehicle";
      if (!groups[veh]) groups[veh] = [];
      groups[veh].push(r);
    });
    return groups;
  }, [rows]);

  const toggleVehicle = (veh) => {
    setExpandedVehicles((prev) => ({ ...prev, [veh]: !prev[veh] }));
  };

  const hasAnyFails = (row) => {
    const checks = row.form_data?.checks || {};
    return Object.values(checks).some((v) => v === "No");
  };

  return (
    <PageLayout data-vehicle-prestart-register
      icon="📋"
      title="Vehicle Pre Start Register"
      subtitle="List of submitted vehicle pre-starts"
    >
      {/* Filter card */}
      <div className="card">
        <h3 className="card-title">Filter</h3>
        <p className="card-subtitle">
          Filter by vehicle (e.g. rego). Leave blank to show all.
        </p>
        <div className="card-row" style={{ marginTop: "0.4rem" }}>
          <span className="card-row-label">Vehicle</span>
          <input
            type="text"
            inputMode="text"
            aria-label="Filter by vehicle registration"
            value={vehicleFilter}
            onChange={(e) => setVehicleFilter(e.target.value)}
            className="maps-search-input"
            placeholder="Registration #"
            style={{ maxWidth: "220px" }}
          />
        </div>
      </div>

      {/* Results card */}
      <div className="card">
        <h3 className="card-title">Submissions</h3>
        <p className="card-subtitle">
          Expand a vehicle to see its pre-start history. Click View PDF to open
          the summary.
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
            {Object.entries(groupedByVehicle).map(([vehicleLabel, vehRows]) => {
              const expanded = !!expandedVehicles[vehicleLabel];

              return (
                <div
                  key={vehicleLabel}
                  style={{
                    border: "1px solid #f3e1e1",
                    borderRadius: 8,
                    overflow: "hidden",
                  }}
                >
                  {/* Vehicle header */}
                  <button
                    type="button"
                    aria-label={`Toggle vehicle ${vehicleLabel}`}
                    onClick={() => toggleVehicle(vehicleLabel)}
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
                    <span>{vehicleLabel}</span>
                    <span style={{ fontSize: "0.8rem", color: "#777" }}>
                      {vehRows.length} pre-start
                      {vehRows.length > 1 ? "s" : ""} {expanded ? "▲" : "▼"}
                    </span>
                  </button>

                  {/* Vehicle body */}
                  {expanded && (
                    <div
                      style={{
                        padding: "0.6rem 0.8rem",
                        background: "#fafafa",
                      }}
                    >
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
                                Date
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
                                Odometer
                              </th>
                              <th
                                style={{
                                  borderBottom: "1px solid #f3e1e1",
                                  textAlign: "left",
                                  padding: "0.35rem",
                                }}
                              >
                                Any Fails?
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
                            {vehRows.map((row) => {
                              const submittedAt =
                                row.form_data?.submittedAt || row.created_at;
                              const dateStr = submittedAt
                                ? new Date(submittedAt).toLocaleString(
                                    "en-AU",
                                    {
                                      day: "2-digit",
                                      month: "2-digit",
                                      year: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      hour12: false,
                                    }
                                  )
                                : "-";

                              const fails = hasAnyFails(row);
                              const signedUrl = pdfMap[row.id];

                              return (
                                <tr key={row.id}>
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
                                    {row.employee_name}
                                  </td>
                                  <td
                                    style={{
                                      borderBottom: "1px solid #f8e0e0",
                                      padding: "0.35rem",
                                    }}
                                  >
                                    {row.odometer || "-"}
                                  </td>
                                  <td
                                    style={{
                                      borderBottom: "1px solid #f8e0e0",
                                      padding: "0.35rem",
                                    }}
                                  >
                                    <span
                                      style={{
                                        display: "inline-block",
                                        padding: "0.1rem 0.5rem",
                                        borderRadius: 999,
                                        fontSize: "0.75rem",
                                        fontWeight: 600,
                                        backgroundColor: fails
                                          ? "#e53935"
                                          : "#2e7d32",
                                        color: "#fff",
                                      }}
                                    >
                                      {fails ? "Yes" : "No"}
                                    </span>
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

export default VehiclePrestartRegister;
