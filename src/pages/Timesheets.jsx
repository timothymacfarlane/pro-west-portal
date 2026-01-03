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
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function formatDateLabel(date) {
  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
function formatDayName(date) {
  return date.toLocaleDateString("en-AU", { weekday: "long" });
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
function minutesToHoursDecimal(minutes) {
  if (minutes == null) return "";
  const decimal = minutes / 60;
  return decimal.toFixed(2).replace(/\.00$/, "");
}

function Timesheets() {
  const { user, isAdmin } = useAuth();

  const [staff, setStaff] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(user?.id || "");
  const [selectedName, setSelectedName] = useState("");

  const [periodStart, setPeriodStart] = useState(startOfFortnightMonday());
  const periodStartIso = useMemo(() => periodStart.toISOString().slice(0, 10), [periodStart]);

  const [jumpDate, setJumpDate] = useState(periodStartIso);
  useEffect(() => setJumpDate(periodStartIso), [periodStartIso]);

  const [entries, setEntries] = useState({});
  const [loadingPeriod, setLoadingPeriod] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusError, setStatusError] = useState("");

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

      const { data, error } = await supabase
        .from("timesheet_entries")
        .select("*")
        .eq("user_id", selectedUserId)
        .eq("period_start", periodStartIso)
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

  const handleFieldChange = (dateKey, field, value) => {
    setEntries((prev) => ({
      ...prev,
      [dateKey]: { ...(prev[dateKey] || {}), [field]: value },
    }));
  };

  const buildRowData = (date) => {
    const isoKey = date.toISOString().slice(0, 10);
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
      dayName: formatDayName(date),
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

  const week1TotalMinutes = week1Rows.reduce((sum, r) => sum + (r.workedMinutes || 0), 0);
  const week2TotalMinutes = week2Rows.reduce((sum, r) => sum + (r.workedMinutes || 0), 0);
  const fortnightTotalMinutes = week1TotalMinutes + week2TotalMinutes;

  const goPreviousFortnight = () => !busy && setPeriodStart((prev) => addDays(prev, -14));
  const goCurrentFortnight = () => {
    if (busy) return;
    setPeriodStart(startOfFortnightMonday());
    setStatusMessage("");
    setStatusError("");
  };
  const goNextFortnight = () => !busy && setPeriodStart((prev) => addDays(prev, 14));

  const handleJumpDateChange = (e) => {
    const val = e.target.value;
    setJumpDate(val);
    if (!val || busy) return;
    const chosen = new Date(val + "T00:00:00");
    if (Number.isNaN(chosen.getTime())) return;
    setPeriodStart(startOfFortnightMonday(chosen));
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
    const { error: delError } = await supabase
      .from("timesheet_entries")
      .delete()
      .eq("user_id", selectedUserId)
      .eq("period_start", periodStartIso);

    if (delError) throw delError;

    const { error: insertError } = await supabase.from("timesheet_entries").insert(payload);
    if (insertError) throw insertError;
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
      const hasAny =
        r.colleague || r.start || r.finish || r.lunch || r.notes || r.workedMinutes != null;
      if (!hasAny) return;

      const fields = [
        `"${(selectedName || "").replace(/"/g, '""')}"`,
        `"${periodStartIso}"`,
        `"${endDate.toISOString().slice(0, 10)}"`,
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

      setStatusMessage("Fortnight submitted, CSV downloaded, and saved to server storage.");
    } catch (err) {
      console.error("Error submitting fortnight:", err);
      const msg = err?.message || err?.details || err?.hint || "Unknown Supabase error";
      setStatusError(`There was a problem submitting this fortnight. (${msg})`);
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
            Current fortnight
          </button>
          <button type="button" className="btn-pill" onClick={goNextFortnight} disabled={loadingPeriod || busy}>
            Next ▶
          </button>
          <button type="button" className="btn-pill" onClick={handleSaveFortnight} disabled={loadingPeriod || busy}>
            {busy ? "Saving…" : "Save fortnight"}
          </button>
          <button type="button" className="btn-pill primary" onClick={handleSubmitFortnight} disabled={loadingPeriod || busy}>
            {busy ? "Working…" : "Submit fortnight"}
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
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr>
                <th className="ts-head">Day</th>
                <th className="ts-head">Date</th>
                <th className="ts-head">Work colleague</th>
                <th className="ts-head">Start</th>
                <th className="ts-head">Finish</th>
                <th className="ts-head">Lunch</th>
                <th className="ts-head">Hours</th>
                <th className="ts-head">Notes</th>
              </tr>
            </thead>
            <tbody>
              {week1Days.map((date) => {
                const row = buildRowData(date);
                return (
                  <tr key={row.isoKey}>
                    <td className="ts-cell ts-cell-day">{row.dayName}</td>
                    <td className="ts-cell">{formatDateLabel(row.date)}</td>
                    <td className="ts-cell">
                      <input
                        type="text"
                        list="colleagues-list"
                        className="maps-search-input"
                        value={row.colleague}
                        onChange={(e) => handleFieldChange(row.isoKey, "colleague", e.target.value)}
                        placeholder="Who you worked with"
                      />
                    </td>
                    <td className="ts-cell ts-cell-time">
                      <input
                        type="text"
                        className="maps-search-input"
                        value={row.start}
                        onChange={(e) => handleFieldChange(row.isoKey, "start", e.target.value)}
                        placeholder="07:00"
                      />
                    </td>
                    <td className="ts-cell ts-cell-time">
                      <input
                        type="text"
                        className="maps-search-input"
                        value={row.finish}
                        onChange={(e) => handleFieldChange(row.isoKey, "finish", e.target.value)}
                        placeholder="15:00"
                      />
                    </td>
                    <td className="ts-cell ts-cell-time">
                      <input
                        type="text"
                        className="maps-search-input"
                        value={row.lunch}
                        onChange={(e) => handleFieldChange(row.isoKey, "lunch", e.target.value)}
                        placeholder="00:30"
                      />
                    </td>
                    <td className="ts-cell ts-cell-hours">{row.workedHoursDecimal}</td>
                    <td className="ts-cell">
                      <input
                        type="text"
                        className="maps-search-input"
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
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr>
                <th className="ts-head">Day</th>
                <th className="ts-head">Date</th>
                <th className="ts-head">Work colleague</th>
                <th className="ts-head">Start</th>
                <th className="ts-head">Finish</th>
                <th className="ts-head">Lunch</th>
                <th className="ts-head">Hours</th>
                <th className="ts-head">Notes</th>
              </tr>
            </thead>
            <tbody>
              {week2Days.map((date) => {
                const row = buildRowData(date);
                return (
                  <tr key={row.isoKey}>
                    <td className="ts-cell ts-cell-day">{row.dayName}</td>
                    <td className="ts-cell">{formatDateLabel(row.date)}</td>
                    <td className="ts-cell">
                      <input
                        type="text"
                        list="colleagues-list"
                        className="maps-search-input"
                        value={row.colleague}
                        onChange={(e) => handleFieldChange(row.isoKey, "colleague", e.target.value)}
                        placeholder="Who you worked with"
                      />
                    </td>
                    <td className="ts-cell ts-cell-time">
                      <input
                        type="text"
                        className="maps-search-input"
                        value={row.start}
                        onChange={(e) => handleFieldChange(row.isoKey, "start", e.target.value)}
                        placeholder="07:00"
                      />
                    </td>
                    <td className="ts-cell ts-cell-time">
                      <input
                        type="text"
                        className="maps-search-input"
                        value={row.finish}
                        onChange={(e) => handleFieldChange(row.isoKey, "finish", e.target.value)}
                        placeholder="15:00"
                      />
                    </td>
                    <td className="ts-cell ts-cell-time">
                      <input
                        type="text"
                        className="maps-search-input"
                        value={row.lunch}
                        onChange={(e) => handleFieldChange(row.isoKey, "lunch", e.target.value)}
                        placeholder="00:30"
                      />
                    </td>
                    <td className="ts-cell ts-cell-hours">{row.workedHoursDecimal}</td>
                    <td className="ts-cell">
                      <input
                        type="text"
                        className="maps-search-input"
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
    </PageLayout>
  </>
  );
}

export default Timesheets;
