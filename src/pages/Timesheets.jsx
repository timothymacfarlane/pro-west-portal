import { useEffect, useMemo, useState } from "react";
import PageLayout from "../components/PageLayout.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient";
import { useAppVisibilityContext } from "../context/AppVisibilityContext.jsx";

// ----- Helpers for dates & times -----
function startOfFortnightMonday(baseDate = new Date()) {
  const d = new Date(baseDate);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfWeekMonday(baseDate = new Date()) {
  const d = new Date(baseDate);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}
// ✅ Anchor your payroll cycle to a known "Period 1 Monday"
const PAY_CYCLE_ANCHOR_MONDAY = startOfWeekMonday(new Date("2026-01-12T00:00:00")); 
// ^ change this date to whatever your real payroll cycle started on

function startOfPayFortnightMonday(baseDate = new Date()) {
  const chosenMonday = startOfWeekMonday(baseDate);

  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor((chosenMonday - PAY_CYCLE_ANCHOR_MONDAY) / msPerDay);

  // floor to the fortnight block index (can be negative if chosen is before anchor)
  const blockIndex = Math.floor(diffDays / 14);

  const start = new Date(PAY_CYCLE_ANCHOR_MONDAY);
  start.setDate(start.getDate() + blockIndex * 14);
  start.setHours(0, 0, 0, 0);
  return start;
}
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function formatDateLabel(date) {
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}
function formatDayName(date, short = false) {
  return date.toLocaleDateString("en-AU", { weekday: short ? "short" : "long" });
}
function parseTimeToMinutes(str) {
  if (!str || typeof str !== "string") return null;
  const parts = str.split(":");
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}
function minutesToHHMM(mins) {
  if (mins == null || mins === "") return "";
  const m = Number(mins);
  if (!Number.isFinite(m) || m < 0) return "";
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function minutesToHoursDecimal(minutes) {
  if (minutes == null) return "";
  const decimal = minutes / 60;
  return decimal.toFixed(2).replace(/\.00$/, "");
}
function localIsoDate(d) {
  const date = new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function useIsMobile(breakpointPx = 520) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(max-width: ${breakpointPx}px)`).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const handler = (e) => setIsMobile(e.matches);

    if (mq.addEventListener) mq.addEventListener("change", handler);
    else mq.addListener(handler);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", handler);
      else mq.removeListener(handler);
    };
  }, [breakpointPx]);

  return isMobile;
}
function Timesheets() {
  const { user, isAdmin } = useAuth();
  const isMobile = useIsMobile(520);
  const todayIso = localIsoDate(new Date());

  const [staff, setStaff] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(user?.id || "");
  const [selectedName, setSelectedName] = useState("");

  const [periodStart, setPeriodStart] = useState(startOfPayFortnightMonday());
  const periodStartIso = useMemo(() => localIsoDate(periodStart), [periodStart]);

  const [jumpDate, setJumpDate] = useState(periodStartIso);
  useEffect(() => setJumpDate(periodStartIso), [periodStartIso]);

const [entries, setEntries] = useState({});
const [loadingPeriod, setLoadingPeriod] = useState(false);
const [busy, setBusy] = useState(false);
const [statusMessage, setStatusMessage] = useState("");
const [statusError, setStatusError] = useState("");
const [savedFields, setSavedFields] = useState({});
const [dirtyFields, setDirtyFields] = useState({});
const [isLocked, setIsLocked] = useState(false);
const [lockMeta, setLockMeta] = useState(null);


  const isAppVisible = useAppVisibilityContext();

  // Load staff list (admin) for dropdown + colleague suggestions
  useEffect(() => {
    if (!user) return;
    if (!isAppVisible) return;

    if (!isAdmin) {
  setSelectedUserId(user.id);
  setSelectedName(user?.user_metadata?.full_name || user?.email || "");

  // 👇 STILL load colleagues list
  const loadStaff = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name")
      .eq("is_active", true)
      .eq("show_in_timesheets", true)
      .order("display_name", { ascending: true });

    if (!error && data) {
      setStaff(
        data.map((p) => ({
          id: p.id,
          name: p.display_name || "Unnamed",
        }))
      );
    }
  };

  loadStaff();
  return;
}

    const loadStaff = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, email, is_active, show_in_timesheets")
        .eq("is_active", true)
        .eq("show_in_timesheets", true)
        .order("display_name", { ascending: true });

      if (error) {
        console.warn("Error loading staff list:", error.message);
        return;
      }

      const list = (data || []).map((p) => ({
        id: p.id,
        name: p.display_name || p.email || "Unnamed",
      }));

      setStaff(list);

      const me = list.find((x) => x.id === user.id);
      const first = me || list[0];
      if (first) {
        setSelectedUserId(first.id);
        setSelectedName(first.name);
      }
    };

    loadStaff();
  }, [user, isAdmin, isAppVisible]);

  // Load existing entries for selected user + period
  useEffect(() => {
    if (!isAppVisible) return;

    let cancelled = false;

    const loadEntries = async () => {
      if (!user) return;
      if (!selectedUserId) return;

      setLoadingPeriod(true);
      setStatusMessage("");
      setStatusError("");

      const endIso = localIsoDate(addDays(periodStart, 13));

   const { data, error } = await supabase
  .from("timesheet_entries")
  .select("*")
  .eq("user_id", selectedUserId)
  .gte("entry_date", periodStartIso)
  .lte("entry_date", endIso)
  .order("entry_date", { ascending: true });

  if (cancelled) return;

      if (error) {
        console.warn("Error loading timesheet entries:", error.message);
        setLoadingPeriod(false);
        return;
      }

const map = {};
(data || []).forEach((row) => {
  const key = row.entry_date;
  map[key] = {
    colleague: row.colleague || "",
    start: row.start_time || "",
    finish: row.finish_time || "",
    lunch: row.lunch || "",
    notes: row.notes || "",
  };
});

const { data: lockRow, error: lockError } = await supabase
  .from("timesheet_locks")
  .select("*")
  .eq("user_id", selectedUserId)
  .eq("period_start", periodStartIso)
  .maybeSingle();

  if (cancelled) return;

if (lockError) {
  console.warn("Error loading timesheet lock:", lockError.message);
}

setEntries(map);
setIsLocked(!!lockRow?.is_locked);
setLockMeta(lockRow || null);
setSavedFields({});
setDirtyFields({});
setLoadingPeriod(false);
    };

    loadEntries();
    return () => {
    cancelled = true;
  };
  }, [user, selectedUserId, periodStartIso, isAppVisible, periodStart]);

  const fortnightLabel = useMemo(() => {
    const end = addDays(periodStart, 13);
    return `${formatDateLabel(periodStart)} – ${formatDateLabel(end)}`;
  }, [periodStart]);

  const week1Days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(periodStart, i)),
    [periodStart]
  );
  const week2Days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(periodStart, 7 + i)),
    [periodStart]
  );
const fieldKey = (dateKey, field) => `${dateKey}__${field}`;

const handleFieldChange = (dateKey, field, value) => {
  if (!isEditable) return;

  setEntries((prev) => ({
    ...prev,
    [dateKey]: { ...(prev[dateKey] || {}), [field]: value },
  }));

  const k = fieldKey(dateKey, field);
  setDirtyFields((prev) => ({ ...prev, [k]: true }));
};

  const inputClass = (dateKey, field) => {
  const k = fieldKey(dateKey, field);
  const isSaved = !!savedFields[k];
  const isDirty = !!dirtyFields[k];
  return `maps-search-input ${isSaved && !isDirty ? "ts-saved" : ""}`;
};


    const buildRowData = (date) => {
    const isoKey = localIsoDate(date);
    const row = entries[isoKey] || {};
    const startMin = parseTimeToMinutes(row.start);
    const finishMin = parseTimeToMinutes(row.finish);
    const lunchMin = parseTimeToMinutes(row.lunch);

    let workedMinutes = null;
    if (startMin != null && finishMin != null) {
      workedMinutes = finishMin - startMin - (lunchMin || 0);
      if (workedMinutes < 0) workedMinutes = null;
    }

    return {
      isoKey,
      date,
      dayName: formatDayName(date, isMobile),
      colleague: row.colleague || "",
      start: row.start || "",
      finish: row.finish || "",
      lunch: row.lunch || "",
      notes: row.notes || "",
      workedMinutes,
      workedHoursDecimal: minutesToHoursDecimal(workedMinutes),
    };
  };

  const week1Rows = week1Days.map(buildRowData);
  const week2Rows = week2Days.map(buildRowData);

  // Week 2 is "complete" when every day is either:
// - completely blank (no fields touched), OR
// - has a valid workedMinutes (start & finish make sense)
const isWeek2Complete = useMemo(() => {
  return week2Rows.every((r) => {
    const hasAny =
      (r.colleague && r.colleague.trim()) ||
      (r.start && r.start.trim()) ||
      (r.finish && r.finish.trim()) ||
      (r.lunch && r.lunch.trim()) ||
      (r.notes && r.notes.trim());

    if (!hasAny) return true; // blank day is fine
    return r.workedMinutes != null; // must have valid calculated minutes
  });
}, [week2Rows]);

const canNavigateFortnight = isWeek2Complete;
const isEditable = !isLocked;

  const week1TotalMinutes = week1Rows.reduce((sum, r) => sum + (r.workedMinutes || 0), 0);
  const week2TotalMinutes = week2Rows.reduce((sum, r) => sum + (r.workedMinutes || 0), 0);
  const fortnightTotalMinutes = week1TotalMinutes + week2TotalMinutes;

  const blockIfLocked = () => {
  if (canNavigateFortnight) return false;
  setStatusError("Complete or save Week 2 before moving to another fortnight.");
  setStatusMessage("");
  return true;
};

const goPreviousFortnight = () => {
  if (busy) return;
  if (blockIfLocked()) return;
  setPeriodStart((prev) => startOfPayFortnightMonday(addDays(prev, -14)));
  setStatusMessage("");
  setStatusError("");
};

const goCurrentFortnight = () => {
  if (busy) return;
  if (blockIfLocked()) return;
  setPeriodStart(startOfPayFortnightMonday());
  setStatusMessage("");
  setStatusError("");
};

const goNextFortnight = () => {
  if (busy) return;
  if (blockIfLocked()) return;
  setPeriodStart((prev) => startOfPayFortnightMonday(addDays(prev, 14)));
  setStatusMessage("");
  setStatusError("");
};

const handleJumpDateChange = (e) => {
  const val = e.target.value;
  setJumpDate(val);

  if (!val || busy) return;
  if (blockIfLocked()) return;

  const chosen = new Date(val + "T00:00:00");
  if (Number.isNaN(chosen.getTime())) return;

  setPeriodStart(startOfPayFortnightMonday(chosen));
  setStatusMessage("");
  setStatusError("");
};


  const buildFortnightEntries = () => {
    const rows = [...week1Rows, ...week2Rows];

    return rows
      .filter((r) => r.colleague || r.start || r.finish || r.lunch || r.notes || r.workedMinutes != null)
      .map((r) => ({
        user_id: selectedUserId,
        period_start: periodStartIso,
        entry_date: r.isoKey,
        colleague: r.colleague || null,
        start_time: r.start || null,
        finish_time: r.finish || null,
        lunch: r.lunch || null,
        hours_decimal: r.workedMinutes != null ? r.workedMinutes / 60.0 : null,
        notes: r.notes || null,
      }));
  };

const saveFortnightToSupabase = async (payload) => {
  const endIso = localIsoDate(addDays(periodStart, 13));

  const { error: delError } = await supabase
    .from("timesheet_entries")
    .delete()
    .eq("user_id", selectedUserId)
    .gte("entry_date", periodStartIso)
    .lte("entry_date", endIso);

  if (delError) throw delError;

  if (!payload.length) return;

  const { error: insError } = await supabase
    .from("timesheet_entries")
    .insert(payload);

  if (insError) throw insError;
};

  const buildCsv = () => {
    const header = [
      "Employee",
      "Period Start",
      "Period End",
      "Date",
      "Day",
      "Work Colleague",
      "Start",
      "Finish",
      "Lunch",
      "Hours",
      "Notes",
    ];

    const endDate = addDays(periodStart, 13);
    const allRows = [...week1Rows, ...week2Rows];
    const lines = [header.join(",")];

    allRows.forEach((r) => {
     
      const fields = [
        `"${(selectedName || "").replace(/"/g, '""')}"`,
        `"${periodStartIso}"`,
        `"${localIsoDate(endDate)}"`,
        `"${r.isoKey}"`,
        `"${r.dayName}"`,
        `"${(r.colleague || "").replace(/"/g, '""')}"`,
        `"${r.start || ""}"`,
        `"${r.finish || ""}"`,
        `"${r.lunch || ""}"`,
        `"${r.workedHoursDecimal || ""}"`,
        `"${(r.notes || "").replace(/"/g, '""')}"`,
      ];
      lines.push(fields.join(","));
    });
