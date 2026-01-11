import { useEffect, useMemo, useRef, useState } from "react";
import PageLayout from "../components/PageLayout.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { useNavigate, useLocation } from "react-router-dom";

import proj4 from "proj4";

const STATUS_OPTIONS = ["Planned", "In progress", "On hold", "Complete", "Archived"];

// Full WA LGAs (unchanged)
const LOCAL_AUTHORITIES = [
  "City of Albany","City of Armadale","Shire of Ashburton","Shire of Augusta-Margaret River",
  "Town of Bassendean","City of Bayswater","City of Belmont","Shire of Beverley","Shire of Boddington",
  "Shire of Boyup Brook","Shire of Bridgetown-Greenbushes","Shire of Brookton","Shire of Broome",
  "Shire of Broomehill-Tambellup","Shire of Bruce Rock","City of Bunbury","City of Busselton",
  "Town of Cambridge","City of Canning","Shire of Capel","Shire of Carnamah","Shire of Carnarvon",
  "Shire of Chapman Valley","Shire of Chittering","Shire of Christmas Island","Town of Claremont",
  "Shire of Cocos (Keeling) Islands","City of Cockburn","Shire of Collie","Shire of Coolgardie",
  "Shire of Coorow","Shire of Corrigin","Town of Cottesloe","Shire of Cranbrook","Shire of Cuballing",
  "Shire of Cue","Shire of Cunderdin","Shire of Dalwallinu","Shire of Dandaragan","Shire of Dardanup",
  "Shire of Denmark","Shire of Derby-West Kimberley","Shire of Donnybrook Balingup","Shire of Dowerin",
  "Shire of Dumbleyung","Shire of Dundas","Town of East Fremantle","Shire of East Pilbara",
  "Shire of Esperance","Shire of Exmouth","City of Fremantle","Shire of Gingin","Shire of Gnowangerup",
  "Shire of Goomalling","City of Gosnells","City of Greater Geraldton","Shire of Halls Creek","Shire of Harvey",
  "Shire of Irwin","Shire of Jerramungup","City of Joondalup","Shire of Kalamunda","City of Kalgoorlie-Boulder",
  "City of Karratha","Shire of Katanning","Shire of Kellerberrin","Shire of Kent","Shire of Kojonup",
  "Shire of Kondinin","Shire of Koorda","Shire of Kulin","City of Kwinana","Shire of Lake Grace",
  "Shire of Laverton","Shire of Leonora","City of Mandurah","Shire of Manjimup","Shire of Meekatharra",
  "City of Melville","Shire of Menzies","Shire of Merredin","Shire of Mingenew","Shire of Moora",
  "Shire of Morawa","Town of Mosman Park","Shire of Mount Magnet","Shire of Mount Marshall",
  "Shire of Mukinbudin","Shire of Mundaring","Shire of Murchison","Shire of Murray","Shire of Nannup",
  "Shire of Narembeen","Shire of Narrogin","City of Nedlands","Shire of Ngaanyatjarraku","Shire of Northam",
  "Shire of Northampton","Shire of Nungarin","Shire of Peppermint Grove","Shire of Perenjori","City of Perth",
  "Shire of Pingelly","Shire of Plantagenet","Town of Port Hedland","Shire of Quairading","Shire of Ravensthorpe",
  "City of Rockingham","Shire of Sandstone","Shire of Serpentine-Jarrahdale","Shire of Shark Bay",
  "City of South Perth","City of Stirling","City of Subiaco","City of Swan","Shire of Tammin","Shire of Three Springs",
  "Shire of Toodyay","Shire of Trayning","Shire of Upper Gascoyne","Town of Victoria Park","Shire of Victoria Plains",
  "City of Vincent","Shire of Wagin","Shire of Wandering","City of Wanneroo","Shire of Waroona","Shire of West Arthur",
  "Shire of Westonia","Shire of Wickepin","Shire of Williams","Shire of Wiluna","Shire of Wongan-Ballidu",
  "Shire of Woodanilling","Shire of Wyalkatchem","Shire of Wyndham-East Kimberley","Shire of Yalgoo","Shire of Yilgarn","Shire of York",
];

// MGA2020 / GDA2020
proj4.defs("EPSG:7850", "+proj=utm +zone=50 +south +ellps=GRS80 +units=m +no_defs");
proj4.defs("EPSG:7851", "+proj=utm +zone=51 +south +ellps=GRS80 +units=m +no_defs");
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");

function loadGoogleMaps(apiKey) {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("No window"));
    if (window.google?.maps?.places) return resolve(true);

    const existing = document.getElementById("google-maps-js");
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => reject(new Error("Google Maps failed to load")));
      return;
    }

    const s = document.createElement("script");
    s.id = "google-maps-js";
    s.async = true;
    s.defer = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    s.onload = () => resolve(true);
    s.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(s);
  });
}

function lonToMgaZone(lon) {
  const zone = Math.floor((lon + 180) / 6) + 1;
  return zone <= 50 ? 50 : 51;
}

function wgsToMga(lat, lon) {
  const zone = lonToMgaZone(lon);
  const epsg = zone === 50 ? "EPSG:7850" : "EPSG:7851";
  const [e, n] = proj4("EPSG:4326", epsg, [lon, lat]);
  return { zone, easting: e, northing: n };
}

function formatDateAU(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-AU");
}

function addressSummaryFromRow(r) {
  const a =
    (r?.full_address || "").trim() ||
    [r?.street_number, r?.street_name, r?.suburb].filter(Boolean).join(" ").trim() ||
    (r?.suburb || "").trim() ||
    "—";
  return a;
}

function norm(s) {
  return (s || "").toString().trim().replace(/\s+/g, " ");
}

function clientLabel(c) {
  const first = norm(c.first_name);
  const sur = norm(c.surname);
  const company = norm(c.company);

  const person = norm(`${first} ${sur}`).trim();
  if (company && person) return `${company} — ${person}`;
  if (company) return company;
  if (person) return person;
  return c.email || "Unnamed client";
}

