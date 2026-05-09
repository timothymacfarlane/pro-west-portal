export function cleanDisplayAddress(address) {
  return String(address || "")
    .replace(/,\s*Australia\s*$/i, "")
    .replace(/\s+Australia\s*$/i, "")
    .trim();
}
