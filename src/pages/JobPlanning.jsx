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
  { value: "", label: "White – Miscellaneous Note" },
  { value: "red", label: "Red – Job to be calculated" },
  { value: "yellow", label: "Yellow – Job ready - Date Fixed" },
  { value: "green", label: "Green – Job checked (Field Ready) - Date Fixed" },
  { value: "blue", label: "Blue – Job ready - Date Flexible" },
  { value: "purple", label: "Purple – Cadastral Job" },
];

const COLOUR_HEX = {
  red: "#e53935",
  green: "#43a047",
  yellow: "#fbc02d",
  blue: "#1e88e5",
  purple: "#8e24aa",
};

const JOB_PLANNING_LEGEND = [
  { label: "Job to be calculated", colour: "red" },
  { label: "Job ready - Date Fixed", colour: "yellow" },
  { label: "Job checked (Field Ready) - Date Fixed", colour: "green" },
  { label: "Job ready - Date Flexible", colour: "blue" },
  { label: "Cadastral Job", colour: "purple" },
  { label: "Miscellaneous Note", colour: "" },
];

const getColourHex = (colour) => {
  if (!colour) return "#333";
  return COLOUR_HEX[colour] || "#333";
};

const NOTES_JOB_OPTION = {
  job_number: "Notes",
  full_address: "",
  suburb: "Notes Only",
  isNotesOnly: true,
};

function JobPlanning() {
  const { user, isAdmin } = useAuth();
  const isAppVisible = useAppVisibilityContext();

  const [currentMonth, setCurrentMonth] = useState(() => getMonthStart(new Date()));
  const [plansByDate, setPlansByDate] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [calendarDraggedKey, setCalendarDraggedKey] = useState(null);
  const [calendarDragOverKey, setCalendarDragOverKey] = useState(null);

  const UNSCHEDULED_KEY = "__UNSCHEDULED__";

const [selectedDate, setSelectedDate] = useState(null);
const [editItems, setEditItems] = useState([]);
const [unscheduledItems, setUnscheduledItems] = useState([]);
const [highlightedJobKey, setHighlightedJobKey] = useState(null);
const [draggedJobKey, setDraggedJobKey] = useState(null);
const [dragOverJobKey, setDragOverJobKey] = useState(null);
const [moveDatePickerKey, setMoveDatePickerKey] = useState(null);
const [moveDateDrafts, setMoveDateDrafts] = useState({});
const [toast, setToast] = useState("");

const topScrollRef = useRef(null);
const bottomScrollRef = useRef(null);
const verticalScrollRef = useRef(null);
const editorLoadedRef = useRef(false);
const autosaveTimerRef = useRef(null);
const dragAutoScrollFrameRef = useRef(null);
const dragAutoScrollDirectionRef = useRef({ x: 0, y: 0 });

const [jobQuery, setJobQuery] = useState("");
const [jobSuggestions, setJobSuggestions] = useState([]);
const [jobLoading, setJobLoading] = useState(false);
const [jobActiveIdx, setJobActiveIdx] = useState(-1);
const jobSearchDebounceRef = useRef(null);

const [modalTarget, setModalTarget] = useState(null);
const [editorModalOpen, setEditorModalOpen] = useState(false);
const [newJobColour, setNewJobColour] = useState("");
const [newJobNotes, setNewJobNotes] = useState("");
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

  setEditItems(hydrated);
  setJobQuery("");
  setJobSuggestions([]);
  setJobActiveIdx(-1);
 setHighlightedJobKey(null);
setDraggedJobKey(null);
setDragOverJobKey(null);
setMoveDatePickerKey(null);
setMoveDateDrafts({});
}, [selectedDate]);

useEffect(() => {
  return () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    stopDragAutoScroll();
  };
}, []);
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
  setMoveDatePickerKey(null);
  setMoveDateDrafts({});
};

const openAddModal = (targetKey) => {
  setModalTarget(targetKey);
  setJobQuery("");
  setJobSuggestions([]);
  setJobActiveIdx(-1);
  setNewJobColour("");
  setNewJobNotes("");
  setSelectedJobSuggestion(null);
};

const closeAddModal = () => {
  setModalTarget(null);
  setJobQuery("");
  setJobSuggestions([]);
  setJobActiveIdx(-1);
  setNewJobColour("");
  setNewJobNotes("");
  setSelectedJobSuggestion(null);
};

const cancelAutosave = () => {
  if (autosaveTimerRef.current) {
    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = null;
  }
};

const showToast = (message) => {
  setToast(message);

  if (showToast._timer) {
    window.clearTimeout(showToast._timer);
  }

  showToast._timer = window.setTimeout(() => {
    setToast("");
  }, 2200);
};

const stopDragAutoScroll = () => {
  dragAutoScrollDirectionRef.current = { x: 0, y: 0 };

  if (dragAutoScrollFrameRef.current) {
    cancelAnimationFrame(dragAutoScrollFrameRef.current);
    dragAutoScrollFrameRef.current = null;
  }
};

const startDragAutoScroll = (direction) => {
  const nextDirection = {
    x: direction?.x || 0,
    y: direction?.y || 0,
  };

  if (!nextDirection.x && !nextDirection.y) {
    stopDragAutoScroll();
    return;
  }

  dragAutoScrollDirectionRef.current = nextDirection;

  if (dragAutoScrollFrameRef.current) return;

  const tick = () => {
    const scroller = bottomScrollRef.current;
    const activeDirection = dragAutoScrollDirectionRef.current;

    if (!activeDirection || (!activeDirection.x && !activeDirection.y)) {
      dragAutoScrollFrameRef.current = null;
      return;
    }

    if (scroller && activeDirection.x) {
      scroller.scrollLeft += activeDirection.x * 18;
    }

    if (activeDirection.y) {
  const verticalScroller = verticalScrollRef.current;
  if (verticalScroller) {
    verticalScroller.scrollTop += activeDirection.y * 14;
  } else {
    window.scrollBy(0, activeDirection.y * 14);
  }
}

    dragAutoScrollFrameRef.current = requestAnimationFrame(tick);
  };

  dragAutoScrollFrameRef.current = requestAnimationFrame(tick);
};