// ---- TOTAL HOURS (sum all days in the fortnight) ----
const totalMinutes = allRows.reduce((sum, r) => {
  return sum + (Number.isFinite(r.workedMinutes) ? r.workedMinutes : 0);
}, 0);

const totalHoursDecimal = minutesToHoursDecimal(totalMinutes);

// Add a blank spacer line (optional)
lines.push("");

// Add TOTAL row aligned to your columns
// Your CSV columns are: Name, Period Start, Period End, Date, Day, Colleague, Start, Finish, Lunch, Hours, Notes
// So we place TOTAL in Notes column and the number in Hours column (10th field)
lines.push(
  [
    `"${(selectedName || "").replace(/"/g, '""')}"`,
    `"${periodStartIso}"`,
    `"${localIsoDate(endDate)}"`,
    `""`,
    `""`,
    `""`,
    `""`,
    `""`,
    `""`,
    `"${totalHoursDecimal}"`,
    `"TOTAL HOURS"`,
  ].join(",")
);
    return lines.join("\r\n");
  };

  const handleSaveFortnight = async () => {
    if (!user || !selectedUserId) return;

    const payload = buildFortnightEntries();

    setBusy(true);
    setStatusError("");
    setStatusMessage("");

    try {
      await saveFortnightToSupabase(payload);

markCurrentFieldsSaved();

      setStatusMessage("Fortnight saved.");
    } catch (err) {
      console.error("Error saving fortnight:", err);
      const msg = err?.message || err?.details || err?.hint || "Unknown Supabase error";
      setStatusError(`There was a problem saving. (${msg})`);
    } finally {
      setBusy(false);
    }
  };

