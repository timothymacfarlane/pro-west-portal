import { createClient } from "npm:@supabase/supabase-js@2";

type JsonRecord = Record<string, unknown>;

type WebhookPayload = {
  type?: string;
  event?: string;
  table?: string;
  schema?: string;
  record?: JsonRecord | null;
  old_record?: JsonRecord | null;
};

type WebhookValidation =
  | { ok: true; id: string; schema: string; table: string; event: string }
  | { ok: false; reason: string; schema: string; table: string; event: string };

type SubmissionRow = {
  id: string;
  vehicle_label: string | null;
  vehicle_equipment_id: string | null;
  employee_name: string | null;
  employee_profile_id: string | null;
  odometer: number | null;
  last_service_odometer: number | null;
  next_service_odometer: number | null;
  submitted_status: string | null;
  submitted_at: string | null;
  pdf_path: string | null;
  form_data: JsonRecord | null;
  notify_manager: boolean | null;
  manager_alert_status: string | null;
  manager_alert_attempts: number | null;
  manager_alert_sent_at: string | null;
  submitted_by_user_id: string | null;
  employee_signed_off: boolean | null;
  employee_signed_off_at: string | null;
  signed_off_employee_name: string | null;
};

type VehicleRow = {
  registration_number: string | null;
  make: string | null;
  model: string | null;
  year: number | string | null;
};

type SubmitterInfo = {
  name: string;
  email: string;
};

const TABLE = "vehicle_prestart_submissions";
const SCHEMA = "public";
const PERTH_TIME_ZONE = "Australia/Perth";

const CHECK_LABELS: Record<string, string> = {
  wheels_tyres: "Wheels and tyres in good roadworthy condition",
  seats_seatbelts: "Seats and seatbelts in good condition",
  lamps_indicators_reflectors: "All lamps, indicators and reflectors visible, in a good condition and working order",
  windscreen_mirrors: "Windscreen/Mirrors clean and in good condition",
  washers_wipers: "Window washer and wipers working",
  horn: "Horn working",
  first_aid: "First aid kit in vehicle and items in date",
  fire_extinguisher: "Fire extinguisher in vehicle and last inspected within 6 months",
  camera_reverse_siren: "Camera and/or Reverse siren working",
  beacon: "Beacon in good condition and in working order",
  safety_equipment: "Safety equipment in good working order (eg: Hard hats less than 5 years old)",
  interior_clean: "Interior of the vehicle is clean, tidy and in good condition",
  washer_fluid: "Window washer fluid level",
  oil_levels: "Oil levels (brake, clutch and engine)",
  radiator_coolant: "Radiator coolant overflow tank level (When cold)",
  battery_fluid: "Battery fluid and connections free from corrosion",
  spare_tyre: "Does the vehicle have a spare tyre that's in a roadworthy condition",
  air_conditioning: "Air conditioning in working order",
  fuel_level: "Fuel level (petrol/diesel)",
};

export function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;

  for (let i = 0; i < length; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }

  return diff === 0;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value.trim());
}

export function parseRecipients(value: string): string[] {
  const recipients = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (recipients.length === 0 || recipients.some((recipient) => !isValidEmail(recipient))) {
    throw new Error("VEHICLE_ALERT_TO must contain one or more valid email addresses");
  }

  return recipients;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function valueToString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function submissionIdToString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "bigint") return value.toString();
  return "";
}

export function validateWebhookPayload(payload: WebhookPayload): WebhookValidation {
  const schema = valueToString(payload.schema);
  const table = valueToString(payload.table);
  const event = valueToString(payload.type || payload.event);
  const normalizedEvent = event.toUpperCase();

  if (schema !== SCHEMA) return { ok: false, reason: "ignored_schema", schema, table, event };
  if (table !== TABLE) return { ok: false, reason: "ignored_table", schema, table, event };
  if (normalizedEvent !== "UPDATE") return { ok: false, reason: "ignored_event", schema, table, event };

  const recordId = payload.record?.id;
  const oldRecordId = payload.old_record?.id;
  const recordIdString = submissionIdToString(recordId);
  const oldRecordIdString = submissionIdToString(oldRecordId);
  const id = recordIdString || oldRecordIdString;

  if (!id) return { ok: false, reason: "missing_submission_id", schema, table, event };
  return { ok: true, id, schema, table, event };
}