function ClientSuggestionDropdown({ items, onPick }) {
  if (!items?.length) return null;

  return (
    <div
      style={{
        marginTop: 8,
        borderRadius: 14,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(20,20,25,0.95)",
        boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
        maxHeight: 280,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {items.map((c, idx) => (
        <button
          key={c.id ?? idx}
          className="btn-pill"
          style={{
            width: "100%",
            justifyContent: "flex-start",
            textAlign: "left",
            whiteSpace: "normal",
            borderRadius: 0,
            padding: "10px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            background: "transparent",
          }}
          type="button"
          onClick={() => onPick(c)}
        >
          <div>
            <div style={{ fontWeight: 950, letterSpacing: 0.2 }}>{clientLabel(c)}</div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
              {(c.mobile || c.phone || "—")} · {(c.email || "—")}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function JobModal({ open, mode, isAdmin, onClose, onSaved, initial, staffOptions }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [jobTypeLegacy, setJobTypeLegacy] = useState(initial?.job_type_legacy ?? "");
  const [jobDateLegacy, setJobDateLegacy] = useState(initial?.job_date_legacy ?? "");
  const [lotNumber, setLotNumber] = useState(initial?.lot_number ?? "");
  const [planNumber, setPlanNumber] = useState(initial?.plan_number ?? "");
  const [streetNumber, setStreetNumber] = useState(initial?.street_number ?? "");
  const [streetName, setStreetName] = useState(initial?.street_name ?? "");
  const [suburb, setSuburb] = useState(initial?.suburb ?? "");
  const [localAuthority, setLocalAuthority] = useState(initial?.local_authority ?? "");
  const [mapRef, setMapRef] = useState(initial?.map_ref ?? "");
  const [ct, setCt] = useState(initial?.ct ?? "");

  // ✅ Client snapshot fields on jobs
  const [clientFirstName, setClientFirstName] = useState(initial?.client_first_name ?? "");
  const [clientSurname, setClientSurname] = useState(initial?.client_surname ?? "");
  const [clientCompany, setClientCompany] = useState(initial?.client_company ?? "");
  const [clientPhone, setClientPhone] = useState(initial?.client_phone ?? "");
  const [clientMobile, setClientMobile] = useState(initial?.client_mobile ?? "");
  const [clientEmail, setClientEmail] = useState(initial?.client_email ?? "");

  // Keep legacy job columns (still used in your summaries / older data)
  const [clientName, setClientName] = useState(initial?.client_name ?? "");

  const [status, setStatus] = useState(initial?.status ?? "Planned");
  const [assignedTo, setAssignedTo] = useState(initial?.assigned_to ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const [fullAddress, setFullAddress] = useState(initial?.full_address ?? "");
  const [placeId, setPlaceId] = useState(initial?.place_id ?? "");

  const [mgaZone, setMgaZone] = useState(initial?.mga_zone ?? "");
  const [mgaE, setMgaE] = useState(initial?.mga_easting ?? "");
  const [mgaN, setMgaN] = useState(initial?.mga_northing ?? "");

  // ✅ Client autocomplete state
  const [clientSearch, setClientSearch] = useState("");
  const [clientSuggestions, setClientSuggestions] = useState([]);
  const [clientSearching, setClientSearching] = useState(false);
  const clientDebounceRef = useRef(null);

  const addressInputRef = useRef(null);
  const autocompleteRef = useRef(null);

  const canEdit = isAdmin && (mode === "new" || mode === "edit");

  // Prevent background scroll when the modal is open (better UX on phones)
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError("");

    setJobTypeLegacy(initial?.job_type_legacy ?? "");
    setJobDateLegacy(initial?.job_date_legacy ?? "");
    setLotNumber(initial?.lot_number ?? "");
    setPlanNumber(initial?.plan_number ?? "");
    setStreetNumber(initial?.street_number ?? "");
    setStreetName(initial?.street_name ?? "");
    setSuburb(initial?.suburb ?? "");
    setLocalAuthority(initial?.local_authority ?? "");
    setMapRef(initial?.map_ref ?? "");
    setCt(initial?.ct ?? "");

    setClientFirstName(initial?.client_first_name ?? "");
    setClientSurname(initial?.client_surname ?? "");
    setClientCompany(initial?.client_company ?? "");
    setClientPhone(initial?.client_phone ?? "");
    setClientMobile(initial?.client_mobile ?? "");
    setClientEmail(initial?.client_email ?? "");
    setClientName(initial?.client_name ?? "");

    setStatus(initial?.status ?? "Planned");
    setAssignedTo(initial?.assigned_to ?? "");
    setNotes(initial?.notes ?? "");

    setFullAddress(initial?.full_address ?? "");
    setPlaceId(initial?.place_id ?? "");

    setMgaZone(initial?.mga_zone ?? "");
    setMgaE(initial?.mga_easting ?? "");
    setMgaN(initial?.mga_northing ?? "");

    setClientSearch("");
    setClientSuggestions([]);
  }, [open, initial]);

  // Google Places
  useEffect(() => {
    if (!open) return;

    if (!apiKey) {
      setError("Missing VITE_GOOGLE_MAPS_API_KEY. Add it to env vars and redeploy.");
      return;
    }

    let cancelled = false;

    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled) return;
        if (!addressInputRef.current) return;
        if (!window.google?.maps?.places?.Autocomplete) return;
        if (autocompleteRef.current) return;

        const ac = new window.google.maps.places.Autocomplete(addressInputRef.current, {
          fields: ["formatted_address", "place_id", "geometry"],
          types: ["address"],
          componentRestrictions: { country: "au" },
        });

        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          const formatted = place?.formatted_address ?? "";
          const pid = place?.place_id ?? "";
          const lat = place?.geometry?.location?.lat?.();
          const lng = place?.geometry?.location?.lng?.();

          setFullAddress(formatted);
          setPlaceId(pid);

          if (typeof lat === "number" && typeof lng === "number") {
            const mga = wgsToMga(lat, lng);
            setMgaZone(mga.zone);
            setMgaE(mga.easting.toFixed(3));
            setMgaN(mga.northing.toFixed(3));
          }
        });

        autocompleteRef.current = ac;
      })
      .catch((e) => setError(e?.message || "Google Maps failed to load."));

    return () => {
      cancelled = true;
    };
  }, [open, apiKey]);

  async function runClientSearch(q) {
    const s = (q || "").trim();
    if (!s) {
      setClientSuggestions([]);
      return;
    }

    setClientSearching(true);
    try {
      const like = `%${s}%`;

      const { data, error: qErr } = await supabase
        .from("clients")
        .select("id, first_name, surname, company, phone, mobile, email")
        .eq("is_active", true)
        .eq("show_in_contacts", true)
        .or(
          [
            `first_name.ilike.${like}`,
            `surname.ilike.${like}`,
            `company.ilike.${like}`,
            `phone.ilike.${like}`,
            `mobile.ilike.${like}`,
            `email.ilike.${like}`,
          ].join(",")
        )
        .limit(10);

      if (qErr) throw qErr;
      setClientSuggestions(data || []);
    } catch (e) {
      console.error("Client search failed:", e);
      setClientSuggestions([]);
    } finally {
      setClientSearching(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    if (clientDebounceRef.current) clearTimeout(clientDebounceRef.current);
    clientDebounceRef.current = setTimeout(() => runClientSearch(clientSearch), 180);
    return () => clientDebounceRef.current && clearTimeout(clientDebounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientSearch, open]);

  function pickClient(c) {
    const fn = norm(c.first_name);
    const sn = norm(c.surname);
    const full = norm(`${fn} ${sn}`).trim();

    setClientFirstName(fn);
    setClientSurname(sn);
    setClientCompany(norm(c.company));
    setClientPhone(norm(c.phone));
    setClientMobile(norm(c.mobile));
    setClientEmail(norm(c.email));

    // Keep legacy `client_name` populated for any old screens/search logic you already rely on
    setClientName(full || norm(c.company) || norm(c.email) || "");

    setClientSearch(clientLabel(c));
    setClientSuggestions([]);
  }
  // -----------------------------
  // Sticker printing (admin only)
  // Uses hidden iframe (reliable in Chrome + mobile)
  // -----------------------------

  function stickerDate(v) {
    if (!v) return "";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString("en-AU");
  }

  function escapeHtml(str) {
    return (str || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Prefer Google formatted address (full_address) for the sticker.
  // Returns the "street part" only (before first comma), optionally prefixed with LOT.
  function deriveStickerSiteAddress(job) {
    const j = job || {};
    const lot = (j.lot_number ?? lotNumber ?? "").toString().trim();
    const fa = (j.full_address ?? fullAddress ?? "").toString().trim();

    // Google formatted address typically: "123 Street Name, Suburb WA 6020, Australia"
    let streetPart = "";
    if (fa) {
      streetPart = fa.split(",")[0]?.trim() || "";
    }

    if (!streetPart) {
      // Fallback to structured fields
      const sn = (j.street_number ?? streetNumber ?? "").toString().trim();
      const st = (j.street_name ?? streetName ?? "").toString().trim();
      streetPart = [sn, st].filter(Boolean).join(" ").trim();
    }

    const parts = [];
    if (lot) parts.push(`LOT ${lot}`);
    if (streetPart) parts.push(streetPart);

    // If we *still* don't have anything, fall back to full address as-is
    if (!parts.length && fa) return fa;

    return parts.join(", ");
  }

  // Extract suburb from Google formatted address if suburb field is empty.
  // Attempts to handle "Suburb WA 6020" patterns.
  function parseSuburbFromFullAddress(fullAddr) {
    const fa = (fullAddr || "").toString().trim();
    if (!fa) return "";

    const parts = fa.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) return "";

    // second segment is usually "Suburb WA 6020"
    let candidate = parts[1];

    // Remove state/postcode if present
    // e.g. "Duncraig WA 6023" -> "Duncraig"
    candidate = candidate.replace(/\s+WA\s+\d{4}.*$/i, "").trim();
    candidate = candidate.replace(/\s+\d{4}.*$/i, "").trim();

    // If still has WA
    candidate = candidate.replace(/\s+WA\s*$/i, "").trim();

    return candidate;
  }

function buildStickerHtml(jobForPrint) {
  const j = jobForPrint || {};

  const jobNumberText = j.job_number != null ? String(j.job_number) : "";
  const jobTypeText = (j.job_type_legacy || "").toString();
  const dateText = stickerDate(j.job_date_legacy);

  const clientText = (j.client_company || "").toString();
  const contactText =
    (`${(j.client_first_name || "").toString()} ${(j.client_surname || "").toString()}`.trim() ||
      (j.client_name || "").toString());

  const telephoneText = (j.client_phone || "").toString();
  const mobileText = (j.client_mobile || "").toString();

 // Sticker SITE ADDRESS: Lot + street only (no suburb/state/postcode)
const siteAddressText = deriveStickerSiteAddress(j);

  // Suburb: use field first, otherwise derive from full_address "..., SUBURB STATE POSTCODE, Australia"
  let suburbText = (j.suburb || "").toString().trim();
  if (!suburbText && j.full_address) {
    const parts = j.full_address.split(",").map((p) => p.trim()).filter(Boolean);
    // Commonly: [street, suburb state postcode, Australia]
    if (parts.length >= 3) {
      const mid = parts[parts.length - 2]; // "Hillarys WA 6025"
      suburbText = (mid.split(" WA ")[0] || mid.split(" W.A. ")[0] || mid).trim();
      // If still has postcode/state format, take first token group as suburb
      suburbText = suburbText.replace(/\s+(WA|W\.A\.)\s+\d{4}$/i, "").trim();
    }
  }

  const planText = (j.plan_number || "").toString();
  const ctText = (j.ct || "").toString();
  const authorityText = (j.local_authority || "").toString();
  const commentsText = (j.notes || "").toString();

  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Job Sticker</title>
    <style>
      @page { size: A4 landscape; margin: 0; }

      html, body { width: 297mm; height: 210mm; }
      body {
        margin: 0;
        font-family: "Times New Roman", Times, serif;
        color: #000;
      }

      /* A4 landscape page */
      .page {
        width: 297mm;
        height: 210mm;
        box-sizing: border-box;
        padding-top: 10mm;  /* your measured top margin */
        padding-left: 9mm;  /* your measured left margin */
      }

      /* Top-left label area only (Avery L7169 / PPS 4-up) */
      .label-box {
  width: 139mm;
  height: 84mm; /* ≈ 4/5ths of original height */
  box-sizing: border-box;
  overflow: hidden;
}

     .row {
  display: flex;
  align-items: flex-start;
  margin-bottom: 1.2mm;
}

.row:last-child {
  margin-bottom: 0; /* comments row doesn't waste space */
}

      /* Left headers: NOT bold */
      .label {
        width: 50mm;
        font-size: 12pt;
        font-weight: normal;
        white-space: nowrap;
      }

      /* Right values: bold */
      .value {
        flex: 1;
        font-size: 14pt;
        font-weight: bold;
        line-height: 1.1;
      }

   .value.address {
  font-size: 13pt;
  line-height: 1.1;
}

.value.comments {
  font-size: 10pt;
  line-height: 1.05;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

    </style>
  </head>

  <body>
    <div class="page">
      <div class="label-box">
        <div class="row"><div class="label">JOB NUMBER:</div><div class="value">${escapeHtml(jobNumberText)}</div></div>
        <div class="row"><div class="label">JOB TYPE:</div><div class="value">${escapeHtml(jobTypeText)}</div></div>
        <div class="row"><div class="label">DATE:</div><div class="value">${escapeHtml(dateText)}</div></div>
        <div class="row"><div class="label">CLIENT:</div><div class="value">${escapeHtml(clientText)}</div></div>
        <div class="row"><div class="label">CONTACT:</div><div class="value">${escapeHtml(contactText)}</div></div>
        <div class="row"><div class="label">TELEPHONE:</div><div class="value">${escapeHtml(telephoneText)}</div></div>
        <div class="row"><div class="label">MOBILE:</div><div class="value">${escapeHtml(mobileText)}</div></div>
        <div class="row"><div class="label">SITE ADDRESS:</div><div class="value address">${escapeHtml(siteAddressText)}</div></div>
        <div class="row"><div class="label">SUBURB:</div><div class="value">${escapeHtml(suburbText)}</div></div>
        <div class="row"><div class="label">PLAN:</div><div class="value">${escapeHtml(planText)}</div></div>
        <div class="row"><div class="label">C/T:</div><div class="value">${escapeHtml(ctText)}</div></div>
        <div class="row"><div class="label">AUTHORITY:</div><div class="value">${escapeHtml(authorityText)}</div></div>
        <div class="row"><div class="label">JOB COMMENTS:</div><div class="value comments">${escapeHtml(commentsText)}</div></div>
      </div>
    </div>

    <script>
      setTimeout(() => { window.focus(); window.print(); }, 250);
    </script>
  </body>
</html>
`;
}

  async function handlePrintSticker() {
    if (!canEdit) return;

    const ok = window.confirm("Save this job before printing the sticker?");
    if (!ok) return;

    const saved = await handleSave({ closeAfter: true, returnSaved: true });
    if (!saved) {
      alert("Could not save job. Sticker not printed.");
      return;
    }

    const html = buildStickerHtml(saved);

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.visibility = "hidden";
    iframe.srcdoc = html;

    document.body.appendChild(iframe);

    const cleanup = () => {
      try {
        if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
      } catch {}
    };

    iframe.onload = () => {
      try {
        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(cleanup, 2000);
        }, 150);
      } catch (e) {
        cleanup();
        alert("Print failed to start. Please try again.");
      }
    };
  }


  async function handleSave(opts = {}) {
    if (!canEdit) return;

    const closeAfter = opts.closeAfter !== false;
    const returnSaved = !!opts.returnSaved;

    setSaving(true);
    setError("");

    try {
      const payload = {
        job_type_legacy: jobTypeLegacy?.trim() || null,
        job_date_legacy: jobDateLegacy || null,
        lot_number: lotNumber?.trim() || null,
        plan_number: planNumber?.trim() || null,
        street_number: streetNumber?.trim() || null,
        street_name: streetName?.trim() || null,
        suburb: suburb?.trim() || null,
        local_authority: localAuthority?.trim() || null,
        map_ref: mapRef?.trim() || null,
        ct: ct?.trim() || null,

        client_first_name: clientFirstName?.trim() || null,
        client_surname: clientSurname?.trim() || null,
        client_company: clientCompany?.trim() || null,
        client_phone: clientPhone?.trim() || null,
        client_mobile: clientMobile?.trim() || null,
        client_email: clientEmail?.trim() || null,

        client_name: clientName?.trim() || null, // legacy

        status,
        assigned_to: assignedTo?.trim() || null,
        notes: notes?.trim() || null,

        full_address: fullAddress?.trim() || null,
        place_id: placeId?.trim() || null,

        mga_zone: mgaZone ? Number(mgaZone) : null,
        mga_easting: mgaE ? Number(mgaE) : null,
        mga_northing: mgaN ? Number(mgaN) : null,
      };

      if (mode === "new") {
        const { data, error: rpcErr } = await supabase.rpc("create_job", {
          p_job_type_legacy: payload.job_type_legacy,
          p_job_date_legacy: payload.job_date_legacy,
          p_lot_number: payload.lot_number,
          p_plan_number: payload.plan_number,
          p_street_number: payload.street_number,
          p_street_name: payload.street_name,
          p_suburb: payload.suburb,
          p_local_authority: payload.local_authority,
          p_map_ref: payload.map_ref,
          p_ct: payload.ct,

          // RPC compatibility: still send these
          p_client_name: payload.client_name,
          p_client_phone: payload.client_mobile || payload.client_phone,
          p_status: payload.status,
          p_assigned_to: payload.assigned_to,
          p_notes: payload.notes,

          p_full_address: payload.full_address,
          p_place_id: payload.place_id,
          p_mga_zone: payload.mga_zone,
          p_mga_easting: payload.mga_easting,
          p_mga_northing: payload.mga_northing,
        });

        if (rpcErr) throw rpcErr;

        const created = Array.isArray(data) ? data[0] : data;

        // Best-effort: write the extra client snapshot fields post-create (if your RPC doesn't already)
        let createdMerged = created;
        if (created?.id) {
          const { error: upErr } = await supabase
            .from("jobs")
            .update({
              client_first_name: payload.client_first_name,
              client_surname: payload.client_surname,
              client_company: payload.client_company,
              client_phone: payload.client_phone,
              client_mobile: payload.client_mobile,
              client_email: payload.client_email,
              client_name: payload.client_name,
            })
            .eq("id", created.id);

          if (upErr) console.warn("Post-create client snapshot update failed:", upErr);

          createdMerged = { ...created, ...payload };
          onSaved?.(createdMerged);
        } else {
          onSaved?.(created);
        }

        if (closeAfter) onClose();
        return returnSaved ? (createdMerged || created) : undefined;
      }

      const { error: upErr } = await supabase.from("jobs").update(payload).eq("id", initial.id);
      if (upErr) throw upErr;

      const updated = { ...initial, ...payload };
      onSaved?.(updated);
      if (closeAfter) onClose();
      return returnSaved ? updated : undefined;
    } catch (e) {
      setError(e?.message || "Failed to save job.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const staffDisplay = (staffOptions || []).map((s) => ({
    id: s.id,
    display_name: s.display_name,
  }));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        className="card"
        style={{
          width: "min(980px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          padding: "1rem",
          borderRadius: 16,
          boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <h3 className="card-title" style={{ marginBottom: 4 }}>
              {mode === "new" ? "New Job" : "Edit Job"}
            </h3>
            <p className="card-subtitle" style={{ margin: 0 }}>
              {mode === "new" ? "Create a new job record" : `Job #${initial?.job_number ?? "—"}`}
            </p>
          </div>

          <button className="btn-pill" onClick={onClose} type="button">
            Close
          </button>
        </div>

        {error && (
          <div
            style={{
              marginTop: 10,
              padding: "0.7rem 0.8rem",
              borderRadius: 12,
              background: "rgba(255,0,0,0.08)",
              fontSize: "0.9rem",
            }}
          >
            {error}
          </div>
        )}

        <div className="jobmodal-grid" style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {/* Client */}
          <div style={{ padding: "10px 12px", borderRadius: 14, background: "rgba(255,255,255,0.04)" }}>
            <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 8 }}>Client</div>

            <div style={{ display: "grid", gap: 8 }}>
              {/* Type-to-search */}
              <input
                className="input"
                placeholder={`Search client… ${clientSearching ? "…" : ""}`}
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                onFocus={() => runClientSearch(clientSearch)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setClientSuggestions([]);
                }}
                disabled={!canEdit}
              />

              <ClientSuggestionDropdown items={clientSuggestions} onPick={pickClient} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <input className="input" placeholder="First name" value={clientFirstName} onChange={(e) => setClientFirstName(e.target.value)} disabled={!canEdit} />
                <input className="input" placeholder="Surname" value={clientSurname} onChange={(e) => setClientSurname(e.target.value)} disabled={!canEdit} />
              </div>

              <input className="input" placeholder="Company" value={clientCompany} onChange={(e) => setClientCompany(e.target.value)} disabled={!canEdit} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <input className="input" placeholder="Phone" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} disabled={!canEdit} />
                <input className="input" placeholder="Mobile" value={clientMobile} onChange={(e) => setClientMobile(e.target.value)} disabled={!canEdit} />
              </div>

              <input className="input" placeholder="Email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} disabled={!canEdit} />
            </div>
          </div>

          {/* Status / Assigned */}
          <div style={{ padding: "10px 12px", borderRadius: 14, background: "rgba(255,255,255,0.04)" }}>
            <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 8 }}>Status / Assigned</div>

            <div style={{ display: "grid", gap: 8 }}>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} disabled={!canEdit}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <select className="input" value={assignedTo || ""} onChange={(e) => setAssignedTo(e.target.value)} disabled={!canEdit}>
                <option value="">Unassigned</option>
                {staffDisplay.map((s) => (
                  <option key={s.id} value={s.display_name}>
                    {s.display_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Address */}
          <div style={{ gridColumn: "1 / -1", padding: "10px 12px", borderRadius: 14, background: "rgba(255,255,255,0.04)" }}>
            <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 8 }}>Address (Google autocomplete)</div>

            <div style={{ display: "grid", gap: 8 }}>
              <input
                ref={addressInputRef}
                className="input"
                placeholder="Start typing an address…"
                value={fullAddress || ""}
                onChange={(e) => setFullAddress(e.target.value)}
                disabled={!canEdit}
              />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <input className="input" placeholder="Street no" value={streetNumber} onChange={(e) => setStreetNumber(e.target.value)} disabled={!canEdit} />
                <input className="input" placeholder="Street name" value={streetName} onChange={(e) => setStreetName(e.target.value)} disabled={!canEdit} />
                <input className="input" placeholder="Suburb" value={suburb} onChange={(e) => setSuburb(e.target.value)} disabled={!canEdit} />
              </div>

              <div style={{ fontSize: 12, opacity: 0.75 }}>
                <b>place_id:</b> {placeId || "—"}
              </div>
            </div>
          </div>

          {/* Local authority / Job type / Job date */}
          <div style={{ padding: "10px 12px", borderRadius: 14, background: "rgba(255,255,255,0.04)" }}>
            <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 8 }}>Local authority</div>
            <select className="input" value={localAuthority || ""} onChange={(e) => setLocalAuthority(e.target.value)} disabled={!canEdit}>
              <option value="">—</option>
              {LOCAL_AUTHORITIES.map((la) => (
                <option key={la} value={la}>
                  {la}
                </option>
              ))}
            </select>
          </div>

          <div style={{ padding: "10px 12px", borderRadius: 14, background: "rgba(255,255,255,0.04)" }}>
            <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 8 }}>Job type / date</div>
            <div style={{ display: "grid", gap: 8 }}>
              <input className="input" placeholder="Job type" value={jobTypeLegacy} onChange={(e) => setJobTypeLegacy(e.target.value)} disabled={!canEdit} />
              <input className="input" type="date" value={jobDateLegacy ? String(jobDateLegacy).slice(0, 10) : ""} onChange={(e) => setJobDateLegacy(e.target.value)} disabled={!canEdit} />
            </div>
          </div>

          {/* Lot/Plan/CT + Map ref */}
          <div style={{ padding: "10px 12px", borderRadius: 14, background: "rgba(255,255,255,0.04)" }}>
            <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 8 }}>Lot / Plan / C/T</div>
            <div style={{ display: "grid", gap: 8 }}>
              <input className="input" placeholder="Lot" value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} disabled={!canEdit} />
              <input className="input" placeholder="Plan" value={planNumber} onChange={(e) => setPlanNumber(e.target.value)} disabled={!canEdit} />
              <input className="input" placeholder="C/T" value={ct} onChange={(e) => setCt(e.target.value)} disabled={!canEdit} />
            </div>
          </div>

          <div style={{ padding: "10px 12px", borderRadius: 14, background: "rgba(255,255,255,0.04)" }}>
            <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 8 }}>Map ref</div>
            <input className="input" placeholder="Map ref" value={mapRef} onChange={(e) => setMapRef(e.target.value)} disabled={!canEdit} />
          </div>

          {/* MGA */}
          <div style={{ gridColumn: "1 / -1", padding: "10px 12px", borderRadius: 14, background: "rgba(255,255,255,0.04)" }}>
            <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 8 }}>MGA (auto from Google address if available)</div>
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr", gap: 8 }}>
              <input className="input" placeholder="Zone" value={mgaZone} onChange={(e) => setMgaZone(e.target.value)} disabled={!canEdit} />
              <input className="input" placeholder="Easting" value={mgaE} onChange={(e) => setMgaE(e.target.value)} disabled={!canEdit} />
              <input className="input" placeholder="Northing" value={mgaN} onChange={(e) => setMgaN(e.target.value)} disabled={!canEdit} />
            </div>
          </div>

          {/* Notes */}
          <div style={{ gridColumn: "1 / -1", padding: "10px 12px", borderRadius: 14, background: "rgba(255,255,255,0.04)" }}>
            <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 8 }}>Notes</div>
            <textarea
              className="input"
              style={{ minHeight: 110, resize: "vertical", width: "100%" }}
              placeholder="Notes…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!canEdit}
            />
          </div>
        </div>

        <style>{`
          /* Jobs modal responsive */
          @media (max-width: 860px) {
            .jobmodal-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
          {isAdmin && (
            <button className="btn-pill" onClick={handlePrintSticker} type="button" disabled={!canEdit || saving}>
              Print Sticker
            </button>
          )}
          <button className="btn-pill" onClick={onClose} type="button">Cancel</button>
          <button className="btn-pill primary" onClick={handleSave} type="button" disabled={!canEdit || saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Jobs() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [err, setErr] = useState("");

  const [jobNoQuery, setJobNoQuery] = useState("");
  const [jobNoSuggestions, setJobNoSuggestions] = useState([]);
  const [jobNoLoading, setJobNoLoading] = useState(false);

  const [globalQuery, setGlobalQuery] = useState("");
  const [globalSuggestions, setGlobalSuggestions] = useState([]);
  const [globalLoading, setGlobalLoading] = useState(false);

  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState({ open: false, mode: "new" });

  const [staffOptions, setStaffOptions] = useState([]);
  const [totalJobs, setTotalJobs] = useState(0);

  const debounceJobNoRef = useRef(null);
  const debounceGlobalRef = useRef(null);

  // ✅ Deep-link / return flags
  const openedEditFromMapsRef = useRef(false);

  const queryFlags = useMemo(() => {
    const params = new URLSearchParams(location.search || "");
    const from = (params.get("from") || "").toLowerCase();
    const fromMaps = from === "maps" || params.get("fromMaps") === "1";
    const editRequested = params.get("edit") === "1" || (params.get("mode") || "").toLowerCase() === "edit";
    const jobParam = params.get("job") || "";
    return { fromMaps, editRequested, jobParam, params };
  }, [location.search]);

  async function fetchStaff() {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name")
        .order("display_name", { ascending: true })
        .limit(5000);
      if (error) throw error;
      setStaffOptions(
        (data || [])
          .filter((p) => (p.display_name || "").trim())
          .map((p) => ({ id: p.id, display_name: p.display_name }))
      );
    } catch {
      setStaffOptions([]);
    }
  }

  async function fetchTotalJobs() {
    const { count, error } = await supabase.from("jobs").select("id", { count: "exact", head: true });
    if (error) throw error;
    setTotalJobs(Number(count || 0));
  }

  async function fetchJobById(id) {
    if (!id) return null;

    const { data, error } = await supabase
      .from("jobs")
      .select(
        "id, job_number, client_name, client_first_name, client_surname, client_company, client_phone, client_mobile, client_email, status, assigned_to, notes, full_address, place_id, mga_zone, mga_easting, mga_northing, job_type_legacy, job_date_legacy, lot_number, plan_number, street_number, street_name, suburb, local_authority, map_ref, ct, created_at, updated_at"
      )
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }

  async function fetchJobByNumber(jobNumber) {
    const num = Number(jobNumber);
    if (!Number.isFinite(num)) return null;

    const { data, error } = await supabase
      .from("jobs")
      .select(
        "id, job_number, client_name, client_first_name, client_surname, client_company, client_phone, client_mobile, client_email, status, assigned_to, notes, full_address, place_id, mga_zone, mga_easting, mga_northing, job_type_legacy, job_date_legacy, lot_number, plan_number, street_number, street_name, suburb, local_authority, map_ref, ct, created_at, updated_at"
      )
      .eq("job_number", num)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }

  async function jumpToJobById(id) {
    setErr("");
    try {
      const job = await fetchJobById(id);
      if (job) setSelected(job);
      else setErr("No matching job found.");
      return job || null;
    } catch (e) {
      setErr(e?.message || "Could not load that job.");
      return null;
    }
  }

  async function jumpToJobByNumber(jobNumber) {
    setErr("");
    try {
      const job = await fetchJobByNumber(jobNumber);
      if (job) setSelected(job);
      else setErr("No matching job found.");
      return job || null;
    } catch (e) {
      setErr(e?.message || "Could not load that job.");
      return null;
    }
  }

  async function runJobNoSuggest(query) {
    const q = (query || "").trim();
    if (!q || !/^\d+$/.test(q)) {
      setJobNoSuggestions([]);
      return;
    }

    setJobNoLoading(true);
    try {
      const { data, error } = await supabase
        .from("jobs")
        .select("id, job_number, full_address, street_number, street_name, suburb")
        .like("job_number_text", `${q}%`)
        .order("job_number", { ascending: false })
        .limit(20);

      if (error) throw error;

      setJobNoSuggestions(
        (data || []).map((r) => ({
          id: r.id,
          job_number: r.job_number,
          address: addressSummaryFromRow(r),
        }))
      );
    } catch {
      setJobNoSuggestions([]);
    } finally {
      setJobNoLoading(false);
    }
  }

  async function runGlobalSuggest(query) {
    const q = (query || "").trim();
    if (!q) {
      setGlobalSuggestions([]);
      return;
    }

    setGlobalLoading(true);
    try {
      const { data, error } = await supabase
        .from("jobs")
        .select("id, job_number, full_address, street_number, street_name, suburb")
        .textSearch("search_tsv", q, { type: "plain" })
        .order("job_number", { ascending: false })
        .limit(20);

      if (error) throw error;

      setGlobalSuggestions(
        (data || []).map((r) => ({
          id: r.id,
          job_number: r.job_number,
          address: addressSummaryFromRow(r),
        }))
      );
    } catch {
      setGlobalSuggestions([]);
    } finally {
      setGlobalLoading(false);
    }
  }

  useEffect(() => {
    if (debounceJobNoRef.current) clearTimeout(debounceJobNoRef.current);
    debounceJobNoRef.current = setTimeout(() => runJobNoSuggest(jobNoQuery), 160);
    return () => debounceJobNoRef.current && clearTimeout(debounceJobNoRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobNoQuery]);

  useEffect(() => {
    if (debounceGlobalRef.current) clearTimeout(debounceGlobalRef.current);
    debounceGlobalRef.current = setTimeout(() => runGlobalSuggest(globalQuery), 180);
    return () => debounceGlobalRef.current && clearTimeout(debounceGlobalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalQuery]);

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([fetchStaff(), fetchTotalJobs()]);
      } catch (e) {
        setErr(e?.message || "Failed to load Jobs page.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Deep-link support: /jobs?job=12345 (+ optional from=maps&edit=1)
  useEffect(() => {
    const jobParam = (queryFlags.jobParam || "").trim();
    if (!jobParam) return;

    // Keep the UI consistent: show what was asked for
    setJobNoQuery(jobParam);
    setJobNoSuggestions([]);
    setGlobalSuggestions([]);

    (async () => {
      const job = await jumpToJobByNumber(jobParam);
      if (!job) return;

      // ✅ Auto-open edit modal if requested and admin
      if (
        queryFlags.fromMaps &&
        queryFlags.editRequested &&
        isAdmin &&
        !openedEditFromMapsRef.current
      ) {
        openedEditFromMapsRef.current = true;
        setModal({ open: true, mode: "edit" });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryFlags.jobParam, queryFlags.fromMaps, queryFlags.editRequested, isAdmin]);

  const actions = (
    <>
      {isAdmin && (
        <button className="btn-pill primary" type="button" onClick={() => setModal({ open: true, mode: "new" })}>
          New job
        </button>
      )}
    </>
  );

  const mapsHref = useMemo(() => {
    if (!selected) return "";
    const params = new URLSearchParams();

    if (selected.job_number != null) params.set("job", String(selected.job_number));
    if (selected.place_id) params.set("place_id", String(selected.place_id));
    if (selected.full_address) params.set("address", String(selected.full_address));
    if (selected.mga_zone != null) params.set("zone", String(selected.mga_zone));
    if (selected.mga_easting != null) params.set("e", String(selected.mga_easting));
    if (selected.mga_northing != null) params.set("n", String(selected.mga_northing));

    return `/maps?${params.toString()}`;
  }, [selected]);

  const headerStatusText = useMemo(() => {
    if (totalJobs) return `Total jobs in register: ${totalJobs.toLocaleString()}`;
    return "Total jobs in register: —";
  }, [totalJobs]);

  const showBackToMaps = queryFlags.fromMaps;

  const handleBackToMaps = () => {
    // Best UX: go back in history if we came directly from maps
    // This preserves zoom/position in SPA flows, and Maps also persists view in localStorage.
    try {
      if (window.history.length > 1) {
        navigate(-1);
        return;
      }
    } catch {
      // ignore
    }
    navigate("/maps");
  };

  return (
    <PageLayout
      title="Jobs"
      subtitle="Search → select → view → edit"
      actions={
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {showBackToMaps && (
            <button className="btn-pill" type="button" onClick={handleBackToMaps} title="Back to Maps (preserves your last map view)">
              ← Back to Maps
            </button>
          )}
          {actions}
        </div>
      }
    >
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h3 className="card-title" style={{ marginBottom: 6 }}>Find a job</h3>
            <div style={{ fontSize: 12, opacity: 0.75 }}>{headerStatusText}</div>
          </div>

          <button
            className="btn-pill"
            type="button"
            onClick={async () => {
              setErr("");
              setSelected(null);
              setJobNoQuery("");
              setGlobalQuery("");
              setJobNoSuggestions([]);
              setGlobalSuggestions([]);
              try {
                await fetchTotalJobs();
              } catch (e) {
                setErr(e?.message || "Failed to refresh total job count.");
              }
            }}
            title="Clear search + refresh total job count"
          >
            Refresh
          </button>
        </div>

        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }} className="jobs-two-col">
          {/* Quick find */}
          <div style={{ padding: "10px 12px", borderRadius: 14, background: "rgba(255,255,255,0.04)" }}>
            <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 6 }}>
              Quick find (job number){jobNoLoading ? "…" : ""}
            </div>

            <input
              className="input"
              placeholder="Type job number… (e.g. 25123)"
              inputMode="numeric"
              pattern="[0-9]*"
              value={jobNoQuery}
              onChange={(e) => setJobNoQuery(e.target.value)}
              onFocus={() => runJobNoSuggest(jobNoQuery)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setJobNoSuggestions([]);
                  jumpToJobByNumber(jobNoQuery);
                }
                if (e.key === "Escape") setJobNoSuggestions([]);
              }}
            />

            {jobNoSuggestions.length > 0 && (
              <div style={{ marginTop: 8, borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(20,20,25,0.95)" }}>
                {jobNoSuggestions.map((j) => (
                  <button
                    key={j.id}
                    className="btn-pill"
                    style={{ width: "100%", justifyContent: "flex-start", borderRadius: 0, padding: "10px 12px", background: "transparent" }}
                    type="button"
                    onClick={() => {
                      setJobNoQuery(String(j.job_number));
                      setJobNoSuggestions([]);
                      jumpToJobByNumber(j.job_number);
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 950 }}>#{j.job_number}</div>
                      <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>{j.address}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Global search */}
          <div style={{ padding: "10px 12px", borderRadius: 14, background: "rgba(255,255,255,0.04)" }}>
            <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 6 }}>
              Global search{globalLoading ? "…" : ""}
            </div>

            <input
              className="input"
              placeholder="Start typing… (client, suburb, lot/plan, notes, etc.)"
              value={globalQuery}
              onChange={(e) => setGlobalQuery(e.target.value)}
              onFocus={() => runGlobalSuggest(globalQuery)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (globalSuggestions.length === 1) {
                    const only = globalSuggestions[0];
                    setGlobalSuggestions([]);
                    jumpToJobById(only.id);
                  }
                }
                if (e.key === "Escape") setGlobalSuggestions([]);
              }}
            />

            {globalSuggestions.length > 0 && (
              <div style={{ marginTop: 8, borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(20,20,25,0.95)" }}>
                {globalSuggestions.map((j) => (
                  <button
                    key={j.id}
                    className="btn-pill"
                    style={{ width: "100%", justifyContent: "flex-start", borderRadius: 0, padding: "10px 12px", background: "transparent" }}
                    type="button"
                    onClick={() => {
                      setGlobalQuery(`#${j.job_number}`);
                      setGlobalSuggestions([]);
                      jumpToJobById(j.id);
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 950 }}>#{j.job_number}</div>
                      <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>{j.address}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <style>{`
          @media (max-width: 860px) {
            .jobs-two-col { grid-template-columns: 1fr !important; }
            .jobs-selected-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>

        {err ? (
          <div style={{ marginTop: 12, padding: "0.7rem 0.8rem", borderRadius: 12, background: "rgba(255,0,0,0.08)", fontSize: "0.9rem" }}>
            {err}
          </div>
        ) : null}

        {!selected && (
          <div style={{ marginTop: 12, padding: "0.8rem", opacity: 0.8 }}>
            Select a job from <b>Quick find</b> or <b>Global search</b> to view details.
          </div>
        )}
      </div>

      {/* Selected job summary */}
      {selected && (
        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <h3 className="card-title" style={{ marginBottom: 4 }}>Job #{selected.job_number}</h3>
              <p className="card-subtitle" style={{ margin: 0 }}>
                {(selected.client_company || selected.client_name || "—")} · {selected.status || "—"} · {selected.assigned_to || "Unassigned"}
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn-pill" type="button" onClick={() => mapsHref && navigate(mapsHref)}>
                View in Maps
              </button>

              {isAdmin && (
                <button className="btn-pill primary" type="button" onClick={() => setModal({ open: true, mode: "edit" })}>
                  Edit
                </button>
              )}

              <button className="btn-pill" type="button" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
          </div>

          <div className="jobs-selected-grid" style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.85 }}>Client</div>
              <div style={{ marginTop: 4 }}>
                {selected.client_first_name || selected.client_surname
                  ? `${selected.client_first_name || ""} ${selected.client_surname || ""}`.trim()
                  : (selected.client_name || "—")}
              </div>
              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.85 }}>{selected.client_company || "—"}</div>
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                {(selected.client_mobile || selected.client_phone || "—")} · {(selected.client_email || "—")}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.85 }}>Status / Assigned</div>
              <div style={{ marginTop: 4 }}><b>Status:</b> {selected.status || "—"}</div>
              <div style={{ marginTop: 4 }}><b>Assigned:</b> {selected.assigned_to || "—"}</div>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.85 }}>Address</div>
              <div style={{ marginTop: 4 }}>{selected.full_address || addressSummaryFromRow(selected)}</div>
              <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>place_id: {selected.place_id || "—"}</div>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.85 }}>Notes</div>
              <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{selected.notes || "—"}</div>
            </div>
          </div>
        </div>
      )}

      <JobModal
        open={modal.open}
        mode={modal.mode}
        isAdmin={isAdmin}
        staffOptions={staffOptions}
        initial={modal.mode === "edit" ? selected : null}
        onClose={() => setModal({ open: false, mode: "new" })}
        onSaved={async (updatedOrCreated) => {
          if (updatedOrCreated?.id) {
            setSelected((prev) =>
              prev?.id === updatedOrCreated.id ? { ...prev, ...updatedOrCreated } : prev
            );
          }
          try {
            await fetchTotalJobs();
          } catch {}
        }}
      />
    </PageLayout>
  );
}

export default Jobs;