const markCurrentFieldsSaved = () => {
  setSavedFields(() => {
    const next = {};
    Object.entries(entries).forEach(([dateKey, row]) => {
      ["colleague", "start", "finish", "lunch", "notes"].forEach((f) => {
        const v = row?.[f];
        if (v && String(v).trim() !== "") {
          next[fieldKey(dateKey, f)] = true;
        }
      });
    });
    return next;
  });

  setDirtyFields({});
};

const handleLockFortnight = async () => {
  if (!user || !selectedUserId) return;
  if (isLocked) return;

  const confirmed = window.confirm(
    "Are you sure you want to lock and submit this timesheet? Once locked, you will not be able to edit it unless an admin unlocks it."
  );

  if (!confirmed) return;

  const payload = buildFortnightEntries();
  if (payload.length === 0) {
    setStatusError("No timesheet entries to lock for this fortnight.");
    setStatusMessage("");
    return;
  }

  setBusy(true);
  setStatusError("");
  setStatusMessage("");

  try {
    await saveFortnightToSupabase(payload);

    const { data, error } = await supabase
      .from("timesheet_locks")
      .upsert(
        {
          user_id: selectedUserId,
          period_start: periodStartIso,
          is_locked: true,
          locked_at: new Date().toISOString(),
          locked_by: user.id,
          unlocked_at: null,
          unlocked_by: null,
        },
        { onConflict: "user_id,period_start" }
      )
      .select()
      .single();

    if (error) throw error;

    markCurrentFieldsSaved();
    setIsLocked(true);
    setLockMeta(data || null);
    setStatusMessage("Timesheet locked and submitted.");
  } catch (err) {
    console.error("Error locking fortnight:", err);
    const msg = err?.message || err?.details || err?.hint || "Unknown Supabase error";
    setStatusError(`There was a problem locking this fortnight. (${msg})`);
  } finally {
    setBusy(false);
  }
};