export function isEligibleForManagerAlert(row: SubmissionRow | null): boolean {
  if (!row) return false;
  return row.notify_manager === true &&
    row.submitted_status === "submitted" &&
    !!row.pdf_path &&
    row.manager_alert_sent_at == null &&
    row.manager_alert_status === "pending";
}

function titleFromKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getNoChecklistAnswers(formData: JsonRecord | null): string[] {
  const checks = formData?.checks;
  if (!checks || typeof checks !== "object" || Array.isArray(checks)) return [];

  return Object.entries(checks as Record<string, unknown>)
    .filter(([, value]) => String(value || "").trim().toLowerCase() === "no")
    .map(([key]) => CHECK_LABELS[key] || titleFromKey(key));
}

function formatPerthDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-AU", {
    timeZone: PERTH_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function valueOrDash(value: unknown): string {
  const normalized = String(value ?? "").trim();
  return normalized || "-";
}

function km(value: unknown): string {
  const normalized = valueOrDash(value);
  return normalized === "-" ? normalized : `${normalized} km`;
}

export function buildSubject(row: SubmissionRow, vehicle: VehicleRow | null): string {
  const registration = valueOrDash(vehicle?.registration_number || row.vehicle_label || row.form_data?.vehicle);
  const employee = valueOrDash(row.employee_name || row.form_data?.employeeName);
  return `Vehicle Prestart Manager Notification - ${registration} - ${employee}`;
}

function portalRegisterUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return `${trimmed}/vehicle-prestart-register`;
}

function emailFields(row: SubmissionRow, vehicle: VehicleRow | null, submitter: SubmitterInfo | null) {
  const formData = row.form_data || {};
  const signature = formData.signature && typeof formData.signature === "object"
    ? formData.signature as JsonRecord
    : {};
  const signedOff = row.employee_signed_off ?? signature.confirmed;

  return {
    registration: valueOrDash(vehicle?.registration_number || row.vehicle_label || formData.vehicle),
    make: valueOrDash(vehicle?.make),
    model: valueOrDash(vehicle?.model),
    year: valueOrDash(vehicle?.year),
    employee: valueOrDash(row.employee_name || formData.employeeName),
    submitterName: valueOrDash(submitter?.name),
    submitterEmail: valueOrDash(submitter?.email),
    submittedAt: formatPerthDateTime(row.submitted_at || String(formData.submittedAt || "")),
    odometer: km(row.odometer ?? formData.odometer),
    lastService: km(row.last_service_odometer ?? formData.lastServiceOdometer ?? formData.lastService),
    nextService: km(row.next_service_odometer ?? formData.nextServiceOdometer ?? formData.nextService),
    comments: valueOrDash(formData.comments),
    signoff: signedOff ? "Signed off" : "Not signed off",
  };
}

export function buildTextBody(row: SubmissionRow, vehicle: VehicleRow | null, submitter: SubmitterInfo | null, baseUrl: string): string {
  const fields = emailFields(row, vehicle, submitter);
  const noAnswers = getNoChecklistAnswers(row.form_data);
  const noSection = noAnswers.length
    ? `Items marked No:\n${noAnswers.map((item) => `- ${item}`).join("\n")}`
    : "No checklist items were marked No. The employee manually requested manager notification.";

  return [
    "Vehicle Prestart Manager Notification",
    "",
    "The employee requested that a manager be notified about this submitted Vehicle Prestart checklist.",
    "",
    `Registration: ${fields.registration}`,
    `Vehicle make: ${fields.make}`,
    `Vehicle model: ${fields.model}`,
    `Vehicle year: ${fields.year}`,
    `Employee selected on checklist: ${fields.employee}`,
    `Authenticated portal submitter: ${fields.submitterName}`,
    `Authenticated portal submitter email: ${fields.submitterEmail}`,
    `Submitted: ${fields.submittedAt}`,
    `Current odometer: ${fields.odometer}`,
    `Last-service odometer: ${fields.lastService}`,
    `Next-service odometer: ${fields.nextService}`,
    `Comments: ${fields.comments}`,
    `Employee sign-off status: ${fields.signoff}`,
    "",
    noSection,
    "",
    `Vehicle Prestart Register: ${portalRegisterUrl(baseUrl)}`,
  ].join("\n");
}

