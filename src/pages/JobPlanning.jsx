import { useEffect, useMemo, useState, useRef } from "react";
import PageLayout from "../components/PageLayout.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useAppVisibilityContext } from "../context/AppVisibilityContext.jsx";
import { supabase } from "../lib/supabaseClient";

// ---------- Date helpers ----------
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday start
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getMonthStart(date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(base, offset) {
  const d = new Date(base);
  d.setDate(d.getDate() + offset);
  return d;
}

function addMonths(base, offset) {
  const d = new Date(base);
  d.setMonth(d.getMonth() + offset, 1);
  d.setHours(0, 0, 0, 0);
  return getMonthStart(d);
}

function formatISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatMonthInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function longDateLabel(dateISO) {
  return new Date(`${dateISO}T00:00:00`).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function extractSuburbFromAddress(address) {
  if (!address) return "";

  const text = String(address).trim();

  // Common Google format: "12 Smith St, Suburb WA 6000, Australia"
  const match = text.match(/,\s*([^,]+?)\s+WA\s+\d{4}\b/i);
  if (match?.[1]) {
    return match[1].trim();
  }

  // Fallback: second comma part if it exists
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return parts[1].replace(/\s+WA.*$/i, "").trim();
  }

  return "";
}

function buildCalendarDays(currentMonth) {
  const monthStart = getMonthStart(currentMonth);
  const calendarStart = getMonday(monthStart);

  return Array.from({ length: 42 }, (_, i) => addDays(calendarStart, i));
}

const DAY_HEADERS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const JOB_COLOURS = [
  { value: "", label: "Default" },
  { value: "red", label: "Red" },
  { value: "blue", label: "Blue" },
  { value: "green", label: "Green" },
  { value: "yellow", label: "Yellow" },
  { value: "purple", label: "Purple" },
];

function JobPlanning() {
  const { user, isAdmin } = useAuth();
  const isAppVisible = useAppVisibilityContext();

  const [currentMonth, setCurrentMonth] = useState(() => getMonthStart(new Date()));
  const [plansByDate, setPlansByDate] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [selectedDate, setSelectedDate] = useState(null);
  const [editItems, setEditItems] = useState([]);
  const [highlightedJobKey, setHighlightedJobKey] = useState(null);
  const [draggedJobKey, setDraggedJobKey] = useState(null);
  const [dragOverJobKey, setDragOverJobKey] = useState(null);
  const topScrollRef = useRef(null);
  const bottomScrollRef = useRef(null);

  const [jobQuery, setJobQuery] = useState("");
  const [jobSuggestions, setJobSuggestions] = useState([]);
  const [jobLoading, setJobLoading] = useState(false);

  const calendarDays = useMemo(() => buildCalendarDays(currentMonth), [currentMonth]);

  const calendarRows = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => calendarDays.slice(i * 7, i * 7 + 7));
  }, [calendarDays]);

  const monthLabel = currentMonth.toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
  });

  const monthValue = formatMonthInput(currentMonth);
  const todayISO = formatISO(new Date());

  // ---------- Access guard ----------
  if (!isAdmin) {
    return (
      <PageLayout icon="🗓️" title="Job Planning" subtitle="Admin only">
        <div className="card">
          <h3 className="card-title">Access denied</h3>
          <p className="card-subtitle">This page is only available to admin users.</p>
        </div>
      </PageLayout>
    );
  }

  // ---------- Load month data ----------
  useEffect(() => {
    let cancelled = false;
    if (!isAppVisible) return;

    const loadPlans = async () => {
      setLoading(true);
      setError("");

      try {
        const from = formatISO(calendarDays[0]);
        const to = formatISO(calendarDays[41]);

        const { data, error } = await supabase
          .from("job_planning_entries")
          .select("*")
          .gte("date", from)
          .lte("date", to)
          .order("date", { ascending: true })
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true });

        if (error) throw error;
        if (cancelled) return;

        const grouped = {};

        for (const row of data || []) {
          if (!grouped[row.date]) grouped[row.date] = [];
          grouped[row.date].push(row);
        }

        setPlansByDate(grouped);
      } catch (err) {
        console.error("Error loading job planning entries:", err);
        if (!cancelled) {
          const msg = err?.message || err?.details || err?.hint || "Unknown Supabase error";
          setError(`Could not load job planning calendar. (${msg})`);
          setPlansByDate({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadPlans();

    return () => {
      cancelled = true;
    };
  }, [calendarDays, isAppVisible]);

  useEffect(() => {
  const top = topScrollRef.current;
  const bottom = bottomScrollRef.current;

  if (!top || !bottom) return;

  const syncTop = () => {
    bottom.scrollLeft = top.scrollLeft;
  };

  const syncBottom = () => {
    top.scrollLeft = bottom.scrollLeft;
  };

  top.addEventListener("scroll", syncTop);
  bottom.addEventListener("scroll", syncBottom);

  return () => {
    top.removeEventListener("scroll", syncTop);
    bottom.removeEventListener("scroll", syncBottom);
  };
}, []);

useEffect(() => {
  const top = topScrollRef.current;
  const bottom = bottomScrollRef.current;

  if (!top || !bottom) return;

  const inner = top.querySelector(".schedule-grid-scroll-inner");
  if (!inner) return;

  inner.style.width = `${bottom.scrollWidth}px`;
}, [calendarDays, plansByDate, selectedDate]);

  // ---------- Sync editor when day changes ----------
  useEffect(() => {
    if (!selectedDate) return;

    const currentItems = plansByDate[selectedDate] || [];
    const hydrated = currentItems.map((item, index) => ({
      ...item,
      client_key: item.id || `${item.job_number}-${selectedDate}-${index}`,
    }));

   setEditItems(hydrated);
setJobQuery("");
setJobSuggestions([]);
setHighlightedJobKey(null);
setDraggedJobKey(null);
setDragOverJobKey(null);
  }, [selectedDate, plansByDate]);

  // ---------- Month nav ----------
  const handlePrevMonth = () => {
    setCurrentMonth((prev) => addMonths(prev, -1));
    setSelectedDate(null);
  };

  const handleNextMonth = () => {
    setCurrentMonth((prev) => addMonths(prev, 1));
    setSelectedDate(null);
  };

  const handleThisMonth = () => {
    setCurrentMonth(getMonthStart(new Date()));
    setSelectedDate(null);
  };

  const handleMonthChange = (e) => {
    const v = e.target.value;
    if (!v) return;

    const d = new Date(`${v}-01T00:00:00`);
    if (Number.isNaN(d.getTime())) return;

    setCurrentMonth(getMonthStart(d));
    setSelectedDate(null);
  };

  const onDayClick = (dateISO) => {
    setSelectedDate(dateISO);
  };

  // ---------- Job search ----------
  useEffect(() => {
    let cancelled = false;
    if (!isAppVisible) return;

    if (!jobQuery || Number.isNaN(Number(jobQuery))) {
      setJobSuggestions([]);
      return;
    }

    const t = setTimeout(async () => {
      setJobLoading(true);

      try {
        const q = jobQuery.trim();

        const { data, error } = await supabase.rpc("search_jobs", {
          p_q: q,
          p_limit: 10,
        });

        if (error) throw error;

        if (!cancelled) {
          setJobSuggestions(
            (data || []).map((r) => ({
              job_number: String(r.job_number),
              full_address: r.full_address || "",
            }))
          );
        }
      } catch (err) {
        console.error("Job autocomplete failed:", err);
        if (!cancelled) setJobSuggestions([]);
      } finally {
        if (!cancelled) setJobLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [jobQuery, isAppVisible]);

  const resolveSuburbForJob = async (job) => {
    // First try the address already returned by search_jobs
    const fromSearch = extractSuburbFromAddress(job.full_address);
    if (fromSearch) return fromSearch;

    // Fallback to jobs table
    try {
      const jobNumberValue = Number.isNaN(Number(job.job_number))
        ? String(job.job_number)
        : Number(job.job_number);

      const { data, error } = await supabase
        .from("jobs")
        .select("full_address, suburb")
        .eq("job_number", jobNumberValue)
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      return extractSuburbFromAddress(data?.full_address) || data?.suburb || "";
    } catch (err) {
      console.error("Could not resolve suburb for job:", err);
      return "";
    }
  };

 const addPlannedJob = async (job) => {
  const jobNumber = String(job.job_number);

  if (editItems.some((item) => String(item.job_number) === jobNumber)) {
    setJobQuery("");
    setJobSuggestions([]);
    return;
  }

  const suburb = await resolveSuburbForJob(job);

  const newKey = `new-${jobNumber}-${Date.now()}`;

  setEditItems((prev) => {
    const next = [
     {
  id: null,
  client_key: newKey,
  date: selectedDate,
  job_number: jobNumber,
  suburb,
  notes: "",
  colour: "",
  sort_order: 0,
},
      ...prev,
    ].map((item, index) => ({
      ...item,
      sort_order: index,
    }));

    return next;
  });

  // 🔥 highlight the new job
  setHighlightedJobKey(newKey);

  // remove highlight after 1.5 seconds
  setTimeout(() => {
    setHighlightedJobKey(null);
  }, 1500);

  setJobQuery("");
  setJobSuggestions([]);
};

  const handleJobKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (jobSuggestions.length > 0) {
        void addPlannedJob(jobSuggestions[0]);
      }
    }
  };

  const updateEditItem = (clientKey, field, value) => {
    setEditItems((prev) =>
      prev.map((item) =>
        item.client_key === clientKey
          ? {
              ...item,
              [field]: value,
            }
          : item
      )
    );
  };

  const removeEditItem = (clientKey) => {
    setEditItems((prev) =>
      prev
        .filter((item) => item.client_key !== clientKey)
        .map((item, index) => ({
          ...item,
          sort_order: index,
        }))
    );
  };

const cycleJobColour = (clientKey) => {
  setEditItems((prev) =>
    prev.map((item) => {
      if (item.client_key !== clientKey) return item;

      const currentIndex = JOB_COLOURS.findIndex((c) => c.value === (item.colour || ""));
      const nextIndex = currentIndex === -1
        ? 1
        : (currentIndex + 1) % JOB_COLOURS.length;

      return {
        ...item,
        colour: JOB_COLOURS[nextIndex].value,
      };
    })
  );
};

  const moveEditItem = (fromKey, toKey) => {
  if (!fromKey || !toKey || fromKey === toKey) return;

  setEditItems((prev) => {
    const fromIndex = prev.findIndex((item) => item.client_key === fromKey);
    const toIndex = prev.findIndex((item) => item.client_key === toKey);

    if (fromIndex === -1 || toIndex === -1) return prev;

    const next = [...prev];
    const [movedItem] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, movedItem);

    return next.map((item, index) => ({
      ...item,
      sort_order: index,
    }));
  });
};

const handleDragStart = (clientKey) => {
  setDraggedJobKey(clientKey);
};

const handleDragEnter = (clientKey) => {
  if (!draggedJobKey || draggedJobKey === clientKey) return;
  setDragOverJobKey(clientKey);
};

const handleDragEnd = () => {
  setDraggedJobKey(null);
  setDragOverJobKey(null);
};

const handleDropOnItem = (targetKey) => {
  if (!draggedJobKey || !targetKey || draggedJobKey === targetKey) {
    setDraggedJobKey(null);
    setDragOverJobKey(null);
    return;
  }

  moveEditItem(draggedJobKey, targetKey);
  setDraggedJobKey(null);
  setDragOverJobKey(null);
};
  // ---------- Save / clear ----------
  const handleSave = async () => {
    if (!selectedDate) return;

    setSaving(true);
    setError("");

    try {
      const { error: deleteError } = await supabase
        .from("job_planning_entries")
        .delete()
        .eq("date", selectedDate);

      if (deleteError) throw deleteError;

      let insertedRows = [];

      if (editItems.length > 0) {
      const payload = editItems.map((item, index) => ({
  date: selectedDate,
  job_number: String(item.job_number || "").trim(),
  suburb: String(item.suburb || "").trim(),
  notes: String(item.notes || "").trim(),
  colour: String(item.colour || "").trim(),
  sort_order: index,
  created_by: user?.id || null,
  updated_by: user?.id || null,
  updated_at: new Date().toISOString(),
}));

        const { data, error } = await supabase
          .from("job_planning_entries")
          .insert(payload)
          .select()
          .order("sort_order", { ascending: true });

        if (error) throw error;
        insertedRows = data || [];
      }

      setPlansByDate((prev) => {
        const next = { ...prev };
        if (insertedRows.length > 0) {
          next[selectedDate] = insertedRows;
        } else {
          delete next[selectedDate];
        }
        return next;
      });
    } catch (err) {
      console.error("Error saving day plan:", err);
      const msg = err?.message || err?.details || err?.hint || "Unknown Supabase error";
      setError(`Could not save this day plan. (${msg})`);
    } finally {
      setSaving(false);
    }
  };

  const handleClearDay = async () => {
    if (!selectedDate) return;

    setSaving(true);
    setError("");

    try {
      const { error } = await supabase
        .from("job_planning_entries")
        .delete()
        .eq("date", selectedDate);

      if (error) throw error;

      setPlansByDate((prev) => {
        const next = { ...prev };
        delete next[selectedDate];
        return next;
      });

      setEditItems([]);
      setJobQuery("");
      setJobSuggestions([]);
    } catch (err) {
      console.error("Error clearing day plan:", err);
      const msg = err?.message || err?.details || err?.hint || "Unknown Supabase error";
      setError(`Could not clear this day plan. (${msg})`);
    } finally {
      setSaving(false);
    }
  };

  const buildTooltip = (dateISO, items) => {
    const lines = [longDateLabel(dateISO)];

    if (!items?.length) {
      lines.push("No jobs planned");
      return lines.join("\n");
    }

    items.forEach((item, index) => {
      lines.push(
        `${index + 1}. ${item.job_number}` +
          (item.suburb ? ` – ${item.suburb}` : "") +
          (item.notes ? ` – ${item.notes}` : "")
      );
    });

    return lines.join("\n");
  };

  return (
    <PageLayout
      icon="📅"
      title="Job Planning"
      subtitle="Monthly Job Planning – admin only"
    >
      <div className="card schedule-card">
        <div className="schedule-header">
          <div className="schedule-week-label">
            Month of&nbsp;<strong>{monthLabel}</strong>
            {loading && <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem" }}>Loading…</span>}
          </div>

          <div className="schedule-week-buttons">
            <button type="button" className="btn-pill" onClick={handlePrevMonth}>
              ◀ Previous month
            </button>

            <button type="button" className="btn-pill" onClick={handleThisMonth}>
              This month
            </button>

            <button type="button" className="btn-pill" onClick={handleNextMonth}>
              Next month ▶
            </button>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.25rem",
                fontSize: "0.75rem",
              }}
            >
              <span>Select month:</span>
              <input
                type="month"
                className="schedule-week-date-input"
                value={monthValue}
                onChange={handleMonthChange}
              />
            </div>

            <button type="button" className="btn-pill" onClick={() => window.print()}>
              Print PDF
            </button>
          </div>
        </div>

        {error && (
          <div
            style={{
              marginBottom: "0.5rem",
              fontSize: "0.8rem",
              color: "#b71c1c",
              whiteSpace: "pre-wrap",
            }}
          >
            {error}
          </div>
        )}

        <div className="schedule-grid-scroll-top" ref={topScrollRef}>
  <div className="schedule-grid-scroll-inner" />
</div>

<div
  className="schedule-grid-wrapper"
  ref={bottomScrollRef}
  style={{ WebkitOverflowScrolling: "touch" }}
>
  <table className="job-planning-grid">
            <thead>
              <tr>
                {DAY_HEADERS.map((day) => (
                  <th key={day} className="job-planning-col-day">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {calendarRows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`}>
                  {row.map((day) => {
                    const iso = formatISO(day);
                    const items = plansByDate[iso] || [];
                    const isToday = iso === todayISO;
                    const isSelected = selectedDate === iso;
                    const inCurrentMonth = day.getMonth() === currentMonth.getMonth();

                    return (
                      <td
                        key={iso}
                        className={
                          "job-planning-day-cell" +
                          (isToday ? " job-planning-today-cell" : "") +
                          (isSelected ? " job-planning-selected-cell" : "") +
                          (!inCurrentMonth ? " job-planning-outside-month" : "")
                        }
                        onClick={() => onDayClick(iso)}
                        title={buildTooltip(iso, items)}
                      >
                        <div className="job-planning-day-cell-inner">
                          <div className="job-planning-day-header">
                            <div className="job-planning-day-date-wrap">
                              <div className="job-planning-day-number">{day.getDate()}</div>
                              {!inCurrentMonth && (
                                <div className="job-planning-day-mini-month">
                                  {day.toLocaleDateString("en-AU", { month: "short" })}
                                </div>
                              )}
                            </div>

                            {items.length > 0 && (
  <div className="job-planning-day-count">
    {items.length} job{items.length === 1 ? "" : "s"}
  </div>
)}
                          </div>

                          <div className="job-planning-day-jobs">
                            {items.length === 0 ? (
                              <div className="job-planning-empty-note">No jobs planned</div>
                            ) : (
                              items.map((item, index) => (
                              <div
  key={item.id || `${iso}-${item.job_number}-${index}`}
  className={
    "job-planning-day-job" +
    (item.colour ? ` job-planning-day-job--${item.colour}` : "")
  }
>
                                  <div className="job-planning-day-job-top">
                                    <span className="job-planning-day-job-number">
                                      {item.job_number}
                                    </span>
                                    {item.suburb && (
                                      <span className="job-planning-day-job-suburb">
                                        {item.suburb}
                                      </span>
                                    )}
                                  </div>

                                  {item.notes && (
                                    <div className="job-planning-day-job-notes">{item.notes}</div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="schedule-footer-note">
          Logged in as <strong>{user?.email}</strong>. You have admin editing rights.
        </p>
      </div>

      {selectedDate && (
        <div className="card schedule-editor-card">
          <h3 className="card-title">Edit day plan</h3>
          <p className="card-subtitle">{longDateLabel(selectedDate)}</p>

          <div className="schedule-editor-grid">
            <div className="schedule-editor-row">
              <label className="schedule-editor-label">Job ref</label>

              <div style={{ position: "relative" }}>
                <input
                  className="maps-search-input"
                  type="text"
                  value={jobQuery}
                  onChange={(e) => setJobQuery(e.target.value)}
                  onKeyDown={handleJobKeyDown}
                  placeholder="Type job number (exact)…"
                />

                {(jobLoading || jobSuggestions.length > 0) && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: "100%",
                      marginTop: "4px",
                      background: "#fff",
                      border: "1px solid #ddd",
                      borderRadius: "8px",
                      zIndex: 50,
                      maxHeight: "220px",
                      overflowY: "auto",
                    }}
                  >
                    {jobLoading && (
                      <div style={{ padding: "8px", fontSize: "0.8rem", opacity: 0.7 }}>
                        Searching…
                      </div>
                    )}

                    {!jobLoading &&
                      jobSuggestions.map((job) => (
                        <button
                          key={job.job_number}
                          type="button"
                          onClick={() => void addPlannedJob(job)}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            padding: "8px",
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>{job.job_number}</div>
                          {job.full_address && (
                            <div style={{ fontSize: "0.75rem", opacity: 0.75 }}>
                              {job.full_address}
                            </div>
                          )}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="job-planning-editor-summary">
            {editItems.length} planned job{editItems.length === 1 ? "" : "s"} for this day
          </div>

          {editItems.length === 0 ? (
            <div className="job-planning-empty-editor">
              No jobs added for this day yet.
            </div>
          ) : (
            <div className="job-planning-edit-list">
              <p style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "#777" }}>
  Drag jobs up or down to set the order for this day.
</p>
              {editItems.map((item) => (
                <div
  key={item.client_key}
  className={
    "job-planning-edit-item" +
    (item.colour ? ` job-planning-edit-item--${item.colour}` : "") +
    (highlightedJobKey === item.client_key ? " job-planning-new-highlight" : "") +
    (draggedJobKey === item.client_key ? " job-planning-dragging" : "") +
    (dragOverJobKey === item.client_key ? " job-planning-drag-over" : "")
  }
  draggable
  onDragStart={() => handleDragStart(item.client_key)}
  onDragEnter={(e) => {
    e.preventDefault();
    handleDragEnter(item.client_key);
  }}
  onDragOver={(e) => {
    e.preventDefault();
  }}
  onDrop={(e) => {
    e.preventDefault();
    handleDropOnItem(item.client_key);
  }}
  onDragEnd={handleDragEnd}
>
                 <div className="job-planning-edit-item-header">
  <div className="job-planning-edit-item-header-left">
    <div>
      <div className="job-planning-edit-item-title">
        Job {item.job_number}
      </div>
      <div className="job-planning-drag-hint">Drag to reorder</div>
    </div>

    <div className="job-planning-job-actions">
      <button
        type="button"
        className="btn-pill"
        onClick={() => cycleJobColour(item.client_key)}
      >
        Set Colour
      </button>

      <button
        type="button"
        className="btn-pill"
        onClick={() => removeEditItem(item.client_key)}
      >
        Remove
      </button>
    </div>
  </div>
</div>

                  <div className="schedule-editor-grid">
                    <div className="schedule-editor-row">
                      <label className="schedule-editor-label">Suburb</label>
                      <input
                        className="maps-search-input"
                        type="text"
                        value={item.suburb || ""}
                        onChange={(e) =>
                          updateEditItem(item.client_key, "suburb", e.target.value)
                        }
                        placeholder="Auto-filled from job address"
                      />
                    </div>

                    <div className="schedule-editor-row">
                      <label className="schedule-editor-label">Notes</label>
                      <textarea
                        className="maps-search-input"
                        style={{ minHeight: "70px" }}
                        value={item.notes || ""}
                        onChange={(e) =>
                          updateEditItem(item.client_key, "notes", e.target.value)
                        }
                        placeholder="Notes for this planned job"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn-pill primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>

            <button
              type="button"
              className="btn-pill"
              onClick={handleClearDay}
              disabled={saving}
            >
              Clear day
            </button>

            <button
              type="button"
              className="btn-pill"
              onClick={() => setSelectedDate(null)}
              disabled={saving}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </PageLayout>
  );
}

export default JobPlanning;