const handleCalendarDragAutoScroll = (event) => {
  const horizontalScroller = bottomScrollRef.current;
  const verticalScroller = verticalScrollRef.current;
  if (!horizontalScroller) return;

  const hRect = horizontalScroller.getBoundingClientRect();
  const vRect = verticalScroller
    ? verticalScroller.getBoundingClientRect()
    : {
        top: 0,
        bottom: window.innerHeight,
      };

  const edgeThresholdX = 80;
  const edgeThresholdY = 90;

  const x = event.clientX;
  const y = event.clientY;

  let dx = 0;
  let dy = 0;

  if (x < hRect.left + edgeThresholdX) {
    dx = -1;
  } else if (x > hRect.right - edgeThresholdX) {
    dx = 1;
  }

  if (y < vRect.top + edgeThresholdY) {
    dy = -1;
  } else if (y > vRect.bottom - edgeThresholdY) {
    dy = 1;
  }

  if (!dx && !dy) {
    stopDragAutoScroll();
  } else {
    startDragAutoScroll({ x: dx, y: dy });
  }
};

function safeText(v, fallback = "—") {
  if (v == null) return fallback;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return fallback;
}

function addressSummaryFromRow(r) {
  const a =
    (r?.full_address || "").trim() ||
    [r?.street_number, r?.street_name, r?.suburb].filter(Boolean).join(" ").trim() ||
    (r?.suburb || "").trim() ||
    "—";
  return a;
}

function jobLotPlanText(row) {
  const lot = (row?.lot_number || "").toString().trim();
  const plan = (row?.plan_number || "").toString().trim();

  if (lot && plan) return `(Lot ${lot} on ${plan})`;
  if (lot) return `(Lot ${lot})`;
  if (plan) return `(Plan ${plan})`;
  return "";
}

function jobClientText(row) {
  const company = String(row?.client_company || "").trim();
  const first = String(row?.client_first_name || "").trim();
  const surname = String(row?.client_surname || "").trim();
  const person = [first, surname].filter(Boolean).join(" ").trim();

  if (company && person) return `${company} · ${person}`;
  if (company) return company;
  if (person) return person;
  return "";
}

function getJobBadge(jobNumber) {
  const s = String(jobNumber ?? "").trim();
  if (!s) return "#";
  return s.length <= 3 ? s : s.slice(-4);
}

  // ---------- Job search ----------
const runJobPlanningGlobalSuggest = async (query) => {
const rawQ = String(query || "").trim();
const q = rawQ.replace(/^#/, "");
const lowerQ = q.toLowerCase();
const isNotesShortcut = rawQ === "!!!";

if (!rawQ) {
  setJobSuggestions([]);
  return [];
}

// Manual Notes option only when typing !!!
if (isNotesShortcut) {
  setJobSuggestions([NOTES_JOB_OPTION]);
  return [NOTES_JOB_OPTION];
}

  setJobLoading(true);

  try {
    const isNumeric = /^\d+$/.test(q);

    let queryBuilder = supabase
      .from("jobs")
      .select(`
        id,
        job_number,
        full_address,
        street_number,
        street_name,
        suburb,
        client_company,
        client_first_name,
        client_surname,
        lot_number,
        plan_number,
        job_type_legacy,
        assigned_to
      `)
      .order("job_number", { ascending: false })
      .limit(20);

    if (isNumeric) {
  const like = `%${q}%`;

  queryBuilder = queryBuilder.or(
    [
      `job_number_text.like.${q}%`,
      `street_number.ilike.${like}`,
      `full_address.ilike.${like}`,
      `suburb.ilike.${like}`,
      `lot_number.ilike.${like}`,
      `plan_number.ilike.${like}`,
      `notes.ilike.${like}`,
      `client_company.ilike.${like}`,
    ].join(",")
  );
} else if (q.length <= 2) {
  const like = `%${q}%`;

  queryBuilder = queryBuilder.or(
    [
      `full_address.ilike.${like}`,
      `suburb.ilike.${like}`,
      `lot_number.ilike.${like}`,
      `plan_number.ilike.${like}`,
      `notes.ilike.${like}`,
      `client_company.ilike.${like}`,
      `client_first_name.ilike.${like}`,
      `client_surname.ilike.${like}`,
      `job_type_legacy.ilike.${like}`,
    ].join(",")
  );
} else {
  const ts = q
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `${w}:*`)
    .join(" & ");

  queryBuilder = queryBuilder.textSearch("search_tsv", ts, { type: "tsquery" });
}

    const { data, error } = await queryBuilder;
    if (error) throw error;

const results = (data || []).map((r) => ({
  id: r.id,
  job_number: String(r.job_number),
  full_address: r.full_address || "",
  suburb: r.suburb || "",
  job_type_legacy: r.job_type_legacy || "",
  lot_number: r.lot_number || "",
  plan_number: r.plan_number || "",
  client_company: r.client_company || "",
  client_first_name: r.client_first_name || "",
  client_surname: r.client_surname || "",
  address: addressSummaryFromRow(r),
}));

const orderedResults = isNumeric
  ? [...results].sort((a, b) => {
      const aJob = String(a.job_number || "").trim();
      const bJob = String(b.job_number || "").trim();

      const aExact = aJob === q ? 1 : 0;
      const bExact = bJob === q ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;

      const aStarts = aJob.startsWith(q) ? 1 : 0;
      const bStarts = bJob.startsWith(q) ? 1 : 0;
      if (aStarts !== bStarts) return bStarts - aStarts;

      return Number(bJob) - Number(aJob);
    })
  : results;

setJobSuggestions(orderedResults);
return orderedResults;
  } catch (err) {
    console.error("Job planning global search failed:", err);
    setJobSuggestions([]);
    return [];
  } finally {
    setJobLoading(false);
  }
};