export function buildHtmlBody(row: SubmissionRow, vehicle: VehicleRow | null, submitter: SubmitterInfo | null, baseUrl: string): string {
  const fields = emailFields(row, vehicle, submitter);
  const noAnswers = getNoChecklistAnswers(row.form_data);
  const rows = [
    ["Registration", fields.registration],
    ["Vehicle make", fields.make],
    ["Vehicle model", fields.model],
    ["Vehicle year", fields.year],
    ["Employee selected on checklist", fields.employee],
    ["Authenticated portal submitter", fields.submitterName],
    ["Authenticated portal submitter email", fields.submitterEmail],
    ["Submitted", fields.submittedAt],
    ["Current odometer", fields.odometer],
    ["Last-service odometer", fields.lastService],
    ["Next-service odometer", fields.nextService],
    ["Comments", fields.comments],
    ["Employee sign-off status", fields.signoff],
  ];

  const noHtml = noAnswers.length
    ? `<h2>Items marked No:</h2><ul>${noAnswers.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : `<p><strong>No checklist items were marked No.</strong> The employee manually requested manager notification.</p>`;

  return `<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #1f2933; line-height: 1.45;">
    <h1 style="font-size: 20px; margin: 0 0 12px;">Vehicle Prestart Manager Notification</h1>
    <p>The employee requested that a manager be notified about this submitted Vehicle Prestart checklist.</p>
    <table style="border-collapse: collapse; width: 100%; max-width: 720px;">
      <tbody>
        ${rows.map(([label, value]) => `<tr><th style="text-align: left; border-bottom: 1px solid #e5e7eb; padding: 8px; width: 230px;">${escapeHtml(label)}</th><td style="border-bottom: 1px solid #e5e7eb; padding: 8px;">${escapeHtml(value)}</td></tr>`).join("")}
      </tbody>
    </table>
    ${noHtml}
    <p><a href="${escapeHtml(portalRegisterUrl(baseUrl))}">Open the Vehicle Prestart Register</a></p>
  </body>
</html>`;
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  return message.replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]").slice(0, 500);
}

function logStage(message: string, details: JsonRecord = {}) {
  console.log(`[vehicle-alert] ${message}`, details);
}

function rowDebug(row: SubmissionRow | null): JsonRecord {
  return {
    found: !!row,
    notify_manager: row?.notify_manager ?? null,
    submitted_status: row?.submitted_status ?? null,
    pdf_path_present: !!row?.pdf_path,
    manager_alert_status: row?.manager_alert_status ?? null,
    manager_alert_sent_at_present: !!row?.manager_alert_sent_at,
  };
}

function jsonResponse(body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function resolveSubmitter(supabaseAdmin: ReturnType<typeof createClient>, userId: string | null): Promise<SubmitterInfo | null> {
  if (!userId) return null;

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (authError || !authData?.user?.email || !isValidEmail(authData.user.email)) {
    console.warn("Vehicle alert Reply-To could not be resolved from Auth Admin", { userId, error: authError?.message });
    return null;
  }

  let profileName = "";
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.display_name) profileName = String(profile.display_name).trim();

  const metadata = authData.user.user_metadata || {};
  const metadataName = String(metadata.full_name || metadata.name || "").trim();

  return {
    name: profileName || metadataName || authData.user.email,
    email: authData.user.email,
  };
}

async function markFailed(supabaseAdmin: ReturnType<typeof createClient>, row: SubmissionRow, error: string) {
  const { data, error: updateError } = await supabaseAdmin
    .from(TABLE)
    .update({
      manager_alert_status: "failed",
      manager_alert_last_attempt_at: new Date().toISOString(),
      manager_alert_attempts: (row.manager_alert_attempts ?? 0) + 1,
      manager_alert_error: safeError(error),
    })
    .eq("id", row.id)
    .select("id, manager_alert_status, manager_alert_error");

  logStage("failed audit update result", {
    submission_id: row.id,
    updated_count: data?.length ?? 0,
    error: updateError?.message ?? null,
  });
}

Deno.serve(async (request) => {
  logStage("request received", {
    method: request.method,
    webhook_secret_header_present: request.headers.has("x-vehicle-alert-secret"),
  });

  if (request.method !== "POST") {
    logStage("request rejected", { reason: "method_not_allowed", method: request.method });
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const webhookSecret = Deno.env.get("VEHICLE_ALERT_WEBHOOK_SECRET") || "";
  const providedSecret = request.headers.get("x-vehicle-alert-secret") || "";
  if (!webhookSecret || !providedSecret || !constantTimeEqual(providedSecret, webhookSecret)) {
    logStage("webhook secret validation failed", {
      configured: !!webhookSecret,
      header_present: !!providedSecret,
    });
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  logStage("webhook secret validation passed");

  let payload: WebhookPayload;
  try {
    payload = await request.json();
  } catch {
    logStage("request rejected", { reason: "invalid_json" });
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  logStage("webhook payload received", {
    payload_keys: Object.keys(payload || {}),
    record_keys: payload.record && typeof payload.record === "object" ? Object.keys(payload.record) : [],
    old_record_keys: payload.old_record && typeof payload.old_record === "object" ? Object.keys(payload.old_record) : [],
    record_id_type: typeof payload.record?.id,
    record_id_present: payload.record?.id !== null && payload.record?.id !== undefined,
    old_record_id_type: typeof payload.old_record?.id,
    old_record_id_present: payload.old_record?.id !== null && payload.old_record?.id !== undefined,
  });

  const validation = validateWebhookPayload(payload);
  logStage("webhook payload resolved", {
    schema: validation.schema,
    table: validation.table,
    event: validation.event,
    submission_id: validation.ok ? validation.id : null,
    submission_id_type: validation.ok ? typeof validation.id : null,
    validation_ok: validation.ok,
    reason: validation.ok ? null : validation.reason,
  });
  if (!validation.ok) {
    if (validation.reason === "missing_submission_id") {
      return jsonResponse({
        error: "missing_submission_id",
        payload_keys: Object.keys(payload || {}),
        record_keys: payload.record && typeof payload.record === "object" ? Object.keys(payload.record) : [],
        old_record_keys: payload.old_record && typeof payload.old_record === "object" ? Object.keys(payload.old_record) : [],
        record_id_type: typeof payload.record?.id,
        record_id_present: payload.record?.id !== null && payload.record?.id !== undefined,
        old_record_id_type: typeof payload.old_record?.id,
        old_record_id_present: payload.old_record?.id !== null && payload.old_record?.id !== undefined,
      }, 400);
    }
    return jsonResponse({ ok: true, ignored: validation.reason });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) {
    logStage("server configuration missing", {
      supabase_url_present: !!supabaseUrl,
      service_role_key_present: !!serviceRoleKey,
    });
    return jsonResponse({ error: "server_not_configured" }, 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: currentRow, error: fetchError } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("id", validation.id)
    .maybeSingle<SubmissionRow>();

  if (fetchError) {
    console.error("Vehicle alert fetch failed", { submissionId: validation.id, error: fetchError.message });
    return jsonResponse({ error: "fetch_failed" }, 500);
  }

  logStage("submission fetch result", {
    submission_id: validation.id,
    ...rowDebug(currentRow),
  });

  const eligible = isEligibleForManagerAlert(currentRow);
  logStage("submission eligibility check result", {
    submission_id: validation.id,
    eligible,
    ...rowDebug(currentRow),
  });

  if (!eligible) {
    return jsonResponse({ ok: true, ignored: "not_eligible", current: rowDebug(currentRow) });
  }

  logStage("claim update attempted", {
    submission_id: validation.id,
    from_status: "pending",
    to_status: "processing",
  });

  const { data: claimedRows, error: claimError } = await supabaseAdmin
    .from(TABLE)
    .update({ manager_alert_status: "processing" })
    .eq("id", validation.id)
    .eq("notify_manager", true)
    .eq("submitted_status", "submitted")
    .not("pdf_path", "is", null)
    .is("manager_alert_sent_at", null)
    .eq("manager_alert_status", "pending")
    .select("*");

  logStage("claim update result", {
    submission_id: validation.id,
    updated_count: claimedRows?.length ?? 0,
    error: claimError?.message ?? null,
    data_present: Array.isArray(claimedRows) && claimedRows.length > 0,
  });

  if (claimError) {
    console.error("Vehicle alert claim failed", { submissionId: validation.id, error: claimError.message });
    return jsonResponse({ error: "claim_failed" }, 500);
  }

  const claimed = (claimedRows?.[0] || null) as SubmissionRow | null;
  if (!claimed) {
    logStage("claim matched zero rows", {
      submission_id: validation.id,
      current: rowDebug(currentRow),
    });
    return jsonResponse({ ok: true, ignored: "claim_matched_zero_rows", current: rowDebug(currentRow) });
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
  const recipientConfig = Deno.env.get("VEHICLE_ALERT_TO") || "";
  const from = Deno.env.get("VEHICLE_ALERT_FROM") || "";
  const portalBaseUrl = Deno.env.get("PORTAL_BASE_URL") || "";

  try {
    const missingSecrets = [
      !resendApiKey ? "RESEND_API_KEY" : "",
      !recipientConfig ? "VEHICLE_ALERT_TO" : "",
      !from ? "VEHICLE_ALERT_FROM" : "",
      !portalBaseUrl ? "PORTAL_BASE_URL" : "",
    ].filter(Boolean);

    logStage("required secret check", {
      missing: missingSecrets,
      resend_api_key_present: !!resendApiKey,
      vehicle_alert_to_present: !!recipientConfig,
      vehicle_alert_from_present: !!from,
      portal_base_url_present: !!portalBaseUrl,
    });

    if (missingSecrets.length) {
      throw new Error(`Missing required Edge Function secret(s): ${missingSecrets.join(", ")}`);
    }

    const to = parseRecipients(recipientConfig);
    const submitter = await resolveSubmitter(supabaseAdmin, claimed.submitted_by_user_id);
    const replyTo = submitter?.email && isValidEmail(submitter.email) ? submitter.email : "";

    let vehicle: VehicleRow | null = null;
    if (claimed.vehicle_equipment_id) {
      const { data: vehicleData } = await supabaseAdmin
        .from("equipment_register")
        .select("registration_number, make, model, year")
        .eq("id", claimed.vehicle_equipment_id)
        .maybeSingle<VehicleRow>();
      vehicle = vehicleData || null;
    }

    const subject = buildSubject(claimed, vehicle);
    const text = buildTextBody(claimed, vehicle, submitter, portalBaseUrl);
    const html = buildHtmlBody(claimed, vehicle, submitter, portalBaseUrl);

    logStage("Resend send attempted", {
      submission_id: claimed.id,
      recipient_count: to.length,
      reply_to_present: !!replyTo,
    });

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${resendApiKey}`,
        "content-type": "application/json",
        "idempotency-key": `vehicle-prestart-manager-alert/${claimed.id}`,
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        html,
        text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });

    const providerBody = await resendResponse.json().catch(() => ({}));
    if (!resendResponse.ok) {
      logStage("Resend failure", {
        submission_id: claimed.id,
        status: resendResponse.status,
        error: providerBody?.message || providerBody?.error || "unknown error",
      });
      throw new Error(`Resend send failed (${resendResponse.status}): ${providerBody?.message || providerBody?.error || "unknown error"}`);
    }

    logStage("Resend success", {
      submission_id: claimed.id,
      provider_message_id_present: typeof providerBody?.id === "string",
    });

    const providerMessageId = typeof providerBody?.id === "string" ? providerBody.id : null;
    const now = new Date().toISOString();

    const { data: sentRows, error: sentUpdateError } = await supabaseAdmin
      .from(TABLE)
      .update({
        manager_alert_status: "sent",
        manager_alert_sent_at: now,
        manager_alert_last_attempt_at: now,
        manager_alert_attempts: (claimed.manager_alert_attempts ?? 0) + 1,
        manager_alert_recipient: to.join(", "),
        manager_alert_reply_to: replyTo || null,
        manager_alert_provider_message_id: providerMessageId,
        manager_alert_error: null,
      })
      .eq("id", claimed.id)
      .select("id, manager_alert_status, manager_alert_sent_at");

    logStage("final audit update result", {
      submission_id: claimed.id,
      updated_count: sentRows?.length ?? 0,
      error: sentUpdateError?.message ?? null,
    });

    if (sentUpdateError) {
      throw new Error(`Email sent but audit update failed: ${sentUpdateError.message}`);
    }

    return jsonResponse({ ok: true, sent: true });
  } catch (error) {
    const message = safeError(error);
    console.error("Vehicle alert delivery failed", { submissionId: claimed.id, error: message });
    await markFailed(supabaseAdmin, claimed, message);
    return jsonResponse({ ok: false, error: "delivery_failed" }, 500);
  }
});
