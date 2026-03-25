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
  const [calendarDraggedKey, setCalendarDraggedKey] = useState(null);

  const UNSCHEDULED_KEY = "__UNSCHEDULED__";

const [selectedDate, setSelectedDate] = useState(null);
const [editItems, setEditItems] = useState([]);
const [unscheduledItems, setUnscheduledItems] = useState([]);
const [highlightedJobKey, setHighlightedJobKey] = useState(null);
const [draggedJobKey, setDraggedJobKey] = useState(null);
const [dragOverJobKey, setDragOverJobKey] = useState(null);
 const topScrollRef = useRef(null);
const bottomScrollRef = useRef(null);
const editorLoadedRef = useRef(false);
const autosaveTimerRef = useRef(null);

const [jobQuery, setJobQuery] = useState("");
const [jobSuggestions, setJobSuggestions] = useState([]);
const [jobLoading, setJobLoading] = useState(false);
const [modalTarget, setModalTarget] = useState(null);
const [editorModalOpen, setEditorModalOpen] = useState(false);
const [newJobColour, setNewJobColour] = useState("");
const [selectedJobSuggestion, setSelectedJobSuggestion] = useState(null);

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

      const [
        scheduledResult,
        unscheduledResult,
      ] = await Promise.all([
        supabase
          .from("job_planning_entries")
          .select("*")
          .gte("date", from)
          .lte("date", to)
          .order("date", { ascending: true })
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),

        supabase
          .from("job_planning_unscheduled")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);

      if (scheduledResult.error) throw scheduledResult.error;
      if (unscheduledResult.error) throw unscheduledResult.error;
      if (cancelled) return;

      const grouped = {};

      for (const row of scheduledResult.data || []) {
        if (!grouped[row.date]) grouped[row.date] = [];
        grouped[row.date].push(row);
      }

      setPlansByDate(grouped);
      setUnscheduledItems(unscheduledResult.data || []);
    } catch (err) {
      console.error("Error loading job planning entries:", err);
      if (!cancelled) {
        const msg = err?.message || err?.details || err?.hint || "Unknown Supabase error";
        setError(`Could not load job planning calendar. (${msg})`);
        setPlansByDate({});
        setUnscheduledItems([]);
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

  const sourceItems =
    selectedDate === UNSCHEDULED_KEY
      ? unscheduledItems
      : (plansByDate[selectedDate] || []);

  const hydrated = sourceItems.map((item, index) => ({
    ...item,
    client_key: item.id || `${item.job_number}-${selectedDate}-${index}`,
  }));
editorLoadedRef.current = false;
  setEditItems(hydrated);
  setJobQuery("");
  setJobSuggestions([]);
  setHighlightedJobKey(null);
  setDraggedJobKey(null);
  setDragOverJobKey(null);
}, [selectedDate, plansByDate, unscheduledItems]);

