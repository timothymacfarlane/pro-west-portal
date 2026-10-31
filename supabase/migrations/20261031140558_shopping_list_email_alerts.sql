-- Keep email delivery separate from the shopping list write, so a mail outage
-- never loses an item. Only service_role can read or update delivery records.
create table public.shopping_list_email_events (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null,
  event_type text not null check (event_type in ('added', 'edited')),
  item_text text not null,
  previous_text text,
  actor_id uuid,
  actor_name text,
  occurred_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error text
);

alter table public.shopping_list_email_events enable row level security;
revoke all on table public.shopping_list_email_events from public, anon, authenticated;
grant all on table public.shopping_list_email_events to service_role;

create index shopping_list_email_events_pending_idx
  on public.shopping_list_email_events (occurred_at)
  where status in ('pending', 'failed', 'processing') and sent_at is null;

do $$
begin
  if not exists (
    select 1 from vault.secrets where name = 'shopping_list_alert_signing_key'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'shopping_list_alert_signing_key',
      'Signs shopping list email webhook requests'
    );
  end if;
end $$;

-- The Edge Function reads this through its service-role client only.
create function public.get_shopping_list_alert_signing_key()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'shopping_list_alert_signing_key'
  limit 1;
$$;

revoke all on function public.get_shopping_list_alert_signing_key() from public, anon, authenticated;
grant execute on function public.get_shopping_list_alert_signing_key() to service_role;

-- Configure shopping_list_alert_url in Vault for each environment. Without it,
-- events remain pending and the scheduled retry will send them once configured.
create function public.dispatch_shopping_list_email_events(
  p_event_id uuid default null,
  p_limit integer default 20
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  function_url text;
  signing_key text;
  event_row record;
begin
  select decrypted_secret into function_url
  from vault.decrypted_secrets
  where name = 'shopping_list_alert_url';

  select decrypted_secret into signing_key
  from vault.decrypted_secrets
  where name = 'shopping_list_alert_signing_key';

  if function_url is null or signing_key is null then
    return;
  end if;

  for event_row in
    select id
    from public.shopping_list_email_events
    where (p_event_id is null or id = p_event_id)
      and sent_at is null
      and (
        (status in ('pending', 'failed') and (
          last_attempt_at is null or last_attempt_at < now() - interval '5 minutes'
        ))
        or (status = 'processing' and last_attempt_at < now() - interval '10 minutes')
      )
    order by occurred_at
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  loop
    perform net.http_post(
      url := function_url,
      body := jsonb_build_object('event_id', event_row.id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-shopping-alert-signature',
        encode(extensions.hmac(event_row.id::text, signing_key, 'sha256'), 'hex')
      ),
      timeout_milliseconds := 5000
    );
  end loop;
end;
$$;

revoke all on function public.dispatch_shopping_list_email_events(uuid, integer) from public, anon, authenticated;

create function public.queue_shopping_list_email_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  queued_id uuid;
  editor_name text;
begin
  if tg_op = 'UPDATE' and new.item_text is not distinct from old.item_text then
    return new;
  end if;

  select nullif(btrim(display_name), '') into editor_name
  from public.profiles
  where id = (select auth.uid());

  insert into public.shopping_list_email_events (
    item_id, event_type, item_text, previous_text, actor_id, actor_name
  ) values (
    new.id,
    case when tg_op = 'INSERT' then 'added' else 'edited' end,
    new.item_text,
    case when tg_op = 'UPDATE' then old.item_text else null end,
    (select auth.uid()),
    coalesce(editor_name, case when tg_op = 'INSERT' then new.created_by_name end, 'Unknown user')
  ) returning id into queued_id;

  perform public.dispatch_shopping_list_email_events(queued_id, 1);
  return new;
end;
$$;

revoke all on function public.queue_shopping_list_email_event() from public, anon, authenticated;

create trigger shopping_list_email_event
after insert or update of item_text on public.shopping_list_items
for each row execute function public.queue_shopping_list_email_event();

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'shopping-list-email-retry') then
    perform cron.schedule(
      'shopping-list-email-retry',
      '*/5 * * * *',
      'select public.dispatch_shopping_list_email_events(null, 20);'
    );
  end if;
end $$;

notify pgrst, 'reload schema';
