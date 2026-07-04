import { useEffect, useMemo, useRef, useState } from "react";
import PageLayout from "../components/PageLayout.jsx";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

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
  disabled = false,
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
            onClick={() => {
              if (!disabled) onChange(opt);
            }}
            disabled={disabled}
            style={{
              border: `1px solid ${selected ? selectedBorder : "#ccc"}`,
              padding: "0.35rem 0.85rem",
              fontSize: "0.85rem",
              cursor: disabled ? "not-allowed" : "pointer",
              background: selected ? selectedBg : "#fff",
              color: selected ? "#fff" : "#333",
              opacity: disabled && !selected ? 0.72 : 1,
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
    allowNa: true,
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
const REQUIRED_WARNING = "Please complete all required fields and checklist items before submitting.";
const PDF_BUCKET = "vehicle-prestart-pdfs";

function employeeOptionName(profile) {
  return (profile?.display_name || "").trim() || (profile?.email || "").trim();
}

function sanitizeWholeNumber(value) {
  return String(value || "").replace(/\D/g, "");
}

function parseWholeNumber(value) {
  const normalized = sanitizeWholeNumber(value);
  if (!normalized) return null;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function formatVehiclePart(value) {
  return value == null || value === "" ? "-" : String(value);
}

function vehiclePrimaryText(vehicle) {
  if (!vehicle) return "Select vehicle...";
  const registration = formatVehiclePart(vehicle.registration);
  const makeModel = [vehicle.make, vehicle.model].filter(Boolean).join(" ").trim() || "-";
  return `${registration} — ${makeModel}`;
}

function vehicleSecondaryText(vehicle) {
  if (!vehicle) return "Year: - · Assigned to: -";
  return `Year: ${formatVehiclePart(vehicle.year)} · Assigned to: ${formatVehiclePart(vehicle.assignedName)}`;
}

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

function FieldError({ children }) {
  if (!children) return null;
  return <div className="vehicle-prestart-field-error">{children}</div>;
}

/* ---------------- Component ---------------- */

function VehiclePrestart() {
  const { user, profile, displayName } = useAuth();
  const derivedDisplayName =
    profile?.display_name ||
    displayName ||
    user?.user_metadata?.full_name ||
    user?.email ||
    "";

  const [employeeName, setEmployeeName] = useState(derivedDisplayName);
  const [employeeId, setEmployeeId] = useState("");
  const [employeeOptions, setEmployeeOptions] = useState([]);
  const [vehicle, setVehicle] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [vehicleOptions, setVehicleOptions] = useState([]);
  const [odometer, setOdometer] = useState("");
  const [lastService, setLastService] = useState("");
  const [nextService, setNextService] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const [checks, setChecks] = useState(() => {
    const init = {};
    CHECK_ITEMS.forEach((c) => {
      init[c.id] = "";
    });
    return init;
  });

  const [comments, setComments] = useState("");
  const [notifyManager, setNotifyManager] = useState(false);
  const [signatureConfirmed, setSignatureConfirmed] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [submittedAt, setSubmittedAt] = useState("");
  const [pendingSubmissionId, setPendingSubmissionId] = useState("");
  const [pendingPdfPath, setPendingPdfPath] = useState("");
  const [incompleteWarning, setIncompleteWarning] = useState("");
  const [showFailedWarning, setShowFailedWarning] = useState(false);
  const [vehicleDropdownOpen, setVehicleDropdownOpen] = useState(false);
  const [highlightedVehicleIndex, setHighlightedVehicleIndex] = useState(-1);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [vehicleLoadError, setVehicleLoadError] = useState("");
  const [employeeLoadError, setEmployeeLoadError] = useState("");

  const [pdfUrl, setPdfUrl] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const fieldRefs = useRef({});
  const vehicleDropdownRef = useRef(null);
  const defaultVehicleAppliedForRef = useRef("");

  const myProfileId = profile?.id || user?.id || "";

  const employeeMap = useMemo(() => {
    const map = new Map();
    employeeOptions.forEach((emp) => map.set(emp.id, emp));
    return map;
  }, [employeeOptions]);

  const vehicleSelectDisabled = vehiclesLoading || !!vehicleLoadError || vehicleOptions.length === 0;
  const isSubmitted = !!submitSuccess;
  const selectedVehicle = useMemo(
    () => vehicleOptions.find((item) => item.id === vehicleId) || null,
    [vehicleId, vehicleOptions]
  );

  const clearFieldError = (key) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // Keep employee default aligned with Take 5, but leave manual selections alone.
  useEffect(() => {
    if (!employeeOptions.length && derivedDisplayName && !employeeName) {
      setEmployeeName(derivedDisplayName);
    }
  }, [derivedDisplayName, employeeName, employeeOptions.length]);

  useEffect(() => {
    let isMounted = true;

    const loadEmployees = async () => {
      setEmployeesLoading(true);
      setEmployeeLoadError("");

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, display_name, email, is_active")
          .order("display_name", { ascending: true });

        if (error) throw error;

        const options = (data || [])
          .filter((p) => p.is_active !== false)
          .map((p) => ({
            id: p.id,
            name: employeeOptionName(p),
            email: p.email,
          }))
          .filter((p) => p.name)
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

        if (!isMounted) return;

        setEmployeeOptions(options);

        const matchedUser =
          options.find((emp) => emp.id === myProfileId) ||
          options.find((emp) => emp.id === user?.id) ||
          options.find((emp) => emp.email === user?.email);
        const defaultName = matchedUser?.name || derivedDisplayName || "";

        if (matchedUser?.id) {
          setEmployeeId((prev) => prev || matchedUser.id);
        }

        if (defaultName) {
          setEmployeeName((prev) => {
            if (!prev || prev === user?.email) return defaultName;
            return prev;
          });
        }
      } catch (err) {
        console.error("Failed to load employee profiles", err);
        if (!isMounted) {
          return;
        }
        setEmployeeOptions([]);
        setEmployeeLoadError("Employee list could not be loaded. Please refresh and try again.");
      } finally {
        if (isMounted) setEmployeesLoading(false);
      }
    };

    loadEmployees();

    return () => {
      isMounted = false;
    };
  }, [derivedDisplayName, myProfileId, user?.email, user?.id]);

  useEffect(() => {
    let isMounted = true;

    const loadVehicles = async () => {
      setVehiclesLoading(true);
      setVehicleLoadError("");

      try {
        const { data: profileRows, error: profileError } = await supabase
          .from("profiles")
          .select("id, display_name, email");

        if (profileError) throw profileError;

        const profileMap = new Map(
          (profileRows || []).map((p) => [p.id, employeeOptionName(p) || "-"])
        );

        const { data, error } = await supabase
          .from("equipment_register")
          .select("id, equipment_type, registration_number, make, model, year, assigned_to, vehicle_last_service_odometer")
          .eq("equipment_type", "Vehicle");

        if (error) throw error;

        const options = (data || [])
          .map((row) => ({
            id: row.id,
            registration: row.registration_number || "",
            make: row.make || "",
            model: row.model || "",
            year: row.year ?? "",
            assigned_to: row.assigned_to || "",
            assignedName: profileMap.get(row.assigned_to) || "-",
            vehicle_last_service_odometer: row.vehicle_last_service_odometer,
          }))
          .sort((a, b) =>
            (a.registration || "").localeCompare(b.registration || "", undefined, { sensitivity: "base" })
          );

        if (!isMounted) return;

        setVehicleOptions(options);

        if (myProfileId && defaultVehicleAppliedForRef.current !== myProfileId) {
          defaultVehicleAppliedForRef.current = myProfileId;
          const assignedVehicle = options.find((item) => item.assigned_to && item.assigned_to === myProfileId);

          if (assignedVehicle) {
            setVehicleId(assignedVehicle.id);
            setVehicle(assignedVehicle.registration);
            setLastService(
              assignedVehicle.vehicle_last_service_odometer == null
                ? ""
                : String(assignedVehicle.vehicle_last_service_odometer)
            );
          }
        }
      } catch (err) {
        console.error("Failed to load Equipment Register vehicles", err);
        if (!isMounted) return;
        setVehicleOptions([]);
        setVehicleLoadError("Vehicle list could not be loaded from the Equipment Register. Please refresh and try again.");
      } finally {
        if (isMounted) setVehiclesLoading(false);
      }
    };

    loadVehicles();

    return () => {
      isMounted = false;
    };
  }, [myProfileId]);

  useEffect(() => {
    if (!vehicleDropdownOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!vehicleDropdownRef.current?.contains(event.target)) {
        setVehicleDropdownOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [vehicleDropdownOpen]);

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

  const handleVehicleChange = (id) => {
    if (isSubmitted) return;
    const nextVehicle = vehicleOptions.find((item) => item.id === id) || null;
    setVehicleId(id);
    setVehicle(nextVehicle?.registration || "");
    setLastService(
      nextVehicle?.vehicle_last_service_odometer == null
        ? ""
        : String(nextVehicle.vehicle_last_service_odometer)
    );
    clearFieldError("vehicle");
    clearFieldError("lastService");
    clearFieldError("nextService");
    setIncompleteWarning("");
  };

  const selectVehicleOption = (id) => {
    handleVehicleChange(id);
    setVehicleDropdownOpen(false);
    requestAnimationFrame(() => fieldRefs.current.vehicle?.focus?.());
  };

  const openVehicleDropdown = () => {
    if (vehicleSelectDisabled || isSubmitted) return;
    const selectedIndex = vehicleOptions.findIndex((item) => item.id === vehicleId);
    setHighlightedVehicleIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setVehicleDropdownOpen(true);
  };

  const handleVehicleKeyDown = (event) => {
    if (vehicleSelectDisabled || isSubmitted) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setVehicleDropdownOpen(true);
      setHighlightedVehicleIndex((prev) => {
        const current = prev >= 0 ? prev : vehicleOptions.findIndex((item) => item.id === vehicleId);
        if (event.key === "ArrowDown") return Math.min((current < 0 ? -1 : current) + 1, vehicleOptions.length - 1);
        return Math.max((current < 0 ? vehicleOptions.length : current) - 1, 0);
      });
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setVehicleDropdownOpen(true);
      setHighlightedVehicleIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setVehicleDropdownOpen(true);
      setHighlightedVehicleIndex(vehicleOptions.length - 1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!vehicleDropdownOpen) {
        openVehicleDropdown();
        return;
      }
      const option = vehicleOptions[highlightedVehicleIndex];
      if (option) selectVehicleOption(option.id);
      return;
    }

    if (event.key === "Escape") {
      setVehicleDropdownOpen(false);
    }
  };

  const handleEmployeeChange = (id) => {
    if (isSubmitted) return;
    const selected = employeeMap.get(id);
    setEmployeeId(id);
    setEmployeeName(selected?.name || "");
    setSignatureConfirmed(false);
    clearFieldError("employee");
    clearFieldError("signatureConfirmed");
    setIncompleteWarning("");
  };

  const handleNumberChange = (setter, key) => (e) => {
    if (isSubmitted) return;
    setter(sanitizeWholeNumber(e.target.value));
    clearFieldError(key);
    setIncompleteWarning("");
  };

  const handleCheckChange = (id, value) => {
    if (isSubmitted) return;
    setChecks((prev) => ({ ...prev, [id]: value }));
    clearFieldError(`check_${id}`);
    setIncompleteWarning("");
  };

  const resetForm = () => {
    defaultVehicleAppliedForRef.current = "";
    const assignedVehicle = vehicleOptions.find((item) => item.assigned_to && item.assigned_to === myProfileId);
    setVehicleId(assignedVehicle?.id || "");
    setVehicle(assignedVehicle?.registration || "");
    setOdometer("");
    setLastService(
      assignedVehicle?.vehicle_last_service_odometer == null
        ? ""
        : String(assignedVehicle.vehicle_last_service_odometer)
    );
    setNextService("");
    const currentEmployee =
      employeeOptions.find((emp) => emp.id === myProfileId) ||
      employeeOptions.find((emp) => emp.id === user?.id) ||
      employeeOptions.find((emp) => emp.email === user?.email);
    setEmployeeId(currentEmployee?.id || "");
    setEmployeeName(currentEmployee?.name || derivedDisplayName || "");
    setChecks(() => {
      const init = {};
      CHECK_ITEMS.forEach((c) => {
        init[c.id] = "";
      });
      return init;
    });
    setComments("");
    setNotifyManager(false);
    setSignatureConfirmed(false);
    setSubmitError("");
    setSubmitSuccess("");
    setSubmittedAt("");
    setPendingSubmissionId("");
    setPendingPdfPath("");
    setIncompleteWarning("");
    setFieldErrors({});
    setShowFailedWarning(false);
    setPdfUrl("");
  };

  const basicValidate = () => {
    const nextErrors = {};
    const currentOdometer = parseWholeNumber(odometer);
    const lastServiceOdometer = parseWholeNumber(lastService);
    const nextServiceOdometer = parseWholeNumber(nextService);

    if (vehicleLoadError) nextErrors.vehicle = "Vehicle list could not be loaded.";
    else if (!vehicleOptions.length) nextErrors.vehicle = "No Vehicle equipment records are available.";
    else if (!vehicleId || !vehicle.trim()) nextErrors.vehicle = "Select a vehicle.";

    if (employeeLoadError) nextErrors.employee = "Employee list could not be loaded.";
    else if (!employeeName.trim()) nextErrors.employee = "Select an employee.";

    if (currentOdometer == null) nextErrors.odometer = "Enter a non-negative whole-number odometer reading.";
    if (lastServiceOdometer == null) nextErrors.lastService = "Enter the last service odometer reading.";
    if (nextServiceOdometer == null) nextErrors.nextService = "Enter the next service odometer reading.";

    if (lastServiceOdometer != null && nextServiceOdometer != null && nextServiceOdometer <= lastServiceOdometer) {
      nextErrors.nextService = "Next service odometer must be greater than the last service odometer.";
    }

    if (currentOdometer != null && nextServiceOdometer != null && nextServiceOdometer < currentOdometer) {
      nextErrors.nextService = "Next service odometer cannot be below the current odometer reading.";
    }

    CHECK_ITEMS.forEach((item) => {
      if (!checks[item.id]) nextErrors[`check_${item.id}`] = "Required.";
    });

    if (hasAnyNo) {
      if (!comments.trim()) {
        nextErrors.comments = "Describe the issue(s) when any checks are marked No.";
      }
      if (!notifyManager) {
        nextErrors.notifyManager = "Notify Manager of Results is required when any checks are marked No.";
      }
    }

    if (!signatureConfirmed) {
      nextErrors.signatureConfirmed = "Employee sign-off is required before submitting.";
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setIncompleteWarning(REQUIRED_WARNING);
      const firstKey = Object.keys(nextErrors)[0];
      requestAnimationFrame(() => {
        fieldRefs.current[firstKey]?.focus?.();
        fieldRefs.current[firstKey]?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      });
      return false;
    }

    setIncompleteWarning("");
    return true;
  };

  const buildFormData = (submittedIso = new Date().toISOString()) => ({
    vehicle,
    vehicleEquipmentId: vehicleId || null,
    odometer: parseWholeNumber(odometer),
    lastService: parseWholeNumber(lastService),
    nextService: parseWholeNumber(nextService),
    lastServiceOdometer: parseWholeNumber(lastService),
    nextServiceOdometer: parseWholeNumber(nextService),
    employeeId: employeeId || null,
    employeeName,
    checks,
    comments,
    notifyManager,
    signature: {
      name: employeeName || "-",
      employeeId: employeeId || null,
      confirmed: signatureConfirmed,
      signedAt: signatureConfirmed ? submittedIso : null,
    },
    submittedStatus: "submitted",
    submittedAt: submittedIso,
  });

  // PDF generator – styled like Take 5, but simplified for vehicle checklist
  const generatePdf = async (data) => {
    const { jsPDF } = await import("jspdf");
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
    doc.text(`Odometer: ${data.odometer ?? "-"} km`, left + 2, y);
    y += lineH;
    doc.text(`Employee: ${data.employeeName || "-"}`, left + 2, y);
    y += lineH;
    if (data.lastService != null) {
      doc.text(`Last Service Odometer Reading: ${data.lastService} km`, left + 2, y);
      y += lineH;
    }
    if (data.nextService != null) {
      doc.text(`Next Service Odometer Reading: ${data.nextService} km`, left + 2, y);
      y += lineH;
    }
    doc.text(`Submitted: ${submittedDate}`, left + 2, y);
    y += lineH + 2;
    doc.text(`Status: ${data.submittedStatus === "submitted" ? "Submitted" : "-"}`, left + 2, y);
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

    sectionHeader("Employee Sign-off");

    doc.setFont("helvetica", "italic");
    doc.setFontSize(9.2);
    doc.setTextColor("#333");

    const declarationText = doc.splitTextToSize(
      "I confirm I have completed or reviewed this Vehicle Pre Start checklist and the entered information is accurate to the best of my knowledge.",
      right - left - 4
    );

    doc.text(declarationText, left + 2, y);
    y += declarationText.length * 4.8 + 2;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor("#000");
    doc.text("Signed by:", left + 2, y);
    doc.text(data.signature?.name || "-", left + 28, y);
    y += lineH;

    const signedAt = data.signature?.signedAt
      ? new Date(data.signature.signedAt).toLocaleString("en-AU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "-";

    doc.text(
      `Confirmed: ${data.signature?.confirmed ? "Yes" : "No"}   |   Signed at: ${signedAt}`,
      left + 2,
      y
    );
    y += lineH;

    // Footer
    doc.setFontSize(8);
    doc.setTextColor("#777");
    doc.text("Generated by Pro West Surveying Portal", left, 290);

    return doc;
  };

  // Final submit to Supabase (after any warning confirmation)
  const submitToSupabase = async () => {
    if (isSubmitting || isSubmitted) return;
    if (!basicValidate()) return;

    setIsSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");
    setPdfUrl("");
    let savedSubmissionId = pendingSubmissionId;

    try {
      const submittedIso = new Date().toISOString();
      const formData = buildFormData(submittedIso);
      const currentOdometer = parseWholeNumber(odometer);
      const lastServiceOdometer = parseWholeNumber(lastService);
      const nextServiceOdometer = parseWholeNumber(nextService);
      const submissionPayload = {
        vehicle_label: vehicle,
        vehicle_equipment_id: vehicleId || null,
        odometer: currentOdometer,
        last_service_odometer: lastServiceOdometer,
        next_service_odometer: nextServiceOdometer,
        employee_profile_id: employeeId || null,
        employee_name: employeeName,
        employee_signed_off: signatureConfirmed,
        employee_signed_off_at: signatureConfirmed ? submittedIso : null,
        signed_off_employee_profile_id: employeeId || null,
        signed_off_employee_name: employeeName,
        submitted_status: "pdf_pending",
        submitted_at: submittedIso,
        form_data: formData,
        notify_manager: notifyManager,
        manager_alert_status: "not_required",
        submitted_by_user_id: user?.id || null,
      };

      let prestartId = pendingSubmissionId;

      if (prestartId) {
        console.info("Vehicle Pre Start PDF workflow: retrying saved submission", { submissionId: prestartId });
        const { error: updateSubmissionError } = await supabase
          .from("vehicle_prestart_submissions")
          .update(submissionPayload)
          .eq("id", prestartId);

        if (updateSubmissionError) throw updateSubmissionError;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("vehicle_prestart_submissions")
          .insert(submissionPayload)
          .select("id")
          .single();

        if (insertError) throw insertError;
        prestartId = inserted.id;
        savedSubmissionId = prestartId;
        setPendingSubmissionId(prestartId);
        console.info("Vehicle Pre Start PDF workflow: submission row created", { submissionId: prestartId });
      }

      let path = pendingSubmissionId && pendingPdfPath ? pendingPdfPath : "";

      if (path) {
        console.info("Vehicle Pre Start PDF workflow: reusing uploaded PDF for finalization retry", {
          submissionId: prestartId,
          pdfPath: path,
        });
      } else {
        const pdfDoc = await generatePdf(formData);
        console.info("Vehicle Pre Start PDF workflow: PDF generated", { submissionId: prestartId });

        let pdfBlob;
        try {
          pdfBlob = pdfDoc.output("blob");
        } catch {
          const ab = pdfDoc.output("arraybuffer");
          pdfBlob = new Blob([ab], { type: "application/pdf" });
        }

        if (!pdfBlob || pdfBlob.size <= 0) {
          throw new Error("Generated Vehicle Pre Start PDF was empty.");
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        path = `vehicle-prestarts/${prestartId}/vehicle-prestart-${timestamp}.pdf`;

        console.info("Vehicle Pre Start PDF workflow: upload started", { submissionId: prestartId, pdfPath: path });
        const { error: uploadError } = await supabase.storage
          .from(PDF_BUCKET)
          .upload(path, pdfBlob, {
            contentType: "application/pdf",
            upsert: false,
          });

        if (uploadError) throw uploadError;
        setPendingPdfPath(path);
        console.info("Vehicle Pre Start PDF workflow: PDF uploaded", { submissionId: prestartId, pdfPath: path });
      }

      const completedFormData = {
        ...formData,
        pdfPath: path,
        pdf_path: path,
        submittedStatus: "submitted",
      };

      const finalUpdatePayload = {
        pdf_path: path,
        submitted_status: "submitted",
        submitted_at: submittedIso,
        form_data: completedFormData,
        notify_manager: !!notifyManager,
        manager_alert_status: notifyManager ? "pending" : "not_required",
        submitted_by_user_id: user?.id || null,
      };

      console.info("Vehicle Pre Start PDF workflow: saving PDF path", {
        submissionId: prestartId,
        pdfPath: path,
        updateFields: Object.keys(finalUpdatePayload),
      });

      const { data: updatedRows, error: updateError, count: updatedCount, status: updateStatus } = await supabase
        .from("vehicle_prestart_submissions")
        .update(finalUpdatePayload, { count: "exact" })
        .eq("id", prestartId)
        .select("id, pdf_path, submitted_status, submitted_at");

      if (updateError) {
        console.error("Vehicle Pre Start PDF workflow: final update failed", {
          submissionId: prestartId,
          pdfPath: path,
          updateFields: Object.keys(finalUpdatePayload),
          status: updateStatus,
          code: updateError.code,
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
        });
        throw updateError;
      }

      if (updatedCount !== 1 || !Array.isArray(updatedRows) || updatedRows.length !== 1) {
        console.error("Vehicle Pre Start PDF workflow: final update affected unexpected row count", {
          submissionId: prestartId,
          pdfPath: path,
          updateFields: Object.keys(finalUpdatePayload),
          status: updateStatus,
          updatedCount,
          returnedRows: Array.isArray(updatedRows) ? updatedRows.length : null,
        });
        throw new Error("Vehicle Pre Start PDF path could not be saved to the submission row.");
      }

      const [updatedSubmission] = updatedRows;
      if (updatedSubmission.pdf_path !== path || updatedSubmission.submitted_status !== "submitted") {
        console.error("Vehicle Pre Start PDF workflow: final update returned unexpected values", {
          submissionId: prestartId,
          pdfPath: path,
          returnedPdfPath: updatedSubmission.pdf_path,
          returnedStatus: updatedSubmission.submitted_status,
          status: updateStatus,
        });
        throw new Error("Vehicle Pre Start PDF path was not confirmed on the submission row.");
      }
      console.info("Vehicle Pre Start PDF workflow: PDF path saved", { submissionId: prestartId, pdfPath: path });

      const { data: signed, error: signedErr } = await supabase.storage
        .from(PDF_BUCKET)
        .createSignedUrl(path, 60 * 60);

      if (!signedErr && signed?.signedUrl) {
        setPdfUrl(signed.signedUrl);
        console.info("Vehicle Pre Start PDF workflow: signed URL created", { submissionId: prestartId });
      }

      setSubmitSuccess(
        "Vehicle pre-start submitted and PDF saved successfully."
      );
      setSubmittedAt(submittedIso);
      setPendingSubmissionId("");
      setPendingPdfPath("");
      setIncompleteWarning("");
    } catch (err) {
      console.error("Vehicle Pre Start submit/PDF workflow failed:", err);
      setSubmitError(
        savedSubmissionId
          ? "The checklist was saved, but the PDF could not be attached. Please try submitting again to retry the PDF attachment."
          : "There was a problem submitting the Vehicle Pre Start. Please try again."
      );
    } finally {
      setIsSubmitting(false);
      setShowFailedWarning(false);
    }
  };

  const handleSubmitClick = () => {
    if (isSubmitted || isSubmitting) return;
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
        className="modal-backdrop"
        onClick={() => setShowFailedWarning(false)}
      >
        <div
          className="modal-card vehicle-prestart-confirm-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vehicle-prestart-confirm-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h3 id="vehicle-prestart-confirm-title">Vehicle Safety Check</h3>
          </div>
          <p className="vehicle-prestart-confirm-message">
            One or more checklist items have been marked{" "}
            <strong>No</strong>. The vehicle may not be safe to use. Are you
            sure you want to submit this Vehicle Pre Start and notify the
            manager?
          </p>

          <div className="modal-actions">
            <button
              className="btn-pill"
              type="button"
              onClick={() => setShowFailedWarning(false)}
              disabled={isSubmitting}
            >
              No
            </button>
            <button
              className="btn-pill primary"
              type="button"
              onClick={submitToSupabase}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Submitting..." : "Yes, submit"}
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
        <button className="btn-pill" type="button" onClick={resetForm} disabled={isSubmitting || isSubmitted}>
          Start Over
        </button>
      }
    >
      {renderFailedWarningModal()}

      {/* Top card – vehicle & service info */}
      <div className="card">
        <h3 className="card-title">Vehicle Details</h3>
        <p className="card-subtitle">
          Select the vehicle and complete the checklist on the <strong>first Monday of every month.</strong>
        </p>

        {(vehicleLoadError || employeeLoadError) && (
          <div className="vehicle-prestart-message error" role="alert">
            {vehicleLoadError || employeeLoadError}
          </div>
        )}

        {!vehiclesLoading && !vehicleLoadError && vehicleOptions.length === 0 && (
          <div className="vehicle-prestart-message warning" role="alert">
            No Vehicle equipment records exist in the Equipment Register. Add a Vehicle before submitting a pre-start.
          </div>
        )}

        <div className="vehicle-prestart-details-grid">
          <div className="card-row">
            <label className="card-row-label" htmlFor="vehicle-prestart-vehicle">Vehicle</label>
            <div className="vehicle-prestart-control" ref={vehicleDropdownRef}>
              <input type="hidden" name="vehicle_equipment_id" value={vehicleId} />
              <button
                id="vehicle-prestart-vehicle"
                ref={(node) => {
                  fieldRefs.current.vehicle = node;
                }}
                type="button"
                role="combobox"
                className={`maps-search-input vehicle-prestart-vehicle-trigger${fieldErrors.vehicle ? " is-invalid" : ""}`}
                disabled={vehicleSelectDisabled || isSubmitted}
                aria-invalid={fieldErrors.vehicle ? "true" : "false"}
                aria-haspopup="listbox"
                aria-expanded={vehicleDropdownOpen}
                aria-controls="vehicle-prestart-vehicle-list"
                aria-activedescendant={
                  vehicleDropdownOpen && highlightedVehicleIndex >= 0
                    ? `vehicle-prestart-vehicle-option-${vehicleOptions[highlightedVehicleIndex]?.id}`
                    : undefined
                }
                onClick={() => {
                  if (isSubmitted) return;
                  if (vehicleDropdownOpen) {
                    setVehicleDropdownOpen(false);
                  } else {
                    openVehicleDropdown();
                  }
                }}
                onKeyDown={handleVehicleKeyDown}
              >
                <span className="vehicle-prestart-vehicle-text">
                  <span className="vehicle-prestart-vehicle-primary">
                    {vehiclesLoading ? "Loading vehicles..." : vehiclePrimaryText(selectedVehicle)}
                  </span>
                  <span className="vehicle-prestart-vehicle-secondary">
                    {selectedVehicle ? vehicleSecondaryText(selectedVehicle) : "Year: - · Assigned to: -"}
                  </span>
                </span>
                <span className="vehicle-prestart-vehicle-arrow" aria-hidden="true">⌄</span>
              </button>
              {vehicleDropdownOpen && (
                <div
                  id="vehicle-prestart-vehicle-list"
                  className="vehicle-prestart-vehicle-list"
                  role="listbox"
                  aria-labelledby="vehicle-prestart-vehicle"
                >
                  {vehicleOptions.map((item, index) => {
                    const selected = item.id === vehicleId;
                    const highlighted = index === highlightedVehicleIndex;

                    return (
                      <button
                        key={item.id}
                        id={`vehicle-prestart-vehicle-option-${item.id}`}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={`vehicle-prestart-vehicle-option${selected ? " is-selected" : ""}${highlighted ? " is-highlighted" : ""}`}
                        onMouseEnter={() => setHighlightedVehicleIndex(index)}
                        onFocus={() => setHighlightedVehicleIndex(index)}
                        onKeyDown={handleVehicleKeyDown}
                        onClick={() => selectVehicleOption(item.id)}
                      >
                        <span className="vehicle-prestart-vehicle-primary">{vehiclePrimaryText(item)}</span>
                        <span className="vehicle-prestart-vehicle-secondary">{vehicleSecondaryText(item)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <FieldError>{fieldErrors.vehicle}</FieldError>
            </div>
          </div>

          <div className="card-row">
            <label className="card-row-label" htmlFor="vehicle-prestart-odometer">Current Odometer</label>
            <div className="vehicle-prestart-control">
              <input
                id="vehicle-prestart-odometer"
                ref={(node) => {
                  fieldRefs.current.odometer = node;
                }}
                type="number"
                min="0"
                step="1"
                value={odometer}
                onChange={handleNumberChange(setOdometer, "odometer")}
                readOnly={isSubmitted}
                aria-label="Current odometer reading"
                aria-invalid={fieldErrors.odometer ? "true" : "false"}
                inputMode="numeric"
                placeholder="km"
                className={`maps-search-input${fieldErrors.odometer ? " is-invalid" : ""}`}
                required
              />
              <FieldError>{fieldErrors.odometer}</FieldError>
            </div>
          </div>

          <div className="card-row">
            <label className="card-row-label" htmlFor="vehicle-prestart-last-service">Last Service Odometer Reading</label>
            <div className="vehicle-prestart-control">
              <input
                id="vehicle-prestart-last-service"
                ref={(node) => {
                  fieldRefs.current.lastService = node;
                }}
                type="number"
                min="0"
                step="1"
                value={lastService}
                onChange={handleNumberChange(setLastService, "lastService")}
                readOnly={isSubmitted}
                aria-label="Last service odometer reading"
                aria-invalid={fieldErrors.lastService ? "true" : "false"}
                inputMode="numeric"
                placeholder="km"
                className={`maps-search-input${fieldErrors.lastService ? " is-invalid" : ""}`}
                required
              />
              <FieldError>{fieldErrors.lastService}</FieldError>
            </div>
          </div>

          <div className="card-row">
            <label className="card-row-label" htmlFor="vehicle-prestart-next-service">Next Service Odometer Reading</label>
            <div className="vehicle-prestart-control">
              <input
                id="vehicle-prestart-next-service"
                ref={(node) => {
                  fieldRefs.current.nextService = node;
                }}
                type="number"
                min="0"
                step="1"
                value={nextService}
                onChange={handleNumberChange(setNextService, "nextService")}
                readOnly={isSubmitted}
                aria-label="Next service odometer reading"
                aria-invalid={fieldErrors.nextService ? "true" : "false"}
                inputMode="numeric"
                placeholder="km"
                className={`maps-search-input${fieldErrors.nextService ? " is-invalid" : ""}`}
                required
              />
              <FieldError>{fieldErrors.nextService}</FieldError>
            </div>
          </div>

          <div className="card-row">
            <label className="card-row-label" htmlFor="vehicle-prestart-employee">Employee</label>
            <div className="vehicle-prestart-control">
              <select
                id="vehicle-prestart-employee"
                ref={(node) => {
                  fieldRefs.current.employee = node;
                }}
                value={employeeId}
                onChange={(e) => handleEmployeeChange(e.target.value)}
                className={`maps-search-input${fieldErrors.employee ? " is-invalid" : ""}`}
                disabled={employeesLoading || !!employeeLoadError || isSubmitted}
                aria-invalid={fieldErrors.employee ? "true" : "false"}
              >
                <option value="">{employeesLoading ? "Loading employees..." : "Select employee..."}</option>
                {employeeOptions.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
              <FieldError>{fieldErrors.employee}</FieldError>
            </div>
          </div>
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
                className={`vehicle-prestart-check-row${fieldErrors[`check_${item.id}`] ? " is-invalid" : ""}`}
                ref={(node) => {
                  fieldRefs.current[`check_${item.id}`] = node;
                }}
                tabIndex={fieldErrors[`check_${item.id}`] ? -1 : undefined}
              >
                <YesNoToggle
                  value={checks[item.id]}
                  options={item.allowNa ? yesNaNoOptions : yesNoOptions}
                  onChange={(v) => handleCheckChange(item.id, v)}
                  colorMode="traffic"
                  disabled={isSubmitted}
                />
                <div className="vehicle-prestart-check-label">
                  <span>{item.label}</span>
                  <FieldError>{fieldErrors[`check_${item.id}`]}</FieldError>
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
          ref={(node) => {
            fieldRefs.current.comments = node;
          }}
          value={comments}
          onChange={(e) => {
            if (isSubmitted) return;
            setComments(e.target.value);
            clearFieldError("comments");
            setIncompleteWarning("");
          }}
          rows={4}
          className={`maps-search-input${fieldErrors.comments ? " is-invalid" : ""}`}
          style={{ width: "100%", marginTop: "0.4rem", resize: "vertical" }}
          aria-label="Vehicle damage or comments"
          aria-invalid={fieldErrors.comments ? "true" : "false"}
          placeholder="Describe any issues found during the pre-start…"
          readOnly={isSubmitted}
        />
        <FieldError>{fieldErrors.comments}</FieldError>

        <label
          ref={(node) => {
            fieldRefs.current.notifyManager = node;
          }}
          className={fieldErrors.notifyManager ? "vehicle-prestart-checkbox is-invalid" : "vehicle-prestart-checkbox"}
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
            disabled={isSubmitted}
            onChange={(e) => {
              if (isSubmitted) return;
              setNotifyManager(e.target.checked);
              clearFieldError("notifyManager");
              setIncompleteWarning("");
            }}
          />
          <span>
            Notify Manager of Results{" "}
            <span style={{ color: "#777" }}></span>
          </span>
        </label>
        <FieldError>{fieldErrors.notifyManager}</FieldError>
      </div>

      <div className="card">
        <h3 className="card-title">Employee Sign-off</h3>
        <p className="card-subtitle">
          Confirm the selected employee has completed or reviewed this checklist and the information is accurate.
        </p>

        <div className="card-row" style={{ marginTop: "0.6rem" }}>
          <span className="card-row-label">Signature name</span>
          <input
            type="text"
            value={employeeName || ""}
            readOnly
            className="maps-search-input"
            style={{ maxWidth: "260px", backgroundColor: "#f5f5f5" }}
          />
        </div>

        <label
          ref={(node) => {
            fieldRefs.current.signatureConfirmed = node;
          }}
          className={fieldErrors.signatureConfirmed ? "vehicle-prestart-checkbox is-invalid" : "vehicle-prestart-checkbox"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            marginTop: "0.8rem",
            fontSize: "0.85rem",
            color: "#555",
          }}
        >
          <input
            type="checkbox"
            checked={signatureConfirmed}
            disabled={isSubmitted}
            onChange={(e) => {
              if (isSubmitted) return;
              setSignatureConfirmed(e.target.checked);
              clearFieldError("signatureConfirmed");
              setIncompleteWarning("");
            }}
          />
          I confirm I have completed this Vehicle Pre Start honestly and to the best of my knowledge.
        </label>
        <FieldError>{fieldErrors.signatureConfirmed}</FieldError>

        {isSubmitted && (
          <div className="vehicle-prestart-message success" role="status">
            This Vehicle Pre Start has been submitted and is now locked.
            {submittedAt ? ` Submitted ${new Date(submittedAt).toLocaleString("en-AU", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}.` : ""}
          </div>
        )}
      </div>

      {/* Warnings & submit row */}
      {incompleteWarning && (
        <div className="vehicle-prestart-message warning" role="alert">
          {incompleteWarning}
        </div>
      )}

      {submitError && (
        <div className="vehicle-prestart-message error" role="alert">
          {submitError}
        </div>
      )}

      {submitSuccess && (
        <div className="vehicle-prestart-message success" role="status">
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
          disabled={isSubmitting || isSubmitted}
          aria-busy={isSubmitting ? "true" : "false"}
          style={{
            opacity: isSubmitting || isSubmitted ? 0.7 : 1,
            cursor: isSubmitting || isSubmitted ? "not-allowed" : "pointer",
          }}
        >
          {isSubmitting ? "Submitting..." : isSubmitted ? "Submitted" : "Submit Vehicle Pre Start"}
        </button>
      </div>
    </PageLayout>
  );
}

export default VehiclePrestart;