const handleUnlockFortnight = async () => {
  if (!user || !selectedUserId || !isAdmin) return;
  if (!isLocked) return;

  const confirmed = window.confirm(
    "Unlock this timesheet? The employee will be able to edit it again."
  );

  if (!confirmed) return;

  setBusy(true);
  setStatusError("");
  setStatusMessage("");

  try {
    const { data, error } = await supabase
      .from("timesheet_locks")
      .upsert(
        {
          user_id: selectedUserId,
          period_start: periodStartIso,
          is_locked: false,
          unlocked_at: new Date().toISOString(),
          unlocked_by: user.id,
        },
        { onConflict: "user_id,period_start" }
      )
      .select()
      .single();

    if (error) throw error;

    setIsLocked(false);
    setLockMeta(data || null);
    setStatusMessage("Timesheet unlocked.");
  } catch (err) {
    console.error("Error unlocking fortnight:", err);
    const msg = err?.message || err?.details || err?.hint || "Unknown Supabase error";
    setStatusError(`There was a problem unlocking this fortnight. (${msg})`);
  } finally {
    setBusy(false);
  }
};

  const handleSubmitFortnight = async () => {
    if (!user || !selectedUserId) return;

    const payload = buildFortnightEntries();
    if (payload.length === 0) {
      setStatusError("No timesheet entries to submit for this fortnight.");
      setStatusMessage("");
      return;
    }

    setBusy(true);
    setStatusError("");
    setStatusMessage("");

    try {
      await saveFortnightToSupabase(payload);


markCurrentFieldsSaved();


      const csv = buildCsv();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });

      const safeWho = (selectedName || selectedUserId).replace(/[^a-zA-Z0-9@._-]/g, "_");
      const fileName = `timesheet_${safeWho}_${periodStartIso}.csv`;

      // download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      // upload to storage under the selected user
      const storagePath = `${selectedUserId}/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from("timesheets")
        .upload(storagePath, blob, { upsert: true, contentType: "text/csv" });

      if (uploadError) throw uploadError;

      setStatusMessage("Fortnight exported, CSV downloaded, and saved to server storage.");
    } catch (err) {
      console.error("Error exporting fortnight:", err);
      const msg = err?.message || err?.details || err?.hint || "Unknown Supabase error";
      setStatusError(`There was a problem exporting this fortnight. (${msg})`);
    } finally {
      setBusy(false);
    }
  };

  const handleStaffChange = (e) => {
    const id = e.target.value;
    setSelectedUserId(id);
    const match = staff.find((s) => s.id === id);
    setSelectedName(match?.name || "");
    setStatusMessage("");
    setStatusError("");
  };

  const colleagues = useMemo(() => staff.map((s) => s.name).filter(Boolean), [staff]);

  return (
    <>
    <PageLayout
      icon="⏱️"
      title="Timesheets"
      subtitle="Complete your fortnightly working hours"
      actions={
        <>
          <button type="button" className="btn-pill" onClick={goPreviousFortnight} disabled={loadingPeriod || busy}>
            ◀ Previous
          </button>
          <button type="button" className="btn-pill" onClick={goCurrentFortnight} disabled={loadingPeriod || busy}>
            Current Fortnight
          </button>
          <button type="button" className="btn-pill" onClick={goNextFortnight} disabled={loadingPeriod || busy}>
            Next ▶
          </button>
        <button
  type="button"
  className={`btn-pill ${isLocked ? "ts-lock-btn is-locked" : ""}`}
  onClick={isLocked ? handleUnlockFortnight : handleLockFortnight}
  disabled={loadingPeriod || busy || (!isAdmin && isLocked)}
  title={
    isLocked
      ? (isAdmin ? "Unlock this fortnight" : "This fortnight has been locked")
      : "Lock and submit this fortnight"
  }
>
  {busy
    ? "Working…"
    : isLocked
      ? (isAdmin ? "Unlock Timesheet" : "Timesheet Locked")
      : "Lock Timesheet"}
</button>

<button
  type="button"
  className="btn-pill"
  onClick={handleSaveFortnight}
  disabled={loadingPeriod || busy || !isEditable}
>
  {busy ? "Saving…" : "Save Fortnight"}
</button>

<button
  type="button"
  className="btn-pill primary"
  onClick={handleSubmitFortnight}
  disabled={loadingPeriod || busy}
>
  {busy ? "Working…" : "Export Fortnight"}
</button>
        </>
      }
    >
      <datalist id="colleagues-list">
        {colleagues.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <div className="card">
        <h3 className="card-title">Timesheet period</h3>
        <p className="card-subtitle">This view covers the full 14 days (including weekends) across your payroll cycle.</p>

        <div style={{ marginTop: "0.6rem", display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
          {isAdmin ? (
            <div className="card-row">
              <span className="card-row-label">Employee</span>
              <select
                className="maps-search-input"
                style={{ maxWidth: "260px" }}
                value={selectedUserId}
                onChange={handleStaffChange}
                disabled={busy || loadingPeriod}
              >
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="card-row">
              <span className="card-row-label">Employee</span>
              <span className="card-row-value">
                {user?.user_metadata?.full_name || user?.email || "Unknown user"}
              </span>
            </div>
          )}

          <div className="card-row">
            <span className="card-row-label">Period</span>
            <span className="card-row-value">{fortnightLabel}</span>
          </div>

          <div className="card-row">
            <span className="card-row-label">Jump to date</span>
            <input
              type="date"
              className="maps-search-input"
              style={{ maxWidth: "160px" }}
              value={jumpDate || ""}
              onChange={handleJumpDateChange}
              disabled={busy || loadingPeriod}
            />
          </div>
        </div>

        {loadingPeriod && (
          <p style={{ marginTop: "0.4rem", fontSize: "0.8rem", color: "#777" }}>
            Loading existing entries…
          </p>
        )}

        {isLocked && (
  <p
    style={{
      marginTop: "0.5rem",
      fontSize: "0.85rem",
      color: "#1565c0",
      fontWeight: 600,
    }}
  >
    This fortnight has been locked and submitted. Only Admin can unlock it to make changes.
  </p>
)}
      </div>

      {/* Week 1 */}
      <div className="card">
        <h3 className="card-title">Week 1 (Mon–Sun)</h3>

        <div style={{ overflowX: "auto", marginTop: "0.5rem" }}>
        <table className="ts-table" style={{ borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr>
  <th className="ts-head ts-sticky ts-sticky-day">Day</th>
  <th className="ts-head ts-sticky ts-sticky-date">Date</th>
  <th className="ts-head ts-col-start">Start</th>
  <th className="ts-head ts-col-finish">Finish</th>
  <th className="ts-head ts-col-lunch">Lunch</th>
  <th className="ts-head ts-col-hours">Hours</th>
  <th className="ts-head ts-col-colleague">Work colleague</th>
  <th className="ts-head ts-col-notes">Notes</th>
</tr>
            </thead>
            <tbody>
              {week1Days.map((date) => {
                const row = buildRowData(date);
                return (
                  <tr key={row.isoKey}
                  className={row.isoKey === todayIso ? "ts-today" : ""}>
                    <td className="ts-cell ts-cell-day ts-sticky ts-sticky-day">{row.dayName}</td>
                    <td className="ts-cell ts-cell-date ts-sticky ts-sticky-date">{formatDateLabel(row.date)}</td>
              <td className="ts-cell ts-cell-time ts-col-start">
  <div className="ts-time-wrap">
    <input
      type="time"
      className={inputClass(row.isoKey, "start")}
      value={row.start || ""}
      step="300"
      onChange={(e) => handleFieldChange(row.isoKey, "start", e.currentTarget.value || "")}
      onInput={(e) => handleFieldChange(row.isoKey, "start", e.currentTarget.value || "")}
      onBlur={(e) => handleFieldChange(row.isoKey, "start", e.currentTarget.value || "")}
      disabled={!isEditable}
    />
    {isEditable && row.start && (
      <button
        type="button"
        className="ts-clear-btn"
        onClick={() => handleFieldChange(row.isoKey, "start", "")}
      >
        ×
      </button>
    )}
  </div>
</td>
 <td className="ts-cell ts-cell-time ts-col-finish">
  <div className="ts-time-wrap">
    <input
      type="time"
      className={inputClass(row.isoKey, "finish")}
      value={row.finish || ""}
      step="300"
      onChange={(e) => handleFieldChange(row.isoKey, "finish", e.currentTarget.value || "")}
      onInput={(e) => handleFieldChange(row.isoKey, "finish", e.currentTarget.value || "")}
      onBlur={(e) => handleFieldChange(row.isoKey, "finish", e.currentTarget.value || "")}
      disabled={!isEditable}
    />
    {isEditable && row.finish && (
      <button
        type="button"
        className="ts-clear-btn"
        onClick={() => handleFieldChange(row.isoKey, "finish", "")}
      >
        ×
      </button>
    )}
  </div>
</td>
<td className="ts-cell ts-cell-time ts-col-lunch">
  <div className="ts-time-wrap">
    <input
      type="text"
      className={inputClass(row.isoKey, "lunch")}
      value={row.lunch}
      inputMode="numeric"
      pattern="[0-9]*"
      placeholder="30"
      onChange={(e) => {
        const digits = e.target.value.replace(/[^\d]/g, "");
        if (digits === "") {
          handleFieldChange(row.isoKey, "lunch", "");
          return;
        }
        const mins = parseInt(digits, 10);
        handleFieldChange(row.isoKey, "lunch", minutesToHHMM(mins));
      }}
      disabled={!isEditable}
    />
    {isEditable && row.lunch && (
      <button
        type="button"
        className="ts-clear-btn"
        onClick={() => handleFieldChange(row.isoKey, "lunch", "")}
      >
        ×
      </button>
    )}
  </div>
</td>
                    <td className="ts-cell ts-cell-hours ts-col-hours">{row.workedHoursDecimal}</td>
                      <td className="ts-cell ts-col-colleague">
                      <input
                        type="text"
                        list="colleagues-list"
                        className={inputClass(row.isoKey, "colleague")}
                        value={row.colleague}
                        onChange={(e) => handleFieldChange(row.isoKey, "colleague", e.target.value)}
                        placeholder="Worked with"
                        disabled={!isEditable}
                      />
                    </td>
                    <td className="ts-cell ts-col-notes">
                      <input
                        type="text"
                        className={inputClass(row.isoKey, "notes")}
                        value={row.notes}
                        onChange={(e) => handleFieldChange(row.isoKey, "notes", e.target.value)}
                        placeholder="Job / comments"
                         disabled={!isEditable}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="ts-foot" colSpan={5} style={{ textAlign: "right" }}>
                  Weekly total
                </td>
                <td className="ts-foot ts-cell-hours">{minutesToHoursDecimal(week1TotalMinutes)}</td>
                <td className="ts-foot"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Week 2 */}
      <div className="card">
        <h3 className="card-title">Week 2 (Mon–Sun)</h3>

        <div style={{ overflowX: "auto", marginTop: "0.5rem" }}>
        <table className="ts-table" style={{ borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr>
  <th className="ts-head ts-sticky ts-sticky-day">Day</th>
  <th className="ts-head ts-sticky ts-sticky-date">Date</th>
  <th className="ts-head ts-col-start">Start</th>
  <th className="ts-head ts-col-finish">Finish</th>
  <th className="ts-head ts-col-lunch">Lunch</th>
  <th className="ts-head ts-col-hours">Hours</th>
  <th className="ts-head ts-col-colleague">Work colleague</th>
  <th className="ts-head ts-col-notes">Notes</th>
</tr>
            </thead>
            <tbody>
              {week2Days.map((date) => {
                const row = buildRowData(date);
                return (
                  <tr key={row.isoKey}
                  className={row.isoKey === todayIso ? "ts-today" : ""}>
                    <td className="ts-cell ts-cell-day ts-sticky ts-sticky-day">{row.dayName}</td>
                    <td className="ts-cell ts-cell-date ts-sticky ts-sticky-date">{formatDateLabel(row.date)}</td>
<td className="ts-cell ts-cell-time ts-col-start">
  <div className="ts-time-wrap">
    <input
      type="time"
      className={inputClass(row.isoKey, "start")}
      value={row.start || ""}
      step="300"
      onChange={(e) => handleFieldChange(row.isoKey, "start", e.currentTarget.value || "")}
      onInput={(e) => handleFieldChange(row.isoKey, "start", e.currentTarget.value || "")}
      onBlur={(e) => handleFieldChange(row.isoKey, "start", e.currentTarget.value || "")}
      disabled={!isEditable}
    />
    {isEditable && row.start && (
      <button
        type="button"
        className="ts-clear-btn"
        onClick={() => handleFieldChange(row.isoKey, "start", "")}
      >
        ×
      </button>
    )}
  </div>
</td>

<td className="ts-cell ts-cell-time ts-col-finish">
  <div className="ts-time-wrap">
    <input
      type="time"
      className={inputClass(row.isoKey, "finish")}
      value={row.finish || ""}
      step="300"
      onChange={(e) => handleFieldChange(row.isoKey, "finish", e.currentTarget.value || "")}
      onInput={(e) => handleFieldChange(row.isoKey, "finish", e.currentTarget.value || "")}
      onBlur={(e) => handleFieldChange(row.isoKey, "finish", e.currentTarget.value || "")}
      disabled={!isEditable}
    />
    {isEditable && row.finish && (
      <button
        type="button"
        className="ts-clear-btn"
        onClick={() => handleFieldChange(row.isoKey, "finish", "")}
      >
        ×
      </button>
    )}
  </div>
</td>
                   <td className="ts-cell ts-cell-time ts-col-lunch">
  <div className="ts-time-wrap">
    <input
      type="text"
      className={inputClass(row.isoKey, "lunch")}
      value={row.lunch}
      inputMode="numeric"
      pattern="[0-9]*"
      placeholder="30"
      onChange={(e) => {
        const digits = e.target.value.replace(/[^\d]/g, "");
        if (digits === "") {
          handleFieldChange(row.isoKey, "lunch", "");
          return;
        }
        const mins = parseInt(digits, 10);
        handleFieldChange(row.isoKey, "lunch", minutesToHHMM(mins));
      }}
      disabled={!isEditable}
    />
    {isEditable && row.lunch && (
      <button
        type="button"
        className="ts-clear-btn"
        onClick={() => handleFieldChange(row.isoKey, "lunch", "")}
      >
        ×
      </button>
    )}
  </div>
</td>
                    <td className="ts-cell ts-cell-hours ts-col-hours">{row.workedHoursDecimal}</td>
                    <td className="ts-cell ts-col-colleague">
                      <input
                        type="text"
                        list="colleagues-list"
                        className={inputClass(row.isoKey, "colleague")}
                        value={row.colleague}
                        onChange={(e) => handleFieldChange(row.isoKey, "colleague", e.target.value)}
                        placeholder="Worked with"
                        disabled={!isEditable} 
                      />
                    </td>
                    <td className="ts-cell ts-col-notes">
                      <input
                        type="text"
                        className={inputClass(row.isoKey, "notes")}
                        value={row.notes}
                        onChange={(e) => handleFieldChange(row.isoKey, "notes", e.target.value)}
                        placeholder="Job / comments"
                         disabled={!isEditable}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="ts-foot" colSpan={5} style={{ textAlign: "right" }}>
                  Weekly total
                </td>
                <td className="ts-foot ts-cell-hours">{minutesToHoursDecimal(week2TotalMinutes)}</td>
                <td className="ts-foot"></td>
              </tr>
              <tr>
                <td className="ts-foot" colSpan={5} style={{ textAlign: "right" }}>
                  Fortnight total
                </td>
                <td className="ts-foot ts-cell-hours">{minutesToHoursDecimal(fortnightTotalMinutes)}</td>
                <td className="ts-foot"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
<div className="ts-help">
  <div className="ts-help-title">How to complete & export your timesheet</div>

  <ul className="ts-help-list">
    <li>
      <strong>Complete your timesheet daily:</strong> This is the most accurate way to keep a true representation of your hours worked.
    </li><li>
      <strong>Daily times:</strong> Enter Start and Finish times plus the duration of your Lunch Break for each day worked.
      Times to be rounded to nearest 15 minute interval. Hours are calculated automatically.
    </li>
    <li>
      <strong>Work colleague:</strong> Select who you worked with (if applicable).
    </li>
    <li>
      <strong>Notes:</strong> Add brief notes if desired.
    </li>
    <li>
  <strong>Save:</strong> YOU MUST SAVE your changes before navigating to another fortnight or page. Time entries will go green. Failing to do this will result in entries being unsaved.
</li>
<li>
  <strong>Lock:</strong> Once your fortnight is complete, press Lock Timesheet to submit it. Locked timesheets turn blue and can no longer be edited unless an admin unlocks them.
</li>
<li>
  <strong>Export:</strong> Export remains available if a CSV copy is still required.
</li>
    <li>
      <strong>Weekdays Not Worked:</strong> For weekdays not worked, leave time entries blank and place a Note saying, "Not Worked". Weekends don't require a note.
    </li>
  </ul>

  <div className="ts-help-tip">
    Tip: Selecting any date will automatically jump to the correct payroll fortnight.
  </div>
</div>
      {statusError && <div style={{ marginTop: "0.6rem", fontSize: "0.85rem", color: "#b71c1c" }}>{statusError}</div>}
      {statusMessage && <div style={{ marginTop: "0.6rem", fontSize: "0.85rem", color: "#2e7d32" }}>{statusMessage}</div>}
    <style>{`
  /* --- Timesheets: sticky Day + Date columns for mobile horizontal scroll --- */

  /* Set consistent widths so sticky offsets are reliable */
  
