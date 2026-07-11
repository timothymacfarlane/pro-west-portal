export const STATUS_OPTIONS = ["In progress", "On hold", "Complete"];

export const PRIORITY_OPTIONS = ["", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export const JOB_CATEGORY_OPTIONS = [
  "",
  "Amalgamation",
  "Boundary Identification",
  "Boundary Repeg",
  "Building Setout",
  "Feature and Contour Survey",
  "Repeg and Setout",
  "Subdivision - Built Strata",
  "Subdivision - Green Title",
  "Subdivision - Survey Strata",
  "Subdivision - Survey Strata Conversion",
  "Vacant Site Survey",
  "Other",
];

export function getPriorityColor(priority) {
  const n = Number(priority);
  if (!Number.isFinite(n)) return "inherit";
  if (n === 1) return "#4da3ff";
  if (n >= 2 && n <= 3) return "#4caf50";
  if (n >= 4 && n <= 6) return "#ff9800";
  if (n >= 7 && n <= 9) return "#f44336";
  return "inherit";
}

export function getPriorityBadgeStyle(priority) {
  const color = getPriorityColor(priority);

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 28,
    padding: "4px 8px",
    borderRadius: 999,
    fontWeight: 900,
    fontSize: 12,
    lineHeight: 1,
    color: "#fff",
    background: color === "inherit" ? "rgba(255,255,255,0.12)" : color,
    border: "1px solid rgba(255,255,255,0.10)",
  };
}

export function toggleFilterValue(currentValues, value, setter) {
  if (value === "All") {
    setter([]);
    return;
  }

  if (currentValues.includes(value)) {
    setter(currentValues.filter((v) => v !== value));
  } else {
    setter([...currentValues, value]);
  }
}
