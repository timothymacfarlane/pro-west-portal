import { useEffect, useMemo, useState } from "react";
import PageLayout from "../components/PageLayout.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient";

// --- Statuses & colours ---
const STATUSES = ["FIELD", "OFFICE", "AWAY", "LEAVE", "COURSE", "HOLD", "NON-WORK"];

const PALETTE = {
  OFFICE: "#c6f5b2ff",
  LEAVE: "#FFEB3B",
  AWAY: "#faaf3dff",
  HOLD: "#E1BEE7",
  COURSE: "#FFD180",
  "NON-WORK": "#CFD8DC",
  FIELD_BORDER: "#BDBDBD",
  FIELD_BG: "#FFFFFF",
  TEXT_DARK: "#222222",
  TEXT_HINT: "#E57373",
  GRID_LINE: "#E0E0E0",
  HEADER_BG: "#FAFAFA",
  FOOTER_BG: "#1E1E1E",
  FOOTER_TEXT: "#E0E0E0",
  FIELD_TOUCHED_BG: "#E3F2FD",
  FIELD_TOUCHED_BORDER: "#90CAF9",
};

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(base, offset) {
  const d = new Date(base);
  d.setDate(d.getDate() + offset);
  return d;
}

function formatISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// --- Weather helpers (Open-Meteo for Perth) ---
function weatherIcon(code) {
  if (code === 0) return "☀";
  if (code === 1 || code === 2) return "⛅";
  if (code === 3) return "☁";
  if (code >= 45 && code <= 48) return "🌫";
  if (code >= 51 && code <= 57) return "🌦";
  if (code >= 61 && code <= 67) return "🌧";
  if (code >= 71 && code <= 77) return "🌨";
  if (code >= 80 && code <= 82) return "🌦";
  if (code >= 95) return "⛈";
  return "·";
}
function weatherPhrase(code) {
  if (code === 0) return "Sunny";
  if (code === 1 || code === 2) return "Partly cloudy";
  if (code === 3) return "Cloudy";
  if (code >= 45 && code <= 48) return "Fog/mist";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code >= 95) return "Thunderstorms";
  return "";
}