:root {
  --ts-day-w: 80px;
  --ts-date-w: 45px;
}
@media (max-width: 520px) {
  :root { --ts-day-w: 35px; }
}

/* Make ALL header cells sticky to the top */
th.ts-head {
  position: sticky;
  top: 0;
  background: #fff;
  z-index: 20; /* header layer */
}

/* Sticky base */
.ts-sticky {
  position: sticky;
  background: #fff;
}

/* Sticky Day/Date body cells */
td.ts-sticky-day {
  left: 0;
  z-index: 10; /* below headers */
  min-width: var(--ts-day-w);
  width: var(--ts-day-w);
  max-width: var(--ts-day-w);
  box-shadow: 1px 0 0 rgba(0,0,0,0.08);
}

td.ts-sticky-date {
  left: var(--ts-day-w);
  z-index: 10;
  min-width: var(--ts-date-w);
  width: var(--ts-date-w);
  max-width: var(--ts-date-w);
  box-shadow: 1px 0 0 rgba(0,0,0,0.08);
}

/* ✅ Sticky Day/Date header cells (top-left) MUST be above other headers */
th.ts-sticky-day {
  left: 0;
  z-index: 40; /* higher than th.ts-head */
  min-width: var(--ts-day-w);
  width: var(--ts-day-w);
  max-width: var(--ts-day-w);
  box-shadow: 1px 0 0 rgba(0,0,0,0.12);
}

