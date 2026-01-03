import { useEffect, useState } from "react";
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

  async function loadNotifications() {
    if (!user) return;

    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_acknowledged", false)
      .order("created_at", { ascending: false });

    setItems(data || []);
  }

  async function acknowledge(id) {
    await supabase
      .from("notifications")
      .update({ is_acknowledged: true })
      .eq("id", id);

    setItems((prev) => prev.filter((n) => n.id !== id));
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

    await supabase
      .from("notifications")
      .update({ is_acknowledged: true })
      .eq("user_id", user.id)
      .eq("is_acknowledged", false);

    setItems([]);
  }

  useEffect(() => {
    loadNotifications();

    if (!user) return;

    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => loadNotifications()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user]);

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
        onClick={() => setOpen((v) => !v)}
        type="button"
        aria-label="Notifications"
        title="Notifications"
      >
        🔔
        {count > 0 && <span className="notification-badge">{count}</span>}
      </button>

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
