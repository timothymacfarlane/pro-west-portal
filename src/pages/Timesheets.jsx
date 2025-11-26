import { useEffect, useMemo, useState } from "react";
import PageLayout from "../components/PageLayout.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient";

// ---- Simple colleague list for dropdown (mirrors Contacts.jsx) ----
const colleagues = [
  "Angus Leaver",
  "Jared Flavel",
  "Joel Parker",
  "Liam Wells",
  "Orion Cerrero",
  "Ryan Parker",
  "Tim MacFarlane",
];

// ----- Helpers for dates & times -----

function startOfFortnightMonday(baseDate = new Date()) {
  const d = new Date(baseDate);
  const day = d.getDay(); // 0 Sun, 1 Mon, ... 6 Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  const newDate = d.getDate() + days;
  d.setDate(newDate);
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

// Parse "HH:MM" into minutes
function parseTimeToMinutes(str) {
  if (!str || typeof str !== "string") return null;
  const parts = str.split(":");
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

// Format minutes to "H.hh" (e.g. 7.5)
function minutesToHoursDecimal(minutes) {
  if (minutes == null) return "";
  const decimal = minutes / 60;
  return decimal.toFixed(2).replace(/\.00$/, "");
}

function Timesheets() {
  const { user } = useAuth();
  const displayName =
    user?.user_metadata?.full_name || user?.email || "Unknown user";

  const [periodStart, setPeriodStart] = useState(startOfFortnightMonday());
  const periodStartIso = useMemo(
    () => periodStart.toISOString().slice(0, 10),
    [periodStart]
  );

  // For the small calendar – defaults to current period start
  const [jumpDate, setJumpDate] = useState(periodStartIso);

  // Keep the calendar value in sync when we change fortnight with buttons
  useEffect(() => {
    setJumpDate(periodStartIso);
  }, [periodStartIso]);

  // Timesheet entries keyed by date key "YYYY-MM-DD"
  const [entries, setEntries] = useState({});
  const [loadingPeriod, setLoadingPeriod] = useState(false);
  const [busy, setBusy] = useState(false); // used for save + submit
  const [statusMessage, setStatusMessage] = useState("");
  const [statusError, setStatusError] = useState("");

  const fortnightLabel = useMemo(() => {
    // Now: full 14 days Mon–Sun, Mon–Sun
    const end = addDays(periodStart, 13);
    return `${formatDateLabel(periodStart)} – ${formatDateLabel(end)}`;
  }, [periodStart]);

  // Week 1: Monday–Sunday
  const week1Days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(periodStart, i)),
    [periodStart]
  );

  // Week 2: next Monday–Sunday
  const week2Days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(periodStart, 7 + i)),
    [periodStart]
  );

  // Load existing entries for this user + period from Supabase
  useEffect(() => {
    const loadEntries = async () => {
      if (!user) return;

      setLoadingPeriod(true);
      setStatusMessage("");
      setStatusError("");

      const { data, error } = await supabase
        .from("timesheet_entries")
        .select("*")
        .eq("user_id", user.id)
        .eq("period_start", periodStartIso)
        .order("entry_date", { ascending: true });

      if (error) {
        console.warn("Error loading timesheet entries:", error.message);
        setLoadingPeriod(false);
        return;
      }

      const map = {};
      data.forEach((row) => {
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
  }, [user, periodStartIso]);

  const handleFieldChange = (dateKey, field, value) => {
    setEntries((prev) => ({
      ...prev,
      [dateKey]: {
        ...prev[dateKey],
        [field]: value,
      },
    }));
  };

  const buildRowData = (date) => {
    const isoKey = date.toISOString().slice(0, 10); // YYYY-MM-DD
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

  const week1TotalMinutes = week1Rows.reduce(
    (sum, r) => sum + (r.workedMinutes || 0),
    0
  );
  const week2TotalMinutes = week2Rows.reduce(
    (sum, r) => sum + (r.workedMinutes || 0),
    0
  );
  const fortnightTotalMinutes = week1TotalMinutes + week2TotalMinutes;

  const goPreviousFortnight = () => {
    if (busy) return;
    setPeriodStart((prev) => addDays(prev, -14));
  };

  const goCurrentFortnight = () => {
    if (busy) return;
    setPeriodStart(startOfFortnightMonday());
    setStatusMessage("");
    setStatusError("");
  };

  const goNextFortnight = () => {
    if (busy) return;
    setPeriodStart((prev) => addDays(prev, 14));
  };

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

  // Build a flat list of entries for saving
  const buildFortnightEntries = () => {
    const rows = [...week1Rows, ...week2Rows];

    return rows
      .filter((r) => {
        // Only save rows that have at least some data
        const hasAnyField =
          r.colleague ||
          r.start ||
          r.finish ||
          r.lunch ||
          r.notes ||
          r.workedMinutes != null;
        return hasAnyField;
      })
      .map((r) => ({
        user_id: user.id,
        period_start: periodStartIso,
        entry_date: r.isoKey,
        colleague: r.colleague || null,
        start_time: r.start || null,
        finish_time: r.finish || null,
        lunch: r.lunch || null,
        hours_decimal:
          r.workedMinutes != null ? r.workedMinutes / 60.0 : null,
        notes: r.notes || null,
      }));
  };

  // Reusable function: save/overwrite this fortnight in Supabase
  const saveFortnightToSupabase = async (payload) => {
    // 1) Delete existing entries for this user + period_start
    const { error: delError } = await supabase
      .from("timesheet_entries")
      .delete()
      .eq("user_id", user.id)
      .eq("period_start", periodStartIso);

    if (delError) throw delError;

    // 2) Insert new entries
    const { error: insertError } = await supabase
      .from("timesheet_entries")
      .insert(payload);

    if (insertError) throw insertError;
  };

  // Create CSV string for Excel from the fortnight view
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
      const hasAnyField =
        r.colleague ||
        r.start ||
        r.finish ||
        r.lunch ||
        r.notes ||
        r.workedMinutes != null;
      if (!hasAnyField) return;

      const fields = [
        `"${(displayName || "").replace(/"/g, '""')}"`,
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

  // Save button handler (no CSV)
  const handleSaveFortnight = async () => {
    if (!user) return;

    const payload = buildFortnightEntries();

    if (payload.length === 0) {
      setStatusError(
        "No timesheet entries to save for this fortnight. Add some rows first."
      );
      setStatusMessage("");
      return;
    }

    setBusy(true);
    setStatusError("");
    setStatusMessage("");

    try {
      await saveFortnightToSupabase(payload);
      setStatusMessage(
        "Fortnight saved. You can come back and submit it later when ready."
      );
    } catch (err) {
      console.error("Error saving fortnight:", err);
      setStatusError("There was a problem saving. Please try again.");
      setStatusMessage("");
    } finally {
      setBusy(false);
    }
  };

  // Submit fortnight (save + CSV + upload)
  const handleSubmitFortnight = async () => {
    if (!user) return;

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
      // 1) Save/overwrite in DB
      await saveFortnightToSupabase(payload);

      // 2) Build CSV & trigger download
      const csv = buildCsv();
      const blob = new Blob([csv], {
        type: "text/csv;charset=utf-8;",
      });

      const safeEmail = (user.email || user.id || "user").replace(
        /[^a-zA-Z0-9@._-]/g,
        "_"
      );
      const fileName = `timesheet_${safeEmail.replace(
        "@",
        "_at_"
      )}_${periodStartIso}.csv`;

      // Download to device
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      // 3) Upload CSV to Supabase storage (server folder)
      const storagePath = `${user.id}/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from("timesheets")
        .upload(storagePath, blob, {
          upsert: true,
          contentType: "text/csv",
        });

      if (uploadError) throw uploadError;

      // 4) Done
      setStatusMessage(
        "Fortnight submitted, CSV downloaded, and saved to server storage."
      );
    } catch (err) {
      console.error("Error submitting fortnight:", err);
      setStatusError(
        "There was a problem submitting this fortnight. Please try again."
      );
      setStatusMessage("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageLayout
      icon="⏱️"
      title="Timesheets"
      subtitle="Fortnightly working hours"
      actions={
        <>
          <button
            type="button"
            className="btn-pill"
            onClick={goPreviousFortnight}
            disabled={loadingPeriod || busy}
          >
            ◀ Previous
          </button>

          <button
            type="button"
            className="btn-pill"
            onClick={goCurrentFortnight}
            disabled={loadingPeriod || busy}
          >
            Current fortnight
          </button>

          <button
            type="button"
            className="btn-pill"
            onClick={goNextFortnight}
            disabled={loadingPeriod || busy}
          >
            Next ▶
          </button>

          <button
            type="button"
            className="btn-pill"
            onClick={handleSaveFortnight}
            disabled={loadingPeriod || busy}
          >
            {busy ? "Saving…" : "Save fortnight"}
          </button>

          <button
            type="button"
            className="btn-pill primary"
            onClick={handleSubmitFortnight}
            disabled={loadingPeriod || busy}
          >
            {busy ? "Working…" : "Submit fortnight"}
          </button>
        </>
      }
    >
      {/* Datelist for colleagues dropdown */}
      <datalist id="colleagues-list">
        {colleagues.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {/* Summary card */}
      <div className="card">
        <h3 className="card-title">Timesheet period</h3>
        <p className="card-subtitle">
          This view covers a full 14 days (including weekends) across two weeks.
        </p>

        <div
          style={{
            marginTop: "0.6rem",
            display: "flex",
            flexWrap: "wrap",
            gap: "0.6rem",
          }}
        >
          <div className="card-row">
            <span className="card-row-label">Employee</span>
            <span className="card-row-value">{displayName}</span>
          </div>
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
        <p className="card-subtitle">
          First week of the fortnight, including weekend days.
        </p>

        <div style={{ overflowX: "auto", marginTop: "0.5rem" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.85rem",
            }}
          >
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
                        onChange={(e) =>
                          handleFieldChange(
                            row.isoKey,
                            "colleague",
                            e.target.value
                          )
                        }
                        placeholder="Who you worked with"
                      />
                    </td>
                    <td className="ts-cell ts-cell-time">
                      <input
                        type="text"
                        className="maps-search-input"
                        value={row.start}
                        onChange={(e) =>
                          handleFieldChange(
                            row.isoKey,
                            "start",
                            e.target.value
                          )
                        }
                        placeholder="07:00"
                      />
                    </td>
                    <td className="ts-cell ts-cell-time">
                      <input
                        type="text"
                        className="maps-search-input"
                        value={row.finish}
                        onChange={(e) =>
                          handleFieldChange(
                            row.isoKey,
                            "finish",
                            e.target.value
                          )
                        }
                        placeholder="15:00"
                      />
                    </td>
                    <td className="ts-cell ts-cell-time">
                      <input
                        type="text"
                        className="maps-search-input"
                        value={row.lunch}
                        onChange={(e) =>
                          handleFieldChange(
                            row.isoKey,
                            "lunch",
                            e.target.value
                          )
                        }
                        placeholder="00:30"
                      />
                    </td>
                    <td className="ts-cell ts-cell-hours">
                      {row.workedHoursDecimal}
                    </td>
                    <td className="ts-cell">
                      <input
                        type="text"
                        className="maps-search-input"
                        value={row.notes}
                        onChange={(e) =>
                          handleFieldChange(
                            row.isoKey,
                            "notes",
                            e.target.value
                          )
                        }
                        placeholder="Job / comments"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td
                  className="ts-foot"
                  colSpan={6}
                  style={{ textAlign: "right" }}
                >
                  Weekly total
                </td>
                <td className="ts-foot ts-cell-hours">
                  {minutesToHoursDecimal(week1TotalMinutes)}
                </td>
                <td className="ts-foot"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Week 2 */}
      <div className="card">
        <h3 className="card-title">Week 2 (Mon–Sun)</h3>
        <p className="card-subtitle">
          Second week of the fortnight, including weekend days.
        </p>

        <div style={{ overflowX: "auto", marginTop: "0.5rem" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.85rem",
            }}
          >
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
                        onChange={(e) =>
                          handleFieldChange(
                            row.isoKey,
                            "colleague",
                            e.target.value
                          )
                        }
                        placeholder="Who you worked with"
                      />
                    </td>
                    <td className="ts-cell ts-cell-time">
                      <input
                        type="text"
                        className="maps-search-input"
                        value={row.start}
                        onChange={(e) =>
                          handleFieldChange(
                            row.isoKey,
                            "start",
                            e.target.value
                          )
                        }
                        placeholder="07:00"
                      />
                    </td>
                    <td className="ts-cell ts-cell-time">
                      <input
                        type="text"
                        className="maps-search-input"
                        value={row.finish}
                        onChange={(e) =>
                          handleFieldChange(
                            row.isoKey,
                            "finish",
                            e.target.value
                          )
                        }
                        placeholder="15:00"
                      />
                    </td>
                    <td className="ts-cell ts-cell-time">
                      <input
                        type="text"
                        className="maps-search-input"
                        value={row.lunch}
                        onChange={(e) =>
                          handleFieldChange(
                            row.isoKey,
                            "lunch",
                            e.target.value
                          )
                        }
                        placeholder="00:30"
                      />
                    </td>
                    <td className="ts-cell ts-cell-hours">
                      {row.workedHoursDecimal}
                    </td>
                    <td className="ts-cell">
                      <input
                        type="text"
                        className="maps-search-input"
                        value={row.notes}
                        onChange={(e) =>
                          handleFieldChange(
                            row.isoKey,
                            "notes",
                            e.target.value
                          )
                        }
                        placeholder="Job / comments"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td
                  className="ts-foot"
                  colSpan={6}
                  style={{ textAlign: "right" }}
                >
                  Weekly total
                </td>
                <td className="ts-foot ts-cell-hours">
                  {minutesToHoursDecimal(week2TotalMinutes)}
                </td>
                <td className="ts-foot"></td>
              </tr>
              <tr>
                <td
                  className="ts-foot"
                  colSpan={6}
                  style={{ textAlign: "right" }}
                >
                  Fortnight total
                </td>
                <td className="ts-foot ts-cell-hours">
                  {minutesToHoursDecimal(fortnightTotalMinutes)}
                </td>
                <td className="ts-foot"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Status messages */}
      {statusError && (
        <div
          style={{
            marginTop: "0.6rem",
            fontSize: "0.85rem",
            color: "#b71c1c",
          }}
        >
          {statusError}
        </div>
      )}
      {statusMessage && (
        <div
          style={{
            marginTop: "0.6rem",
            fontSize: "0.85rem",
            color: "#2e7d32",
          }}
        >
          {statusMessage}
        </div>
      )}

      <div
        style={{
          marginTop: "0.5rem",
          fontSize: "0.8rem",
          color: "#666",
        }}
      >
        <ul style={{ marginTop: "0.3rem" }}>
          <li>
            <strong>Save fortnight</strong> – stores your entries in the
            Pro&nbsp;West database so you can come back later.
          </li>
          <li>
            <strong>Submit fortnight</strong> – saves, downloads a CSV copy, and
            uploads it to the server storage.
          </li>
        </ul>
      </div>
    </PageLayout>
  );
}

export default Timesheets;
