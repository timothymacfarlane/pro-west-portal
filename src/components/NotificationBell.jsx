import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function formatDateTimeAU(value) {
  if (!value) return "";
  const d = new Date(value);
  return d.toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [liveAlert, setLiveAlert] = useState(null);
  const loadRequestRef = useRef(0);
  const alertTimerRef = useRef(null);
  const openRef = useRef(false);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  async function loadNotifications() {
    if (!user) return;
    const requestId = ++loadRequestRef.current;

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_acknowledged", false)
      .order("created_at", { ascending: false });

    if (requestId !== loadRequestRef.current) return;
    if (error) {
      console.warn("Could not refresh notifications:", error);
      return;
    }
    setItems(data || []);
  }

  async function acknowledge(id) {
    ++loadRequestRef.current;
    await supabase
      .from("notifications")
      .update({ is_acknowledged: true })
      .eq("id", id);

    setItems((prev) => prev.filter((n) => n.id !== id));
    setLiveAlert((prev) => prev?.id === id ? null : prev);
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      const wrap = document.querySelector('.notification-wrapper');
      if (wrap && !wrap.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  async function acknowledgeAll() {
    if (!user) return;
    ++loadRequestRef.current;

    await supabase
      .from("notifications")
      .update({ is_acknowledged: true })
      .eq("user_id", user.id)
      .eq("is_acknowledged", false);

    setItems([]);
    setLiveAlert(null);
  }

 useEffect(() => {
  if (!user?.id) return;

  // Keep the initial read even if the live connection is unavailable.
  loadNotifications();

  const refreshOnReturn = () => {
    if (document.visibilityState === "visible") loadNotifications();
  };
  const refreshAfterPageRestore = (event) => {
    if (event.persisted) loadNotifications();
  };
  document.addEventListener("visibilitychange", refreshOnReturn);
  window.addEventListener("pageshow", refreshAfterPageRestore);

  const channel = supabase
    .channel(`notifications-realtime-${user.id}`)

    // ✅ INSERT: push into state immediately (instant badge update)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      },
      (payload) => {
        const row = payload?.new;
        if (!row || row.is_acknowledged) return;

        setItems((prev) => {
          // prevent duplicates if loadNotifications also runs
          if (prev.some((n) => n.id === row.id)) return prev;
          return [row, ...prev];
        });
        if (document.visibilityState === "visible" && !openRef.current) {
          setLiveAlert(row);
          if (alertTimerRef.current) window.clearTimeout(alertTimerRef.current);
          alertTimerRef.current = window.setTimeout(() => setLiveAlert(null), 7000);
        }
        // Reconcile with the database if a load and an insert overlapped.
        loadNotifications();
      }
    )

    // ✅ UPDATE: if another device clears/acknowledges, remove instantly
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      },
      (payload) => {
        const row = payload?.new;
        if (!row) return;

        if (row.is_acknowledged) {
          setItems((prev) => prev.filter((n) => n.id !== row.id));
          setLiveAlert((prev) => prev?.id === row.id ? null : prev);
        } else {
          setItems((prev) => prev.some((n) => n.id === row.id)
            ? prev.map((n) => (n.id === row.id ? row : n))
            : [row, ...prev]);
        }
        loadNotifications();
      }
    )
    .subscribe((status) => {
      // A fresh read fills any gap while the socket was connecting or offline.
      if (status === "SUBSCRIBED") loadNotifications();
    });

  return () => {
    ++loadRequestRef.current;
    if (alertTimerRef.current) window.clearTimeout(alertTimerRef.current);
    document.removeEventListener("visibilitychange", refreshOnReturn);
    window.removeEventListener("pageshow", refreshAfterPageRestore);
    supabase.removeChannel(channel);
  };
  // IMPORTANT: depend on user.id, not the whole user object
}, [user?.id]);


 

  const count = items.length;

  // Prevent background scroll when notifications are open (mobile-friendly)
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="notification-wrapper">
      <button
        className="notification-bell"
        onClick={() => {
          setLiveAlert(null);
          setOpen((v) => !v);
        }}
        type="button"
        aria-label="Notifications"
        title="Notifications"
      >
        🔔
        {count > 0 && <span className="notification-badge">{count}</span>}
      </button>
      {liveAlert && (
        <button
          className="notification-live-alert"
          type="button"
          aria-live="polite"
          onClick={() => {
            setLiveAlert(null);
            setOpen(true);
          }}
        >
          <strong>{liveAlert.title}</strong>
          <span>{liveAlert.body}</span>
          <small>Tap to view notification</small>
        </button>
      )}
{open && (
  <button
    type="button"
    className="notification-backdrop"
    onClick={() => setOpen(false)}
    aria-label="Close notifications"
  />
)}

      {open && (
        <div className="notification-dropdown" role="menu" aria-label="Notifications list">
          <div className="notification-header">
            <strong>Notifications</strong>
            {count > 0 && (
              <button type="button" onClick={acknowledgeAll}>
                Clear all
              </button>
            )}
          </div>

          {count === 0 && (
            <div className="notification-empty">
              No new notifications
            </div>
          )}

          {items.map((n) => (
            <div
              key={n.id}
              className="notification-item"
              role="menuitem"
              tabIndex={0}
              style={{ cursor: "pointer" }}
              onClick={() => {
                acknowledge(n.id);
                navigate("/my-jobs");
                setOpen(false);
              }}
            >
              <div className="notification-title">{n.title}</div>

              <div className="notification-body">
                {n.body}
              </div>

              <div
                style={{
                  fontSize: "11px",
                  opacity: 0.7,
                  marginTop: 4,
                }}
              >
                {formatDateTimeAU(n.created_at)}
              </div>

              <div className="notification-actions">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation(); // prevent card click
                    acknowledge(n.id);
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
