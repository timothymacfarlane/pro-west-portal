import { useEffect, useMemo, useState } from "react";
import PageLayout from "../components/PageLayout.jsx";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";
import { jsPDF } from "jspdf";

// Reuse the Yes/No toggle behaviour from Take5
const yesNoOptions = ["Yes", "No"];
const yesNaNoOptions = ["Yes", "N/A", "No"]; // Yes | N/A | No

/**
 * colorMode:
 *  - "traffic": Yes=green, No=red (N/A grey)
 *  - "allGreen": any selected option green
 *  - "inverseTraffic": unused here but kept for consistency
 */
function YesNoToggle({
  value,
  onChange,
  colorMode = "traffic",
  options = yesNoOptions,
}) {
  return (
    <div style={{ display: "inline-flex", borderRadius: 6, overflow: "hidden" }}>
      {options.map((opt) => {
        const selected = value === opt;

        let selectedBg = "#2e7d32"; // green
        let selectedBorder = "#1b5e20";

        if (opt === "N/A" && colorMode !== "allGreen") {
          selectedBg = "#616161";
          selectedBorder = "#424242";
        }

        if (colorMode === "traffic") {
          if (opt === "No") {
            selectedBg = "#c62828"; // red
            selectedBorder = "#8e0000";
          }
        }

        if (colorMode === "inverseTraffic") {
          if (opt === "Yes") {
            selectedBg = "#c62828"; // red
            selectedBorder = "#8e0000";
          }
          if (opt === "No") {
            selectedBg = "#2e7d32"; // green
            selectedBorder = "#1b5e20";
          }
        }

        if (colorMode === "allGreen") {
          selectedBg = "#2e7d32";
          selectedBorder = "#1b5e20";
        }

        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            style={{
              border: `1px solid ${selected ? selectedBorder : "#ccc"}`,
              padding: "0.35rem 0.85rem",
              fontSize: "0.85rem",
              cursor: "pointer",
              background: selected ? selectedBg : "#fff",
              color: selected ? "#fff" : "#333",
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// Checklist configuration – copied from your screenshots
const CHECK_ITEMS = [
  // --- Checks ---
  {
    id: "wheels_tyres",
    group: "Checks",
    label: "Wheels and tyres in good roadworthy condition",
    allowNa: false,
  },
  {
    id: "seats_seatbelts",
    group: "Checks",
    label: "Seats and seatbelts in good condition",
    allowNa: false,
  },
  {
    id: "lamps_indicators_reflectors",
    group: "Checks",
    label:
      "All lamps, indicators and reflectors visible, in a good condition and working order",
    allowNa: false,
  },
  {
    id: "windscreen_mirrors",
    group: "Checks",
    label: "Windscreen/Mirrors clean and in good condition",
    allowNa: false,
  },
  {
    id: "washers_wipers",
    group: "Checks",
    label: "Window washer and wipers working",
    allowNa: false,
  },
  { id: "horn", group: "Checks", label: "Horn working", allowNa: false },
  {
    id: "first_aid",
    group: "Checks",
    label: "First aid kit in vehicle and items in date",
    allowNa: false,
  },
  {
    id: "fire_extinguisher",
    group: "Checks",
    label: "Fire extinguisher in vehicle and last inspected within 6 months",
    allowNa: false,
  },
  {
    id: "camera_reverse_siren",
    group: "Checks",
    label: "Camera and/or Reverse siren working",
    allowNa: true,
  },
  {
    id: "beacon",
    group: "Checks",
    label: "Beacon in good condition and in working order",
    allowNa: true,
  },
  {
    id: "safety_equipment",
    group: "Checks",
    label:
      "Safety equipment in good working order (eg: Hard hats less than 5 years old)",
    allowNa: true,
  },
  {
    id: "interior_clean",
    group: "Checks",
    label: "Interior of the vehicle is clean, tidy and in good condition",
    allowNa: true,
  },
  {
    id: "vehicle_strap_constraint",
    group: "Checks",
    label: "Vehicle strap constraint in working condition",
    allowNa: true,
  },
  {
    id: "spray_cans",
    group: "Checks",
    label:
      "Spray can/s stowed in appropriate storage solution (i.e. esky or lined compartment)",
    allowNa: true,
  },

  // --- Okay (fluid / levels) ---
  {
    id: "washer_fluid",
    group: "Okay",
    label: "Window washer fluid level",
    allowNa: false,
  },
  {
    id: "oil_levels",
    group: "Okay",
    label: "Oil levels (brake, clutch and engine)",
    allowNa: false,
  },
  {
    id: "radiator_coolant",
    group: "Okay",
    label: "Radiator coolant overflow tank level (When cold)",
    allowNa: false,
  },
  {
    id: "battery_fluid",
    group: "Okay",
    label: "Battery fluid and connections free from corrosion",
    allowNa: false,
  },
  {
    id: "spare_tyre",
    group: "Okay",
    label:
      "Does the vehicle have a spare tyre that's in a roadworthy condition",
    allowNa: false,
  },
  {
    id: "air_conditioning",
    group: "Okay",
    label: "Air conditioning in working order",
    allowNa: false,
  },
  {
    id: "fuel_level",
    group: "Okay",
    label: "Fuel level (petrol/diesel)",
    allowNa: false,
  },
];

const GROUP_ORDER = ["Checks", "Okay"];

/* ---------------- PDF helpers (mirroring Take 5 style) ---------------- */

const PDF_COLOURS = {
  green: "#2e7d32",
  blue: "#0b79ff",
  yellow: "#ffca28",
  red: "#e53935",
  grey: "#616161",
  textWhite: "#ffffff",
  headerRed: "#B71C1C",
  sectionFill: "#f6f6f6",
  border: "#e6e6e6",
};

function getYNStyle(mode, value) {
  if (!value) return { bg: PDF_COLOURS.grey, text: PDF_COLOURS.textWhite };

  if (mode === "allGreen") {
    return { bg: PDF_COLOURS.green, text: PDF_COLOURS.textWhite };
  }

  if (value === "NA" || value === "N/A") {
    return { bg: PDF_COLOURS.grey, text: PDF_COLOURS.textWhite };
  }

  if (mode === "inverseTraffic") {
    if (value === "No") return { bg: PDF_COLOURS.green, text: PDF_COLOURS.textWhite };
    if (value === "Yes") return { bg: PDF_COLOURS.red, text: PDF_COLOURS.textWhite };
  }

  if (value === "Yes") return { bg: PDF_COLOURS.green, text: PDF_COLOURS.textWhite };
  if (value === "No") return { bg: PDF_COLOURS.red, text: PDF_COLOURS.textWhite };

  return { bg: PDF_COLOURS.grey, text: PDF_COLOURS.textWhite };
}

function drawYesNoPill(doc, label, x, y, mode) {
  const { bg, text } = getYNStyle(mode, label);
  const w = 22;
  const h = 7.5;

  doc.setFillColor(bg);
  doc.roundedRect(x, y - 5.2, w, h, 2, 2, "F");

  doc.setTextColor(text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(label || "-", x + 4, y);
}

/* ---------------- Component ---------------- */

function VehiclePrestart() {
  const { user } = useAuth();
  const derivedDisplayName =
    user?.user_metadata?.full_name || user?.email || "";

  const [employeeName, setEmployeeName] = useState(derivedDisplayName);
  const [vehicle, setVehicle] = useState("");
  const [odometer, setOdometer] = useState("");
  const [lastService, setLastService] = useState("");
  const [nextService, setNextService] = useState("");

  const [checks, setChecks] = useState(() => {
    const init = {};
    CHECK_ITEMS.forEach((c) => {
      init[c.id] = "";
    });
    return init;
  });

  const [comments, setComments] = useState("");
  const [notifyManager, setNotifyManager] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [incompleteWarning, setIncompleteWarning] = useState("");
  const [showFailedWarning, setShowFailedWarning] = useState(false);

  const [pdfUrl, setPdfUrl] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState("");

  // sync display name like Take5
  useEffect(() => {
    if (derivedDisplayName) {
      setEmployeeName(derivedDisplayName);
    }
  }, [derivedDisplayName]);

  // Load logo for PDF header
  useEffect(() => {
    const loadLogo = async () => {
      try {
        const res = await fetch("/prowest-logo.jpg");
        const blob = await res.blob();
        const reader = new FileReader();
        reader.onloadend = () => setLogoDataUrl(reader.result);
        reader.readAsDataURL(blob);
      } catch (e) {
        console.warn("Logo failed to load for Vehicle Prestart PDF", e);
      }
    };
    loadLogo();
  }, []);

  // Derived helpers
  const hasAnyNo = useMemo(
    () => Object.values(checks).some((v) => v === "No"),
    [checks]
  );

  const hasUnanswered = useMemo(
    () => Object.values(checks).some((v) => !v),
    [checks]
  );

  const handleCheckChange = (id, value) => {
    setChecks((prev) => ({ ...prev, [id]: value }));
    setIncompleteWarning("");
  };

  const resetForm = () => {
    setVehicle("");
    setOdometer("");
    setLastService("");
    setNextService("");
    setChecks(() => {
      const init = {};
      CHECK_ITEMS.forEach((c) => {
        init[c.id] = "";
      });
      return init;
    });
    setComments("");
    setNotifyManager(false);
    setSubmitError("");
    setSubmitSuccess("");
    setIncompleteWarning("");
    setShowFailedWarning(false);
    setPdfUrl("");
  };

  const basicValidate = () => {
    if (!vehicle.trim()) {
      setIncompleteWarning("Please select a vehicle.");
      return false;
    }
    if (!odometer.trim()) {
      setIncompleteWarning("Please enter the odometer reading.");
      return false;
    }
    if (hasUnanswered) {
      setIncompleteWarning("Please answer all checklist items.");
      return false;
    }
    if (hasAnyNo) {
      if (!comments.trim()) {
        setIncompleteWarning(
          "Please describe the issue(s) in the comments box when any checks are 'No'."
        );
        return false;
      }
      if (!notifyManager) {
        setIncompleteWarning(
          "Please tick 'Notify Manager of Results' when there are any failed checks."
        );
        return false;
      }
    }
    return true;
  };

  const buildFormData = () => ({
    vehicle,
    odometer,
    lastService,
    nextService,
    employeeName,
    checks,
    comments,
    notifyManager,
    submittedAt: new Date().toISOString(),
  });

  // PDF generator – styled like Take 5, but simplified for vehicle checklist
  const generatePdf = (data) => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    let y = 18;
    const lineH = 6.5;
    const left = 10;
    const right = 200;

    const ensureSpace = (needed = 10) => {
      if (y + needed > 280) {
        doc.addPage();
        y = 18;
      }
    };

    // Header bar
    doc.setFillColor(PDF_COLOURS.headerRed);
    doc.rect(0, 0, 210, 18, "F");

    // logo
    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, "PNG", left, 2.2, 40, 13);
      } catch {
        try {
          doc.addImage(logoDataUrl, "JPEG", left, 2.2, 40, 13);
        } catch {
          // ignore
        }
      }
    }

    doc.setTextColor("#fff");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("VEHICLE PRESTART CHECKLIST", 65, 11);

    // Section helper
    const sectionHeader = (title) => {
      ensureSpace(12);
      doc.setFillColor(PDF_COLOURS.sectionFill);
      doc.rect(left, y - 5, right - left, 8, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor("#000");
      doc.text(title, left + 2, y);
      y += 8;
    };

    // Vehicle details
    sectionHeader("Vehicle Details");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor("#000");

    const submittedDate = data.submittedAt
      ? new Date(data.submittedAt).toLocaleString("en-AU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "-";

    doc.text(`Vehicle: ${data.vehicle || "-"}`, left + 2, y);
    y += lineH;
    doc.text(`Odometer: ${data.odometer || "-"} km`, left + 2, y);
    y += lineH;
    doc.text(`Employee: ${data.employeeName || "-"}`, left + 2, y);
    y += lineH;
    if (data.lastService) {
      doc.text(`Last Service: ${data.lastService}`, left + 2, y);
      y += lineH;
    }
    if (data.nextService) {
      doc.text(`Next Service: ${data.nextService}`, left + 2, y);
      y += lineH;
    }
    doc.text(`Submitted: ${submittedDate}`, left + 2, y);
    y += lineH + 2;

    // Checklist
    sectionHeader("Checklist");

    CHECK_ITEMS.forEach((item) => {
      ensureSpace(8);
      const value = data.checks?.[item.id] || "-";

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor("#000");
      doc.text(item.label, left + 2, y);
      drawYesNoPill(doc, value, right - 32, y, "traffic");
      y += lineH;
    });

    y += 2;

    // Comments & notify manager
    sectionHeader("Comments & Manager Notification");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Damage to vehicle / Comments:", left + 2, y);
    y += lineH;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);

    const commentsText = data.comments && data.comments.trim().length
      ? data.comments
      : "None";

    const split = doc.splitTextToSize(commentsText, right - left - 4);
    split.forEach((t) => {
      ensureSpace(7);
      doc.text(t, left + 2, y);
      y += lineH - 1.5;
    });

    y += 3;
    ensureSpace(8);
    doc.setFont("helvetica", "bold");
    doc.text("Notify Manager of Results:", left + 2, y);
    doc.setFont("helvetica", "normal");
    doc.text(data.notifyManager ? "Yes" : "No", left + 65, y);
    y += lineH;

    // Footer
    doc.setFontSize(8);
    doc.setTextColor("#777");
    doc.text("Generated by Pro West Surveying Portal", left, 290);

    return doc;
  };

  // Final submit to Supabase (after any warning confirmation)
  const submitToSupabase = async () => {
    if (!basicValidate()) return;

    setIsSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");
    setPdfUrl("");

    try {
      const formData = buildFormData();

      const { data: inserted, error: insertError } = await supabase
        .from("vehicle_prestart_submissions")
        .insert({
          vehicle_label: vehicle,
          odometer,
          employee_name: employeeName,
          form_data: formData,
          notify_manager: notifyManager,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      const prestartId = inserted.id;

      const pdfDoc = generatePdf(formData);

      let pdfBlob;
      try {
        pdfBlob = pdfDoc.output("blob");
      } catch {
        const ab = pdfDoc.output("arraybuffer");
        pdfBlob = new Blob([ab], { type: "application/pdf" });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const vehicleSafe = (vehicle || "vehicle").replace(
        /[^a-zA-Z0-9_-]/g,
        "_"
      );
      const path = `${vehicleSafe}/prestart/${prestartId}_${timestamp}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from("vehicle-prestart-pdfs")
        .upload(path, pdfBlob, { contentType: "application/pdf" });

      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from("vehicle_prestart_submissions")
        .update({ pdf_path: path })
        .eq("id", prestartId);

      if (updateError) throw updateError;

      const { data: signed, error: signedErr } = await supabase.storage
        .from("vehicle-prestart-pdfs")
        .createSignedUrl(path, 60 * 60);

      if (!signedErr && signed?.signedUrl) {
        setPdfUrl(signed.signedUrl);
      }

      setSubmitSuccess(
        "Vehicle pre-start submitted and PDF saved successfully."
      );
      setIncompleteWarning("");
    } catch (err) {
      console.error(err);
      setSubmitError(
        "There was a problem submitting the Vehicle Pre Start. Please try again."
      );
    } finally {
      setIsSubmitting(false);
      setShowFailedWarning(false);
    }
  };

  const handleSubmitClick = () => {
    setIncompleteWarning("");
    setSubmitError("");
    setSubmitSuccess("");
    setPdfUrl("");

    if (!basicValidate()) return;

    if (hasAnyNo) {
      // Show confirmation like the Take 5 "red" warning
      setShowFailedWarning(true);
      return;
    }

    submitToSupabase();
  };

  const renderFailedWarningModal = () => {
    if (!showFailedWarning) return null;

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 60,
        }}
        onClick={() => setShowFailedWarning(false)}
      >
        <div
          className="card"
          style={{ width: "92%", maxWidth: 420, padding: "1rem" }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 style={{ marginTop: 0 }}>Vehicle Safety Check</h3>
          <p style={{ fontSize: "0.9rem", color: "#555" }}>
            One or more checklist items have been marked{" "}
            <strong>No</strong>. The vehicle may not be safe to use. Are you
            sure you want to submit this Vehicle Pre Start and notify the
            manager?
          </p>

          <div
            style={{
              display: "flex",
              gap: "0.6rem",
              justifyContent: "flex-end",
              marginTop: "1rem",
            }}
          >
            <button
              className="btn-pill"
              type="button"
              onClick={() => setShowFailedWarning(false)}
            >
              No
            </button>
            <button
              className="btn-pill primary"
              type="button"
              onClick={submitToSupabase}
            >
              Yes, submit
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Group checklist items by heading (Checks / Okay)
  const groupedItems = useMemo(() => {
    const groups = {};
    CHECK_ITEMS.forEach((item) => {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    });
    return groups;
  }, []);

  return (
    <PageLayout data-vehicle-prestart
      icon="🚗"
      title="Vehicle Pre Start"
      subtitle="Vehicle Checklist"
      actions={
        <button className="btn-pill" type="button" onClick={resetForm}>
          Start Over
        </button>
      }
    >
      {renderFailedWarningModal()}

      {/* Top card – vehicle & service info */}
      <div className="card">
        <h3 className="card-title">Vehicle Details</h3>
        <p className="card-subtitle">
          Select the vehicle and complete the checklist before driving.
        </p>

        <div
          style={{
            marginTop: "0.6rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
          }}
        >
          <div className="card-row">
            <span className="card-row-label">Vehicle</span>
            {/* Change this to a real select fed from Supabase later */}
            <input
              type="text"
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value)}
              aria-label="Vehicle registration"
              placeholder="Registration #"
              className="maps-search-input"
              style={{ maxWidth: "260px" }}
            />
          </div>

          <div className="card-row">
            <span className="card-row-label">Odometer</span>
            <input
              type="number"
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
              aria-label="Odometer reading"
              inputMode="numeric"
              placeholder="km"
              className="maps-search-input"
              style={{ maxWidth: "160px" }}
            />
          </div>

          {/* Optional manual fields for service info – you can wire to a vehicles table later */}
          <div className="card-row">
            <span className="card-row-label">Last Service</span>
            <input
              type="text"
              value={lastService}
              onChange={(e) => setLastService(e.target.value)}
              aria-label="Last service date"
              placeholder="e.g. 10 February 2025"
              className="maps-search-input"
              style={{ maxWidth: "220px" }}
            />
          </div>

          <div className="card-row">
            <span className="card-row-label">Next Service</span>
            <input
              type="text"
              value={nextService}
              onChange={(e) => setNextService(e.target.value)}
              aria-label="Next service date"
              placeholder="e.g. 10 August 2025"
              className="maps-search-input"
              style={{ maxWidth: "220px" }}
            />
          </div>

          <div className="card-row">
            <span className="card-row-label">Employee</span>
            <input
              type="text"
              value={employeeName}
              readOnly
              className="maps-search-input"
              style={{ maxWidth: "260px", backgroundColor: "#f5f5f5" }}
            />
          </div>

          <p style={{ margin: 0, fontSize: "0.75rem", color: "#777" }}>
            Employee name is pulled from your <strong>My Profile</strong> page.
          </p>
        </div>
      </div>

      {/* Checklist card */}
      <div className="card">
        <h3 className="card-title">Checklist</h3>
        <p className="card-subtitle">
          Answer each question before using the vehicle.
        </p>

        {GROUP_ORDER.map((group) => (
          <div key={group} style={{ marginTop: "0.6rem" }}>
            <div
              style={{
                fontWeight: 700,
                marginBottom: "0.4rem",
                fontSize: "0.95rem",
              }}
            >
              {group}
            </div>

            {groupedItems[group].map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  gap: "0.7rem",
                  alignItems: "center",
                  marginBottom: "0.45rem",
                }}
              >
                <YesNoToggle
                  value={checks[item.id]}
                  options={item.allowNa ? yesNaNoOptions : yesNoOptions}
                  onChange={(v) => handleCheckChange(item.id, v)}
                  colorMode="traffic"
                />
                <div
                  style={{
                    fontSize: "0.85rem",
                    lineHeight: 1.4,
                    flex: 1,
                  }}
                >
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Comments & notify manager */}
      <div className="card">
        <h3 className="card-title">Damage to Vehicle / Comments</h3>
        <p className="card-subtitle">
          Note any defects, damage or general comments. Required if any boxes
          are marked <strong>No</strong>.
        </p>

        <textarea
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          rows={4}
          className="maps-search-input"
          style={{ width: "100%", marginTop: "0.4rem", resize: "vertical" }}
          aria-label="Vehicle damage or comments"
          placeholder="Describe any issues found during the pre-start…"
        />

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            marginTop: "0.7rem",
            fontSize: "0.85rem",
          }}
        >
          <input
            type="checkbox"
            checked={notifyManager}
            onChange={(e) => setNotifyManager(e.target.checked)}
          />
          <span>
            Notify Manager of Results{" "}
            <span style={{ color: "#777" }}></span>
          </span>
        </label>
      </div>

      {/* Warnings & submit row */}
      {incompleteWarning && (
        <div
          style={{
            marginTop: "0.7rem",
            padding: "0.6rem 0.8rem",
            borderRadius: 8,
            background: "#fff3e0",
            border: "1px solid #ffcc80",
            color: "#8a4b00",
            fontSize: "0.85rem",
          }}
        >
          ⚠️ {incompleteWarning}
        </div>
      )}

      {submitError && (
        <div
          style={{
            marginTop: "0.6rem",
            fontSize: "0.85rem",
            color: "#b71c1c",
          }}
        >
          {submitError}
        </div>
      )}

      {submitSuccess && (
        <div
          style={{
            marginTop: "0.6rem",
            fontSize: "0.85rem",
            color: "#2e7d32",
          }}
        >
          {submitSuccess}
        </div>
      )}

      {pdfUrl && (
        <div style={{ marginTop: "0.9rem" }}>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-pill primary"
            style={{ display: "inline-block", textDecoration: "none" }}
          >
            View PDF
          </a>
        </div>
      )}

      <div
        style={{
          marginTop: "0.8rem",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <button
          type="button"
          className="btn-pill primary"
          onClick={handleSubmitClick}
          disabled={isSubmitting}
          style={{
            opacity: isSubmitting ? 0.7 : 1,
          }}
        >
          {isSubmitting ? "Submitting…" : "Submit Vehicle Pre Start"}
        </button>
      </div>
    </PageLayout>
  );
}

export default VehiclePrestart;
