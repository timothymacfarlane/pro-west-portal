do $$
begin
  if to_regclass('public.vehicle_prestart_submissions') is not null then
    create or replace function public.protect_vehicle_prestart_manager_alert_fields()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
    as $fn$
    declare
      jwt_role text := coalesce(
        auth.role(),
        current_setting('request.jwt.claim.role', true),
        current_setting('role', true),
        ''
      );
      current_user_id uuid := auth.uid();
      new_status text := coalesce(new.manager_alert_status, 'not_required');
    begin
      -- Supabase service-role requests are trusted server-side operations.
      -- They are used by Edge Functions to claim and audit manager-alert delivery.
      if jwt_role = 'service_role' then
        return new;
      end if;

      if tg_op = 'INSERT' then
        if new.submitted_by_user_id is not null and new.submitted_by_user_id <> current_user_id then
          raise exception 'submitted_by_user_id must match authenticated user';
        end if;

        if new.manager_alert_status not in ('not_required', 'pending') then
          raise exception 'manager alert status is not allowed from the browser';
        end if;

        if new.manager_alert_sent_at is not null
          or new.manager_alert_last_attempt_at is not null
          or coalesce(new.manager_alert_attempts, 0) <> 0
          or new.manager_alert_recipient is not null
          or new.manager_alert_reply_to is not null
          or new.manager_alert_provider_message_id is not null
          or new.manager_alert_error is not null then
          raise exception 'manager alert delivery fields are server-managed';
        end if;

        return new;
      end if;

      if new.submitted_by_user_id is distinct from old.submitted_by_user_id then
        if new.submitted_by_user_id is not null and new.submitted_by_user_id <> current_user_id then
          raise exception 'submitted_by_user_id must match authenticated user';
        end if;
      end if;

      if new.manager_alert_status is distinct from old.manager_alert_status then
        if not (
          old.submitted_status = 'pdf_pending'
          and old.pdf_path is null
          and new.submitted_status = 'submitted'
          and new.pdf_path is not null
          and new_status in ('pending', 'not_required')
        ) then
          raise exception 'manager alert status is server-managed after submission';
        end if;
      end if;

      if new.manager_alert_sent_at is distinct from old.manager_alert_sent_at
        or new.manager_alert_last_attempt_at is distinct from old.manager_alert_last_attempt_at
        or new.manager_alert_attempts is distinct from old.manager_alert_attempts
        or new.manager_alert_recipient is distinct from old.manager_alert_recipient
        or new.manager_alert_reply_to is distinct from old.manager_alert_reply_to
        or new.manager_alert_provider_message_id is distinct from old.manager_alert_provider_message_id
        or new.manager_alert_error is distinct from old.manager_alert_error then
        raise exception 'manager alert delivery fields are server-managed';
      end if;

      return new;
    end;
    $fn$;
  end if;
end $$;
