import { useState, useEffect, useRef } from "react";
import PageLayout from "../components/PageLayout.jsx";
import { supabase } from "../lib/supabaseClient";
import { jsPDF } from "jspdf";
import { useAuth } from "../context/AuthContext.jsx";

const yesNoOptions = ["Yes", "No"];
const yesNaNoOptions = ["Yes", "NA", "No"]; // Yes | NA | No (NA in middle)

// Dropdown wording matches matrix
const likelihoodOptions = [
  { code: "1", label: "1 – Rarely" },
  { code: "2", label: "2 – Unlikely" },
  { code: "3", label: "3 – Likely" },
  { code: "4", label: "4 – Very Likely" },
  { code: "5", label: "5 – Extremely Likely" },
];

const consequenceOptions = [
  { code: "1", label: "1 – Insignificant" },
  { code: "2", label: "2 – Minor" },
  { code: "3", label: "3 – Moderate" },
  { code: "4", label: "4 – Major" },
  { code: "5", label: "5 – Catastrophic" },
];

// Matrix headers like your screenshots
const likelihoodMatrixLabels = [
  { code: "1", title: "Rarely" },
  { code: "2", title: "Unlikely" },
  { code: "3", title: "Likely" },
  { code: "4", title: "Very Likely" },
  { code: "5", title: "Extremely Likely" },
];

const consequenceMatrixLabels = [
  { code: "1", title: "Insignificant" },
  { code: "2", title: "Minor" },
  { code: "3", title: "Moderate" },
  { code: "4", title: "Major" },
  { code: "5", title: "Catastrophic" },
];

// Risk result wording matches matrix
function computeRiskResult(lCode, cCode) {
  const l = parseInt(lCode || "0", 10);
  const c = parseInt(cCode || "0", 10);
  if (!l || !c) return "";
  const score = l * c;

  if (score >= 20) return "Critical";
  if (score >= 12) return "High";
  if (score >= 6) return "Moderate";
  return "Low";
}

/**
 * colorMode:
 *  - "traffic": Yes=green, No=red (NA grey)
 *  - "allGreen": any selected option green
 *  - "inverseTraffic": No=green, Yes=red (NA grey)
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

        if (opt === "NA" && colorMode !== "allGreen") {
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

/* ---------------- Risk Result pills (UI + PDF) ---------------- */

function getRiskColour(result) {
  switch (result) {
    case "Low":
      return { bg: "#2e7d32", text: "#fff" }; // green
    case "Moderate":
      return { bg: "#0b79ff", text: "#fff" }; // blue
    case "High":
      return { bg: "#ffca28", text: "#222" }; // yellow
    case "Critical":
      return { bg: "#e53935", text: "#fff" }; // red
    default:
      return { bg: "#9e9e9e", text: "#fff" }; // grey
  }
}

function RiskResultPill({ value }) {
  const { bg, text } = getRiskColour(value);
  return (
    <div
      style={{
        display: "inline-block",
        padding: "0.25rem 0.6rem",
        background: bg,
        color: text,
        borderRadius: 6,
        fontSize: "0.8rem",
        fontWeight: 600,
        minWidth: "78px",
        textAlign: "center",
      }}
    >
      {value || "-"}
    </div>
  );
}