useEffect(() => {
  if (!editorModalOpen || !selectedDate) return;

  if (!editorLoadedRef.current) {
    editorLoadedRef.current = true;
    return;
  }

  if (autosaveTimerRef.current) {
    clearTimeout(autosaveTimerRef.current);
  }

  autosaveTimerRef.current = setTimeout(async () => {
    try {
      setError("");

      if (selectedDate === UNSCHEDULED_KEY) {
        const { error: deleteError } = await supabase
          .from("job_planning_unscheduled")
          .delete()
          .gt("id", 0);

        if (deleteError) throw deleteError;

        if (editItems.length > 0) {
          const payload = editItems.map((item, index) => ({
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
            .from("job_planning_unscheduled")
            .insert(payload)
            .select()
            .order("sort_order", { ascending: true });

          if (error) throw error;

          const rows = data || [];
          setUnscheduledItems(rows);
          setEditItems(
            rows.map((item, index) => ({
              ...item,
              client_key: item.id || `${item.job_number}-${UNSCHEDULED_KEY}-${index}`,
            }))
          );
        } else {
          setUnscheduledItems([]);
        }
      } else {
        const { error: deleteError } = await supabase
          .from("job_planning_entries")
          .delete()
          .eq("date", selectedDate);

        if (deleteError) throw deleteError;

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

          const rows = data || [];
          setPlansByDate((prev) => ({
            ...prev,
            [selectedDate]: rows,
          }));

          setEditItems(
            rows.map((item, index) => ({
              ...item,
              client_key: item.id || `${item.job_number}-${selectedDate}-${index}`,
            }))
          );
        } else {
          setPlansByDate((prev) => {
            const next = { ...prev };
            delete next[selectedDate];
            return next;
          });
        }
      }
    } catch (err) {
      console.error("Autosave failed:", err);
      const msg = err?.message || err?.details || err?.hint || "Unknown Supabase error";
      setError(`Could not autosave changes. (${msg})`);
    }
  }, 500);

  return () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
  };
}, [editItems, editorModalOpen, selectedDate, user?.id]);

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

 const openEditorModalForDay = (dateISO) => {
  setSelectedDate(dateISO);
  setEditorModalOpen(true);
};

const openEditorModalForUnscheduled = () => {
  setSelectedDate(UNSCHEDULED_KEY);
  setEditorModalOpen(true);
};

const closeEditorModal = () => {
  setEditorModalOpen(false);
  setSelectedDate(null);
};

const openAddModal = (targetKey) => {
  setModalTarget(targetKey);
  setJobQuery("");
  setJobSuggestions([]);
  setNewJobColour("");
  setSelectedJobSuggestion(null);
};

const closeAddModal = () => {
  setModalTarget(null);
  setJobQuery("");
  setJobSuggestions([]);
  setNewJobColour("");
  setSelectedJobSuggestion(null);
};

const cancelAutosave = () => {
  if (autosaveTimerRef.current) {
    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = null;
  }
  editorLoadedRef.current = false;
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
  const targetKey = modalTarget ?? selectedDate;

  if (!targetKey) return;
cancelAutosave();
  const targetItems =
    targetKey === UNSCHEDULED_KEY
      ? unscheduledItems
      : (plansByDate[targetKey] || []);

  if (targetItems.some((item) => String(item.job_number) === jobNumber)) {
   setJobQuery("");
setJobSuggestions([]);
setSelectedJobSuggestion(null);
closeAddModal();
    return;
  }

  try {
    setSaving(true);
    setError("");

    const suburb = await resolveSuburbForJob(job);

    if (targetKey === UNSCHEDULED_KEY) {
      const payload = {
        job_number: jobNumber,
        suburb,
        notes: "",
        colour: newJobColour,
        sort_order: targetItems.length,
        created_by: user?.id || null,
        updated_by: user?.id || null,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("job_planning_unscheduled")
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      const nextUnscheduled = [data, ...unscheduledItems].map((item, index) => ({
        ...item,
        sort_order: index,
      }));

      setUnscheduledItems(nextUnscheduled);

      if (selectedDate === UNSCHEDULED_KEY) {
        setEditItems(
          nextUnscheduled.map((item, index) => ({
            ...item,
            client_key: item.id || `${item.job_number}-${UNSCHEDULED_KEY}-${index}`,
          }))
        );
      }

      setHighlightedJobKey(data.id || `new-${jobNumber}-${Date.now()}`);
    } else {
      const payload = {
        date: targetKey,
        job_number: jobNumber,
        suburb,
        notes: "",
        colour: newJobColour,
        sort_order: targetItems.length,
        created_by: user?.id || null,
        updated_by: user?.id || null,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("job_planning_entries")
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      const nextDayItems = [data, ...(plansByDate[targetKey] || [])].map((item, index) => ({
        ...item,
        sort_order: index,
      }));

      setPlansByDate((prev) => ({
        ...prev,
        [targetKey]: nextDayItems,
      }));

      if (selectedDate === targetKey) {
        setEditItems(
          nextDayItems.map((item, index) => ({
            ...item,
            client_key: item.id || `${item.job_number}-${targetKey}-${index}`,
          }))
        );
      }

      setHighlightedJobKey(data.id || `new-${jobNumber}-${Date.now()}`);
    }

    setTimeout(() => {
      setHighlightedJobKey(null);
    }, 1500);

    setJobQuery("");
    setJobSuggestions([]);
    closeAddModal();
  } catch (err) {
    console.error("Error adding planned job:", err);
    const msg = err?.message || err?.details || err?.hint || "Unknown Supabase error";
    setError(`Could not add this job. (${msg})`);
  } finally {
    setSaving(false);
  }
};

 const handleJobKeyDown = (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    if (jobSuggestions.length > 0) {
      const picked = jobSuggestions[0];
      setSelectedJobSuggestion(picked);
      setJobQuery(String(picked.job_number));
      setJobSuggestions([]);
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

const removeEditItem = async (item) => {
  cancelAutosave();

  try {
    setSaving(true);
    setError("");

    if (selectedDate === UNSCHEDULED_KEY) {
      if (item.id != null) {
        const { error: deleteError } = await supabase
          .from("job_planning_unscheduled")
          .delete()
          .eq("id", item.id);

        if (deleteError) throw deleteError;
      }

      const nextUnscheduled = unscheduledItems
        .filter((x) => {
          if (item.id != null && x.id != null) return x.id !== item.id;
          return x.client_key !== item.client_key && String(x.job_number) !== String(item.job_number);
        })
        .map((x, index) => ({
          ...x,
          sort_order: index,
        }));

      setUnscheduledItems(nextUnscheduled);
      setEditItems(
        nextUnscheduled.map((x, index) => ({
          ...x,
          client_key: x.id || `${x.job_number}-${UNSCHEDULED_KEY}-${index}`,
        }))
      );
    } else {
      if (item.id != null) {
        const { error: deleteError } = await supabase
          .from("job_planning_entries")
          .delete()
          .eq("id", item.id);

        if (deleteError) throw deleteError;
      }

      const nextDayItems = (plansByDate[selectedDate] || [])
        .filter((x) => {
          if (item.id != null && x.id != null) return x.id !== item.id;
          return x.client_key !== item.client_key && String(x.job_number) !== String(item.job_number);
        })
        .map((x, index) => ({
          ...x,
          sort_order: index,
        }));

      setPlansByDate((prev) => {
        const next = { ...prev };
        if (nextDayItems.length > 0) {
          next[selectedDate] = nextDayItems;
        } else {
          delete next[selectedDate];
        }
        return next;
      });

      setEditItems(
        nextDayItems.map((x, index) => ({
          ...x,
          client_key: x.id || `${x.job_number}-${selectedDate}-${index}`,
        }))
      );
    }
  } catch (err) {
    console.error("Error removing planned item:", err);
    const msg = err?.message || err?.details || err?.hint || "Unknown Supabase error";
    setError(`Could not remove job. (${msg})`);
  } finally {
    setSaving(false);
  }
};

const moveItemToUnscheduled = async (item) => {
  cancelAutosave();

  try {
    if (!selectedDate || selectedDate === UNSCHEDULED_KEY) return;

    setSaving(true);
    setError("");

    if (item.id != null) {
      const { error: deleteError } = await supabase
        .from("job_planning_entries")
        .delete()
        .eq("id", item.id);

      if (deleteError) throw deleteError;
    }

    const insertPayload = {
      job_number: String(item.job_number || "").trim(),
      suburb: String(item.suburb || "").trim(),
      notes: String(item.notes || "").trim(),
      colour: String(item.colour || "").trim(),
      sort_order: 0,
      created_by: user?.id || null,
      updated_by: user?.id || null,
      updated_at: new Date().toISOString(),
    };

    const { data: insertedRow, error: insertError } = await supabase
      .from("job_planning_unscheduled")
      .insert(insertPayload)
      .select()
      .single();

    if (insertError) throw insertError;

    const nextDayItems = (plansByDate[selectedDate] || [])
      .filter((x) => {
        if (item.id != null && x.id != null) return x.id !== item.id;
        return (
          x.client_key !== item.client_key &&
          String(x.job_number) !== String(item.job_number)
        );
      })
      .map((x, index) => ({
        ...x,
        sort_order: index,
      }));

    setPlansByDate((prev) => {
      const next = { ...prev };
      if (nextDayItems.length > 0) {
        next[selectedDate] = nextDayItems;
      } else {
        delete next[selectedDate];
      }
      return next;
    });

    setEditItems(
      nextDayItems.map((x, index) => ({
        ...x,
        client_key: x.id || `${x.job_number}-${selectedDate}-${index}`,
      }))
    );

    const nextUnscheduled = [
      insertedRow,
      ...unscheduledItems.filter((x) => {
        if (item.id != null && x.id != null) return x.id !== item.id;
        return (
          x.client_key !== item.client_key &&
          String(x.job_number) !== String(item.job_number)
        );
      }),
    ].map((x, index) => ({
      ...x,
      sort_order: index,
    }));

    setUnscheduledItems(nextUnscheduled);
  } catch (err) {
    console.error("Error moving item to unscheduled:", err);
    const msg = err?.message || err?.details || err?.hint || "Unknown Supabase error";
    setError(`Could not move job to unscheduled. (${msg})`);
  } finally {
    setSaving(false);
  }
};

const moveItemToSelectedDay = async (item, targetDateISO) => {
  cancelAutosave();

  try {
    if (!targetDateISO || selectedDate !== UNSCHEDULED_KEY) return;

    setSaving(true);
    setError("");

    // 1. Remove from unscheduled table
    if (item.id != null) {
      const { error: deleteError } = await supabase
        .from("job_planning_unscheduled")
        .delete()
        .eq("id", item.id);

      if (deleteError) throw deleteError;
    }

    // 2. Insert into scheduled table
    const insertPayload = {
      date: targetDateISO,
      job_number: String(item.job_number || "").trim(),
      suburb: String(item.suburb || "").trim(),
      notes: String(item.notes || "").trim(),
      colour: String(item.colour || "").trim(),
      sort_order: 0,
      created_by: user?.id || null,
      updated_by: user?.id || null,
      updated_at: new Date().toISOString(),
    };

    const { data: insertedRow, error: insertError } = await supabase
      .from("job_planning_entries")
      .insert(insertPayload)
      .select()
      .single();

    if (insertError) throw insertError;

    // 3. Rebuild UNSCHEDULED list (remove moved item)
    const nextUnscheduled = unscheduledItems
      .filter((x) => {
        if (item.id != null && x.id != null) return x.id !== item.id;
        return (
          x.client_key !== item.client_key &&
          String(x.job_number) !== String(item.job_number)
        );
      })
      .map((x, index) => ({
        ...x,
        sort_order: index,
      }));

    setUnscheduledItems(nextUnscheduled);

    // update editor (because we are in UNSCHEDULED modal)
    setEditItems(
      nextUnscheduled.map((x, index) => ({
        ...x,
        client_key: x.id || `${x.job_number}-${UNSCHEDULED_KEY}-${index}`,
      }))
    );

    // 4. Add to target day (top of list)
    const nextTargetItems = [
      insertedRow,
      ...(plansByDate[targetDateISO] || []).filter((x) => {
        if (insertedRow.id != null && x.id != null) return x.id !== insertedRow.id;
        return String(x.job_number) !== String(item.job_number);
      }),
    ].map((x, index) => ({
      ...x,
      sort_order: index,
    }));

    setPlansByDate((prev) => ({
      ...prev,
      [targetDateISO]: nextTargetItems,
    }));

  } catch (err) {
    console.error("Error moving item to selected day:", err);
    const msg = err?.message || err?.details || err?.hint || "Unknown Supabase error";
    setError(`Could not move job to day. (${msg})`);
  } finally {
    setSaving(false);
  }
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

const makeCalendarDragKey = (bucketKey, item, index) =>
  `${bucketKey}::${item.id ?? item.client_key ?? item.job_number ?? index}`;

const persistCalendarOrder = async (bucketKey, rows) => {
  cancelAutosave();
  try {
    setError("");

    if (bucketKey === UNSCHEDULED_KEY) {
      const { error: deleteError } = await supabase
        .from("job_planning_unscheduled")
        .delete()
        .gt("id", 0);

      if (deleteError) throw deleteError;

      if (rows.length > 0) {
        const payload = rows.map((item, index) => ({
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
          .from("job_planning_unscheduled")
          .insert(payload)
          .select()
          .order("sort_order", { ascending: true });

        if (error) throw error;

        const savedRows = data || [];
        setUnscheduledItems(savedRows);

        if (selectedDate === UNSCHEDULED_KEY) {
          setEditItems(
            savedRows.map((item, index) => ({
              ...item,
              client_key: item.id || `${item.job_number}-${UNSCHEDULED_KEY}-${index}`,
            }))
          );
        }
      } else {
        setUnscheduledItems([]);
      }
    } else {
      const { error: deleteError } = await supabase
        .from("job_planning_entries")
        .delete()
        .eq("date", bucketKey);

      if (deleteError) throw deleteError;

      if (rows.length > 0) {
        const payload = rows.map((item, index) => ({
          date: bucketKey,
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

        const savedRows = data || [];

        setPlansByDate((prev) => ({
          ...prev,
          [bucketKey]: savedRows,
        }));

        if (selectedDate === bucketKey) {
          setEditItems(
            savedRows.map((item, index) => ({
              ...item,
              client_key: item.id || `${item.job_number}-${bucketKey}-${index}`,
            }))
          );
        }
      } else {
        setPlansByDate((prev) => {
          const next = { ...prev };
          delete next[bucketKey];
          return next;
        });
      }
    }
  } catch (err) {
    console.error("Could not persist calendar reorder:", err);
    const msg = err?.message || err?.details || err?.hint || "Unknown Supabase error";
    setError(`Could not save reordered jobs. (${msg})`);
  }
};

const reorderCalendarItems = (bucketKey, fromKey, toKey) => {
  const source =
    bucketKey === UNSCHEDULED_KEY
      ? [...unscheduledItems]
      : [...(plansByDate[bucketKey] || [])];

  const keyed = source.map((item, index) => ({
    ...item,
    __dragKey: makeCalendarDragKey(bucketKey, item, index),
  }));

  const fromIndex = keyed.findIndex((item) => item.__dragKey === fromKey);
  const toIndex = keyed.findIndex((item) => item.__dragKey === toKey);

  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

  const next = [...keyed];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);

  const cleaned = next.map(({ __dragKey, ...item }, index) => ({
    ...item,
    sort_order: index,
  }));

  if (bucketKey === UNSCHEDULED_KEY) {
    setUnscheduledItems(cleaned);

    if (selectedDate === UNSCHEDULED_KEY) {
      setEditItems(
        cleaned.map((item, index) => ({
          ...item,
          client_key: item.id || `${item.job_number}-${UNSCHEDULED_KEY}-${index}`,
        }))
      );
    }
  } else {
    setPlansByDate((prev) => ({
      ...prev,
      [bucketKey]: cleaned,
    }));

    if (selectedDate === bucketKey) {
      setEditItems(
        cleaned.map((item, index) => ({
          ...item,
          client_key: item.id || `${item.job_number}-${bucketKey}-${index}`,
        }))
      );
    }
  }

  void persistCalendarOrder(bucketKey, cleaned);
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

 if (autosaveTimerRef.current) {
    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = null;
  }
  editorLoadedRef.current = false;

  try {
    if (selectedDate === UNSCHEDULED_KEY) {
      const { error: deleteError } = await supabase
        .from("job_planning_unscheduled")
        .delete()
        .gt("id", 0);

      if (deleteError) throw deleteError;

      let insertedRows = [];

      if (editItems.length > 0) {
        const payload = editItems.map((item, index) => ({
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
          .from("job_planning_unscheduled")
          .insert(payload)
          .select()
          .order("sort_order", { ascending: true });

        if (error) throw error;
        insertedRows = data || [];
      }

      setUnscheduledItems(insertedRows);
    } else {
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
    }
  } catch (err) {
    console.error("Error saving plan:", err);
    const msg = err?.message || err?.details || err?.hint || "Unknown Supabase error";
    setError(`Could not save this plan. (${msg})`);
} finally {
  setSaving(false);
  setEditorModalOpen(false);
  setSelectedDate(null);
}
};

const handleClearDay = async () => {
  if (!selectedDate) return;

  setSaving(true);
  setError("");

  if (autosaveTimerRef.current) {
  clearTimeout(autosaveTimerRef.current);
  autosaveTimerRef.current = null;
}
editorLoadedRef.current = false;

  try {
    if (selectedDate === UNSCHEDULED_KEY) {
      const { error } = await supabase
        .from("job_planning_unscheduled")
        .delete()
        .gt("id", 0);

      if (error) throw error;

      setUnscheduledItems([]);
    } else {
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
    }

    setEditItems([]);
    setJobQuery("");
    setJobSuggestions([]);
  } catch (err) {
    console.error("Error clearing plan:", err);
    const msg = err?.message || err?.details || err?.hint || "Unknown Supabase error";
    setError(`Could not clear this plan. (${msg})`);
} finally {
  setSaving(false);
  setEditorModalOpen(false);
  setSelectedDate(null);
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

  return (
    <PageLayout
      icon="📅"
      title="Job Planning"
      subtitle="Schedule Jobs – Admin Only"
    >
      <div className="card schedule-card">
        <div className="schedule-header">
          <div className="schedule-week-label">
            Month of&nbsp;<strong>{monthLabel}</strong>
            {loading && <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem" }}>Loading…</span>}
          </div>

          <div className="schedule-week-buttons">
            <button type="button" className="btn-pill job-planning-month-btn" onClick={handlePrevMonth}>
  <span className="job-planning-month-btn-desktop">◀ Previous Month</span>
  <span className="job-planning-month-btn-mobile">◀ Prev. Month</span>
</button>

            <button type="button" className="btn-pill" onClick={handleThisMonth}>
              This Month
            </button>

            <button type="button" className="btn-pill job-planning-month-btn" onClick={handleNextMonth}>
  <span className="job-planning-month-btn-desktop">Next Month ▶</span>
  <span className="job-planning-month-btn-mobile">Next Month ▶</span>
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

<div className="job-planning-main-layout">
  <div
    className={
      "job-planning-unscheduled-panel" +
      (selectedDate === UNSCHEDULED_KEY ? " job-planning-selected-cell" : "")
    }
  >
    <button
  type="button"
  className="job-planning-add-btn"
  onClick={(e) => {
    e.stopPropagation();
    openAddModal(UNSCHEDULED_KEY);
  }}
  title="Add unscheduled job"
>
  +
</button>
    <div className="job-planning-day-cell-inner">
      <div className="job-planning-day-header">
        <div className="job-planning-day-date-wrap">
          <div className="job-planning-unscheduled-title">Unscheduled Jobs</div>
        </div>

        {unscheduledItems.length > 0 && (
          <div className="job-planning-day-count">
            {unscheduledItems.length} job{unscheduledItems.length === 1 ? "" : "s"}
          </div>
        )}
      </div>

      <div className="job-planning-day-jobs job-planning-unscheduled-scroll">
        {unscheduledItems.length === 0 ? (
          <div className="job-planning-empty-note">No unscheduled jobs</div>
        ) : (
          unscheduledItems.map((item, index) => (
<div
  key={item.id || `unscheduled-${item.job_number}-${index}`}
  className={
    "job-planning-day-job" +
    (item.colour ? ` job-planning-day-job--${item.colour}` : "")
  }
  onClick={(e) => {
  e.stopPropagation();
  openEditorModalForUnscheduled();
}}
  draggable
  onDragStart={(e) => {
    e.stopPropagation();
    setCalendarDraggedKey(makeCalendarDragKey(UNSCHEDULED_KEY, item, index));
  }}
  onDragOver={(e) => {
    e.preventDefault();
    e.stopPropagation();
  }}
  onDrop={(e) => {
    e.preventDefault();
    e.stopPropagation();
    const targetKey = makeCalendarDragKey(UNSCHEDULED_KEY, item, index);
    reorderCalendarItems(UNSCHEDULED_KEY, calendarDraggedKey, targetKey);
    setCalendarDraggedKey(null);
  }}
  onDragEnd={() => setCalendarDraggedKey(null)}
>
              <div className="job-planning-day-job-top">
                <span className="job-planning-day-job-number">{item.job_number}</span>
                {item.suburb && (
                  <span className="job-planning-day-job-suburb">{item.suburb}</span>
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
  </div>

  <div className="job-planning-calendar-wrap">
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
                    title={buildTooltip(iso, items)}
                  >
                    <button
  type="button"
  className="job-planning-add-btn"
  onClick={(e) => {
    e.stopPropagation();
    openAddModal(iso);
  }}
  title="Add job to this day"
>
  +
</button>
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
  onClick={(e) => {
  e.stopPropagation();
  openEditorModalForDay(iso);
}}
  draggable
  onDragStart={(e) => {
    e.stopPropagation();
    setCalendarDraggedKey(makeCalendarDragKey(iso, item, index));
  }}
  onDragOver={(e) => {
    e.preventDefault();
    e.stopPropagation();
  }}
  onDrop={(e) => {
    e.preventDefault();
    e.stopPropagation();
    const targetKey = makeCalendarDragKey(iso, item, index);
    reorderCalendarItems(iso, calendarDraggedKey, targetKey);
    setCalendarDraggedKey(null);
  }}
  onDragEnd={() => setCalendarDraggedKey(null)}
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
  </div>
</div>

        <p className="schedule-footer-note">
          Logged in as <strong>{user?.email}</strong>. You have admin editing rights.
        </p>
      </div>

      {editorModalOpen && selectedDate && (
  <div
    className="job-planning-modal-overlay"
    onClick={closeEditorModal}
  >
    <div
      className="job-planning-modal-card job-planning-editor-modal-card"
      onClick={(e) => e.stopPropagation()}
    >
         <h3 className="card-title">
  {selectedDate === UNSCHEDULED_KEY ? "Edit unscheduled jobs" : "Edit day plan"}
</h3>
<p className="card-subtitle">
  {selectedDate === UNSCHEDULED_KEY ? "Jobs waiting to be scheduled" : longDateLabel(selectedDate)}
</p>


          <div className="job-planning-editor-summary">
  {editItems.length} {selectedDate === UNSCHEDULED_KEY ? "unscheduled" : "planned"} job
  {editItems.length === 1 ? "" : "s"}
  {selectedDate === UNSCHEDULED_KEY ? "" : " for this day"}
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
  onDragStart={(e) => {
    const interactive = e.target.closest("button, select, input, textarea, option");
    if (interactive) {
      e.preventDefault();
      return;
    }
    handleDragStart(item.client_key);
  }}
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

<div
  className="job-planning-job-actions"
  onMouseDown={(e) => e.stopPropagation()}
  onDragStart={(e) => e.stopPropagation()}
>
  <select
    className="maps-search-input"
    style={{ minWidth: "130px", maxWidth: "140px" }}
    value={item.colour || ""}
    draggable={false}
    onMouseDown={(e) => e.stopPropagation()}
    onChange={(e) => updateEditItem(item.client_key, "colour", e.target.value)}
  >
    {JOB_COLOURS.map((colour) => (
      <option key={colour.value} value={colour.value}>
        {colour.label}
      </option>
    ))}
  </select>

  {selectedDate !== UNSCHEDULED_KEY && (
    <button
      type="button"
      className="btn-pill"
      draggable={false}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void moveItemToUnscheduled(item);
      }}
    >
      Move to Unscheduled
    </button>
  )}

  {selectedDate === UNSCHEDULED_KEY && (
    <button
      type="button"
      className="btn-pill"
      draggable={false}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void moveItemToSelectedDay(item, todayISO);
      }}
    >
      Move to Today
    </button>
  )}

  <button
    type="button"
    className="btn-pill"
    draggable={false}
    onMouseDown={(e) => {
      e.preventDefault();
      e.stopPropagation();
    }}
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      void removeEditItem(item);
    }}
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
  onClick={closeEditorModal}
  disabled={saving}
>
  Close
</button>
          </div>
     </div>   
</div>   
)}
   {modalTarget && (
  <div
    className="job-planning-modal-overlay"
    onClick={closeAddModal}
  >
    <div
      className="job-planning-modal-card"
      onClick={(e) => e.stopPropagation()}
    >
      <h3 className="card-title" style={{ marginBottom: "0.35rem" }}>
        Add job
      </h3>

      <p className="card-subtitle" style={{ marginBottom: "0.75rem" }}>
        {modalTarget === UNSCHEDULED_KEY
          ? "Add to Unscheduled Jobs"
          : `Add to ${longDateLabel(modalTarget)}`}
      </p>

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
            autoFocus
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
                    onClick={() => {
                      setSelectedJobSuggestion(job);
                      setJobQuery(String(job.job_number));
                      setJobSuggestions([]);
                    }}
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

        {selectedJobSuggestion && (
          <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "#555" }}>
            Selected job: <strong>{selectedJobSuggestion.job_number}</strong>
          </div>
        )}
      </div>

      <div className="schedule-editor-row" style={{ marginTop: "0.75rem" }}>
        <label className="schedule-editor-label">Colour</label>
        <select
          className="maps-search-input"
          value={newJobColour}
          onChange={(e) => setNewJobColour(e.target.value)}
        >
          {JOB_COLOURS.map((colour) => (
            <option key={colour.value} value={colour.value}>
              {colour.label}
            </option>
          ))}
        </select>
      </div>

      <div
        style={{
          marginTop: "1rem",
          display: "flex",
          justifyContent: "flex-end",
          gap: "0.5rem",
          flexWrap: "wrap",
        }}
      >
        <button type="button" className="btn-pill" onClick={closeAddModal}>
          Cancel
        </button>

        <button
          type="button"
          className="btn-pill primary"
          disabled={!selectedJobSuggestion || saving}
          onClick={() => {
            if (!selectedJobSuggestion) return;
            void addPlannedJob(selectedJobSuggestion);
          }}
        >
          {saving ? "Adding…" : "Add job"}
        </button>
      </div>
    </div>
  </div>
)}
    </PageLayout>
  );
}

export default JobPlanning;