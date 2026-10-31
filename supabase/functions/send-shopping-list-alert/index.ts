import { createClient } from "npm:@supabase/supabase-js@2";

type EmailEvent = {
  id: string;
  item_id: string;
  event_type: "added" | "edited";
  item_text: string;
  previous_text: string | null;
  actor_id: string | null;
  actor_name: string | null;
  occurred_at: string;
  status: "pending" | "processing" | "sent" | "failed";
  attempts: number;
  last_attempt_at: string | null;
  sent_at: string | null;
};

const TABLE = "shopping_list_email_events";
const TO = "admin@prowestsurveying.com.au";
const encoder = new TextEncoder();

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function constantTimeEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    difference |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return difference === 0;
}

async function validSignature(eventId: string, provided: string, secret: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/i.test(provided)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(eventId)));
  const expected = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return constantTimeEqual(expected, provided.toLowerCase());
}

function formatPerthDateTime(value: string): string {
  return new Date(value).toLocaleString("en-AU", {
    timeZone: "Australia/Perth",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function emailContent(event: EmailEvent, portalBaseUrl: string) {
  const isEdit = event.event_type === "edited";
  const title = isEdit ? "Shopping List item edited" : "Shopping List item added";
  const actor = event.actor_name || "Unknown user";
  const date = formatPerthDateTime(event.occurred_at);
  const listUrl = `${portalBaseUrl.replace(/\/+$/, "")}/shopping-list`;
  const rows = [
    ["Item", event.item_text],
    ...(isEdit ? [["Previous item", event.previous_text || "—"]] : []),
    [isEdit ? "Edited by" : "Added by", actor],
    ["When", date],
  ];

  return {
    subject: `Pro West Portal - ${title}`,
    text: [
      title,
      "",
      ...rows.map(([label, value]) => `${label}: ${value}`),
      "",
      `Open Shopping List: ${listUrl}`,
    ].join("\n"),
    html: `<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #1f2933; line-height: 1.45;">
    <h1 style="font-size: 20px; margin: 0 0 12px;">${escapeHtml(title)}</h1>
    <p>An item on the Pro West Portal Shopping List was ${isEdit ? "edited" : "added"}.</p>
    <table style="border-collapse: collapse; width: 100%; max-width: 720px;">
      <tbody>
        ${rows.map(([label, value]) => `<tr><th style="text-align: left; border-bottom: 1px solid #e5e7eb; padding: 8px; width: 230px;">${escapeHtml(label)}</th><td style="border-bottom: 1px solid #e5e7eb; padding: 8px; white-space: pre-wrap;">${escapeHtml(value)}</td></tr>`).join("")}
      </tbody>
    </table>
    <p><a href="${escapeHtml(listUrl)}">Open the Shopping List</a></p>
  </body>
</html>`,
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return json({ error: "server_not_configured" }, 500);

  let eventId = "";
  try {
    const body = await request.json();
    eventId = typeof body?.event_id === "string" ? body.event_id : "";
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(eventId)) {
    return json({ error: "invalid_event_id" }, 400);
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signingKey, error: signingKeyError } = await admin.rpc("get_shopping_list_alert_signing_key");
  if (signingKeyError || typeof signingKey !== "string" || !signingKey) {
    console.error("Shopping alert signing key unavailable", signingKeyError?.message);
    return json({ error: "server_not_configured" }, 500);
  }
  if (!await validSignature(eventId, request.headers.get("x-shopping-alert-signature") || "", signingKey)) {
    return json({ error: "unauthorized" }, 401);
  }

  const { data: row, error: readError } = await admin
    .from(TABLE)
    .select("*")
    .eq("id", eventId)
    .maybeSingle<EmailEvent>();
  if (readError) {
    console.error("Shopping alert read failed", readError.message);
    return json({ error: "read_failed" }, 500);
  }
  if (!row || row.status === "sent" || row.sent_at) return json({ ok: true, ignored: "already_sent_or_missing" });

  const lastAttempt = row.last_attempt_at ? Date.parse(row.last_attempt_at) : 0;
  const waitMs = row.status === "processing" ? 10 * 60_000 : 5 * 60_000;
  if (lastAttempt && Date.now() - lastAttempt < waitMs) {
    return json({ ok: true, ignored: "retry_not_due" });
  }

  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await admin
    .from(TABLE)
    .update({ status: "processing", last_attempt_at: now, attempts: row.attempts + 1 })
    .eq("id", eventId)
    .eq("status", row.status)
    .eq("attempts", row.attempts)
    .is("sent_at", null)
    .select("*")
    .maybeSingle<EmailEvent>();
  if (claimError) {
    console.error("Shopping alert claim failed", claimError.message);
    return json({ error: "claim_failed" }, 500);
  }
  if (!claimed) return json({ ok: true, ignored: "claimed_elsewhere" });

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY") || "";
    const from = Deno.env.get("VEHICLE_ALERT_FROM") || "";
    const portalBaseUrl = Deno.env.get("PORTAL_BASE_URL") || "";
    if (!resendKey || !from || !portalBaseUrl) {
      throw new Error("Required email configuration is missing");
    }

    let replyTo = "";
    if (claimed.actor_id) {
      const { data: actor } = await admin
        .from("profiles")
        .select("email")
        .eq("id", claimed.actor_id)
        .maybeSingle();
      if (typeof actor?.email === "string" && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(actor.email)) {
        replyTo = actor.email;
      }
    }

    const { subject, text, html } = emailContent(claimed, portalBaseUrl);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${resendKey}`,
        "content-type": "application/json",
        "idempotency-key": `shopping-list-alert/${claimed.id}`,
      },
      body: JSON.stringify({
        from,
        to: [TO],
        subject,
        html,
        text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    const provider = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Resend returned ${response.status}: ${provider?.message || provider?.error || "unknown error"}`);
    }

    const { error: sentError } = await admin
      .from(TABLE)
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: typeof provider?.id === "string" ? provider.id : null,
        last_error: null,
      })
      .eq("id", claimed.id)
      .eq("status", "processing")
      .eq("attempts", claimed.attempts);
    if (sentError) throw sentError;

    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Shopping alert delivery failed", { eventId, error: message });
    await admin
      .from(TABLE)
      .update({ status: "failed", last_error: message.slice(0, 500) })
      .eq("id", claimed.id)
      .eq("status", "processing")
      .eq("attempts", claimed.attempts);
    return json({ error: "delivery_failed" }, 500);
  }
});