/* ---------------- PDF helpers ---------------- */

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

  if (value === "NA") {
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

function drawRiskPill(doc, result, x, y) {
  const { bg, text } = getRiskColour(result);
  const w = 26;
  const h = 7.5;

  doc.setFillColor(bg);
  doc.roundedRect(x, y - 5.2, w, h, 2, 2, "F");

  doc.setTextColor(text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(result || "-", x + 4, y);
}

/* -------------- Component ---------------- */

function Take5() {
  const { user } = useAuth();
  const derivedDisplayName =
    user?.user_metadata?.full_name || user?.email || "";

  const [step, setStep] = useState(1);
  const totalSteps = 5;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [incompleteWarning, setIncompleteWarning] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");

  // red-warning modal
  const [showRedWarning, setShowRedWarning] = useState(false);

  // Risk matrix tab state
  const [riskTab, setRiskTab] = useState("matrix"); // "matrix" | "likelihood" | "consequence"

  // logo for PDF (data url)
  const [logoDataUrl, setLogoDataUrl] = useState("");

  // Header info
  const [jobNumber, setJobNumber] = useState("");
  const [employeeName, setEmployeeName] = useState(derivedDisplayName);

  // Signature
  const [signatureName, setSignatureName] = useState(derivedDisplayName);
  const [signatureConfirmed, setSignatureConfirmed] = useState(false);

  // Step 1 – SWMS / JHA
  const [swms, setSwms] = useState("");
  const [jha, setJha] = useState("");

  // Step 2 – Consider the Task
  const [consider, setConsider] = useState({
    understandScope: "",
    inspectedArea: "",
    readInstructions: "",
    toolsInOrder: "",
    fitAndCompetent: "",
    correctPpe: "",
  });

  // Step 3 – Assess the Task
  const [assess, setAssess] = useState({
    requirePermits: "",
    obtainedPermit: "",
    sprainStrainRisk: "",
    riskToOthers: "",
    hazardousEnvironment: "",
  });

  // Step 4 – Hazards
  const [hazards, setHazards] = useState([
    {
      id: 1,
      description: "",
      preLikelihood: "",
      preConsequence: "",
      preResult: "",
      controlMeasure: "",
      postLikelihood: "",
      postConsequence: "",
      postResult: "",
    },
  ]);

  // unique hazard id counter
  const nextHazardId = useRef(2);

  // Step 5 – Controls
  const [controls, setControls] = useState({
    hazardsControlled: "",
    confidentSafe: "",
  });

  // Risk matrix modal
  const [showRiskMatrix, setShowRiskMatrix] = useState(false);
  const [riskMatrixContext, setRiskMatrixContext] = useState(null);

  useEffect(() => {
    if (derivedDisplayName) {
      setEmployeeName(derivedDisplayName);
      setSignatureName((prev) => prev || derivedDisplayName);
    }
  }, [derivedDisplayName]);

  // Load logo from /public
  useEffect(() => {
    const loadLogo = async () => {
      try {
        const res = await fetch("/prowest-logo.jpg");
        const blob = await res.blob();
        const reader = new FileReader();
        reader.onloadend = () => setLogoDataUrl(reader.result);
        reader.readAsDataURL(blob);
      } catch (e) {
        console.warn("Logo failed to load for PDF", e);
      }
    };
    loadLogo();
  }, []);

  const openRiskMatrix = (hazardIndex, phase) => {
    setRiskMatrixContext({ hazardIndex, phase });
    setShowRiskMatrix(true);
  };

  const closeRiskMatrix = () => {
    setShowRiskMatrix(false);
    setRiskMatrixContext(null);
    setRiskTab("matrix");
  };

  const applyRiskFromMatrix = (likelihoodCode, consequenceCode) => {
    if (!riskMatrixContext) return;
    const { hazardIndex, phase } = riskMatrixContext;

    setHazards((prev) =>
      prev.map((h, i) => {
        if (i !== hazardIndex) return h;
        const updated = { ...h };

        if (phase === "pre") {
          updated.preLikelihood = likelihoodCode;
          updated.preConsequence = consequenceCode;
          updated.preResult = computeRiskResult(likelihoodCode, consequenceCode);
        } else {
          updated.postLikelihood = likelihoodCode;
          updated.postConsequence = consequenceCode;
          updated.postResult = computeRiskResult(likelihoodCode, consequenceCode);
        }

        return updated;
      })
    );

    closeRiskMatrix();
  };

  const handleHazardChange = (index, field, value) => {
    setHazards((prev) =>
      prev.map((h, i) => {
        if (i !== index) return h;
        const updated = { ...h, [field]: value };

        updated.preResult = computeRiskResult(updated.preLikelihood, updated.preConsequence);
        updated.postResult = computeRiskResult(updated.postLikelihood, updated.postConsequence);

        return updated;
      })
    );
    setIncompleteWarning("");
  };

  const addHazard = () => {
    const newId = nextHazardId.current++;
    setHazards((prev) => [
      ...prev,
      {
        id: newId,
        description: "",
        preLikelihood: "",
        preConsequence: "",
        preResult: "",
        controlMeasure: "",
        postLikelihood: "",
        postConsequence: "",
        postResult: "",
      },
    ]);
  };

  // remove hazard (only if more than one remains)
  const removeHazard = (indexToRemove) => {
    setHazards((prev) => {
      if (prev.length === 1) return prev;
      const updated = prev.filter((_, i) => i !== indexToRemove);
      return updated.length ? updated : prev;
    });
  };

  const resetForm = () => {
    setStep(1);
    setJobNumber("");
    setEmployeeName(derivedDisplayName);
    setSignatureName(derivedDisplayName);
    setSwms("");
    setJha("");
    setConsider({
      understandScope: "",
      inspectedArea: "",
      readInstructions: "",
      toolsInOrder: "",
      fitAndCompetent: "",
      correctPpe: "",
    });
    setAssess({
      requirePermits: "",
      obtainedPermit: "",
      sprainStrainRisk: "",
      riskToOthers: "",
      hazardousEnvironment: "",
    });
    setHazards([
      {
        id: 1,
        description: "",
        preLikelihood: "",
        preConsequence: "",
        preResult: "",
        controlMeasure: "",
        postLikelihood: "",
        postConsequence: "",
        postResult: "",
      },
    ]);
    nextHazardId.current = 2;

    setControls({
      hazardsControlled: "",
      confidentSafe: "",
    });
    setSignatureConfirmed(false);
    setSubmitError("");
    setSubmitSuccess("");
    setIncompleteWarning("");
    setPdfUrl("");
    setShowRedWarning(false);
    setShowRiskMatrix(false);
    setRiskMatrixContext(null);
    setRiskTab("matrix");
  };

  const canContinueFromStep = (currentStep) => {
    if (currentStep === 1) {
      return jobNumber.trim() && employeeName && swms && jha;
    }
    if (currentStep === 2) {
      return Object.values(consider).every((v) => v);
    }
    if (currentStep === 3) {
      return Object.values(assess).every((v) => v);
    }
    if (currentStep === 4) {
      return hazards.some((h) => h.description.trim());
    }
    if (currentStep === 5) {
      return (
        controls.hazardsControlled &&
        controls.confidentSafe &&
        (signatureName || employeeName) &&
        signatureConfirmed
      );
    }
    return true;
  };

  // detect red selections on the current step
  const hasRedSelectionsOnStep = (s) => {
    if (s === 1) return false; // all green always
    if (s === 2) {
      return Object.values(consider).some((v) => v === "No"); // traffic
    }
    if (s === 3) {
      // inverseTraffic except obtainedPermit (traffic)
      const redsInverse = ["requirePermits","sprainStrainRisk","riskToOthers","hazardousEnvironment"]
        .some((k) => assess[k] === "Yes");
      const redObtained = assess.obtainedPermit === "No";
      return redsInverse || redObtained;
    }
    if (s === 4) return false;
    if (s === 5) {
      return Object.values(controls).some((v) => v === "No");
    }
    return false;
  };

  const proceedToNextStep = () => {
    setShowRedWarning(false);
    setIncompleteWarning("");
    setStep((s) => Math.min(s + 1, totalSteps));
  };

  const nextStep = () => {
    if (!canContinueFromStep(step)) {
      setIncompleteWarning("All fields must be completed");
      return;
    }

    if (hasRedSelectionsOnStep(step)) {
      setShowRedWarning(true);
      return;
    }

    proceedToNextStep();
  };

  const prevStep = () => {
    setIncompleteWarning("");
    setShowRedWarning(false);
    setStep((s) => Math.max(s - 1, 1));
  };

  const buildFormData = (take5Number) => {
    const signatureDisplayName = signatureName || employeeName;

    return {
      jobNumber,
      employeeName,
      take5Number,
      steps: {
        swmsJha: { swms, jha },
        considerTask: consider,
        assessTask: assess,
        hazards,
        controls,
      },
      signature: {
        name: signatureDisplayName,
        confirmed: signatureConfirmed,
        signedAt: new Date().toISOString(),
      },
      submittedAt: new Date().toISOString(),
    };
  };

  // ---------- POLISHED PDF ----------
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
        } catch {}
      }
    }

    doc.setTextColor("#fff");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("TAKE 5 SAFE WORK CHECK", 65, 11);

    // Job info
    doc.setTextColor("#000");
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    y = 26;
    doc.text(`Job Number: ${data.jobNumber}`, left, y);
    doc.text(`Employee: ${data.employeeName}`, left + 95, y);
    y += 7;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(
      `Take 5 #: ${data.take5Number || "-"}  |  Submitted: ${new Date(data.submittedAt).toLocaleString("en-AU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
})}
`,
      left,
      y
    );
    y += 8;

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

    const qaRow = (label, value, mode) => {
      ensureSpace(8);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor("#000");

      doc.text(label, left + 2, y);
      drawYesNoPill(doc, value || "-", right - 32, y, mode);
      y += lineH;
    };

    // Step 1
    sectionHeader("STEP 1 – SWMS / JHA");
    qaRow("SWMS in place for this job?", data.steps.swmsJha.swms, "allGreen");
    qaRow("JHA in place for this job?", data.steps.swmsJha.jha, "allGreen");
    y += 2;

    // Step 2
    sectionHeader("STEP 2 – Consider the Task");
    const considerPretty = {
      understandScope: "Do I thoroughly understand the task scope?",
      inspectedArea: "Have I inspected the area?",
      readInstructions: "Have I read & understood instructions/procedure?",
      toolsInOrder: "Are required tools safe/serviced/calibrated?",
      fitAndCompetent: "Am I fit, qualified & competent for the task?",
      correctPpe: "Do I have the correct PPE?",
    };
    Object.entries(data.steps.considerTask).forEach(([key, value]) => {
      qaRow(considerPretty[key] || key, value, "traffic");
    });
    y += 2;

    // Step 3
    sectionHeader("STEP 3 – Assess the Task");
    const assessPretty = {
      requirePermits: "Do I require site-specific permits or inductions?",
      obtainedPermit: "Have I obtained the required permit/induction?",
      sprainStrainRisk: "Could I suffer a sprain/strain from exertion?",
      riskToOthers: "Could my work/nearby activities be a risk to others?",
      hazardousEnvironment:
        "Working in/near hazardous environment (roads, powerlines, water, heights, confined space)?",
    };

    const assessModes = {
      requirePermits: "inverseTraffic",
      obtainedPermit: "traffic",
      sprainStrainRisk: "inverseTraffic",
      riskToOthers: "inverseTraffic",
      hazardousEnvironment: "inverseTraffic",
    };

    Object.entries(data.steps.assessTask).forEach(([key, value]) => {
      qaRow(assessPretty[key] || key, value, assessModes[key] || "inverseTraffic");
    });
    y += 2;

    // Step 4 Hazards
    sectionHeader("STEP 4 – Hazards Identified");

    const hazardsList = data.steps.hazards.filter(
      (h) => h.description && h.description.trim()
    );

    if (hazardsList.length === 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.text("No hazards recorded.", left + 2, y);
      y += lineH;
    }

    hazardsList.forEach((h, idx) => {
      ensureSpace(38);

      const cardX = left + 2;
      const cardW = right - left - 4;
      const startY = y - 2;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`${idx + 1}. ${h.description}`, cardX + 2, y);
      y += lineH;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.2);

      doc.text(
        `Pre-risk: Lik ${h.preLikelihood || "-"} | Cons ${h.preConsequence || "-"} | Result`,
        cardX + 4,
        y
      );
      drawRiskPill(doc, h.preResult, cardX + cardW - 30, y);
      y += lineH;

      doc.text(`Control: ${h.controlMeasure || "-"}`, cardX + 4, y);
      y += lineH;

      doc.text(
        `Post-risk: Lik ${h.postLikelihood || "-"} | Cons ${h.postConsequence || "-"} | Result`,
        cardX + 4,
        y
      );
      drawRiskPill(doc, h.postResult, cardX + cardW - 30, y);
      y += lineH;

      const endY = y + 1;
      doc.setDrawColor(PDF_COLOURS.border);
      doc.roundedRect(cardX, startY, cardW, endY - startY, 2, 2, "S");

      y += 4;
    });

    // Step 5
    sectionHeader("STEP 5 – Controls & Sign-off");
    qaRow(
      "Have I removed hazards or implemented effective controls?",
      data.steps.controls.hazardsControlled,
      "traffic"
    );
    qaRow(
      "Am I confident this task can be done safely?",
      data.steps.controls.confidentSafe,
      "traffic"
    );
    y += 3;

    ensureSpace(14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Signed by:", left + 2, y);
    doc.setFont("helvetica", "normal");
    doc.text(data.signature.name || "-", left + 28, y);
    y += lineH;

    doc.text(
      `Confirmed: ${data.signature.confirmed ? "Yes" : "No"}   |   Signed at: ${new Date(data.signature.signedAt).toLocaleString("en-AU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
})}
`,
      left + 2,
      y
    );

    doc.setFontSize(8);
    doc.setTextColor("#777");
    doc.text("Generated by Pro West Surveying Portal", left, 290);

    return doc;
  };

  const handleSubmit = async () => {
    if (!canContinueFromStep(5)) {
      setIncompleteWarning("All fields must be completed");
      return;
    }

    if (hasRedSelectionsOnStep(5)) {
      setShowRedWarning(true);
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");
    setIncompleteWarning("");
    setPdfUrl("");

    try {
      const { count, error: countError } = await supabase
        .from("take5_submissions")
        .select("id", { count: "exact", head: true })
        .eq("job_number", jobNumber);

      if (countError) throw countError;
      const take5Number = (count || 0) + 1;

      const formData = buildFormData(take5Number);

      const { data: inserted, error: insertError } = await supabase
        .from("take5_submissions")
        .insert({
          job_number: jobNumber,
          employee_name: employeeName,
          take5_number: take5Number,
          form_data: formData,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      const take5Id = inserted.id;

      const pdfDoc = generatePdf(formData);

      let pdfBlob;
      try {
        pdfBlob = pdfDoc.output("blob");
      } catch {
        const ab = pdfDoc.output("arraybuffer");
        pdfBlob = new Blob([ab], { type: "application/pdf" });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const path = `${jobNumber}/take5/${take5Number}_${take5Id}_${timestamp}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from("take5-pdfs")
        .upload(path, pdfBlob, { contentType: "application/pdf" });

      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from("take5_submissions")
        .update({ pdf_path: path })
        .eq("id", take5Id);

      if (updateError) throw updateError;

      const { data: signed, error: signedErr } = await supabase.storage
        .from("take5-pdfs")
        .createSignedUrl(path, 60 * 60);

      if (!signedErr && signed?.signedUrl) {
        setPdfUrl(signed.signedUrl);
      }

      setSubmitSuccess("Take 5 submitted and PDF saved successfully.");
      setStep(totalSteps);
    } catch (err) {
      console.error(err);
      setSubmitError("There was a problem submitting the Take 5. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // -------- RENDER STEPS --------

  const renderStep1 = () => (
    <div className="card">
      <h3 className="card-title">Job Details & SWMS / JHA</h3>
      <p className="card-subtitle">
        Enter job details and confirm whether SWMS or JHA is in place for this job.
      </p>

      <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <div className="card-row">
          <span className="card-row-label">Job Number</span>
          <input
            type="text"
            value={jobNumber}
            onChange={(e) => {
              setJobNumber(e.target.value);
              setIncompleteWarning("");
            }}
            placeholder="e.g. 101441"
            className="maps-search-input"
            style={{ maxWidth: "200px" }}
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

      <div style={{ marginTop: "0.8rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        <div>
          <div className="card-row-label">
            Is there a Safe Work Method Statement in place for this job?
          </div>
          <YesNoToggle colorMode="allGreen" value={swms} onChange={setSwms} />
        </div>

        <div>
          <div className="card-row-label">
            Is there a Job Hazards Analysis in place for this job?
          </div>
          <YesNoToggle colorMode="allGreen" value={jha} onChange={setJha} />
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="card">
      <h3 className="card-title">Consider the Task</h3>
      <p className="card-subtitle">
        Confirm you understand the task, environment and equipment before starting.
      </p>

      <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {[
          ["understandScope", "Do I thoroughly understand the task scope?"],
          ["inspectedArea", "Have I inspected the area?"],
          ["readInstructions", "Have I read & understood the work instruction or procedure for this task?"],
          ["toolsInOrder", "Are the required tools in good working order, safe, serviced & calibrated?"],
          ["fitAndCompetent", "Am I fit, qualified and competent to perform the task?"],
          ["correctPpe", "Do I have the correct PPE?"],
        ].map(([key, label]) => (
          <div key={key}>
            <div className="card-row-label">{label}</div>
            <YesNoToggle
              value={consider[key]}
              onChange={(v) => {
                setConsider((prev) => ({ ...prev, [key]: v }));
                setIncompleteWarning("");
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="card">
      <h3 className="card-title">Assess the Task</h3>
      <p className="card-subtitle">
        Answer the following to assess risks prior to starting work.
      </p>

      <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div>
          <div className="card-row-label">
            Do I require site specific permits or inductions?
          </div>
          <YesNoToggle
            colorMode="inverseTraffic"
            value={assess.requirePermits}
            onChange={(v) => {
              setAssess((prev) => ({ ...prev, requirePermits: v }));
              setIncompleteWarning("");
            }}
          />
        </div>

        <div>
          <div className="card-row-label">
            Have I obtained this specific permit or induction?
          </div>
          <YesNoToggle
            options={yesNaNoOptions}
            colorMode="traffic"
            value={assess.obtainedPermit}
            onChange={(v) => {
              setAssess((prev) => ({ ...prev, obtainedPermit: v }));
              setIncompleteWarning("");
            }}
          />
        </div>

        <div>
          <div className="card-row-label">
            Could I suffer a sprain or strain from repetitive or excessive exertion?
          </div>
          <YesNoToggle
            colorMode="inverseTraffic"
            value={assess.sprainStrainRisk}
            onChange={(v) => {
              setAssess((prev) => ({ ...prev, sprainStrainRisk: v }));
              setIncompleteWarning("");
            }}
          />
        </div>

        <div>
          <div className="card-row-label">
            Could the work I am carrying out, or any nearby activities, be a potential risk for me or to others?
          </div>
          <YesNoToggle
            colorMode="inverseTraffic"
            value={assess.riskToOthers}
            onChange={(v) => {
              setAssess((prev) => ({ ...prev, riskToOthers: v }));
              setIncompleteWarning("");
            }}
          />
        </div>

        <div>
          <div className="card-row-label">
            Will I be working in or near a hazardous environment? (Near a road, powerline or water, at heights or in a confined space)
          </div>
          <YesNoToggle
            colorMode="inverseTraffic"
            value={assess.hazardousEnvironment}
            onChange={(v) => {
              setAssess((prev) => ({ ...prev, hazardousEnvironment: v }));
              setIncompleteWarning("");
            }}
          />
        </div>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="card">
      <h3 className="card-title">Identify the Hazards</h3>
      <p className="card-subtitle">
        Record hazards, pre- and post-control risk ratings and control measures.
      </p>

      {hazards.map((h, index) => (
        <div
          key={h.id}
          style={{
            marginTop: index === 0 ? "0.6rem" : "1rem",
            paddingTop: index === 0 ? 0 : "0.6rem",
            borderTop: index === 0 ? "none" : "1px solid #f3e1e1",
          }}
        >
          {/* Header row + remove button (only for added hazards) */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div className="card-row-label">Hazard {index + 1}</div>

            {index > 0 && (
              <button
                type="button"
                className="btn-pill"
                onClick={() => removeHazard(index)}
                style={{
                  fontSize: "0.75rem",
                  padding: "0.15rem 0.55rem",
                  background: "#fff",
                  color: "#b71c1c",
                  border: "1px solid #f3bcbc",
                }}
              >
                Remove Hazard
              </button>
            )}
          </div>

          <input
            type="text"
            value={h.description}
            onChange={(e) => handleHazardChange(index, "description", e.target.value)}
            className="maps-search-input"
            placeholder="e.g. Wet weather, traffic, uneven ground…"
            style={{ width: "100%", marginTop: "0.2rem" }}
          />

          <div
            style={{
              marginTop: "0.6rem",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "0.4rem",
              alignItems: "end",
            }}
          >
            <div>
              <div className="card-row-label">Pre-risk Likelihood</div>
              <select
                value={h.preLikelihood}
                onChange={(e) => handleHazardChange(index, "preLikelihood", e.target.value)}
                className="maps-search-input"
              >
                <option value="">Select…</option>
                {likelihoodOptions.map((opt) => (
                  <option key={opt.code} value={opt.code}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="card-row-label">Pre-risk Consequence</div>
              <select
                value={h.preConsequence}
                onChange={(e) => handleHazardChange(index, "preConsequence", e.target.value)}
                className="maps-search-input"
              >
                <option value="">Select…</option>
                {consequenceOptions.map((opt) => (
                  <option key={opt.code} value={opt.code}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="card-row-label">
                Pre-risk Result{" "}
                <button
                  type="button"
                  className="btn-pill"
                  style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem" }}
                  onClick={() => openRiskMatrix(index, "pre")}
                >
                  View Risk Matrix
                </button>
              </div>
              <RiskResultPill value={h.preResult} />
            </div>
          </div>

          <div style={{ marginTop: "0.6rem" }}>
            <div className="card-row-label">Control Measure</div>
            <input
              type="text"
              value={h.controlMeasure}
              onChange={(e) => handleHazardChange(index, "controlMeasure", e.target.value)}
              className="maps-search-input"
              style={{ width: "100%", marginTop: "0.2rem" }}
            />
          </div>

          <div
            style={{
              marginTop: "0.6rem",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "0.4rem",
              alignItems: "end",
            }}
          >
            <div>
              <div className="card-row-label">Post-risk Likelihood</div>
              <select
                value={h.postLikelihood}
                onChange={(e) => handleHazardChange(index, "postLikelihood", e.target.value)}
                className="maps-search-input"
              >
                <option value="">Select…</option>
                {likelihoodOptions.map((opt) => (
                  <option key={opt.code} value={opt.code}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="card-row-label">Post-risk Consequence</div>
              <select
                value={h.postConsequence}
                onChange={(e) => handleHazardChange(index, "postConsequence", e.target.value)}
                className="maps-search-input"
              >
                <option value="">Select…</option>
                {consequenceOptions.map((opt) => (
                  <option key={opt.code} value={opt.code}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="card-row-label">
                Post-risk Result{" "}
                <button
                  type="button"
                  className="btn-pill"
                  style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem" }}
                  onClick={() => openRiskMatrix(index, "post")}
                >
                  View Risk Matrix
                </button>
              </div>
              <RiskResultPill value={h.postResult} />
            </div>
          </div>
        </div>
      ))}

      <div style={{ marginTop: "0.9rem" }}>
        <button type="button" className="btn-pill" onClick={addHazard}>
          Add another hazard
        </button>
      </div>
    </div>
  );

  const renderStep5 = () => (
    <div className="card">
      <h3 className="card-title">Make the Change / Implement Controls</h3>
      <p className="card-subtitle">
        Confirm hazards are controlled and the task can be carried out safely.
      </p>

      <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div>
          <div className="card-row-label">
            Have I removed the hazards or implemented effective controls?
          </div>
          <YesNoToggle
            value={controls.hazardsControlled}
            onChange={(v) => {
              setControls((prev) => ({ ...prev, hazardsControlled: v }));
              setIncompleteWarning("");
            }}
          />
        </div>

        <div>
          <div className="card-row-label">
            Am I confident this task can be done safely?
          </div>
          <YesNoToggle
            value={controls.confidentSafe}
            onChange={(v) => {
              setControls((prev) => ({ ...prev, confidentSafe: v }));
              setIncompleteWarning("");
            }}
          />
        </div>
      </div>

      <div
        style={{
          marginTop: "1rem",
          paddingTop: "0.8rem",
          borderTop: "1px solid #f3e1e1",
          display: "flex",
          flexDirection: "column",
          gap: "0.6rem",
        }}
      >
        <h4 style={{ margin: 0, fontSize: "0.95rem", color: "var(--pw-primary-dark)" }}>
          Sign-off
        </h4>

        <div className="card-row">
          <span className="card-row-label">Signature name</span>
          <input
            type="text"
            value={signatureName}
            onChange={(e) => {
              setSignatureName(e.target.value);
              setIncompleteWarning("");
            }}
            placeholder="Type your name to sign"
            className="maps-search-input"
            style={{ maxWidth: "260px" }}
          />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", color: "#555" }}>
          <input
            type="checkbox"
            checked={signatureConfirmed}
            onChange={(e) => {
              setSignatureConfirmed(e.target.checked);
              setIncompleteWarning("");
            }}
          />
          I confirm I have completed this Take 5 honestly and to the best of my knowledge.
        </label>
      </div>

      <div style={{ marginTop: "1rem", fontSize: "0.8rem", color: "#555" }}>
        When you press <strong>Submit</strong>, this Take 5 will be saved and a PDF will be generated under:
        <br />
        <code>{jobNumber || "JOB_NUMBER"}/take5/…</code>
      </div>

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
    </div>
  );

  // ---------- Risk Matrix Modal (Tabbed) ----------
  const renderRiskMatrixModal = () => {
    if (!showRiskMatrix || !riskMatrixContext) return null;

    const TabButton = ({ id, children }) => {
      const active = riskTab === id;
      return (
        <button
          type="button"
          onClick={() => setRiskTab(id)}
          className="btn-pill"
          style={{
            fontSize: "0.8rem",
            padding: "0.25rem 0.7rem",
            background: active ? "var(--pw-primary, #b71c1c)" : "#f3f3f3",
            color: active ? "#fff" : "#333",
            border: active
              ? "1px solid var(--pw-primary, #b71c1c)"
              : "1px solid #ddd",
          }}
        >
          {children}
        </button>
      );
    };

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 50,
        }}
        onClick={closeRiskMatrix}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 10,
            padding: "1rem",
            maxWidth: "700px",
            width: "96%",
            maxHeight: "90vh",
            overflow: "hidden",
            boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
            display: "flex",
            flexDirection: "column",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
            <h3 style={{ margin: 0, fontSize: "1.1rem", color: "var(--pw-primary, #b71c1c)" }}>
              Risk Matrix
            </h3>
            <button type="button" className="btn-pill" style={{ fontSize: "0.8rem", padding: "0.2rem 0.6rem" }} onClick={closeRiskMatrix}>
              Close
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.7rem" }}>
            <TabButton id="matrix">Matrix</TabButton>
            <TabButton id="likelihood">Likelihood</TabButton>
            <TabButton id="consequence">Consequence</TabButton>
          </div>

          {/* Scrollable Content */}
          <div style={{ overflowY: "auto", paddingRight: "0.25rem" }}>
            {/* TAB 1 — MATRIX */}
            {riskTab === "matrix" && (
              <>
                <p style={{ fontSize: "0.8rem", marginBottom: "0.5rem", color: "#555" }}>
                  Tap a cell to apply that Likelihood / Consequence value.
                </p>

                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      borderCollapse: "collapse",
                      width: "100%",
                      fontSize: "0.8rem",
                      minWidth: "520px",
                    }}
                  >
                    <thead>
                      <tr>
                        <th
                          style={{
                            border: "1px solid #ccc",
                            padding: "0.45rem",
                            background: "#fafafa",
                            textAlign: "center",
                            fontWeight: 700,
                          }}
                        >
                          Risk Analysis
                        </th>

                        {consequenceMatrixLabels.map((c) => (
                          <th
                            key={c.code}
                            style={{
                              border: "1px solid #ccc",
                              padding: "0.45rem",
                              background: "#fafafa",
                              textAlign: "center",
                              fontWeight: 700,
                            }}
                          >
                            <div style={{ fontSize: "0.75rem", color: "#777", fontWeight: 600 }}>
                              {c.code}
                            </div>
                            <div style={{ fontSize: "0.9rem" }}>{c.title}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {likelihoodMatrixLabels.map((l) => (
                        <tr key={l.code}>
                          <td
                            style={{
                              border: "1px solid #ccc",
                              padding: "0.45rem",
                              fontWeight: 700,
                              background: "#fafafa",
                              textAlign: "center",
                            }}
                          >
                            <div style={{ fontSize: "0.75rem", color: "#777" }}>
                              {l.code}
                            </div>
                            <div style={{ fontSize: "0.9rem" }}>{l.title}</div>
                          </td>

                          {consequenceMatrixLabels.map((c) => {
                            const res = computeRiskResult(l.code, c.code);

                            let bg = "#2e7d32"; // Low green
                            if (res === "Moderate") bg = "#0b79ff"; // Moderate blue
                            if (res === "High") bg = "#ffca28"; // High yellow
                            if (res === "Critical") bg = "#e53935"; // Critical red

                            const textColour = res === "High" ? "#222" : "#fff";

                            return (
                              <td
                                key={c.code}
                                onClick={() => applyRiskFromMatrix(l.code, c.code)}
                                style={{
                                  border: "1px solid #fff",
                                  padding: "0.6rem 0.3rem",
                                  background: bg,
                                  color: textColour,
                                  fontWeight: 700,
                                  textAlign: "center",
                                  cursor: "pointer",
                                  height: "55px",
                                }}
                              >
                                <div style={{ fontSize: "0.85rem" }}>
                                  {parseInt(l.code, 10) * parseInt(c.code, 10)}
                                </div>
                                <div style={{ fontSize: "0.9rem", fontWeight: 700 }}>
                                  {res}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* TAB 2 — LIKELIHOOD */}
            {riskTab === "likelihood" && (
              <div style={{ marginTop: "0.2rem" }}>
                <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "1rem" }}>Likelihood</h4>

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                  <thead>
                    <tr>
                      <th style={{ border: "1px solid #ddd", padding: "0.55rem", background: "#fafafa" }}>
                        Likelihood
                      </th>
                      <th style={{ border: "1px solid #ddd", padding: "0.55rem", background: "#fafafa" }}>
                        Description
                      </th>
                      <th style={{ border: "1px solid #ddd", padding: "0.55rem", background: "#fafafa" }}>
                        Frequency at Location
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>Extremely Likely</td>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>Expected to happen</td>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>&gt; 1 in 2</td>
                    </tr>
                    <tr>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>Very Likely</td>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>May easily happen</td>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>&gt; 1 in 10</td>
                    </tr>
                    <tr>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>Likely</td>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>May happen</td>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>&gt; 1 in 100</td>
                    </tr>
                    <tr>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>Unlikely</td>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>May happen sometime</td>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>&gt; 1 in 1,000</td>
                    </tr>
                    <tr>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>Rarely</td>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>
                        May happen in extreme circumstances
                      </td>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>&gt; 1 in 10,000</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 3 — CONSEQUENCE */}
            {riskTab === "consequence" && (
              <div style={{ marginTop: "0.2rem" }}>
                <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "1rem" }}>Consequence</h4>

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                  <thead>
                    <tr>
                      <th style={{ border: "1px solid #ddd", padding: "0.55rem", background: "#fafafa" }}>
                        Consequence
                      </th>
                      <th style={{ border: "1px solid #ddd", padding: "0.55rem", background: "#fafafa" }}>
                        Health & Safety
                      </th>
                      <th style={{ border: "1px solid #ddd", padding: "0.55rem", background: "#fafafa" }}>
                        Environment
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>Insignificant</td>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>
                        No injury or superficial injury; requires first aid
                      </td>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>
                        Limited damage to area or low significance
                      </td>
                    </tr>
                    <tr>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>Minor</td>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>
                        Minor injury requires medical treatment
                      </td>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>
                        Minor short-term damage to environment/heritage
                      </td>
                    </tr>
                    <tr>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>Moderate</td>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>
                        Multiple medical treatments; temporary disability
                      </td>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>
                        Moderate effects on environment/heritage
                      </td>
                    </tr>
                    <tr>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>Major</td>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>
                        Life threatening serious injury; hospitalisation
                      </td>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>
                        Significant environmental/heritage damage
                      </td>
                    </tr>
                    <tr>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>Catastrophic</td>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>
                        Fatality; permanent disability; life-threatening injuries
                      </td>
                      <td style={{ border: "1px solid #ddd", padding: "0.55rem" }}>
                        Severe damage to environment/heritage with long-term effects
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderRedWarningModal = () => {
    if (!showRedWarning) return null;
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
        onClick={() => setShowRedWarning(false)}
      >
        <div
          className="card"
          style={{
            width: "92%",
            maxWidth: 420,
            padding: "1rem",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 style={{ marginTop: 0 }}>Safety Check</h3>
          <p style={{ fontSize: "0.9rem", color: "#555" }}>
            One or more boxes are red, are you sure you can proceed safely?
          </p>

          <div style={{ display: "flex", gap: "0.6rem", justifyContent: "flex-end", marginTop: "1rem" }}>
            <button
              className="btn-pill"
              onClick={() => setShowRedWarning(false)}
            >
              No
            </button>
            <button
              className="btn-pill primary"
              onClick={proceedToNextStep}
            >
              Yes
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <PageLayout
      icon="📝"
      title="Take 5"
      subtitle={`Step ${step} of ${totalSteps}`}
      actions={
        <button className="btn-pill" type="button" onClick={resetForm}>
          Start Over
        </button>
      }
    >
      {renderRiskMatrixModal()}
      {renderRedWarningModal()}

      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
      {step === 4 && renderStep4()}
      {step === 5 && renderStep5()}

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

      <div style={{ marginTop: "0.8rem", display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
        <button type="button" className="btn-pill" onClick={prevStep} disabled={step === 1}>
          ◀ Back
        </button>

        {step < totalSteps && (
          <button
            type="button"
            className="btn-pill primary"
            onClick={nextStep}
            style={{
              opacity: canContinueFromStep(step) ? 1 : 0.55,
              cursor: canContinueFromStep(step) ? "pointer" : "not-allowed",
            }}
          >
            Continue ▶
          </button>
        )}

        {step === totalSteps && (
          <button
            type="button"
            className="btn-pill primary"
            onClick={handleSubmit}
            disabled={isSubmitting || !!submitSuccess}
            style={{
              opacity: canContinueFromStep(totalSteps) ? 1 : 0.55,
              cursor:
                canContinueFromStep(totalSteps) && !submitSuccess
                  ? "pointer"
                  : "not-allowed",
            }}
          >
            {isSubmitting ? "Submitting..." : submitSuccess ? "Submitted" : "Submit Take 5"}
          </button>
        )}
      </div>

      {submitError && (
        <div style={{ marginTop: "0.6rem", fontSize: "0.85rem", color: "#b71c1c" }}>
          {submitError}
        </div>
      )}

      {submitSuccess && (
        <div style={{ marginTop: "0.6rem", fontSize: "0.85rem", color: "#2e7d32" }}>
          {submitSuccess}
        </div>
      )}
    </PageLayout>
  );
}

export default Take5;