th.ts-sticky-date {
  left: var(--ts-day-w);
  z-index: 40;
  min-width: var(--ts-date-w);
  width: var(--ts-date-w);
  max-width: var(--ts-date-w);
  box-shadow: 1px 0 0 rgba(0,0,0,0.12);
}
/* ===============================
   Timesheets column sizing
   =============================== */

:root {
  --ts-colleague-w: 160px;
  --ts-start-w: 125px;
  --ts-finish-w: 125px;
  --ts-lunch-w: 90px;
  --ts-hours-w: 50px;
  --ts-notes-w: 170px;
}

/* Mobile tightening */
@media (max-width: 520px) {
  :root {
    --ts-colleague-w: 155px;
    --ts-start-w: 100px;
    --ts-finish-w: 100px;
    --ts-lunch-w: 92px;
    --ts-hours-w: 50px;
    --ts-notes-w: 150px;
  }
}
 /* ✅ critical: table must respect widths */
  .ts-table{
    table-layout: fixed;
    width: max-content;
  }

  th.ts-col-colleague, td.ts-col-colleague { width: var(--ts-colleague-w); min-width: var(--ts-colleague-w); max-width: var(--ts-colleague-w); }
  th.ts-col-start, td.ts-col-start { width: var(--ts-start-w); min-width: var(--ts-start-w); max-width: var(--ts-start-w); }
  th.ts-col-finish, td.ts-col-finish { width: var(--ts-finish-w); min-width: var(--ts-finish-w); max-width: var(--ts-finish-w); }
  th.ts-col-lunch, td.ts-col-lunch { width: var(--ts-lunch-w); min-width: var(--ts-lunch-w); max-width: var(--ts-lunch-w); }
  th.ts-col-hours, td.ts-col-hours { width: var(--ts-hours-w); min-width: var(--ts-hours-w); max-width: var(--ts-hours-w); }
  th.ts-col-notes, td.ts-col-notes { width: var(--ts-notes-w); min-width: var(--ts-notes-w); max-width: var(--ts-notes-w); }

  td.ts-cell input,
  td.ts-cell select,
  td.ts-cell textarea{
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }
   /* ===============================
   Mobile Table layout + column control sizing
   =============================== */