useEffect(() => {
  if (!isAppVisible) return;

  if (jobSearchDebounceRef.current) {
    clearTimeout(jobSearchDebounceRef.current);
  }

  const q = String(jobQuery || "").trim();

  if (!q) {
    setJobSuggestions([]);
    setJobActiveIdx(-1);
    return;
  }

  jobSearchDebounceRef.current = setTimeout(() => {
    void runJobPlanningGlobalSuggest(jobQuery);
  }, 180);

  return () => {
    if (jobSearchDebounceRef.current) {
      clearTimeout(jobSearchDebounceRef.current);
    }
  };
}, [jobQuery, isAppVisible]);

useEffect(() => {
  setJobActiveIdx(-1);
}, [jobQuery]);

useEffect(() => {
  setJobActiveIdx((i) => Math.min(i, (jobSuggestions?.length || 0) - 1));
}, [jobSuggestions]);

  const resolveSuburbForJob = async (job) => {
    if (job?.isNotesOnly || String(job?.job_number || "").trim().toLowerCase() === "notes") {
  return "Notes Only";
}
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
  const jobNumber = String(job.job_number || "").trim();
  const targetKey = modalTarget ?? selectedDate;

  if (!targetKey) return;
cancelAutosave();
  const targetItems =
    targetKey === UNSCHEDULED_KEY
      ? unscheduledItems
      : (plansByDate[targetKey] || []);

const isNotesOnly = job?.isNotesOnly || jobNumber.toLowerCase() === "notes";

if (!isNotesOnly && targetItems.some((item) => String(item.job_number) === jobNumber)) {
  setJobQuery("");
  setJobSuggestions([]);
  setJobActiveIdx(-1);
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
  notes: String(newJobNotes || "").trim(),
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
  notes: String(newJobNotes || "").trim(),
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
setJobActiveIdx(-1);
setSelectedJobSuggestion(null);
closeAddModal();
  } catch (err) {
    console.error("Error adding planned job:", err);
    const msg = err?.message || err?.details || err?.hint || "Unknown Supabase error";
    setError(`Could not add this job. (${msg})`);
  } finally {
    setSaving(false);
  }
};

