import { cleanDisplayAddress } from "./displayFormatters.js";

function text(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed === "—" ? "" : trimmed;
}

export function getJobAddressState(job = {}) {
  const hasGoogleAddress = Boolean(text(job.place_id));
  const fallbackAddress = cleanDisplayAddress(
    text(job.full_address) ||
      text(job.manual_address) ||
      text(job.address) ||
      [job.street_number, job.street_name, job.suburb].map(text).filter(Boolean).join(" ") ||
      text(job.street_address) ||
      text(job.suburb)
  );
  const hasFallbackAddress = Boolean(fallbackAddress);

  return {
    hasGoogleAddress,
    isManualAddress: !hasGoogleAddress && hasFallbackAddress,
    hasNoAddress: !hasGoogleAddress && !hasFallbackAddress,
    fallbackAddress,
    displayAddress: fallbackAddress || "—",
  };
}

export function getJobAddressWarning(job = {}) {
  const state = getJobAddressState(job);
  if (state.hasNoAddress) return { ...state, label: "No Address" };
  if (state.isManualAddress) return { ...state, label: "Manual" };
  return { ...state, label: "" };
}
