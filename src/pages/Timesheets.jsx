import { useEffect, useMemo, useState } from "react";
import PageLayout from "../components/PageLayout.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient";

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

  // Load staff list (admin) for dropdown + colleague suggestions
  useEffect(() => {
    if (!user) return;

    if (!isAdmin) {
      setSelectedUserId(user.id);
      setSelectedName(user?.user_metadata?.full_name || user?.email || "");
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
  }, [user, isAdmin]);

  // Load existing entries for selected user + period
  useEffect(() => {
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

      setEntries(map);
      setSavedFields({});
      setDirtyFields({});
      setLoadingPeriod(false);
    };

    loadEntries();
  }, [user, selectedUserId, periodStartIso]);

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
  setEntries((prev) => ({
    ...prev,
    [dateKey]: { ...(prev[dateKey] || {}), [field]: value },
  }));


  // mark this specific input as edited since last save
  const k = fieldKey(dateKey, field);
  setDirtyFields((prev) => ({ ...prev, [k]: true }));
};
const clearField = (dateKey, field) => {
  handleFieldChange(dateKey, field, "");
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

  const week1TotalMinutes = week1Rows.reduce((sum, r) => sum + (r.workedMinutes || 0), 0);
  const week2TotalMinutes = week2Rows.reduce((sum, r) => sum + (r.workedMinutes || 0), 0);
  const fortnightTotalMinutes = week1TotalMinutes + week2TotalMinutes;

  const blockIfLocked = () => {
  if (canNavigateFortnight) return false;
  setStatusError("Fortnight is locked until Week 2 is complete.");
  setStatusMessage("");
  return true;
};

const goPreviousFortnight = () => {
  if (busy) return;
  setPeriodStart((prev) => startOfPayFortnightMonday(addDays(prev, -14)));
  setStatusMessage("");
  setStatusError("");
};

const goCurrentFortnight = () => {
  if (busy) return;
  setPeriodStart(startOfPayFortnightMonday());
  setStatusMessage("");
  setStatusError("");
};

const goNextFortnight = () => {
  if (busy) return;
  setPeriodStart((prev) => startOfPayFortnightMonday(addDays(prev, 14)));
  setStatusMessage("");
  setStatusError("");
};

const handleJumpDateChange = (e) => {
  const val = e.target.value;
  setJumpDate(val);

  if (!val || busy) return;

  const chosen = new Date(val + "T00:00:00");
  if (Number.isNaN(chosen.getTime())) return;

  // ✅ snap to the correct pay-cycle fortnight Monday
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
    if (payload.length === 0) {
      setStatusError("No timesheet entries to save for this fortnight. Add some rows first.");
      setStatusMessage("");
      return;
    }

    setBusy(true);
    setStatusError("");
    setStatusMessage("");

    try {
      await saveFortnightToSupabase(payload);
if (isWeek2Complete) {
  setStatusMessage("Fortnight complete — exported.");
  setStatusError("");
  // stay on the current fortnight (no auto-advance)
}

      // mark all currently-entered fields as saved
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

// everything is now saved, so clear dirty flags
setDirtyFields({});
      setStatusMessage("Fortnight saved.");
    } catch (err) {
      console.error("Error saving fortnight:", err);
      const msg = err?.message || err?.details || err?.hint || "Unknown Supabase error";
      setStatusError(`There was a problem saving. (${msg})`);
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
     if (isWeek2Complete) {
  setStatusMessage("Fortnight complete — saved.");
  setStatusError("");
  // stay on the current fortnight (no auto-advance)
}

      // mark all currently-entered fields as saved
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

// everything is now saved, so clear dirty flags
setDirtyFields({});


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
      subtitle="Fortnightly working hours"
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
          <button type="button" className="btn-pill" onClick={handleSaveFortnight} disabled={loadingPeriod || busy}>
            {busy ? "Saving…" : "Save Fortnight"}
          </button>
          <button type="button" className="btn-pill primary" onClick={handleSubmitFortnight} disabled={loadingPeriod || busy}>
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
        <p className="card-subtitle">This view covers a full 14 days (including weekends) across two weeks.</p>

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
                <th className="ts-head ts-col-colleague">Work colleague</th>
                <th className="ts-head ts-col-start">Start</th>
                <th className="ts-head ts-col-finish">Finish</th>
                <th className="ts-head ts-col-lunch">Lunch</th>
                <th className="ts-head ts-col-hours">Hours</th>
                <th className="ts-head ts-col-notes">Notes</th>
              </tr>
            </thead>
            <tbody>
              {week1Days.map((date) => {
                const row = buildRowData(date);
                return (
                  <tr key={row.isoKey}>
                    <td className="ts-cell ts-cell-day ts-sticky ts-sticky-day">{row.dayName}</td>
                    <td className="ts-cell ts-cell-date ts-sticky ts-sticky-date">{formatDateLabel(row.date)}</td>
                    <td className="ts-cell ts-col-colleague">
                      <input
                        type="text"
                        list="colleagues-list"
                        className={inputClass(row.isoKey, "colleague")}
                        value={row.colleague}
                        onChange={(e) => handleFieldChange(row.isoKey, "colleague", e.target.value)}
                        placeholder="Worked with"
                      />
                    </td>
                    <td className="ts-cell ts-cell-time ts-col-start">
                      <input
  type="time"
  className={inputClass(row.isoKey, "start")}
  value={row.start || ""}
  step="300"
  onChange={(e) => handleFieldChange(row.isoKey, "start", e.currentTarget.value || "")}
  onInput={(e) => handleFieldChange(row.isoKey, "start", e.currentTarget.value || "")}
  onBlur={(e) => handleFieldChange(row.isoKey, "start", e.currentTarget.value || "")}
/>

                    </td>
                    <td className="ts-cell ts-cell-time ts-col-finish">
                      <input
  type="time"
  className={inputClass(row.isoKey, "finish")}
  value={row.finish || ""}
  onChange={(e) => handleFieldChange(row.isoKey, "finish", e.target.value || "")}
  onInput={(e) => handleFieldChange(row.isoKey, "finish", e.currentTarget.value || "")}
  step="300"
/>
                    </td>
                    <td className="ts-cell ts-cell-time ts-col-lunch">
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
/>
                    </td>
                    <td className="ts-cell ts-cell-hours ts-col-hours">{row.workedHoursDecimal}</td>
                    <td className="ts-cell ts-col-notes">
                      <input
                        type="text"
                        className={inputClass(row.isoKey, "notes")}
                        value={row.notes}
                        onChange={(e) => handleFieldChange(row.isoKey, "notes", e.target.value)}
                        placeholder="Job / comments"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="ts-foot" colSpan={6} style={{ textAlign: "right" }}>
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
                <th className="ts-head ts-col-colleague">Work colleague</th>
                <th className="ts-head ts-col-start">Start</th>
                <th className="ts-head ts-col-finish">Finish</th>
                <th className="ts-head ts-col-lunch">Lunch</th>
                <th className="ts-head ts-col-hours">Hours</th>
                <th className="ts-head ts-col-notes">Notes</th>
              </tr>
            </thead>
            <tbody>
              {week2Days.map((date) => {
                const row = buildRowData(date);
                return (
                  <tr key={row.isoKey}>
                    <td className="ts-cell ts-cell-day ts-sticky ts-sticky-day">{row.dayName}</td>
                    <td className="ts-cell ts-cell-date ts-sticky ts-sticky-date">{formatDateLabel(row.date)}</td>
                    <td className="ts-cell ts-col-colleague">
                      <input
                        type="text"
                        list="colleagues-list"
                        className={inputClass(row.isoKey, "colleague")}
                        value={row.colleague}
                        onChange={(e) => handleFieldChange(row.isoKey, "colleague", e.target.value)}
                        placeholder="Worked with"
                      />
                    </td>
                    <td className="ts-cell ts-cell-time ts-col-start">
                      <input
  type="time"
  className={inputClass(row.isoKey, "start")}
  value={row.start || ""}
  step="300"
  onChange={(e) => handleFieldChange(row.isoKey, "start", e.currentTarget.value || "")}
  onInput={(e) => handleFieldChange(row.isoKey, "start", e.currentTarget.value || "")}
  onBlur={(e) => handleFieldChange(row.isoKey, "start", e.currentTarget.value || "")}
/>
                    </td>
                    <td className="ts-cell ts-cell-time ts-col-finish">
                      <input
  type="time"
  className={inputClass(row.isoKey, "finish")}
  value={row.finish || ""}
  step="300"
  onChange={(e) => handleFieldChange(row.isoKey, "finish", e.currentTarget.value || "")}
  onInput={(e) => handleFieldChange(row.isoKey, "finish", e.currentTarget.value || "")}
  onBlur={(e) => handleFieldChange(row.isoKey, "finish", e.currentTarget.value || "")}
/>
                    </td>
                    <td className="ts-cell ts-cell-time ts-col-lunch">
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
/>
                    </td>
                    <td className="ts-cell ts-cell-hours ts-col-hours">{row.workedHoursDecimal}</td>
                    <td className="ts-cell ts-col-notes">
                      <input
                        type="text"
                        className={inputClass(row.isoKey, "notes")}
                        value={row.notes}
                        onChange={(e) => handleFieldChange(row.isoKey, "notes", e.target.value)}
                        placeholder="Job / comments"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="ts-foot" colSpan={6} style={{ textAlign: "right" }}>
                  Weekly total
                </td>
                <td className="ts-foot ts-cell-hours">{minutesToHoursDecimal(week2TotalMinutes)}</td>
                <td className="ts-foot"></td>
              </tr>
              <tr>
                <td className="ts-foot" colSpan={6} style={{ textAlign: "right" }}>
                  Fortnight total
                </td>
                <td className="ts-foot ts-cell-hours">{minutesToHoursDecimal(fortnightTotalMinutes)}</td>
                <td className="ts-foot"></td>
              </tr>
            </tfoot>
          </table>
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
  --ts-colleague-w: 140px;
  --ts-start-w: 120px;
  --ts-finish-w: 120px;
  --ts-lunch-w: 60px;
  --ts-hours-w: 30px;
  --ts-notes-w: 125px;
}

/* Mobile tightening */
@media (max-width: 520px) {
  :root {
    --ts-colleague-w: 140px;
    --ts-start-w: 60px;
    --ts-finish-w: 60px;
    --ts-lunch-w: 60px;
    --ts-hours-w: 30px;
    --ts-notes-w: 130px;
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
`}</style>
    </PageLayout>
  </>
  );
}

export default Timesheets;
