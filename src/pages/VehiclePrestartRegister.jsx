import { useCallback, useEffect, useMemo, useState } from "react";
import PageLayout from "../components/PageLayout.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient";

const ALL_SURVEYORS = "__all__";
const MY_SURVEYOR = "__my__";
const ALL_VEHICLES = "__all__";
const MY_VEHICLE = "__my__";
const PDF_BUCKET = "vehicle-prestart-pdfs";
const PDF_SIGNED_URL_SECONDS = 60 * 60;

function profileName(profile) {
  return (profile?.display_name || "").trim() || (profile?.email || "").trim() || "Unnamed";
}

function vehicleLabel(vehicle) {
  if (!vehicle) return "-";
  const registration = vehicle.registration || "-";
  const makeModel = [vehicle.make, vehicle.model].filter(Boolean).join(" ").trim() || "-";
  const year = vehicle.year == null || vehicle.year === "" ? "-" : String(vehicle.year);
  return `${registration} — ${makeModel} — ${year}`;
}

function perthDateString(value) {
  return value
    ? new Date(value).toLocaleDateString("en-CA", { timeZone: "Australia/Perth" })
    : "";
}

function formatDateTime(value) {
  return value
    ? new Date(value).toLocaleString("en-AU", {
        timeZone: "Australia/Perth",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "-";
}

function isUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function managerAlertInfo(row) {
  const requested = row.notify_manager === true || row.form_data?.notifyManager === true;
  const status = row.manager_alert_status || (requested ? "pending" : "not_required");

  if (!requested || status === "not_required") {
    return { label: "Not requested", detail: "", tone: "neutral" };
  }

  if (status === "pending") return { label: "Pending", detail: "", tone: "warning" };
  if (status === "processing") return { label: "Sending", detail: "", tone: "info" };
  if (status === "sent") {
    return {
      label: "Sent",
      detail: row.manager_alert_sent_at ? formatDateTime(row.manager_alert_sent_at) : "",
      tone: "success",
    };
  }
  if (status === "failed") {
    return {
      label: "Failed",
      detail: row.manager_alert_error || "Delivery failed",
      tone: "danger",
    };
  }

  return { label: "Not requested", detail: "", tone: "neutral" };
}

function managerAlertPillStyle(tone) {
  const colours = {
    neutral: { backgroundColor: "#eef2f7", color: "#4b5563" },
    warning: { backgroundColor: "#fff3cd", color: "#7a5b00" },
    info: { backgroundColor: "#dbeafe", color: "#1d4ed8" },
    success: { backgroundColor: "#dcfce7", color: "#166534" },
    danger: { backgroundColor: "#fee2e2", color: "#991b1b" },
  };

  return {
    display: "inline-block",
    padding: "0.1rem 0.5rem",
    borderRadius: 999,
    fontSize: "0.75rem",
    fontWeight: 700,
    whiteSpace: "nowrap",
    ...(colours[tone] || colours.neutral),
  };
}

function normalizePdfPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (isUrl(raw)) return raw;

  return raw
    .replace(/^\/+/, "")
    .replace(new RegExp(`^${PDF_BUCKET}/`), "")
    .replace(/^storage\/v1\/object\/(?:sign|public)\//, "")
    .replace(new RegExp(`^${PDF_BUCKET}/`), "");
}

function pdfReference(row) {
  const candidates = [
    row.pdf_path,
    row.form_data?.pdfPath,
    row.form_data?.pdf_path,
    row.form_data?.pdfUrl,
    row.form_data?.pdf_url,
    row.form_data?.attachmentUrl,
    row.form_data?.attachment_url,
  ];

  for (const candidate of candidates) {
    const ref = normalizePdfPath(candidate);
    if (ref) return ref;
  }

  return "";
}

function VehiclePrestartRegister() {
  const { user, profile, displayName } = useAuth();

  const [staff, setStaff] = useState([]);
  const [myDisplayName, setMyDisplayName] = useState("");
  const [surveyorMode, setSurveyorMode] = useState(MY_SURVEYOR);
  const [vehicles, setVehicles] = useState([]);
  const [vehicleMode, setVehicleMode] = useState(MY_VEHICLE);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [error, setError] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [pdfMap, setPdfMap] = useState({});
  const [openingPdfId, setOpeningPdfId] = useState("");

  const myProfileId = profile?.id || user?.id || "";

  const selectedSurveyor = useMemo(() => {
    if (surveyorMode === ALL_SURVEYORS) return ALL_SURVEYORS;
    if (surveyorMode === MY_SURVEYOR) return (myDisplayName || "").trim();
    return (surveyorMode || "").trim();
  }, [myDisplayName, surveyorMode]);

  const surveyorDropdownOptions = useMemo(() => {
    const list = staff.map((p) => p.name).filter(Boolean);
    return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b));
  }, [staff]);

  const selectedVehicle = useMemo(() => {
    if (vehicleMode === ALL_VEHICLES) return null;
    if (vehicleMode === MY_VEHICLE) {
      return vehicles.find((vehicle) => vehicle.assigned_to && vehicle.assigned_to === myProfileId) || null;
    }
    return vehicles.find((vehicle) => vehicle.id === vehicleMode) || null;
  }, [myProfileId, vehicleMode, vehicles]);

  const selectedVehicleId = selectedVehicle?.id || "";
  const selectedVehicleRegistration = (selectedVehicle?.registration || "").trim();

  const loadFilters = useCallback(async () => {
    if (!user) return;

    setFiltersLoading(true);
    try {
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, display_name, email, is_active")
        .eq("is_active", true)
        .order("display_name", { ascending: true });

      if (profileError) throw profileError;

      const profileList = (profiles || [])
        .map((p) => ({
          id: p.id,
          name: profileName(p),
          email: p.email,
        }))
        .filter((p) => p.name)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

      setStaff(profileList);

      const me =
        profileList.find((p) => p.id === myProfileId) ||
        profileList.find((p) => p.id === user?.id) ||
        profileList.find((p) => p.email === user?.email);
      const fallback = displayName || user?.user_metadata?.full_name || user?.email || "";
      setMyDisplayName((me?.name || fallback || "").trim());

      const profileNameMap = new Map(profileList.map((p) => [p.id, p.name]));
      const { data: equipmentRows, error: equipmentError } = await supabase
        .from("equipment_register")
        .select("id, equipment_type, registration_number, make, model, year, assigned_to")
        .eq("equipment_type", "Vehicle");

      if (equipmentError) throw equipmentError;

      const vehicleOptions = (equipmentRows || [])
        .map((row) => ({
          id: row.id,
          registration: row.registration_number || "",
          make: row.make || "",
          model: row.model || "",
          year: row.year ?? "",
          assigned_to: row.assigned_to || "",
          assignedName: profileNameMap.get(row.assigned_to) || "-",
        }))
        .sort((a, b) => (a.registration || "").localeCompare(b.registration || "", undefined, { sensitivity: "base" }));

      setVehicles(vehicleOptions);
      setVehicleMode(vehicleOptions.some((vehicle) => vehicle.assigned_to && vehicle.assigned_to === myProfileId) ? MY_VEHICLE : ALL_VEHICLES);
    } catch (err) {
      console.warn("Vehicle Prestart Register filter load failed:", err);
      setStaff([]);
      setVehicles([]);
      setVehicleMode(ALL_VEHICLES);
      setMyDisplayName((displayName || user?.user_metadata?.full_name || user?.email || "").trim());
    } finally {
      setFiltersLoading(false);
    }
  }, [displayName, myProfileId, user]);

  useEffect(() => {
    loadFilters();
  }, [loadFilters, refreshKey]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    setPdfError("");
    setPdfMap({});

    try {
      let query = supabase
        .from("vehicle_prestart_submissions")
        .select(
          "id, vehicle_label, vehicle_equipment_id, employee_name, employee_profile_id, odometer, created_at, form_data, pdf_path, employee_signed_off, employee_signed_off_at, signed_off_employee_name, submitted_status, submitted_at, notify_manager, manager_alert_status, manager_alert_sent_at, manager_alert_error"
        )
        .order("created_at", { ascending: false });

      const { data, error: qError } = await query;
      if (qError) throw qError;

      let fetched = data || [];

      if (selectedSurveyor !== ALL_SURVEYORS) {
        if (!selectedSurveyor) {
          setRows([]);
          setLoading(false);
          return;
        }

        const staffMatch = staff.find((person) => person.name === selectedSurveyor);
        fetched = fetched.filter((row) => {
          const rowProfileId = row.employee_profile_id || row.form_data?.employeeId || "";
          if (staffMatch?.id && rowProfileId && rowProfileId === staffMatch.id) return true;
          return String(row.employee_name || row.form_data?.employeeName || "") === selectedSurveyor;
        });
      }

      if (dateFilter) {
        fetched = fetched.filter((row) => {
          const submittedAt = row.submitted_at || row.form_data?.submittedAt || row.created_at;
          return perthDateString(submittedAt) === dateFilter;
        });
      }

      if (selectedVehicleId) {
        const registration = selectedVehicleRegistration.toLowerCase();
        fetched = fetched.filter((row) => {
          const rowEquipmentId = row.vehicle_equipment_id || row.form_data?.vehicleEquipmentId || "";
          if (rowEquipmentId && rowEquipmentId === selectedVehicleId) return true;

          const rowLabel = String(row.vehicle_label || row.form_data?.vehicle || "").toLowerCase();
          return registration && rowLabel.includes(registration);
        });
      }

      setRows(fetched);

      const map = {};
      await Promise.all(
        fetched.map(async (row) => {
          const ref = pdfReference(row);
          if (!ref) return;

          if (isUrl(ref)) {
            map[row.id] = ref;
            return;
          }

          try {
            const { data: signed, error: signedError } = await supabase.storage
              .from(PDF_BUCKET)
              .createSignedUrl(ref, PDF_SIGNED_URL_SECONDS);

            if (signedError) throw signedError;
            if (signed?.signedUrl) map[row.id] = signed.signedUrl;
          } catch (signedErr) {
            console.warn("Vehicle Prestart Register signed URL error", {
              rowId: row.id,
              pdfPath: ref,
              error: signedErr,
            });
          }
        })
      );

      setPdfMap(map);
    } catch (err) {
      console.error("Vehicle Prestart Register load failed:", err);
      setError("Failed to load Vehicle Pre Start submissions.");
    } finally {
      setLoading(false);
    }
  }, [dateFilter, selectedSurveyor, selectedVehicleId, selectedVehicleRegistration, staff]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const handleRefresh = useCallback(() => {
    setDateFilter("");
    setSurveyorMode(MY_SURVEYOR);
    setVehicleMode(MY_VEHICLE);
    setPdfError("");
    setPdfMap({});
    setRefreshKey((key) => key + 1);
  }, []);

  const hasAnyFails = (row) => {
    const checks = row.form_data?.checks || {};
    return Object.values(checks).some((v) => v === "No");
  };

  const getSignoff = (row) => {
    const signature = row.form_data?.signature || {};
    const confirmed =
      typeof row.employee_signed_off === "boolean"
        ? row.employee_signed_off
        : typeof signature.confirmed === "boolean"
          ? signature.confirmed
          : null;

    return {
      confirmed,
      name: row.signed_off_employee_name || signature.name || "",
      signedAt: row.employee_signed_off_at || signature.signedAt || "",
    };
  };

  const openPdf = async (row) => {
    const ref = pdfReference(row);
    if (!ref || openingPdfId === row.id) return;

    setOpeningPdfId(row.id);
    setPdfError("");

    try {
      console.info("Vehicle Pre Start PDF open requested", { rowId: row.id, pdfPath: ref });

      if (isUrl(ref)) {
        window.open(ref, "_blank", "noopener,noreferrer");
        return;
      }

      const cached = pdfMap[row.id];
      if (cached) {
        window.open(cached, "_blank", "noopener,noreferrer");
        return;
      }

      const { data, error: signedError } = await supabase.storage
        .from(PDF_BUCKET)
        .createSignedUrl(ref, PDF_SIGNED_URL_SECONDS);

      if (signedError) throw signedError;
      if (!data?.signedUrl) throw new Error("No signed PDF URL returned.");

      setPdfMap((prev) => ({ ...prev, [row.id]: data.signedUrl }));
      console.info("Vehicle Pre Start signed PDF URL created", { rowId: row.id });
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("Vehicle Prestart PDF open failed:", { rowId: row.id, pdfPath: ref, error: err });
      setPdfError("The PDF could not be opened. The attachment may be missing or unavailable.");
    } finally {
      setOpeningPdfId("");
    }
  };

  const showingLabel = useMemo(() => {
    const count = rows.length;
    const parts = [`${count} Vehicle Pre Start${count === 1 ? "" : "s"}`];

    if (selectedSurveyor !== ALL_SURVEYORS && selectedSurveyor) parts.push(`for ${selectedSurveyor}`);
    if (selectedVehicle) parts.push(`Vehicle ${selectedVehicle.registration || "-"}`);
    if (dateFilter) parts.push(new Date(`${dateFilter}T00:00:00+08:00`).toLocaleDateString("en-AU", { timeZone: "Australia/Perth" }));

    return parts.join(" • ");
  }, [dateFilter, rows.length, selectedSurveyor, selectedVehicle]);

  return (
    <PageLayout
      data-vehicle-prestart-register
      icon="📋"
      title="Vehicle Pre Start Register"
      subtitle="List of submitted vehicle pre-starts"
      actions={
        <button
          className="btn-pill"
          type="button"
          onClick={handleRefresh}
          disabled={loading || filtersLoading}
          title="Refresh Vehicle Pre Start register"
        >
          {loading || filtersLoading ? "Refreshing..." : "Refresh"}
        </button>
      }
    >
      <div className="card">
        <h3 className="card-title">Filter</h3>
        <p className="card-subtitle">
          Filter by date, surveyor, and vehicle. Defaults to your assigned vehicle and your submissions where available.
        </p>

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
            onChange={(e) => setSurveyorMode(e.target.value)}
            disabled={!user || loading || filtersLoading}
          >
            <option value={MY_SURVEYOR}>My Vehicle Pre Starts</option>
            <option value={ALL_SURVEYORS}>All</option>
            <option disabled>────────</option>
            {surveyorDropdownOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="card-row" style={{ marginTop: "0.6rem" }}>
          <span className="card-row-label">Vehicle</span>
          <select
            className="maps-search-input"
            aria-label="Filter by vehicle"
            style={{ maxWidth: "360px" }}
            value={vehicleMode}
            onChange={(e) => setVehicleMode(e.target.value)}
            disabled={loading || filtersLoading}
          >
            <option value={MY_VEHICLE}>My assigned vehicle</option>
            <option value={ALL_VEHICLES}>All Vehicles</option>
            <option disabled>────────</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicleLabel(vehicle)}
              </option>
            ))}
          </select>
        </div>

        <div className="card-row" style={{ marginTop: "0.6rem" }}>
          <span className="card-row-label">Showing</span>
          <span className="card-row-value">
            <b>{rows.length}</b> {showingLabel.replace(/^\d+ /, "")}
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
            Loading...
          </div>
        )}

        {error && (
          <div className="vehicle-prestart-message error" role="alert">
            {error}
          </div>
        )}

        {pdfError && (
          <div className="vehicle-prestart-message error" role="alert">
            {pdfError}
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
                  {["Vehicle", "Employee", "Status", "Date", "Odometer", "Any Fails?", "Manager Alert", "Sign-off", "PDF"].map((heading) => (
                    <th
                      key={heading}
                      style={{
                        borderBottom: "1px solid #f3e1e1",
                        textAlign: "left",
                        padding: "0.35rem",
                      }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const submittedAt = row.submitted_at || row.form_data?.submittedAt || row.created_at;
                  const fails = hasAnyFails(row);
                  const signoff = getSignoff(row);
                  const status = row.submitted_status || row.form_data?.submittedStatus || "submitted";
                  const alert = managerAlertInfo(row);
                  const ref = pdfReference(row);
                  const pdfUrl = pdfMap[row.id];
                  const opening = openingPdfId === row.id;

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
                        {row.vehicle_label || row.form_data?.vehicle || "-"}
                      </td>
                      <td style={{ borderBottom: "1px solid #f8e0e0", padding: "0.35rem" }}>
                        {row.employee_name || row.form_data?.employeeName || "-"}
                      </td>
                      <td style={{ borderBottom: "1px solid #f8e0e0", padding: "0.35rem" }}>
                        {status === "submitted" ? "Submitted" : status === "pdf_pending" ? "PDF pending" : status || "-"}
                      </td>
                      <td style={{ borderBottom: "1px solid #f8e0e0", padding: "0.35rem" }}>
                        {formatDateTime(submittedAt)}
                      </td>
                      <td style={{ borderBottom: "1px solid #f8e0e0", padding: "0.35rem" }}>
                        {row.odometer ?? row.form_data?.odometer ?? "-"}
                      </td>
                      <td style={{ borderBottom: "1px solid #f8e0e0", padding: "0.35rem" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "0.1rem 0.5rem",
                            borderRadius: 999,
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            backgroundColor: fails ? "#e53935" : "#2e7d32",
                            color: "#fff",
                          }}
                        >
                          {fails ? "Yes" : "No"}
                        </span>
                      </td>
                      <td style={{ borderBottom: "1px solid #f8e0e0", padding: "0.35rem", minWidth: "120px" }}>
                        <span style={managerAlertPillStyle(alert.tone)}>{alert.label}</span>
                        {alert.detail ? (
                          <div style={{ color: "#666", fontSize: "0.72rem", marginTop: 2, maxWidth: 180 }}>
                            {alert.detail}
                          </div>
                        ) : null}
                      </td>
                      <td style={{ borderBottom: "1px solid #f8e0e0", padding: "0.35rem" }}>
                        {signoff.confirmed == null ? (
                          "Not recorded"
                        ) : (
                          <div>
                            <div style={{ fontWeight: 700 }}>{signoff.confirmed ? "Signed off" : "Not signed off"}</div>
                            <div style={{ color: "#666", fontSize: "0.74rem", marginTop: 2 }}>
                              {signoff.name || "-"}
                              {signoff.signedAt ? ` · ${formatDateTime(signoff.signedAt)}` : ""}
                            </div>
                          </div>
                        )}
                      </td>
                      <td style={{ borderBottom: "1px solid #f8e0e0", padding: "0.35rem" }}>
                        {ref ? (
                          <button
                            type="button"
                            className="btn-pill"
                            style={{ fontSize: "0.75rem" }}
                            onClick={() => openPdf(row)}
                            disabled={opening}
                          >
                            {opening ? "Opening..." : pdfUrl || isUrl(ref) ? "View PDF" : "Preparing..."}
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
      </div>
    </PageLayout>
  );
}

export default VehiclePrestartRegister;
