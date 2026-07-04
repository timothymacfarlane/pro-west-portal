# Vehicle Prestart Manager Alert Setup

This runbook sets up manager email notifications for submitted Vehicle Prestart checklists. Do not put real API keys or webhook secrets in source control.

## 1. Create the Resend account

1. Sign in to Resend with `admin@prowestsurveying.com.au`.
2. Create a sending API key with permission to send email.
3. Copy the API key into a secure password manager. It will be entered as a Supabase Edge Function secret only.

For initial testing, use the Resend sandbox sender:

```text
Pro West Portal <onboarding@resend.dev>
```

Resend's sandbox sender is intended for testing and may only send to the verified Resend account email. This avoids DNS verification for the initial test. Later, verify the Pro West sending domain in Resend and replace the sender secret with the verified sender address.

## 2. Apply the database migration

From the repository root, apply migrations to the linked Supabase project:

```bash
supabase db push
```

This applies `supabase/migrations/20260704000000_vehicle_prestart_manager_alerts.sql`.

Do this only when ready to update the live Supabase database.

## 3. Generate a webhook secret

Generate a long random secret and keep it private:

```bash
openssl rand -base64 32
```

Use the generated value for `VEHICLE_ALERT_WEBHOOK_SECRET` and for the Database Webhook custom header.

## 4. Find the Supabase project reference

In Supabase Dashboard, open the project and copy the project reference from Project Settings. It is also visible in function URLs:

```text
https://<PROJECT_REF>.supabase.co/functions/v1/send-vehicle-prestart-manager-alert
```

## 5. Set Edge Function secrets

Set these Supabase secrets. Use placeholders here; enter real values only in Supabase.

```bash
supabase secrets set \
  RESEND_API_KEY='<RESEND_API_KEY>' \
  VEHICLE_ALERT_TO='admin@prowestsurveying.com.au' \
  VEHICLE_ALERT_FROM='Pro West Portal <onboarding@resend.dev>' \
  VEHICLE_ALERT_WEBHOOK_SECRET='<GENERATED_WEBHOOK_SECRET>' \
  PORTAL_BASE_URL='https://<PORTAL_HOSTNAME>'
```

`VEHICLE_ALERT_TO` may be one email address or a comma-separated list of valid email addresses.

## 6. Deploy the Edge Function

Deploy only after secrets are configured:

```bash
supabase functions deploy send-vehicle-prestart-manager-alert
```

The function has `verify_jwt = false` because it is called by a Database Webhook, not by a browser user. The custom `x-vehicle-alert-secret` header is required for every accepted request.

## 7. Create the Database Webhook

In Supabase Dashboard:

1. Open Database > Webhooks.
2. Create a new webhook.
3. Name it `send-vehicle-prestart-manager-alert`.
4. Set table to `public.vehicle_prestart_submissions`.
5. Enable only the `UPDATE` event.
6. Set method to `POST`.
7. Set URL to:

```text
https://<PROJECT_REF>.supabase.co/functions/v1/send-vehicle-prestart-manager-alert
```

8. Add this custom header:

```text
x-vehicle-alert-secret: <GENERATED_WEBHOOK_SECRET>
```

9. Save the webhook.

## 8. Test cases

### Notify Manager unticked

1. Submit a Vehicle Prestart with all required fields complete and Notify Manager unticked.
2. Confirm the PDF uploads and the submission reaches `submitted`.
3. Confirm `manager_alert_status` is `not_required`.
4. Confirm no email appears in Resend logs.
5. Confirm the Vehicle Prestart Register shows `Not requested`.

### Notify Manager ticked with all Yes or N/A

1. Submit a Vehicle Prestart with Notify Manager ticked and no checklist answers marked No.
2. Confirm the PDF uploads and the submission reaches `submitted`.
3. Confirm `manager_alert_status` moves through `pending`/`processing` to `sent`.
4. Confirm the email includes the statement that no checklist items were marked No and that manager notification was manually requested.
5. Confirm the Vehicle Prestart Register shows `Sent` with the sent time.

### Notify Manager ticked with a No response

1. Submit a Vehicle Prestart with at least one checklist answer marked No.
2. Confirm comments are required before submission.
3. Confirm Notify Manager is required before submission.
4. Confirm the email includes an `Items marked No:` section.

### Reply-To

1. Submit while logged in as a portal user whose Supabase Auth email is known.
2. Open the received email.
3. Confirm Reply-To is the authenticated portal user's email, not the selected Employee dropdown unless they are the same user.
4. If the authenticated user's email cannot be resolved, confirm the email still sends without Reply-To and the alert audit stores a blank Reply-To.

## 9. Logs

View Supabase Edge Function logs in Dashboard > Edge Functions > `send-vehicle-prestart-manager-alert` > Logs.

View delivery logs in Resend Dashboard > Emails.

Do not paste API keys, authorization headers, or webhook secrets into logs or support tickets.

## 10. Changing recipients later

Update the recipient without changing source code:

```bash
supabase secrets set VEHICLE_ALERT_TO='manager@example.com, second.manager@example.com'
```

Redeploying is not normally required for secret changes, but verify in Supabase if the runtime does not pick up the new value immediately.

## 11. Changing to a verified sender later

1. Verify the sending domain in Resend.
2. Replace the sender secret:

```bash
supabase secrets set VEHICLE_ALERT_FROM='Pro West Portal <notifications@<VERIFIED_DOMAIN>>'
```

3. Send a Notify Manager test and verify delivery.

## 12. Rotating secrets

### Resend API key

1. Create a new Resend API key.
2. Update Supabase:

```bash
supabase secrets set RESEND_API_KEY='<NEW_RESEND_API_KEY>'
```

3. Run a test submission.
4. Revoke the old Resend API key.

### Webhook secret

1. Generate a new secret:

```bash
openssl rand -base64 32
```

2. Update Supabase secret:

```bash
supabase secrets set VEHICLE_ALERT_WEBHOOK_SECRET='<NEW_WEBHOOK_SECRET>'
```

3. Update the Database Webhook `x-vehicle-alert-secret` header to the same new value.
4. Run a Notify Manager test.