function Schedule() {
  const { user, isAdmin } = useAuth();

  const [currentMonday, setCurrentMonday] = useState(() => getMonday(new Date()));
  const [people, setPeople] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [selectedCell, setSelectedCell] = useState(null);
  const [isFlipped, setIsFlipped] = useState(false);

  const [weatherByDate, setWeatherByDate] = useState({});
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(currentMonday, i)),
    [currentMonday]
  );

  const weekLabel = `${weekDays[0].toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  })} – ${weekDays[6].toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;

  const weekStartISO = formatISO(currentMonday);

  const todayISO = formatISO(new Date());


  // Load staff list for schedule
  useEffect(() => {
    let cancelled = false;

    const loadPeople = async () => {
      setError("");
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, display_name, email, is_active, show_in_schedule")
          .eq("is_active", true)
          .eq("show_in_schedule", true)
          .order("display_name", { ascending: true });

        if (error) throw error;
        if (cancelled) return;

        const normalized = (data || [])
          .map((p) => ({
            id: p.id,
            name: p.display_name || p.email || "Unnamed",
          }))
          .filter((p) => p.id);

        setPeople(normalized);
      } catch (err) {
        console.error("Error loading profiles for schedule:", err);
        if (!cancelled) {
          const msg = err?.message || err?.details || err?.hint || "Unknown Supabase error";
          setError(`Could not load staff list for schedule. (${msg})`);
          setPeople([]);
        }
      }
    };

    loadPeople();
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedPeople = useMemo(() => {
    if (!people || people.length === 0) return [];
    const specialName = "Pro West Survey";
    const normal = people.filter((p) => p.name !== specialName);
    const special = people.filter((p) => p.name === specialName);
    return [...normal, ...special];
  }, [people]);

  // Load assignments whenever the week changes
  useEffect(() => {
    let cancelled = false;

    const loadAssignments = async () => {
      setLoading(true);
      setError("");

      try {
        const from = formatISO(weekDays[0]);
        const to = formatISO(weekDays[6]);

        const { data, error } = await supabase
          .from("schedule_assignments")
          .select("*")
          .gte("date", from)
          .lte("date", to);

        if (error) throw error;
        if (cancelled) return;

        const map = {};
        for (const row of data || []) {
          const key = `${row.date}|${row.person_id}`;
          if (!map[key]) map[key] = row;
        }
        setAssignments(map);
      } catch (err) {
        console.error("Error loading assignments:", err);
        if (!cancelled) {
          setError("Could not load schedule for this week.");
          setAssignments({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonday]);

  // Fetch weather for this week
  useEffect(() => {
    let cancelled = false;

    const fetchWeather = async () => {
      setWeatherLoading(true);
      setWeatherError("");
      try {
        const start = formatISO(currentMonday);
        const end = formatISO(addDays(currentMonday, 6));

        const url =
          "https://api.open-meteo.com/v1/forecast" +
          "?latitude=-31.95&longitude=115.86" +
          "&daily=weathercode,temperature_2m_min,temperature_2m_max,precipitation_sum" +
          "&timezone=Australia%2FPerth" +
          `&start_date=${start}&end_date=${end}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error("Weather API error");

        const d = await res.json();
        const daily = d.daily || {};
        const times = daily.time || [];
        const tmin = daily.temperature_2m_min || [];
        const tmax = daily.temperature_2m_max || [];
        const codes = daily.weathercode || [];
        const psum = daily.precipitation_sum || [];

        const n = Math.min(times.length, tmin.length, tmax.length, codes.length);

        const map = {};
        for (let i = 0; i < n; i++) {
          const code = Number(codes[i]);
          const icon = weatherIcon(code);
          const phrase = weatherPhrase(code);

          const line1 = `${Math.round(tmin[i])}°C–${Math.round(tmax[i])}°C ${icon}`;

          const parts2 = [];
          if (phrase) parts2.push(phrase);
          if (i < psum.length && psum[i] != null) {
            const mm = Number(psum[i]);
            if (!Number.isNaN(mm)) {
              const mmStr = mm >= 1 ? String(Math.round(mm)) : mm.toFixed(1);
              parts2.push(`${mmStr} mm`);
            }
          }
          const line2 = parts2.join(" • ");
          map[times[i]] = { line1, line2 };
        }

        if (!cancelled) setWeatherByDate(map);
      } catch (err) {
        console.error("Weather fetch failed", err);
        if (!cancelled) {
          setWeatherError("Weather data unavailable.");
          setWeatherByDate({});
        }
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    };

    fetchWeather();
    return () => {
      cancelled = true;
    };
  }, [currentMonday]);

  const handlePrevWeek = () => {
    setCurrentMonday((prev) => addDays(prev, -7));
    setSelectedCell(null);
  };
  const handleNextWeek = () => {
    setCurrentMonday((prev) => addDays(prev, 7));
    setSelectedCell(null);
  };
  const handleThisWeek = () => {
    setCurrentMonday(getMonday(new Date()));
    setSelectedCell(null);
  };
  const handleWeekDateChange = (e) => {
    const v = e.target.value;
    if (!v) return;
    const d = new Date(v + "T00:00:00");
    if (Number.isNaN(d.getTime())) return;
    setCurrentMonday(getMonday(d));
    setSelectedCell(null);
  };

  const onCellClick = (dateISO, personId) => {
    if (!isAdmin) return;
    setSelectedCell({ dateISO, personId });
  };

  const [editStatus, setEditStatus] = useState("FIELD");
  const [editRegion, setEditRegion] = useState("");
  const [editJobRef, setEditJobRef] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const getCellVisual = (dateInput, personId) => {
    const d =
      dateInput instanceof Date
        ? new Date(dateInput)
        : new Date(String(dateInput) + "T00:00:00");
    const dateISO = formatISO(d);
    const key = `${dateISO}|${personId}`;
    const a = assignments[key];
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;

    let status;
    let touched = false;

    if (a && a.status) {
      status = a.status;
      touched = !!a.touched;
    } else if (isWeekend) {
      status = "NON-WORK";
    } else {
      status = "FIELD";
    }

    let bg;
    let border;
    let statusColor;

    if (status === "FIELD") {
      if (touched) {
        bg = PALETTE.FIELD_TOUCHED_BG;
        border = PALETTE.FIELD_TOUCHED_BORDER;
        statusColor = "#1A1A1A";
      } else {
        bg = PALETTE.FIELD_BG;
        border = PALETTE.FIELD_BORDER;
        statusColor = PALETTE.TEXT_HINT;
      }
    } else {
      bg = PALETTE[status] || "#EEEEEE";
      border = "#9E9E9E";
      statusColor = "#1A1A1A";
    }

    return {
      dateISO,
      isWeekend,
      status,
      touched,
      bg,
      border,
      statusColor,
      region: a?.region || "",
      job_ref: a?.job_ref || "",
      notes: a?.notes || "",
    };
  };

  useEffect(() => {
    if (!selectedCell) return;
    const key = `${selectedCell.dateISO}|${selectedCell.personId}`;
    const current = assignments[key];

    if (current) {
      setEditStatus(current.status || "FIELD");
      setEditRegion(current.region || "");
      setEditJobRef(current.job_ref || "");
      setEditNotes(current.notes || "");
    } else {
      setEditStatus("FIELD");
      setEditRegion("");
      setEditJobRef("");
      setEditNotes("");
    }
  }, [selectedCell, assignments]);

  const handleSave = async () => {
    if (!selectedCell || !isAdmin) return;
    setSaving(true);
    setError("");

    try {
      const key = `${selectedCell.dateISO}|${selectedCell.personId}`;
      const existing = assignments[key];

      if (existing) {
        const updatePayload = {
          status: editStatus || "FIELD",
          region: editRegion,
          job_ref: editJobRef,
          notes: editNotes,
          touched: true,
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
          .from("schedule_assignments")
          .update(updatePayload)
          .eq("id", existing.id)
          .select()
          .single();

        if (error) throw error;
        setAssignments((prev) => ({ ...prev, [key]: data }));
      } else {
        const insertPayload = {
          date: selectedCell.dateISO,
          person_id: selectedCell.personId,
          status: editStatus || "FIELD",
          region: editRegion,
          job_ref: editJobRef,
          notes: editNotes,
          touched: true,
        };

        const { data, error } = await supabase
          .from("schedule_assignments")
          .insert(insertPayload)
          .select()
          .single();

        if (error) throw error;
        setAssignments((prev) => ({ ...prev, [key]: data }));
      }
    } catch (err) {
      console.error("Error saving assignment:", err);
      const msg = err?.message || err?.details || err?.hint || "Unknown Supabase error";
      setError(`Could not save this assignment. (${msg})`);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!selectedCell || !isAdmin) return;
    const key = `${selectedCell.dateISO}|${selectedCell.personId}`;
    const existing = assignments[key];

    if (!existing) {
      setEditRegion("");
      setEditJobRef("");
      setEditNotes("");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const { error } = await supabase
        .from("schedule_assignments")
        .delete()
        .eq("id", existing.id);

      if (error) throw error;

      const newMap = { ...assignments };
      delete newMap[key];
      setAssignments(newMap);
      setSelectedCell(null);
    } catch (err) {
      console.error("Error clearing assignment:", err);
      const msg = err?.message || err?.details || err?.hint || "Unknown Supabase error";
      setError(`Could not clear this assignment. (${msg})`);
    } finally {
      setSaving(false);
    }
  };

  const getInitialsFromName = (name) => {
    if (!name) return "";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    const first = parts[0][0] || "";
    const last = parts[parts.length - 1][0] || "";
    return (first + last).toUpperCase();
  };

  const buildTooltip = (personName, cell) =>
    [
      personName,
      new Date(cell.dateISO + "T00:00:00").toLocaleDateString("en-AU", {
        weekday: "long",
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      `Status: ${cell.status}`,
      cell.region && `Region: ${cell.region}`,
      cell.job_ref && `Job: ${cell.job_ref}`,
      cell.notes && `Notes: ${cell.notes}`,
    ]
      .filter(Boolean)
      .join("\n");

  return (
    <PageLayout
      icon="📅"
      title="Schedule"
      subtitle={isAdmin ? "Weekly schedule – click a cell to edit" : "Weekly schedule – view only"}
    >
      <div className="card schedule-card">
        <div className="schedule-header">
          <div className="schedule-week-label">
            Week of&nbsp;<strong>{weekLabel}</strong>
            {loading && <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem" }}>Loading…</span>}
            {weatherLoading && (
              <span style={{ marginLeft: "0.5rem", fontSize: "0.7rem" }}>(weather updating…)</span>
            )}
            {weatherError && !weatherLoading && (
              <span style={{ marginLeft: "0.5rem", fontSize: "0.7rem" }}>(weather unavailable)</span>
            )}
          </div>

          <div className="schedule-week-buttons">
            <button type="button" className="btn-pill" onClick={handlePrevWeek}>
              ◀ Previous week
            </button>
            <button type="button" className="btn-pill" onClick={handleThisWeek}>
              This week
            </button>
            <button type="button" className="btn-pill" onClick={handleNextWeek}>
              Next week ▶
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.75rem" }}>
              <span>Select week:</span>
              <input
                type="date"
                className="schedule-week-date-input"
                value={weekStartISO}
                onChange={handleWeekDateChange}
              />
            </div>

            <button type="button" className="btn-pill" onClick={() => setIsFlipped((v) => !v)}>
              {isFlipped ? "Normal view" : "Flip orientation"}
            </button>

            <button type="button" className="btn-pill" onClick={() => window.print()}>
              Print PDF
            </button>
          </div>
        </div>

        {error && (
          <div style={{ marginBottom: "0.5rem", fontSize: "0.8rem", color: "#b71c1c", whiteSpace: "pre-wrap" }}>
            {error}
          </div>
        )}

        <div className="schedule-grid-wrapper" style={{ WebkitOverflowScrolling: "touch" }}>
<table className="schedule-grid">
  {isFlipped ? (
    <>
      <thead>
        <tr>
          <th className="schedule-col-day schedule-day-col-header">Day</th>
          {sortedPeople.map((p) => (
            <th key={p.id} className="schedule-col-person">
              <div className="schedule-day-label">
                <span className="schedule-day-name">{p.name}</span>
              </div>
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {weekDays.map((d) => {
          const iso = formatISO(d);
          const wx = weatherByDate[iso];

          return (
             <tr key={iso}>
              {/* Left column = Day */}
              <td className={"schedule-person-cell schedule-day-cell" + (iso === todayISO ? " schedule-today-cell" : "")}>
                <div className="schedule-person-name">
                  {d.toLocaleDateString("en-AU", { weekday: "short" })}
                </div>
                <div style={{ fontSize: "0.8rem", opacity: 0.85 }}>
                  {d.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                </div>
                {wx && (
                  <div style={{ fontSize: "0.75rem", opacity: 0.85, marginTop: 4 }}>
                    {wx.line1}
                  </div>
                )}
              </td>

              {/* Across = People */}
              {sortedPeople.map((p) => {
                const cell = getCellVisual(d, p.id);
                const isSelected =
                  selectedCell &&
                  selectedCell.dateISO === cell.dateISO &&
                  selectedCell.personId === p.id;

                const tooltipText = buildTooltip(p.name, cell);

                return (
                  <td
  key={cell.dateISO + "|" + p.id}
 className={
  "schedule-cell" +
  (cell.isWeekend ? " schedule-weekend" : "") +
  (isSelected ? " schedule-selected" : "")
}
                    style={{
                      backgroundColor: cell.bg,
                      border: `1px solid ${cell.border || PALETTE.GRID_LINE}`,
                      cursor: isAdmin ? "pointer" : "default",
                    }}
                    onClick={() => onCellClick(cell.dateISO, p.id)}
                    title={tooltipText}
                  >
                    <div className="schedule-cell-status" style={{ color: cell.statusColor }}>
                      {cell.status}
                    </div>
                    {cell.region && <div className="schedule-cell-region">{cell.region}</div>}
                    {cell.job_ref && <div className="schedule-cell-job">Job: {cell.job_ref}</div>}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </>
  ) : (
    <>
      {/* your existing “normal view” head/body 그대로 */}
      <thead>
        <tr>
          <th className="schedule-col-person">Staff</th>
          {weekDays.map((d) => {
            const iso = formatISO(d);
            const wx = weatherByDate[iso];
            return (
              <th key={iso} className={"schedule-col-day" + (iso === todayISO ? " schedule-today-col-header" : "")}>
                <div className="schedule-day-label">
                  <span className="schedule-day-name">
                    {d.toLocaleDateString("en-AU", { weekday: "short" })}
                  </span>
                  <span className="schedule-day-date">
                    {d.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                  </span>
                  {wx && <span className="schedule-day-weather">{wx.line1}</span>}
                </div>
              </th>
            );
          })}
        </tr>
      </thead>

      <tbody>
        {sortedPeople.map((p) => (
          <tr key={p.id}>
            <td className="schedule-person-cell">
              <div className="schedule-person-avatar">{getInitialsFromName(p.name)}</div>
              <div className="schedule-person-name">{p.name}</div>
            </td>

            {weekDays.map((d) => {
              const cell = getCellVisual(d, p.id);
              const isSelected =
                selectedCell &&
                selectedCell.dateISO === cell.dateISO &&
                selectedCell.personId === p.id;

              const tooltipText = buildTooltip(p.name, cell);

              return (
                <td
                  key={cell.dateISO + "|" + p.id}
                  className={
  "schedule-cell" +
  (cell.isWeekend ? " schedule-weekend" : "") +
  (isSelected ? " schedule-selected" : "")
}

                  style={{
                    backgroundColor: cell.bg,
                    border: `1px solid ${cell.border || PALETTE.GRID_LINE}`,
                    cursor: isAdmin ? "pointer" : "default",
                  }}
                  onClick={() => onCellClick(cell.dateISO, p.id)}
                  title={tooltipText}
                >
                  <div className="schedule-cell-status" style={{ color: cell.statusColor }}>
                    {cell.status}
                  </div>
                  {cell.region && <div className="schedule-cell-region">{cell.region}</div>}
                  {cell.job_ref && <div className="schedule-cell-job">Job: {cell.job_ref}</div>}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </>
  )}
</table>

        </div>
<div className="schedule-legend">
  {/* FIELD */}
  <div className="schedule-legend-item">
  <span
    className="schedule-legend-swatch"
    style={{ background: PALETTE.FIELD_TOUCHED_BG, borderColor: PALETTE.FIELD_BORDER }}
  />
  <span>FIELD</span>
</div>

  {/* Other statuses */}
  {STATUSES.filter((st) => st !== "FIELD").map((st) => (
    <div key={st} className="schedule-legend-item">
      <span
        className="schedule-legend-swatch"
        style={{ background: PALETTE[st] || "#EEEEEE" }}
      />
      <span>{st}</span>
    </div>
  ))}
</div>

        <p className="schedule-footer-note">
          Logged in as <strong>{user?.email}</strong>.{" "}
          {isAdmin ? "You have admin editing rights." : "You have view-only access."}
        </p>
      </div>

      {isAdmin && selectedCell && (
        <div className="card schedule-editor-card">
          <h3 className="card-title">Edit assignment</h3>
          <p className="card-subtitle">
            {sortedPeople.find((p) => p.id === selectedCell.personId)?.name || "Staff"} –{" "}
            {new Date(selectedCell.dateISO).toLocaleDateString("en-AU", {
              weekday: "long",
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>

          <div className="schedule-editor-grid">
            <div className="schedule-editor-row">
              <label className="schedule-editor-label">Status</label>
              <select className="maps-search-input" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                {STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div className="schedule-editor-row">
              <label className="schedule-editor-label">Region / area</label>
              <input
                className="maps-search-input"
                type="text"
                value={editRegion}
                onChange={(e) => setEditRegion(e.target.value)}
                placeholder="e.g. METRO NORTH"
              />
            </div>

            <div className="schedule-editor-row">
              <label className="schedule-editor-label">Job ref</label>
              <input
                className="maps-search-input"
                type="text"
                value={editJobRef}
                onChange={(e) => setEditJobRef(e.target.value)}
                placeholder="e.g. 12345"
              />
            </div>

            <div className="schedule-editor-row">
              <label className="schedule-editor-label">Notes</label>
              <textarea
                className="maps-search-input"
                style={{ minHeight: "60px" }}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Additional notes (optional)"
              />
            </div>
          </div>

          <div style={{ marginTop: "0.6rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="button" className="btn-pill primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn-pill" onClick={handleClear} disabled={saving}>
              Clear / remove
            </button>
            <button type="button" className="btn-pill" onClick={() => setSelectedCell(null)} disabled={saving}>
              Close
            </button>
          </div>
        </div>
      )}
    </PageLayout>
  );
}

export default Schedule;