const handleJobKeyDown = async (e) => {
  const hasList = Array.isArray(jobSuggestions) && jobSuggestions.length > 0;

  if (e.key === "ArrowDown") {
    if (!hasList) return;
    e.preventDefault();
    setJobActiveIdx((i) => (i < jobSuggestions.length - 1 ? i + 1 : 0));
    return;
  }

  if (e.key === "ArrowUp") {
    if (!hasList) return;
    e.preventDefault();
    setJobActiveIdx((i) => (i > 0 ? i - 1 : jobSuggestions.length - 1));
    return;
  }

  if (e.key === "Enter") {
    e.preventDefault();

    if (hasList) {
      const picked =
        jobActiveIdx >= 0 ? jobSuggestions[jobActiveIdx] : jobSuggestions[0];

      if (picked) {
        setSelectedJobSuggestion(picked);
        setJobQuery(String(picked.job_number));
        setJobSuggestions([]);
        setJobActiveIdx(-1);
      }
      return;
    }

    const results = await runJobPlanningGlobalSuggest(jobQuery);
    if (results.length === 1) {
      const picked = results[0];
      setSelectedJobSuggestion(picked);
      setJobQuery(String(picked.job_number));
      setJobSuggestions([]);
      setJobActiveIdx(-1);
    }
    return;
  }

  if (e.key === "Escape") {
    setJobSuggestions([]);
    setJobActiveIdx(-1);
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

    const itemId = item?.id ?? null;
    const jobNumber = String(item.job_number || "").trim();

    if (selectedDate === UNSCHEDULED_KEY) {
      let deleteQuery = supabase.from("job_planning_unscheduled").delete();

      if (itemId != null) {
        deleteQuery = deleteQuery.eq("id", itemId);
      } else {
        deleteQuery = deleteQuery.eq("job_number", jobNumber);
      }

      const { error: deleteError } = await deleteQuery;
      if (deleteError) throw deleteError;

      const nextUnscheduled = unscheduledItems
        .filter((x) => {
          if (itemId != null && x?.id != null) return x.id !== itemId;
          return String(x.job_number || "").trim() !== jobNumber;
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
      const sourceDate = selectedDate;

      let deleteQuery = supabase
        .from("job_planning_entries")
        .delete()
        .eq("date", sourceDate);

      if (itemId != null) {
        deleteQuery = deleteQuery.eq("id", itemId);
      } else {
        deleteQuery = deleteQuery.eq("job_number", jobNumber);
      }

      const { error: deleteError } = await deleteQuery;
      if (deleteError) throw deleteError;

      const nextDayItems = (plansByDate[sourceDate] || [])
        .filter((x) => {
          if (itemId != null && x?.id != null) return x.id !== itemId;
          return String(x.job_number || "").trim() !== jobNumber;
        })
        .map((x, index) => ({
          ...x,
          sort_order: index,
        }));

      setPlansByDate((prev) => {
        const next = { ...prev };
        if (nextDayItems.length > 0) {
          next[sourceDate] = nextDayItems;
        } else {
          delete next[sourceDate];
        }
        return next;
      });

      setEditItems(
        nextDayItems.map((x, index) => ({
          ...x,
          client_key: x.id || `${x.job_number}-${sourceDate}-${index}`,
        }))
      );
    }
    showToast(`Removed job ${item.job_number}.`);
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
    showToast(`Moved job ${item.job_number} to unscheduled.`);
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
    if (!targetDateISO) return;
    if (!selectedDate) return;
    if (selectedDate !== UNSCHEDULED_KEY && selectedDate === targetDateISO) return;

    const sourceKey = selectedDate;
    const sourceItemId = item?.id ?? null;
    const sourceJobNumber = String(item.job_number || "").trim();
    const keepModalOpen = sourceKey === UNSCHEDULED_KEY;

    setSaving(true);
    setError("");

    // 1) Remove from source table
    if (sourceKey === UNSCHEDULED_KEY) {
      let deleteQuery = supabase.from("job_planning_unscheduled").delete();

      if (sourceItemId != null) {
        deleteQuery = deleteQuery.eq("id", sourceItemId);
      } else {
        deleteQuery = deleteQuery.eq("job_number", sourceJobNumber);
      }

      const { error: deleteError } = await deleteQuery;
      if (deleteError) throw deleteError;
    } else {
      let deleteQuery = supabase
        .from("job_planning_entries")
        .delete()
        .eq("date", sourceKey);

      if (sourceItemId != null) {
        deleteQuery = deleteQuery.eq("id", sourceItemId);
      } else {
        deleteQuery = deleteQuery
          .eq("job_number", sourceJobNumber)
          .eq("notes", String(item.notes || "").trim())
          .eq("suburb", String(item.suburb || "").trim())
          .eq("colour", String(item.colour || "").trim());
      }

      const { error: deleteError } = await deleteQuery;
      if (deleteError) throw deleteError;
    }

    // 2) Insert into target date
    const currentTargetItems = plansByDate[targetDateISO] || [];

    const insertPayload = {
      date: targetDateISO,
      job_number: sourceJobNumber,
      suburb: String(item.suburb || "").trim(),
      notes: String(item.notes || "").trim(),
      colour: String(item.colour || "").trim(),
      sort_order: currentTargetItems.length,
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

    // 3) Update local state
    if (sourceKey === UNSCHEDULED_KEY) {
      const nextUnscheduled = unscheduledItems
        .filter((x) => {
          if (sourceItemId != null && x?.id != null) return x.id !== sourceItemId;
          return String(x.job_number || "").trim() !== sourceJobNumber;
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

      setPlansByDate((prev) => {
        const existingTarget = prev[targetDateISO] || [];
        return {
          ...prev,
          [targetDateISO]: [...existingTarget, insertedRow].map((x, index) => ({
            ...x,
            sort_order: index,
          })),
        };
      });
    } else {
      const sourceDayItems = plansByDate[sourceKey] || [];

      const nextSourceDayItems = sourceDayItems
        .filter((x) => {
          if (sourceItemId != null && x?.id != null) return x.id !== sourceItemId;
          return String(x.job_number || "").trim() !== sourceJobNumber;
        })
        .map((x, index) => ({
          ...x,
          sort_order: index,
        }));

      setPlansByDate((prev) => {
        const next = { ...prev };
        const existingTarget = prev[targetDateISO] || [];

        if (nextSourceDayItems.length > 0) {
          next[sourceKey] = nextSourceDayItems;
        } else {
          delete next[sourceKey];
        }

        next[targetDateISO] = [...existingTarget, insertedRow].map((x, index) => ({
          ...x,
          sort_order: index,
        }));

        return next;
      });

      setEditItems(
        nextSourceDayItems.map((x, index) => ({
          ...x,
          client_key: x.id || `${x.job_number}-${sourceKey}-${index}`,
        }))
      );
    }

    setMoveDatePickerKey(null);
    setMoveDateDrafts((prev) => {
      const next = { ...prev };
      delete next[item.client_key];
      return next;
    });

    if (!keepModalOpen) {
      setEditorModalOpen(false);
      setSelectedDate(null);
    }
  } catch (err) {
    console.error("Error moving item to selected day:", err);
    const msg = err?.message || err?.details || err?.hint || "Unknown Supabase error";
    setError(`Could not move job to date. (${msg})`);
  } finally {
    setSaving(false);
  }
};

const moveCalendarItemToDay = async (sourceDateISO, item, targetDateISO) => {
  cancelAutosave();

  try {
    if (!sourceDateISO || !targetDateISO || !item) return;
    if (sourceDateISO === targetDateISO) return;

    const sourceItemId = item?.id ?? null;
    const sourceJobNumber = String(item.job_number || "").trim();

    setSaving(true);
    setError("");

    let deleteQuery = supabase
      .from("job_planning_entries")
      .delete()
      .eq("date", sourceDateISO);

    if (sourceItemId != null) {
      deleteQuery = deleteQuery.eq("id", sourceItemId);
    } else {
      deleteQuery = deleteQuery
        .eq("job_number", sourceJobNumber)
        .eq("notes", String(item.notes || "").trim())
        .eq("suburb", String(item.suburb || "").trim())
        .eq("colour", String(item.colour || "").trim());
    }

    const { error: deleteError } = await deleteQuery;
    if (deleteError) throw deleteError;

    const currentTargetItems = plansByDate[targetDateISO] || [];

    const insertPayload = {
      date: targetDateISO,
      job_number: sourceJobNumber,
      suburb: String(item.suburb || "").trim(),
      notes: String(item.notes || "").trim(),
      colour: String(item.colour || "").trim(),
      sort_order: currentTargetItems.length,
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

    setPlansByDate((prev) => {
      const next = { ...prev };

      const sourceItems = (prev[sourceDateISO] || [])
        .filter((x) => {
          if (sourceItemId != null && x?.id != null) return x.id !== sourceItemId;
          return String(x.job_number || "").trim() !== sourceJobNumber;
        })
        .map((x, index) => ({
          ...x,
          sort_order: index,
        }));

      const targetItems = [...(prev[targetDateISO] || []), insertedRow].map((x, index) => ({
        ...x,
        sort_order: index,
      }));

      if (sourceItems.length > 0) {
        next[sourceDateISO] = sourceItems;
      } else {
        delete next[sourceDateISO];
      }

      next[targetDateISO] = targetItems;

      return next;
    });

    showToast(`Moved job ${item.job_number} to ${longDateLabel(targetDateISO)}.`);
  } catch (err) {
    console.error("Error moving calendar item to another day:", err);
    const msg = err?.message || err?.details || err?.hint || "Unknown Supabase error";
    setError(`Could not move job to another day. (${msg})`);
  } finally {
    setSaving(false);
    setCalendarDraggedKey(null);
setCalendarDragOverKey(null);
stopDragAutoScroll();
  }
};

const moveUnscheduledItemToDay = async (item, targetDateISO) => {
  cancelAutosave();

  try {
    if (!targetDateISO || !item) return;

    const sourceItemId = item?.id ?? null;
    const sourceJobNumber = String(item.job_number || "").trim();

    setSaving(true);
    setError("");

    // 1) Remove from unscheduled
    let deleteQuery = supabase.from("job_planning_unscheduled").delete();

    if (sourceItemId != null) {
      deleteQuery = deleteQuery.eq("id", sourceItemId);
    } else {
      deleteQuery = deleteQuery.eq("job_number", sourceJobNumber);
    }

    const { error: deleteError } = await deleteQuery;
    if (deleteError) throw deleteError;

    // 2) Insert into target day
    const currentTargetItems = plansByDate[targetDateISO] || [];

    const insertPayload = {
      date: targetDateISO,
      job_number: sourceJobNumber,
      suburb: String(item.suburb || "").trim(),
      notes: String(item.notes || "").trim(),
      colour: String(item.colour || "").trim(),
      sort_order: currentTargetItems.length,
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

 let nextUnscheduledRows = [];

setUnscheduledItems((prev) => {
  nextUnscheduledRows = prev
    .filter((x) => {
      if (sourceItemId != null && x?.id != null) return x.id !== sourceItemId;
      return String(x.job_number || "").trim() !== sourceJobNumber;
    })
    .map((x, index) => ({
      ...x,
      sort_order: index,
    }));

  return nextUnscheduledRows;
});

setPlansByDate((prev) => {
  const existingTarget = prev[targetDateISO] || [];
  return {
    ...prev,
    [targetDateISO]: [...existingTarget, insertedRow].map((x, index) => ({
      ...x,
      sort_order: index,
    })),
  };
});

if (selectedDate === UNSCHEDULED_KEY) {
  setEditItems(
    nextUnscheduledRows.map((x, index) => ({
      ...x,
      client_key: x.id || `${x.job_number}-${UNSCHEDULED_KEY}-${index}`,
    }))
  );
}

    showToast(`Moved job ${item.job_number} to ${longDateLabel(targetDateISO)}.`);
  } catch (err) {
    console.error("Error moving unscheduled item to day:", err);
    const msg = err?.message || err?.details || err?.hint || "Unknown Supabase error";
    setError(`Could not move unscheduled job to day. (${msg})`);
  } finally {
    setSaving(false);
    setCalendarDraggedKey(null);
setCalendarDragOverKey(null);
stopDragAutoScroll();
  }
};

const moveCalendarItemToUnscheduled = async (sourceDateISO, item) => {
  cancelAutosave();

  try {
    if (!sourceDateISO || sourceDateISO === UNSCHEDULED_KEY || !item) return;

    const sourceItemId = item?.id ?? null;
    const sourceJobNumber = String(item.job_number || "").trim();

    setSaving(true);
    setError("");

    let deleteQuery = supabase
      .from("job_planning_entries")
      .delete()
      .eq("date", sourceDateISO);

    if (sourceItemId != null) {
      deleteQuery = deleteQuery.eq("id", sourceItemId);
    } else {
      deleteQuery = deleteQuery
        .eq("job_number", sourceJobNumber)
        .eq("notes", String(item.notes || "").trim())
        .eq("suburb", String(item.suburb || "").trim())
        .eq("colour", String(item.colour || "").trim());
    }

    const { error: deleteError } = await deleteQuery;
    if (deleteError) throw deleteError;

    const insertPayload = {
      job_number: sourceJobNumber,
      suburb: String(item.suburb || "").trim(),
      notes: String(item.notes || "").trim(),
      colour: String(item.colour || "").trim(),
      sort_order: unscheduledItems.length,
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

    setPlansByDate((prev) => {
      const next = { ...prev };

      const nextDayItems = (prev[sourceDateISO] || [])
        .filter((x) => {
          if (sourceItemId != null && x?.id != null) return x.id !== sourceItemId;
          return (
            String(x.job_number || "").trim() !== sourceJobNumber ||
            String(x.notes || "").trim() !== String(item.notes || "").trim() ||
            String(x.suburb || "").trim() !== String(item.suburb || "").trim() ||
            String(x.colour || "").trim() !== String(item.colour || "").trim()
          );
        })
        .map((x, index) => ({
          ...x,
          sort_order: index,
        }));

      if (nextDayItems.length > 0) {
        next[sourceDateISO] = nextDayItems;
      } else {
        delete next[sourceDateISO];
      }

      return next;
    });

    setUnscheduledItems((prev) =>
      [...prev, insertedRow].map((x, index) => ({
        ...x,
        sort_order: index,
      }))
    );

    showToast(`Moved job ${item.job_number} to unscheduled.`);
  } catch (err) {
    console.error("Error moving calendar item to unscheduled:", err);
    const msg = err?.message || err?.details || err?.hint || "Unknown Supabase error";
    setError(`Could not move job to unscheduled. (${msg})`);
  } finally {
    setSaving(false);
    setCalendarDraggedKey(null);
setCalendarDragOverKey(null);
stopDragAutoScroll();
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

const parseCalendarDragKey = (dragKey) => {
  if (!dragKey) return null;

  const parts = String(dragKey).split("::");
  if (parts.length < 2) return null;

  return {
    bucketKey: parts[0],
    itemKey: parts.slice(1).join("::"),
  };
};

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
      showToast("Jobs saved.");
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

      showToast("Day saved.");
    }
  } catch (err) {
    console.error("Error saving plan:", err);
    const msg = err?.message || err?.details || err?.hint || "Unknown Supabase error";
    setError(`Could not save this plan. (${msg})`);
} finally {
  setSaving(false);
  setMoveDatePickerKey(null);
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
    setJobActiveIdx(-1);
setSelectedJobSuggestion(null);

    showToast(
      selectedDate === UNSCHEDULED_KEY
        ? "All unscheduled jobs cleared."
        : "All jobs cleared for this day."
    );
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

const getDragItemLabel = (item) => {
  const jobNo = String(item?.job_number || "").trim();
  if (!jobNo) return "this job";
  if (jobNo.toLowerCase() === "notes") return "this note";
  return `job ${jobNo}`;
};

const confirmCalendarMove = ({ item, fromKey, toKey }) => {
  const label = getDragItemLabel(item);

  if (!fromKey || !toKey || fromKey === toKey) return true;

  if (toKey === UNSCHEDULED_KEY) {
    const fromLabel =
      fromKey === UNSCHEDULED_KEY ? "Unscheduled" : longDateLabel(fromKey);

    return window.confirm(`Move ${label} from ${fromLabel} to Unscheduled?`);
  }

  if (fromKey === UNSCHEDULED_KEY) {
    return window.confirm(
      `Move ${label} from Unscheduled to ${longDateLabel(toKey)}?`
    );
  }

  return window.confirm(
    `Move ${label} from ${longDateLabel(fromKey)} to ${longDateLabel(toKey)}?`
  );
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

<div className="job-planning-vertical-scroll" ref={verticalScrollRef}>
  <div className="job-planning-main-layout">
 <div
className={
  "job-planning-unscheduled-panel" +
  (selectedDate === UNSCHEDULED_KEY ? " job-planning-selected-cell" : "") +
  (calendarDragOverKey === UNSCHEDULED_KEY ? " job-planning-drop-target" : "")
}
onDragEnter={(e) => {
  e.preventDefault();
  if (!calendarDraggedKey) return;
  setCalendarDragOverKey(UNSCHEDULED_KEY);
}}
onDragOver={(e) => {
  e.preventDefault();
  if (!calendarDraggedKey) return;
  setCalendarDragOverKey(UNSCHEDULED_KEY);
  handleCalendarDragAutoScroll(e);
}}
onDragLeave={(e) => {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    if (calendarDragOverKey === UNSCHEDULED_KEY) {
      setCalendarDragOverKey(null);
    }
    stopDragAutoScroll();
  }
}}
onDrop={(e) => {
  e.preventDefault();
  setCalendarDragOverKey(null);
  stopDragAutoScroll();

  if (!calendarDraggedKey) return;

  const parsed = parseCalendarDragKey(calendarDraggedKey);
  if (!parsed) {
    setCalendarDraggedKey(null);
    return;
  }

  const sourceBucketKey = parsed.bucketKey;

  if (sourceBucketKey === UNSCHEDULED_KEY) {
    setCalendarDraggedKey(null);
    return;
  }

  const sourceItems =
    sourceBucketKey === UNSCHEDULED_KEY
      ? unscheduledItems
      : (plansByDate[sourceBucketKey] || []);

const draggedItem = sourceItems.find(
  (x, index) =>
    makeCalendarDragKey(sourceBucketKey, x, index) === calendarDraggedKey
);

if (!draggedItem) {
  setCalendarDraggedKey(null);
  return;
}

const confirmed = confirmCalendarMove({
  item: draggedItem,
  fromKey: sourceBucketKey,
  toKey: UNSCHEDULED_KEY,
});

if (!confirmed) {
  setCalendarDraggedKey(null);
  setCalendarDragOverKey(null);
  stopDragAutoScroll();
  return;
}

void moveCalendarItemToUnscheduled(sourceBucketKey, draggedItem);
}}
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
  handleCalendarDragAutoScroll(e);
}}
 onDrop={(e) => {
  e.preventDefault();
  e.stopPropagation();

  if (!calendarDraggedKey) return;

  const parsed = parseCalendarDragKey(calendarDraggedKey);
  if (!parsed) {
    setCalendarDraggedKey(null);
    return;
  }

  if (parsed.bucketKey !== UNSCHEDULED_KEY) {
    return;
  }

  const targetKey = makeCalendarDragKey(UNSCHEDULED_KEY, item, index);
  reorderCalendarItems(UNSCHEDULED_KEY, calendarDraggedKey, targetKey);
  setCalendarDraggedKey(null);
}}
 onDragEnd={() => {
  setCalendarDraggedKey(null);
  setCalendarDragOverKey(null);
  stopDragAutoScroll();
}}
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
  (!inCurrentMonth ? " job-planning-outside-month" : "") +
  (calendarDragOverKey === iso ? " job-planning-drop-target" : "")
}
  title={buildTooltip(iso, items)}
 onDragEnter={(e) => {
  e.preventDefault();
  if (!calendarDraggedKey) return;
  setCalendarDragOverKey(iso);
}}

onDragOver={(e) => {
  e.preventDefault();
  if (!calendarDraggedKey) return;
  setCalendarDragOverKey(iso);
  handleCalendarDragAutoScroll(e);
}}
onDragLeave={(e) => {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    if (calendarDragOverKey === iso) {
      setCalendarDragOverKey(null);
    }
    stopDragAutoScroll();
  }
}}
onDrop={(e) => {
  e.preventDefault();
  setCalendarDragOverKey(null);
  stopDragAutoScroll();

  if (!calendarDraggedKey) return;

  const parsed = parseCalendarDragKey(calendarDraggedKey);
  if (!parsed) {
    setCalendarDraggedKey(null);
    return;
  }

  const sourceBucketKey = parsed.bucketKey;

  if (sourceBucketKey === iso) {
    setCalendarDraggedKey(null);
    return;
  }

  const sourceItems =
    sourceBucketKey === UNSCHEDULED_KEY
      ? unscheduledItems
      : (plansByDate[sourceBucketKey] || []);

const draggedItem = sourceItems.find(
  (x, index) =>
    makeCalendarDragKey(sourceBucketKey, x, index) === calendarDraggedKey
);

if (!draggedItem) {
  setCalendarDraggedKey(null);
  return;
}

const confirmed = confirmCalendarMove({
  item: draggedItem,
  fromKey: sourceBucketKey,
  toKey: iso,
});

if (!confirmed) {
  setCalendarDraggedKey(null);
  setCalendarDragOverKey(null);
  stopDragAutoScroll();
  return;
}

if (sourceBucketKey === UNSCHEDULED_KEY) {
  void moveUnscheduledItemToDay(draggedItem, iso);
} else {
  void moveCalendarItemToDay(sourceBucketKey, draggedItem, iso);
}
}}
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
  <div className="job-planning-day-mini-month">
    {day.toLocaleDateString("en-AU", { month: "short" })}
  </div>
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
  handleCalendarDragAutoScroll(e);
}}
 onDrop={(e) => {
  e.preventDefault();
  e.stopPropagation();

  if (!calendarDraggedKey) return;

  const parsed = parseCalendarDragKey(calendarDraggedKey);
  if (!parsed) {
    setCalendarDraggedKey(null);
    return;
  }

  // only reorder when dragging within the same bucket/day
  if (parsed.bucketKey !== iso) {
    return;
  }

  const targetKey = makeCalendarDragKey(iso, item, index);
  reorderCalendarItems(iso, calendarDraggedKey, targetKey);
  setCalendarDraggedKey(null);
}}
  onDragEnd={() => {
  setCalendarDraggedKey(null);
  setCalendarDragOverKey(null);
  stopDragAutoScroll();
}}
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
</div>
</div>
<div className="schedule-legend">
  {JOB_PLANNING_LEGEND.map((item) => (
    <div key={item.label} className="schedule-legend-item">
      <span
        className={
          "schedule-legend-swatch job-planning-legend-swatch" +
          (item.colour ? ` job-planning-day-job--${item.colour}` : "")
        }
      />
      <span>{item.label}</span>
    </div>
  ))}
</div>

   {editorModalOpen && selectedDate && (
  <div className="job-planning-modal-overlay">
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
>
 <div className="job-planning-edit-item-header">
  <div
    className="job-planning-drag-handle"
    draggable
    onDragStart={(e) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", item.client_key);
      handleDragStart(item.client_key);
    }}
    onDragEnd={handleDragEnd}
    title="Drag to reorder"
  >
    ⋮⋮
  </div>

  <div className="job-planning-edit-item-header-left">
    <div>
      <div className="job-planning-edit-item-title">
  {String(item.job_number).toLowerCase() === "notes"
    ? "Notes"
    : `Job ${item.job_number}`}
</div>
      <div className="job-planning-drag-hint">Use dots to drag</div>
    </div>

<div
  className="job-planning-job-actions"
  onMouseDown={(e) => e.stopPropagation()}
  onDragStart={(e) => e.stopPropagation()}
>
  <select
    className="maps-search-input"
    style={{
      color: getColourHex(item.colour),
      fontWeight: item.colour ? 600 : 400,
    }}
    value={item.colour || ""}
    draggable={false}
    onMouseDown={(e) => e.stopPropagation()}
    onChange={(e) => updateEditItem(item.client_key, "colour", e.target.value)}
  >
    {JOB_COLOURS.map((colour) => (
      <option
        key={colour.value}
        value={colour.value}
        style={{
          color: getColourHex(colour.value),
          fontWeight: colour.value ? 600 : 400,
        }}
      >
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
    cancelAutosave();

    setMoveDatePickerKey((current) =>
      current === item.client_key ? null : item.client_key
    );

    setMoveDateDrafts((prev) => ({
      ...prev,
      [item.client_key]:
        prev[item.client_key] ||
        (selectedDate && selectedDate !== UNSCHEDULED_KEY ? selectedDate : todayISO),
    }));
  }}
>
  Move to Date
</button>

{moveDatePickerKey === item.client_key && (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      marginTop: "0.35rem",
      flexWrap: "wrap",
    }}
    onMouseDown={(e) => e.stopPropagation()}
    onClick={(e) => e.stopPropagation()}
  >
    <input
      type="date"
      className="maps-search-input"
      value={
        moveDateDrafts[item.client_key] ||
        (selectedDate && selectedDate !== UNSCHEDULED_KEY ? selectedDate : todayISO)
      }
      onChange={(e) => {
        const picked = e.target.value;
        setMoveDateDrafts((prev) => ({
          ...prev,
          [item.client_key]: picked,
        }));
      }}
      style={{ minWidth: "160px" }}
    />

    <button
      type="button"
      className="btn-pill primary"
      onClick={() => {
        const picked = moveDateDrafts[item.client_key];
        if (!picked) return;
        void moveItemToSelectedDay(item, picked);
      }}
      disabled={!moveDateDrafts[item.client_key] || saving}
    >
      Move
    </button>

    <button
      type="button"
      className="btn-pill"
      onClick={() => {
        setMoveDatePickerKey(null);
        setMoveDateDrafts((prev) => {
          const next = { ...prev };
          delete next[item.client_key];
          return next;
        });
      }}
      disabled={saving}
    >
      Cancel
    </button>
  </div>
)}

<button
  type="button"
  className="btn-pill danger"
  onClick={() => {
    const confirmDelete = window.confirm(
      `Remove job ${item.job_number}?`
    );
    if (!confirmDelete) return;

    removeEditItem(item);
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
  placeholder={
    String(item.job_number).toLowerCase() === "notes"
      ? "Notes Only"
      : "Auto-filled from job address"
  }
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
  className="btn-pill danger"
  onClick={() => {
    const confirmClear = window.confirm(
      selectedDate === UNSCHEDULED_KEY
        ? "Clear all unscheduled jobs?"
        : "Clear all jobs for this day?"
    );
    if (!confirmClear) return;

    handleClearDay();
  }}
>
  {selectedDate === UNSCHEDULED_KEY ? "Clear Jobs" : "Clear Day"}
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
  <div className="job-planning-modal-overlay">
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
        
      <label className="schedule-editor-label">Job search</label>

<div style={{ position: "relative" }}>
  <input
  className="maps-search-input"
  type="text"
  value={jobQuery}
  onChange={(e) => {
    setJobQuery(e.target.value);
    setSelectedJobSuggestion(null);
  }}
  onKeyDown={handleJobKeyDown}
  placeholder="Start typing… (job #, client, suburb, lot/plan, address, notes, etc.) or type !!! for a note"
  autoFocus
/>

  {(jobLoading || jobSuggestions.length > 0) && (
    <div
      className="contacts-suggestions"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: "100%",
        marginTop: "4px",
        zIndex: 50,
        maxHeight: "220px",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        display: "flex",
        flexDirection: "column",
        gap: "0.35rem",
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: "8px",
        padding: "0.35rem",
      }}
    >
      {jobLoading && (
        <div style={{ padding: "8px", fontSize: "0.8rem", opacity: 0.7 }}>
          Searching…
        </div>
      )}

      {!jobLoading &&
        jobSuggestions.map((job, idx) => (
          <button
            key={`${job.id ?? job.job_number}-${job.isNotesOnly ? "notes" : "real"}`}
            type="button"
            className={`contacts-suggestion ${idx === jobActiveIdx ? "is-active" : ""}`}
            onMouseEnter={() => setJobActiveIdx(idx)}
            onClick={() => {
              setSelectedJobSuggestion(job);
              setJobQuery(String(job.job_number));
              setJobSuggestions([]);
              setJobActiveIdx(-1);
            }}
          >
            <div className="contacts-suggestion-header">
              <div className="contacts-avatar">
                {job.isNotesOnly ? "N" : getJobBadge(job.job_number)}
              </div>

              <div>
                <div className="contacts-suggestion-name">
                  {job.isNotesOnly
                    ? "Notes"
                    : `Job #${job.job_number}${job.job_type_legacy ? ` · ${job.job_type_legacy}` : ""}`}
                </div>

       <div>
  <div className="contacts-suggestion-role">
    {job.isNotesOnly
      ? "Notes Only"
      : `${safeText(job.address || job.full_address)}${jobLotPlanText(job) ? ` ${jobLotPlanText(job)}` : ""}`}
  </div>

  {!job.isNotesOnly && jobClientText(job) && (
    <div className="contacts-suggestion-role" style={{ fontSize: "0.72rem", opacity: 0.8 }}>
      {jobClientText(job)}
    </div>
  )}
</div>
              </div>
            </div>
          </button>
        ))}
    </div>
  )}
</div>

   {selectedJobSuggestion && (
  <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "#555" }}>
    {selectedJobSuggestion.isNotesOnly ? (
      <>Selected item: <strong>Notes Only</strong></>
    ) : (
      <>Selected job: <strong>{selectedJobSuggestion.job_number}</strong></>
    )}
  </div>
)}
      </div>

      <div className="schedule-editor-row" style={{ marginTop: "0.75rem" }}>
        <label className="schedule-editor-label">Colour</label>
        <select
  className="maps-search-input"
  value={newJobColour}
  onChange={(e) => setNewJobColour(e.target.value)}
  style={{
    color: getColourHex(newJobColour),
    fontWeight: newJobColour ? 600 : 400,
  }}
>
         {JOB_COLOURS.map((colour) => (
  <option
    key={colour.value}
    value={colour.value}
    style={{
      color: getColourHex(colour.value),
      fontWeight: colour.value ? 600 : 400,
    }}
  >
    {colour.label}
  </option>
))}
        </select>
      </div>

<div className="schedule-editor-row" style={{ marginTop: "0.75rem" }}>
  <label className="schedule-editor-label">Notes</label>
  <textarea
    className="maps-search-input"
    style={{ minHeight: "70px" }}
    value={newJobNotes}
    onChange={(e) => setNewJobNotes(e.target.value)}
    placeholder="Notes for this job"
  />
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

{toast && (
  <div
    style={{
      position: "fixed",
      bottom: "24px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 5000,
      background: "rgba(33, 33, 33, 0.95)",
      color: "#fff",
      padding: "10px 14px",
      borderRadius: "10px",
      fontSize: "0.9rem",
      boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
      width: "max-content",
      maxWidth: "calc(100vw - 32px)",
      textAlign: "center",
      pointerEvents: "none",
    }}
  >
    {toast}
  </div>
)}

    </PageLayout>
  );
}

export default JobPlanning;