.ts-table{
  table-layout: fixed;
  width: max-content; /* allows horizontal scroll to size naturally */
}

/* Keep cells from letting inputs overlap neighbours */
.ts-table td.ts-cell{
  vertical-align: middle;
}

.ts-table td.ts-cell-time{
  overflow: hidden; /* prevents time control bleeding outside cell */
}

/* Make ALL inputs/selects match height & padding (like Work colleague box) */
:root{
  --ts-control-h: 36px;
  --ts-control-fs: 14px;
  --ts-control-pad-x: 10px;
  --ts-control-pad-y: 6px;
  --ts-control-radius: 10px;
}

@media (max-width: 520px){
  :root{
    --ts-control-h: 34px;
    --ts-control-fs: 14px;
    --ts-control-pad-x: 8px;
    --ts-control-pad-y: 6px;
  }
}

/* Your inputs already use "maps-search-input" (from inputClass), so style that */
.ts-table .maps-search-input{
  height: var(--ts-control-h);
  min-height: var(--ts-control-h);
  padding: var(--ts-control-pad-y) var(--ts-control-pad-x);
  font-size: var(--ts-control-fs);
  border-radius: var(--ts-control-radius);
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
}

/* Normalize time inputs specifically (mobile Safari/Chrome differences) */
.ts-table input[type="time"].maps-search-input{
  -webkit-appearance: none;
  appearance: none;
  line-height: calc(var(--ts-control-h) - 2px);
}

