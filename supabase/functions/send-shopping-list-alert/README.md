# Shopping List email alerts

The `shopping_list_email_alerts` migration queues one email event when an item is added or its `item_text` changes. Purchased status changes and deletions do not queue an email. The Shopping List page does not need to stay open: the database calls this Edge Function after commit, and a five-minute cron job retries pending or failed events.

The function uses the existing `RESEND_API_KEY`, `VEHICLE_ALERT_FROM`, and `PORTAL_BASE_URL` Edge Function secrets. It sends to `admin@prowestsurveying.com.au`. The database creates a random signing key in Vault; the function verifies a signed event ID before reading or sending any event.

After deploying the function and applying the migration in a new Supabase environment, set that environment's function URL in Vault (do not put the signing key or Resend key in source control):

```sql
select vault.create_secret(
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-shopping-list-alert',
  'shopping_list_alert_url',
  'Edge Function URL for shopping list email notifications'
);
```

The production project's URL has already been configured. If the URL is absent, item saves still work and email events stay pending until it is configured.

Check delivery without exposing message contents:

```sql
select event_type, status, attempts, occurred_at, sent_at, last_error
from public.shopping_list_email_events
order by occurred_at desc
limit 20;
```

Only `service_role` can read the delivery table. Its RLS policy list is intentionally empty. The Edge Function reuses the vehicle prestart sender address so the notification comes from the same verified domain.
