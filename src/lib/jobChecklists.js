export const JOB_CHECKLIST_CATEGORY_HEADINGS = {
  Amalgamation: "Amalgamation Checklist",
  "Boundary Identification": "Boundary Identification Checklist",
  "Boundary Repeg": "Boundary Repeg Checklist",
  "Building Setout": "Building Setout Checklist",
  "Feature and Contour Survey": "Feature and Contour Survey Checklist",
  "Repeg and Setout": "Repeg and Setout Checklist",
  "Subdivision - Built Strata": "Strata Subdivision Checklist",
  "Subdivision - Green Title": "Subdivision - Green Title Checklist",
  "Subdivision - Survey Strata": "Subdivision - Survey Strata Checklist",
  "Subdivision - Survey Strata Conversion": "Subdivision - Survey Strata Conversion Checklist",
  "Vacant Site Survey": "Vacant Site Survey Checklist",
};

export const JOB_CHECKLIST_DEFINITIONS = {
  Amalgamation: [],
  "Boundary Identification": [
    {
      key: "letter-of-engagement-received",
      text: "Letter of Engagement received; save it to the job folder under Documents > Received — Project Manager.",
    },
    { key: "complete-sufficient-search", text: "Complete sufficient search — Project Manager / Field Surveyor." },
    {
      key: "alignment-field-survey-and-pickup",
      text: "Complete alignment field survey and pickup along the subject boundaries — Field Surveyor.",
    },
    { key: "calculate-required-boundaries", text: "Calculate the required boundaries — Field Surveyor." },
    { key: "magnet-processing-boundary-improvements", text: "Complete Magnet processing and annotate the Magnet file with improvements within 1 m of the parcel boundary — Field Surveyor." },
    {
      key: "check-calculations",
      text: "Check the calculations — Project Manager.",
    },
    {
      key: "complete-boundary-identification-plan",
      text: "Complete the Boundary Identification Survey plan with Regulation 25A Certificate — Drafting.",
    },
    {
      key: "check-boundary-identification-plan",
      text: "Check the Boundary Identification Survey plan — Project Manager.",
    },
    {
      key: "issue-boundary-identification-plan",
      text: "Issue the Boundary Identification Survey plan — Project Manager.",
    },
    {
      key: "invoice-client-mark-complete",
      text: "Invoice the client and mark the job in the Portal as Complete — Accounts.",
    },
  ],
  "Boundary Repeg": [
    {
      key: "save-job-order-email",
      text: "Save the job order email into the Job Orders folder in the Admin inbox and put a copy in the job folder — Admin.",
    },
    {
      key: "print-survey-search-records",
      text: "If SSA, print the Deposited Plan and Survey Sheet. If not SSA and a recent survey has been completed on the street, print the Field Book and Plan, Diagram or Deposited Plan. If an alignment survey is required, complete sufficient search — Admin / Project Manager / Field Surveyor.",
    },
    { key: "complete-alignment-field-survey", text: "If required, complete the alignment field survey — Field Surveyor." },
    { key: "calculate-required-boundaries", text: "Calculate the required boundaries — Field Surveyor." },
    { key: "create-point-plots-and-files", text: "Create and print point plots and a point listing and place them in the file. Save the GSI and DXF files to the job’s Calc directory — Field Surveyor." },
    {
      key: "check-calculations",
      text: "Check the calculations — Project Manager.",
    },
    { key: "complete-field-survey-setout-markup", text: "Complete the field survey and setout markup — Field Surveyor." },
    {
      key: "magnet-qa-boundary-improvements",
      text: "Complete Magnet QA and processing and annotate the Magnet file with improvements within 1 m of the parcel boundary — Field Surveyor.",
    },
    { key: "complete-repeg-plan", text: "Complete the Repeg plan with Regulation 25A Certificate — Drafting." },
    { key: "check-repeg-plan", text: "Check the Repeg plan — Project Manager." },
    { key: "issue-repeg-plan", text: "Issue the Repeg plan — Project Manager." },
    {
      key: "invoice-client-mark-complete",
      text: "Invoice the client and mark the job in the Portal as Complete — Accounts.",
    },
  ],
  "Building Setout": [
    {
      key: "save-job-order-email",
      text: "Save the job order email into the Job Orders folder in the Admin inbox and put a copy in the job folder — Admin.",
    },
    {
      key: "print-site-and-floor-plans",
      text: "Print one site plan and two floor plans, plus an additional floor plan if zero-lot walls exist — Admin.",
    },
    {
      key: "print-survey-search-records",
      text: "If SSA, print the Deposited Plan and Survey Sheet. If not SSA and a recent survey has been completed on the street, print the Field Book and Plan, Diagram or Deposited Plan. If an alignment survey is required, complete sufficient search — Admin / Project Manager / Field Surveyor.",
    },
    { key: "complete-alignment-field-survey", text: "If required, complete the alignment field survey — Field Surveyor." },
    { key: "calculate-required-boundaries", text: "Calculate the required boundaries — Field Surveyor." },
    { key: "calculate-building-position", text: "Calculate the building position from the site plan, then use the floor plan to calculate setout points. Check boundary setbacks against the site plan — Field Surveyor." },

    {
      key: "rule-up-building-floor-plan",
      text: "Rule up the building floor plan: one office copy, one site copy and one zero-lot site copy where applicable — Field Surveyor.",
    },
    {
      key: "create-point-plots-and-files",
      text: "Create and print point plots and a point listing and place them in the file. Save the GSI and DXF files to the job’s Calc directory — Field Surveyor.",
    },
    {
      key: "check-calculations",
      text: "Check the calculations — Project Manager.",
    },
    { key: "complete-field-survey-setout-markup", text: "Complete the field survey and setout markup — Field Surveyor." },
    { key: "complete-magnet-qa-processing", text: "Complete Magnet QA and processing — Field Surveyor." },
    { key: "complete-setout-plan", text: "Complete the Setout plan — Drafting." },
    { key: "check-setout-plan", text: "Check the Setout plan — Project Manager." },
    { key: "issue-setout-plan", text: "Issue the Setout plan — Project Manager." },
    {
      key: "invoice-client-mark-complete",
      text: "Invoice the client and mark the job in the Portal as Complete — Accounts.",
    },
  ],
  "Feature and Contour Survey": [
    {
      key: "letter-of-engagement-received",
      text: "Letter of Engagement received; save it to the job folder under Documents > Received — Project Manager.",
    },
    {
      key: "complete-job-preparation",
      text: "Complete job preparation — Admin:",
      subpoints: [
        "Put the sewer sheet from the Water Corporation Esinet website into the job folder.",
        "If no sewer is nearby, note for the field crew to use GPS for AHD.",
        "Put the Deposited Plan/Plan/Diagram in the job folder.",
      ],
    },
    { key: "complete-field-survey", text: "Complete the field survey — Field Surveyor." },
    { key: "complete-magnet-processing", text: "Complete Magnet processing — Field Surveyor." },
    { key: "complete-autocad-processing", text: "Complete AutoCAD processing — Drafting." },
    {
      key: "complete-plan-check",
      text: "Complete the Feature and Contour Survey plan check — Project Manager.",
    },
    {
      key: "issue-plan-pdf-dwg-photos",
      text: "Issue the Feature and Contour Survey plan in PDF and DWG formats, together with site photographs, to the client — Project Manager.",
    },
    {
      key: "invoice-client-mark-complete",
      text: "Invoice the client and mark the job in the Portal as Complete — Accounts.",
    },
  ],
  "Repeg and Setout": [
    {
      key: "save-job-order-email",
     text: "Save the job order email into the Job Orders folder in the Admin inbox and put a copy in the job folder — Admin.",
    },
    {
      key: "print-site-and-floor-plans",
      text: "Print one site plan and two floor plans, plus an additional floor plan if zero-lot walls exist — Admin.",
    },
    {
      key: "print-survey-search-records",
      text: "If SSA, print the Deposited Plan and Survey Sheet. If not SSA and a recent survey has been completed on the street, print the Field Book and Plan, Diagram or Deposited Plan. If an alignment survey is required, complete sufficient search — Admin / Project Manager / Field Surveyor.",
    },
    { key: "complete-alignment-field-survey", text: "If required, complete the alignment field survey — Field Surveyor." },
    { key: "calculate-required-boundaries", text: "Calculate the required boundaries — Field Surveyor." },
    {
      key: "calculate-building-position",
      text: "Calculate the building position from the site plan, then use the floor plan to calculate setout points. Check boundary setbacks against the site plan — Field Surveyor.",
    },
    {
      key: "rule-up-building-floor-plan",
      text: "Rule up the building floor plan: one office copy, one site copy and one zero-lot site copy where applicable — Field Surveyor.",
    },
    {
      key: "create-point-plots-and-files",
      text: "Create and print point plots and a point listing and place them in the file. Save the GSI and DXF files to the job’s Calc directory — Field Surveyor.",
    },
    { key: "check-calculations", text: "Check the calculations — Project Manager." },
    { key: "complete-field-survey-setout-markup", text: "Complete the field survey and setout markup — Field Surveyor." },
    {
      key: "magnet-qa-boundary-improvements",
      text: "Complete Magnet QA and processing and annotate the Magnet file with improvements within 1 m of the parcel boundary — Field Surveyor.",
    },
    {
      key: "complete-repeg-setout-plan",
      text: "Complete the Repeg and Setout plan with Regulation 25A Certificate — Drafting.",
    },
    { key: "check-repeg-setout-plan", text: "Check the Repeg and Setout plan — Project Manager." },
    { key: "issue-repeg-setout-plan", text: "Issue the Repeg and Setout plan — Project Manager." },
    {
      key: "invoice-client-mark-complete",
      text: "Invoice the client and mark the job in the Portal as Complete — Accounts.",
    },
  ],
  "Subdivision - Built Strata": [
    {
      key: "letter-of-engagement-received",
      text: "Letter of Engagement received; save it to the job folder under Documents > Received — Project Manager.",
    },
    { key: "organise-site-access", text: "Organise site access — Project Manager." },
    {
      key: "alignment-survey-strata-measure-up",
      text: "Complete the alignment survey and strata measure-up — Field Surveyor.",
    },
    {
      key: "alignment-strata-boundary-calculations",
      text: "Complete alignment, strata and boundary calculations — Field Surveyor.",
    },
    { key: "produce-draft-survey-strata-plan", text: "Produce the draft Survey Strata Plan — Drafting." },
    { key: "check-draft-strata-plan", text: "Check the draft Strata Plan — Licensed Surveyor / Project Manager." },
    { key: "order-unit-entitlement", text: "Order the Unit Entitlement evaluation — Project Manager." },
    {
      key: "send-plan-unit-entitlement-bylaws",
      text: "Send the Strata Plan and Unit Entitlement to the client. Confirm whether by-laws are applicable — Project Manager.",
    },
    { key: "invoice-part-1", text: "Invoice Part 1 — Accounts." },
    { key: "draw-field-book", text: "Draw the Field Book — Field Surveyor." },
    {
      key: "final-strata-plan-check",
      text: "Complete the final Strata Plan check, including cross-reference between the Field Book and Strata Plan — Licensed Surveyor / Project Manager.",
    },
    { key: "receive-ba18", text: "Receive BA18, Certificate of Building Compliance, from the builder — Project Manager." },
    { key: "lodge-ba13", text: "Lodge BA13, Application for Building Approval — Project Manager." },
    { key: "receive-ba14", text: "Receive BA14, Building Approval Certificate — Project Manager." },
    {
      key: "lodge-strata-plan-landgate",
      text: "Lodge the Strata Plan, CSV, Field Book, Unit Entitlement and BA14 through Landgate Online — Licensed Surveyor / Project Manager.",
    },
    {
      key: "notify-client-lodged",
      text: "Notify the client that the plan has been lodged — Project Manager.",
    },
    {
      key: "inform-client-iofd",
      text: "Notify the client when the plan is In Order for Dealings and ready for title applications through a third-party conveyancer — Project Manager.",
    },
    { key: "invoice-part-2", text: "Invoice the client Part 2 and mark the job in the Portal as Complete — Accounts." },
  ],
  "Subdivision - Green Title": [
    {
      key: "letter-of-engagement-received",
      text: "Letter of Engagement received; save it to the job folder under Documents > Received — Project Manager.",
    },
    { key: "complete-feature-survey", text: "Complete the feature survey — Field Surveyor." },
    { key: "complete-magnet-processing", text: "Complete Magnet processing — Field Surveyor." },
    { key: "draft-proposed-subdivision-plan", text: "Draft the proposed subdivision plan — Drafting / Project Manager." },
    { key: "invoice-part-1-before-wapc", text: "Invoice Part 1 before submitting the WAPC application — Accounts." },
    { key: "submit-form-1a", text: "Submit Form 1A, WAPC Application — Project Manager / Admin." },
    {
      key: "receive-wapc-conditions",
      text: "Receive the WAPC conditions, forward them to the client and provide advice — Project Manager / Admin.",
    },
    { key: "lodge-water-corp-agreement", text: "Lodge Water Corp Agreement — Project Manager / Admin." },
    { key: "lodge-power-dome-application", text: "Lodge Power Dome Application — Project Manager / Admin." },
    { key: "complete-alignment-fieldwork", text: "Complete alignment fieldwork — Field Surveyor." },
    { key: "calculate-existing-proposed-boundaries", text: "Calculate the existing and proposed boundaries — Field Surveyor." },
    {
      key: "create-point-plots-and-files",
      text: "Create and print point plots and a point listing and place them in the file. Save the GSI and DXF files to the job’s Calc directory — Field Surveyor.",
    },
    { key: "check-calculations", text: "Check the calculations — Project Manager." },
    { key: "complete-final-marking", text: "Complete final marking and referencing — Field Surveyor." },
    { key: "draft-deposited-plan", text: "Draft the Deposited Plan — Drafting." },
    { key: "check-deposited-plan", text: "Check the Deposited Plan — Project Manager." },
    { key: "draw-field-book", text: "Draw the Field Book — Field Surveyor." },
    {
      key: "complete-final-deposited-plan-check",
      text: "Complete the final Deposited Plan check, including cross-reference between the Field Book and Deposited Plan — Licensed Surveyor / Project Manager.",
    },
    {
      key: "send-client-copy-request-lodgement-confirmation",
      text: "Send client copy of plan and request confirmation to lodge — Project Manager / Admin.",
    },
    {
      key: "lodge-deposited-plan",
      text: "Lodge the Deposited Plan, Field Book and CSD through Landgate Online — Licensed Surveyor / Project Manager.",
    },
    { key: "arrange-clearances", text: "Request and receive required clearances — Project Manager / Admin." },
    {
      key: "invoice-part-2",
      text: "Invoice Part 2 before submitting the WAPC Application for Endorsement — Accounts.",
    },
    { key: "submit-wapc-form-1c", text: "Submit WAPC Form 1C Application for Endorsement — Project Manager / Admin." },
    {
      key: "notify-client-iofd-title-applications",
      text: "Notify the client when the plan is In Order for Dealings and ready for title applications through a third-party conveyancer — Project Manager / Admin.",
    },
    { key: "invoice-part-3", text: "Invoice the client Part 3 and mark the job in the Portal as Complete — Accounts." },
  ],
  "Subdivision - Survey Strata": [
    {
      key: "letter-of-engagement-received",
      text: "Letter of Engagement received; save it to the job folder under Documents > Received — Project Manager.",
    },
    { key: "complete-feature-survey", text: "Complete the feature survey — Field Surveyor." },
    { key: "complete-magnet-processing", text: "Complete Magnet processing — Field Surveyor." },
    { key: "draft-proposed-subdivision-plan", text: "Draft the proposed subdivision plan — Drafting / Project Manager." },
    { key: "invoice-part-1-before-wapc", text: "Invoice Part 1 before submitting the WAPC application — Accounts." },
    { key: "submit-form-1a", text: "Submit Form 1A, WAPC Application — Project Manager / Admin." },
    {
      key: "receive-wapc-conditions",
      text: "Receive the WAPC conditions, forward them to the client and provide advice — Project Manager / Admin.",
    },
    { key: "lodge-water-corp-agreement", text: "Lodge Water Corp Agreement — Project Manager / Admin." },
    { key: "lodge-power-dome-application", text: "Lodge Power Dome Application — Project Manager / Admin." },
    { key: "complete-alignment-fieldwork", text: "Complete alignment fieldwork — Field Surveyor." },
    { key: "calculate-existing-proposed-boundaries", text: "Calculate the existing and proposed boundaries — Field Surveyor." },
    {
      key: "create-point-plots-and-files",
      text: "Create and print point plots and a point listing and place them in the file. Save the GSI and DXF files to the job’s Calc directory — Field Surveyor.",
    },
    { key: "check-calculations", text: "Check the calculations — Project Manager." },
    { key: "complete-final-marking", text: "Complete final marking and referencing — Field Surveyor." },
    { key: "draft-survey-strata-plan", text: "Draft the Survey Strata Plan — Drafting." },
    { key: "check-survey-strata-plan", text: "Check the Survey Strata Plan — Project Manager." },
    { key: "draw-field-book", text: "Draw the Field Book — Field Surveyor." },
    {
      key: "complete-final-survey-strata-plan-check",
      text: "Complete the final Survey Strata Plan check, including cross-reference between the Field Book and Survey Strata Plan — Licensed Surveyor / Project Manager.",
    },
    { key: "request-unit-entitlement", text: "Order the Unit Entitlement evaluation — Project Manager." },
    {
      key: "send-client-copy-request-lodgement-confirmation",
      text: "Send client copy of plan and request confirmation to lodge — Project Manager / Admin.",
    },
    {
      key: "lodge-survey-strata-plan",
      text: "Lodge the Survey Strata Plan, Field Book, Unit Entitlement and CSV through Landgate Online — Licensed Surveyor / Project Manager.",
    },
    { key: "arrange-clearances", text: "Request and receive required clearances — Project Manager / Admin." },
    {
      key: "invoice-part-2",
      text: "Invoice Part 2 before submitting the WAPC Application for Endorsement — Accounts.",
    },
    { key: "submit-wapc-form-1c", text: "Submit WAPC Form 1C Application for Endorsement — Project Manager / Admin." },
    {
      key: "notify-client-iofd-title-applications",
      text: "Notify the client when the plan is In Order for Dealings and ready for title applications through a third-party conveyancer — Project Manager / Admin.",
    },
    { key: "invoice-part-3", text: "Invoice the client Part 3 and mark the job in the Portal as Complete — Accounts." },
  ],
  "Subdivision - Survey Strata Conversion": [
    {
      key: "letter-of-engagement-received",
      text: "Letter of Engagement received; save it to the job folder under Documents > Received — Project Manager.",
    },
    { key: "organise-site-access", text: "Organise site access — Project Manager." },
    {
      key: "discuss-boundary-conversion-process",
      text: "Discuss the likely boundary position and conversion process with all owners — Project Manager.",
    },
    {
      key: "alignment-survey-building-pickup",
      text: "Complete the alignment survey and building pickup with sufficient information to determine the boundary location — Field Surveyor.",
    },
    { key: "alignment-boundary-calculations", text: "Complete alignment and boundary calculations — Field Surveyor." },
    { key: "produce-draft-survey-strata-plan", text: "Produce the draft Survey Strata Plan — Drafting." },
    { key: "order-unit-entitlement", text: "Order the Unit Entitlement evaluation — Project Manager." },
    {
      key: "send-draft-plan-unit-entitlement-forms",
      text: "Send the owners the draft Survey Strata Plan, Unit Entitlement and prefilled conversion forms. Have the owners sign and agree to the Survey Strata Plan — Project Manager.",
    },
    {
      key: "receive-signed-conversion-forms",
      text: "Receive the signed conversion forms and signed Survey Strata Plan. Save them to the Landgate folder — Project Manager.",
    },
    { key: "complete-osr-online-form", text: "Complete the required Office of State Revenue online form — Project Manager." },
    {
      key: "receive-osr-online-form",
      text: "Receive the completed Office of State Revenue online form. Save it to the Landgate folder — Project Manager.",
    },
    {
      key: "organise-bank-consent",
      text: "Organise bank consent from banks holding mortgages shown on the Certificate of Title — Project Manager.",
    },
    { key: "receive-bank-consent", text: "Receive bank consent from all banks. Save it to the Landgate folder — Project Manager." },
    { key: "mark-new-boundaries", text: "Mark the new boundaries — Field Surveyor." },
    {
      key: "update-survey-strata-plan-boundary-marking",
      text: "Update the Survey Strata Plan with the correct boundary marking — Drafting.",
    },
    { key: "draw-field-book", text: "Draw the Field Book — Field Surveyor." },
    {
      key: "check-plan-against-field-book",
      text: "Check the Survey Strata Plan and cross-check it against the Field Book — Field Surveyor.",
    },
    {
      key: "lodge-conversion-forms",
      text: "Lodge the conversion forms at Landgate in person and obtain the NOR number required to lodge the Survey Strata Plan — Admin.",
    },
    {
      key: "obtain-owner-lodgement-consent",
      text: "Obtain consent by email from the owners to lodge the Survey Strata Plan at Landgate — Project Manager.",
    },
    { key: "lodge-survey-strata-plan", text: "Lodge the Survey Strata Plan at Landgate — Project Manager." },
    {
      key: "invoice-client-mark-complete",
      text: "Invoice the client and mark the job in the Portal as Complete — Accounts.",
    },
  ],
  "Vacant Site Survey": [
    {
      key: "complete-job-preparation",
      text: "Complete job preparation — Admin:",
      subpoints: [
        "Put the sewer sheet from the Water Corporation Esinet website into the job folder.",
        "If no sewer is nearby, note for the field crew to use GPS for AHD.",
        "Put the Deposited Plan/Plan/Diagram in the job folder.",
        "Save job order and put a copy in the job folder.",
        "Save the job order email into the Job Orders folder in the Admin inbox.",
      ],
    },
    { key: "complete-field-survey", text: "Complete the field survey — Field Surveyor." },
    { key: "complete-magnet-processing", text: "Complete Magnet processing — Field Surveyor." },
    { key: "complete-autocad-processing", text: "Complete AutoCAD processing — Drafting." },
    { key: "complete-plan-check", text: "Complete the Vacant Site Survey plan check — Project Manager." },
    {
      key: "issue-plan-pdf-dwg-photos",
      text: "Issue the Vacant Site Survey plan in PDF and DWG formats, together with site photographs, to the client — Project Manager.",
    },
    {
      key: "invoice-client-mark-complete",
      text: "Invoice the client and mark the job in the Portal as Complete — Accounts.",
    },
  ],
};

export function getChecklistDefinition(jobCategory) {
  return JOB_CHECKLIST_DEFINITIONS[jobCategory] || null;
}

export function getChecklistHeading(jobCategory) {
  return JOB_CHECKLIST_CATEGORY_HEADINGS[jobCategory] || `${jobCategory || "Job"} Checklist`;
}

export function hasChecklistActivity(items = []) {
  return items.some((item) => item.is_completed || String(item.comments || "").trim());
}