/* Optional: ensure the time icon doesn’t squash the text */
.ts-table input[type="time"].maps-search-input{
  padding-right: 28px;
}
 @media (max-width: 520px){
  .ts-table th.ts-head,
  .ts-table td.ts-cell{
    padding: 6px 6px !important;
  }
}
  @media (max-width: 520px){
  td.ts-col-notes .maps-search-input:focus{
    width: 260px;              /* expands within scroll area */
  }
}
 /* Force time inputs to use normal text colour */
.ts-table input[type="time"]{
  color: #111;              /* or var(--text-color) if you have one */
  background-color: #fff;
}
.ts-table input[type="time"]:focus{
  color: #111;
  outline: none;
}
  /* ===============================
   Timesheet help section
   =============================== */
.ts-help{
  margin-top: 14px;
  padding: 12px 14px;
  border: 1px solid rgba(0,0,0,0.12);
  border-radius: 12px;
  background: #fff;
  font-size: 0.75rem;   /* 👈 overall text size */
}

.ts-help-title{
  font-weight: 700;
  margin-bottom: 8px;
  font-size: 0.9rem;   /* 👈 title size */
}

.ts-help-list{
  margin: 0;
  padding-left: 18px;
}

.ts-help-list li{
  margin: 6px 0;
  line-height: 1.35;
}

.ts-help-tip{
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(0,0,0,0.08);
  opacity: 0.9;
  font-size: 0.92em;
  opacity: 0.75;
}
  
/* ===============================
   Timesheets: current day text colour
   =============================== */

.ts-today td.ts-cell-day,
.ts-today td.ts-col-date,
.ts-today td:nth-child(2) {
  color: #c62828;
  font-weight: 600;
}
  .ts-lock-btn.is-locked{
  background: #1976d2 !important;
  border-color: #1976d2 !important;
  color: #fff !important;
}

.ts-lock-btn.is-locked:hover{
  background: #1565c0 !important;
  border-color: #1565c0 !important;
}

.ts-table .maps-search-input:disabled{
  background: #f3f6f9;
  color: #5f6b76;
  cursor: not-allowed;
  opacity: 1;
}

/* Time input clear button wrapper */
.ts-time-wrap{
  position: relative;
  width: 100%;
}

/* Clear (×) button */
.ts-clear-btn{
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);

  width: 16px;
  height: 16px;
  min-width: 16px;
  min-height: 16px;
  max-width: 16px;
  max-height: 16px;

  font-size: 10px;
  line-height: 1;

  display: flex;
  align-items: center;
  justify-content: center;

  border: none;
  background: rgba(0,0,0,0.08);
  color: #555;
  border-radius: 50%;

  padding: 0;
  margin: 0;

  cursor: pointer;

  flex: none;              /* 🔥 stops flex stretching */
  box-sizing: border-box;  /* 🔥 prevents weird scaling */
}

.ts-clear-btn:hover{
  background: rgba(0,0,0,0.12);
}

@media (max-width: 520px){
  .ts-clear-btn{
    width: 14px;
    height: 14px;
    min-width: 14px;
    min-height: 14px;
    max-width: 14px;
    max-height: 14px;

    font-size: 9px;
    right: 4px;
  }
}

/* Make room so button doesn’t overlap text */
.ts-time-wrap input{
  padding-right: 32px !important;
}
`}</style>
    </PageLayout>
  </>
  );
}

export default Timesheets;
