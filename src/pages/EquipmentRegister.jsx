import { useCallback, useEffect, useMemo, useState } from "react";
import PageLayout from "../components/PageLayout.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";

const EQUIPMENT_TYPES = [
  "Computer",
  "Controller",
  "Digital Level",
  "Disto",
  "GNSS Antenna",
  "Metal Detector",
  "Phone",
  "Prism",
  "Radio Handle",
  "Total Station",
  "Vehicle",
];

const SET_NUMBER_TYPES = new Set(["Controller", "Prism", "Radio Handle", "Total Station"]);
const SET_NUMBERS = ["-", "5", "6", "7", "8", "9"];
const MAX_ATTACHMENT_SIZE_BYTES = 15 * 1024 * 1024;
const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  "csv",
  "doc",
  "docx",
  "gif",
  "heic",
  "heif",
  "jpeg",
  "jpg",
  "pdf",
  "png",
  "rtf",
  "txt",
  "webp",
  "xls",
  "xlsx",
]);
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  "application/msword",
  "application/pdf",
  "application/rtf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/plain",
]);

const EMPTY_EQUIPMENT = {
  equipment_type: "Computer",
  make: "",
  model: "",
  year: "",
  vehicle_last_service_odometer: "",
  serial_number: "",
  registration_number: "",
  assigned_to: "",
  set_number: "",
  notes: "",
};

function hasYear(type) {
  return !["Disto", "Metal Detector"].includes(type);
}

function hasSerial(type) {
  return type !== "Vehicle";
}

function hasRegistration(type) {
  return type === "Vehicle";
}

function hasVehicleLastServiceOdometer(type) {
  return type === "Vehicle";
}

function hasSetNumber(type) {
  return SET_NUMBER_TYPES.has(type);
}

function setNumberFormValue(value) {
  return value == null || value === "-" ? "" : String(value);
}

function setNumberPayloadValue(type, value) {
  if (!hasSetNumber(type)) return null;
  const normalized = setNumberFormValue(value);
  return normalized ? Number(normalized) : null;
}

function vehicleLastServiceOdometerFormValue(value) {
  return value == null ? "" : String(value);
}

function vehicleLastServiceOdometerPayloadValue(type, value) {
  if (!hasVehicleLastServiceOdometer(type)) return null;
  const normalized = String(value || "").trim();
  return normalized ? Number.parseInt(normalized, 10) : null;
}

function safeFileName(name = "attachment") {
  return String(name)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "attachment";
}

function fileExtension(fileName = "") {
  const parts = String(fileName).toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() : "";
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isAllowedAttachment(file) {
  const mimeType = String(file?.type || "").toLowerCase();
  const ext = fileExtension(file?.name);
  return ALLOWED_ATTACHMENT_MIME_TYPES.has(mimeType) || ALLOWED_ATTACHMENT_EXTENSIONS.has(ext);
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-AU");
}

function displayProfile(profileMap, id) {
  const profile = profileMap.get(id);
  return profile?.name || "Unassigned";
}

function ConfirmationModal({ open, title, message, confirmLabel, busy, onCancel, onConfirm }) {
  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-card equipment-confirm-card" role="dialog" aria-modal="true" aria-labelledby="equipment-confirm-title">
        <div className="modal-header">
          <h3 id="equipment-confirm-title">{title}</h3>
        </div>
        <p className="equipment-confirm-message">{message}</p>
        <div className="modal-actions">
          <button className="btn-pill" type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn-pill danger" type="button" onClick={onConfirm} disabled={busy}>
            {busy ? "Deleting..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function EquipmentRegister() {
  const { user, profile, displayName, isAdmin } = useAuth();

  const [profiles, setProfiles] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [serviceRows, setServiceRows] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("__my__");
  const [equipmentTypeFilter, setEquipmentTypeFilter] = useState("__all__");
  const [refreshKey, setRefreshKey] = useState(0);
  const [equipmentModal, setEquipmentModal] = useState({ open: false, mode: "new", item: null });
  const [equipmentForm, setEquipmentForm] = useState(EMPTY_EQUIPMENT);
  const [serviceModal, setServiceModal] = useState({ open: false, item: null });
  const [serviceForm, setServiceForm] = useState({ service_date: "", notes: "", files: [] });
  const [confirmModal, setConfirmModal] = useState({
    open: false,
    title: "",
    message: "",
    confirmLabel: "Delete",
    onConfirm: null,
  });

  const myProfileId = profile?.id || user?.id || "";

  const profileOptions = useMemo(
    () => profiles.map((p) => ({ id: p.id, name: p.display_name || p.email || "Unnamed" })),
    [profiles]
  );

  const profileMap = useMemo(() => {
    const map = new Map();
    profileOptions.forEach((p) => map.set(p.id, p));
    return map;
  }, [profileOptions]);

  const effectiveAssignedFilter = useMemo(() => {
    if (assignedFilter === "__all__") return "__all__";
    if (assignedFilter === "__my__") return myProfileId || "";
    return assignedFilter;
  }, [assignedFilter, myProfileId]);

  const serviceByEquipment = useMemo(() => {
    const map = new Map();
    serviceRows.forEach((row) => {
      const list = map.get(row.equipment_id) || [];
      list.push(row);
      map.set(row.equipment_id, list);
    });
    map.forEach((list) =>
      list.sort((a, b) => String(b.service_date || "").localeCompare(String(a.service_date || "")))
    );
    return map;
  }, [serviceRows]);

  const attachmentsByService = useMemo(() => {
    const map = new Map();
    attachments.forEach((row) => {
      const list = map.get(row.service_history_id) || [];
      list.push(row);
      map.set(row.service_history_id, list);
    });
    return map;
  }, [attachments]);

  const filteredEquipment = useMemo(() => {
    const q = search.trim().toLowerCase();
    return equipment.filter((item) => {
      if (effectiveAssignedFilter !== "__all__" && item.assigned_to !== effectiveAssignedFilter) {
        return false;
      }

      if (equipmentTypeFilter !== "__all__" && item.equipment_type !== equipmentTypeFilter) {
        return false;
      }

      if (!q) return true;

      const haystack = [
        item.equipment_type,
        item.make,
        item.model,
        item.year,
        item.serial_number,
        item.registration_number,
        String(item.set_number ?? "-"),
        item.notes,
        displayProfile(profileMap, item.assigned_to),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [equipment, effectiveAssignedFilter, equipmentTypeFilter, profileMap, search]);

  const loadProfiles = useCallback(async () => {
    const { data, error: pErr } = await supabase
      .from("profiles")
      .select("id, display_name, email, is_active")
      .eq("is_active", true)
      .order("display_name", { ascending: true });

    if (pErr) throw pErr;
    setProfiles(data || []);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      await loadProfiles();

      const { data: eqRows, error: eqErr } = await supabase
        .from("equipment_register")
        .select("*")
        .order("equipment_type", { ascending: true })
        .order("make", { ascending: true })
        .order("model", { ascending: true });

      if (eqErr) throw eqErr;

      const ids = (eqRows || []).map((row) => row.id);
      let historyRows = [];
      let attachmentRows = [];

      if (ids.length) {
        const { data: hRows, error: hErr } = await supabase
          .from("equipment_service_history")
          .select("*")
          .in("equipment_id", ids)
          .order("service_date", { ascending: false });

        if (hErr) throw hErr;
        historyRows = hRows || [];

        const historyIds = historyRows.map((row) => row.id);
        if (historyIds.length) {
          const { data: aRows, error: aErr } = await supabase
            .from("equipment_service_attachments")
            .select("*")
            .in("service_history_id", historyIds)
            .order("created_at", { ascending: true });

          if (aErr) throw aErr;
          attachmentRows = aRows || [];
        }
      }

      setEquipment(eqRows || []);
      setServiceRows(historyRows);
      setAttachments(attachmentRows);
    } catch (err) {
      console.error("Equipment register load failed:", err);
      setError(err?.message || "Failed to load equipment register.");
    } finally {
      setLoading(false);
    }
  }, [loadProfiles]);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [loadData, refreshKey, user]);

  const handleRefresh = () => {
    setSearch("");
    setAssignedFilter("__my__");
    setEquipmentTypeFilter("__all__");
    setEquipmentModal({ open: false, mode: "new", item: null });
    setServiceModal({ open: false, item: null });
    setConfirmModal({ open: false, title: "", message: "", confirmLabel: "Delete", onConfirm: null });
    setRefreshKey((key) => key + 1);
  };

  const closeConfirmModal = () => {
    if (saving) return;
    setConfirmModal({ open: false, title: "", message: "", confirmLabel: "Delete", onConfirm: null });
  };

  const openNewEquipment = () => {
    setEquipmentForm({ ...EMPTY_EQUIPMENT, assigned_to: myProfileId });
    setEquipmentModal({ open: true, mode: "new", item: null });
  };

  const openEditEquipment = (item) => {
    setEquipmentForm({
      equipment_type: item.equipment_type || "Computer",
      make: item.make || "",
      model: item.model || "",
      year: item.year || "",
      vehicle_last_service_odometer: vehicleLastServiceOdometerFormValue(item.vehicle_last_service_odometer),
      serial_number: item.serial_number || "",
      registration_number: item.registration_number || "",
      assigned_to: item.assigned_to || "",
      set_number: setNumberFormValue(item.set_number),
      notes: item.notes || "",
    });
    setEquipmentModal({ open: true, mode: "edit", item });
  };

  const validateEquipmentForm = () => {
    const type = equipmentForm.equipment_type;
    const required = [
      ["make", "Make"],
      ["model", "Model"],
      ["assigned_to", "Assigned to"],
    ];

    if (hasYear(type)) required.push(["year", "Year"]);
    if (hasSerial(type)) required.push(["serial_number", "Serial number"]);
    if (hasRegistration(type)) required.push(["registration_number", "Registration number"]);
    const missing = required.filter(([key]) => !String(equipmentForm[key] || "").trim());
    if (missing.length) {
      setError(`Please complete: ${missing.map(([, label]) => label).join(", ")}.`);
      return false;
    }

    return true;
  };

  const saveEquipment = async (e) => {
    e.preventDefault();
    if (!isAdmin || !validateEquipmentForm()) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const type = equipmentForm.equipment_type;
      const payload = {
        equipment_type: type,
        make: equipmentForm.make.trim(),
        model: equipmentForm.model.trim(),
        year: hasYear(type) ? Number(equipmentForm.year) : null,
        vehicle_last_service_odometer: vehicleLastServiceOdometerPayloadValue(
          type,
          equipmentForm.vehicle_last_service_odometer
        ),
        serial_number: hasSerial(type) ? equipmentForm.serial_number.trim() : null,
        registration_number: hasRegistration(type) ? equipmentForm.registration_number.trim() : null,
        assigned_to: equipmentForm.assigned_to || null,
        set_number: setNumberPayloadValue(type, equipmentForm.set_number),
        notes: equipmentForm.notes.trim() || null,
        updated_by: user?.id || null,
        updated_at: new Date().toISOString(),
      };

      if (equipmentModal.mode === "new") {
        const { error: insErr } = await supabase
          .from("equipment_register")
          .insert({ ...payload, created_by: user?.id || null });
        if (insErr) throw insErr;
        setSuccess("Equipment added.");
      } else {
        const { error: upErr } = await supabase
          .from("equipment_register")
          .update(payload)
          .eq("id", equipmentModal.item.id);
        if (upErr) throw upErr;
        setSuccess("Equipment updated.");
      }

      setEquipmentModal({ open: false, mode: "new", item: null });
      await loadData();
    } catch (err) {
      console.error("Equipment save failed:", err);
      setError(err?.message || "Could not save equipment.");
    } finally {
      setSaving(false);
    }
  };

  const performDeleteEquipment = async (item) => {
    const history = serviceByEquipment.get(item.id) || [];

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const historyIds = history.map((row) => row.id);
      const paths = attachments
        .filter((att) => historyIds.includes(att.service_history_id))
        .map((att) => att.storage_path)
        .filter(Boolean);

      if (paths.length) {
        await supabase.storage.from("equipment-files").remove(paths);
      }

      const { error: delErr } = await supabase
        .from("equipment_register")
        .delete()
        .eq("id", item.id);

      if (delErr) throw delErr;
      setSuccess("Equipment deleted.");
      setConfirmModal({ open: false, title: "", message: "", confirmLabel: "Delete", onConfirm: null });
      await loadData();
    } catch (err) {
      console.error("Equipment delete failed:", err);
      setError(err?.message || "Could not delete equipment.");
    } finally {
      setSaving(false);
    }
  };

  const deleteEquipment = (item) => {
    if (!isAdmin) return;
    const history = serviceByEquipment.get(item.id) || [];
    const label = [item.equipment_type, item.make, item.model].filter(Boolean).join(" ");

    setConfirmModal({
      open: true,
      title: "Delete equipment?",
      message: `Delete ${label || "this equipment"}? This permanently deletes the equipment, ${history.length} service/calibration record(s), and their attachment records.`,
      confirmLabel: "Delete equipment",
      onConfirm: () => performDeleteEquipment(item),
    });
  };

  const openServiceModal = (item) => {
    setServiceForm({ service_date: new Date().toISOString().slice(0, 10), notes: "", files: [] });
    setServiceModal({ open: true, item });
  };

  const saveServiceRecord = async (e) => {
    e.preventDefault();
    if (!isAdmin || !serviceModal.item) return;

    if (!serviceForm.service_date) {
      setError("Service/Calibration date is required.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const files = Array.from(serviceForm.files || []);
      const invalidFile = files.find((file) => {
        if (!file || file.size <= 0) return true;
        if (file.size > MAX_ATTACHMENT_SIZE_BYTES) return true;
        return !isAllowedAttachment(file);
      });

      if (invalidFile) {
        const name = invalidFile?.name || "Attachment";
        if (!invalidFile || invalidFile.size <= 0) {
          throw new Error(`${name} is empty. Choose a file with content.`);
        }
        if (invalidFile.size > MAX_ATTACHMENT_SIZE_BYTES) {
          throw new Error(`${name} is ${formatBytes(invalidFile.size)}. The limit is ${formatBytes(MAX_ATTACHMENT_SIZE_BYTES)}.`);
        }
        throw new Error(`${name} is not an allowed attachment type. Use PDF, image, Word, Excel, CSV, RTF, or text files.`);
      }

      const { data: inserted, error: hErr } = await supabase
        .from("equipment_service_history")
        .insert({
          equipment_id: serviceModal.item.id,
          service_date: serviceForm.service_date,
          notes: serviceForm.notes.trim() || null,
          created_by: user?.id || null,
          updated_by: user?.id || null,
        })
        .select("*")
        .single();

      if (hErr) throw hErr;

      const attachmentRows = [];

      for (const file of files) {
        const name = safeFileName(file.name);
        const path = `${serviceModal.item.id}/${inserted.id}/${Date.now()}-${name}`;
        const { error: upErr } = await supabase.storage
          .from("equipment-files")
          .upload(path, file, { contentType: file.type || "application/octet-stream" });

        if (upErr) throw upErr;

        attachmentRows.push({
          service_history_id: inserted.id,
          file_name: file.name || name,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size || 0,
          storage_path: path,
          uploaded_by: user?.id || null,
        });
      }

      if (attachmentRows.length) {
        const { error: aErr } = await supabase
          .from("equipment_service_attachments")
          .insert(attachmentRows);
        if (aErr) throw aErr;
      }

      setSuccess("Service/Calibration record added.");
      setServiceModal({ open: false, item: null });
      await loadData();
    } catch (err) {
      console.error("Service record save failed:", err);
      setError(err?.message || "Could not save service/calibration record.");
    } finally {
      setSaving(false);
    }
  };

  const performDeleteServiceRecord = async (record) => {
    const files = attachmentsByService.get(record.id) || [];

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const paths = files.map((file) => file.storage_path).filter(Boolean);
      if (paths.length) {
        await supabase.storage.from("equipment-files").remove(paths);
      }

      const { error: delErr } = await supabase
        .from("equipment_service_history")
        .delete()
        .eq("id", record.id);

      if (delErr) throw delErr;
      setSuccess("Service/Calibration record deleted.");
      setConfirmModal({ open: false, title: "", message: "", confirmLabel: "Delete", onConfirm: null });
      await loadData();
    } catch (err) {
      console.error("Service record delete failed:", err);
      setError(err?.message || "Could not delete service/calibration record.");
    } finally {
      setSaving(false);
    }
  };

  const deleteServiceRecord = (record) => {
    if (!isAdmin) return;
    const files = attachmentsByService.get(record.id) || [];

    setConfirmModal({
      open: true,
      title: "Delete service record?",
      message: `Delete the service/calibration record dated ${formatDate(record.service_date)}? This permanently deletes ${files.length} attachment record(s).`,
      confirmLabel: "Delete record",
      onConfirm: () => performDeleteServiceRecord(record),
    });
  };

  const openAttachment = async (attachment) => {
    try {
      const { data, error: signedErr } = await supabase.storage
        .from("equipment-files")
        .createSignedUrl(attachment.storage_path, 60 * 10);

      if (signedErr) throw signedErr;
      if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("Attachment open failed:", err);
      setError(err?.message || "Could not open attachment.");
    }
  };

  const setType = (type) => {
    setEquipmentForm((prev) => ({
      ...prev,
      equipment_type: type,
      year: hasYear(type) ? prev.year : "",
      vehicle_last_service_odometer: hasVehicleLastServiceOdometer(type)
        ? vehicleLastServiceOdometerFormValue(prev.vehicle_last_service_odometer)
        : "",
      serial_number: hasSerial(type) ? prev.serial_number : "",
      registration_number: hasRegistration(type) ? prev.registration_number : "",
      set_number: hasSetNumber(type) ? setNumberFormValue(prev.set_number) : "",
    }));
  };

  return (
    <PageLayout
      data-equipment-register
      icon="🧾"
      title="Equipment Register"
      subtitle="Register of Pro West equipment and service/calibration history"
      actions={
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button className="btn-pill" type="button" onClick={handleRefresh} disabled={loading || saving}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          {isAdmin && (
            <button className="btn-pill primary" type="button" onClick={openNewEquipment} disabled={saving}>
              + Add equipment
            </button>
          )}
        </div>
      }
    >
      <div className="card">
        <h3 className="card-title">Filter</h3>
        <p className="card-subtitle">
          Defaults to equipment assigned to you. Use All to view the full register.
        </p>

        <div className="card-row" style={{ marginTop: "0.6rem" }}>
          <span className="card-row-label">Search</span>
          <input
            className="maps-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search type, make, model, serial, rego, set, notes…"
            style={{ maxWidth: 420 }}
          />
        </div>

        <div className="card-row" style={{ marginTop: "0.6rem" }}>
          <span className="card-row-label">Assigned to</span>
          <select
            className="maps-search-input"
            value={assignedFilter}
            onChange={(e) => setAssignedFilter(e.target.value)}
            disabled={loading}
            style={{ maxWidth: 280 }}
          >
            <option value="__my__">My Equipment</option>
            <option value="__all__">All</option>
            <option disabled>────────</option>
            {profileOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="card-row" style={{ marginTop: "0.6rem" }}>
          <span className="card-row-label">Equipment type</span>
          <select
            className="maps-search-input"
            value={equipmentTypeFilter}
            onChange={(e) => setEquipmentTypeFilter(e.target.value)}
            disabled={loading}
            style={{ maxWidth: 280 }}
          >
            <option value="__all__">All Equipment types</option>
            {EQUIPMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className="card-row" style={{ marginTop: "0.6rem" }}>
          <span className="card-row-label">Showing</span>
          <span className="card-row-value">
            <b>{filteredEquipment.length}</b> item{filteredEquipment.length === 1 ? "" : "s"}
            {effectiveAssignedFilter !== "__all__"
              ? ` for ${displayProfile(profileMap, effectiveAssignedFilter) || displayName || "you"}`
              : ""}
          </span>
        </div>
      </div>

      {(error || success) && (
        <div
          className="card"
          style={{
            color: error ? "#b71c1c" : "#2e7d32",
            fontWeight: 700,
          }}
        >
          {error || success}
        </div>
      )}

      <div className="card">
        <h3 className="card-title">Equipment</h3>
        <p className="card-subtitle">
          Service and calibration records are shown newest first under each item.
        </p>

        {loading && <div style={{ marginTop: "0.6rem" }}>Loading…</div>}
        {!loading && filteredEquipment.length === 0 && (
          <div style={{ marginTop: "0.6rem" }}>No equipment found.</div>
        )}

        {!loading && filteredEquipment.length > 0 && (
          <>
          <div className="equipment-table-wrap">
            <table className="equipment-table">
              <thead>
                <tr>
                  {["Type", "Equipment", "Identifier", "Assigned to", "Latest service", "Actions"].map((h) => (
                    <th key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredEquipment.map((item) => {
                  const history = serviceByEquipment.get(item.id) || [];
                  const latest = history[0];
                  const identifier = item.registration_number || item.serial_number || "-";

                  return (
                    <tr key={item.id}>
                      <td className="equipment-table-type">
                        {item.equipment_type}
                      </td>
                      <td>
                        <div style={{ fontWeight: 800 }}>
                          {[item.make, item.model].filter(Boolean).join(" ") || "-"}
                        </div>
                        <div style={{ color: "#666", fontSize: "0.78rem" }}>
                          {item.year || ""}
                          {item.set_number ? ` • Set ${item.set_number}` : ""}
                        </div>
                        {item.notes && <div style={{ marginTop: 4, color: "#555" }}>{item.notes}</div>}
                      </td>
                      <td>{identifier}</td>
                      <td>
                        {displayProfile(profileMap, item.assigned_to)}
                      </td>
                      <td className="equipment-latest-cell">
                        {latest ? (
                          <div>
                            <div style={{ fontWeight: 800 }}>{formatDate(latest.service_date)}</div>
                            {latest.notes && <div style={{ marginTop: 3, color: "#555" }}>{latest.notes}</div>}
                            <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {(attachmentsByService.get(latest.id) || []).map((att) => (
                                <button
                                  key={att.id}
                                  type="button"
                                  className="btn-pill"
                                  style={{ fontSize: "0.72rem", padding: "0.18rem 0.5rem" }}
                                  onClick={() => openAttachment(att)}
                                >
                                  {att.file_name || "Attachment"}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          "No records"
                        )}
                      </td>
                      <td className="equipment-actions-cell">
                        <div className="equipment-table-actions">
                          <button className="btn-pill" type="button" onClick={() => openServiceModal(item)}>
                            History
                          </button>
                          {isAdmin && (
                            <>
                              <button className="btn-pill" type="button" onClick={() => openEditEquipment(item)}>
                                Edit
                              </button>
                              <button className="btn-pill danger" type="button" onClick={() => deleteEquipment(item)}>
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="equipment-mobile-list">
            {filteredEquipment.map((item) => {
              const history = serviceByEquipment.get(item.id) || [];
              const latest = history[0];
              const identifier = item.registration_number || item.serial_number || "-";

              return (
                <article key={item.id} className="equipment-mobile-card">
                  <div className="equipment-mobile-card-header">
                    <div>
                      <div className="equipment-mobile-type">{item.equipment_type}</div>
                      <div className="equipment-mobile-title">
                        {[item.make, item.model].filter(Boolean).join(" ") || "-"}
                      </div>
                    </div>
                    <div className="equipment-mobile-actions">
                      <button className="btn-pill" type="button" onClick={() => openServiceModal(item)}>
                        History
                      </button>
                      {isAdmin && (
                        <>
                          <button className="btn-pill" type="button" onClick={() => openEditEquipment(item)}>
                            Edit
                          </button>
                          <button className="btn-pill danger" type="button" onClick={() => deleteEquipment(item)}>
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <dl className="equipment-mobile-meta">
                    <div>
                      <dt>Identifier</dt>
                      <dd>{identifier}</dd>
                    </div>
                    <div>
                      <dt>Assigned to</dt>
                      <dd>{displayProfile(profileMap, item.assigned_to)}</dd>
                    </div>
                    {(item.year || item.set_number) && (
                      <div>
                        <dt>Details</dt>
                        <dd>
                          {item.year || ""}
                          {item.set_number ? `${item.year ? " / " : ""}Set ${item.set_number}` : ""}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>Latest service</dt>
                      <dd>
                        {latest ? (
                          <>
                            <span>{formatDate(latest.service_date)}</span>
                            {latest.notes && <span className="equipment-mobile-note">{latest.notes}</span>}
                          </>
                        ) : (
                          "No records"
                        )}
                      </dd>
                    </div>
                  </dl>
                  {item.notes && <p className="equipment-mobile-note">{item.notes}</p>}
                </article>
              );
            })}
          </div>
          </>
        )}
      </div>

      {equipmentModal.open && (
        <div className="modal-backdrop">
          <div className="modal-card equipment-modal-card">
            <div className="modal-header">
              <h3>{equipmentModal.mode === "new" ? "Add equipment" : "Edit equipment"}</h3>
              <button className="btn-pill" type="button" onClick={() => setEquipmentModal({ open: false, mode: "new", item: null })}>
                Close
              </button>
            </div>
            <form onSubmit={saveEquipment} className="equipment-modal-body">
              {error && (
                <div
                  className="equipment-modal-full"
                  style={{
                    color: "#b71c1c",
                    fontWeight: 800,
                    padding: "10px 12px",
                    border: "1px solid rgba(183, 28, 28, 0.25)",
                    borderRadius: 8,
                    background: "rgba(183, 28, 28, 0.08)",
                  }}
                >
                  {error}
                </div>
              )}
              <label>
                <span>Equipment type</span>
                <select className="maps-search-input" value={equipmentForm.equipment_type} onChange={(e) => setType(e.target.value)}>
                  {EQUIPMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              {hasSerial(equipmentForm.equipment_type) && (
                <label>
                  <span>Serial number</span>
                  <input className="maps-search-input" value={equipmentForm.serial_number} onChange={(e) => setEquipmentForm((f) => ({ ...f, serial_number: e.target.value }))} required />
                </label>
              )}
              {hasRegistration(equipmentForm.equipment_type) && (
                <label>
                  <span>Registration number</span>
                  <input className="maps-search-input" value={equipmentForm.registration_number} onChange={(e) => setEquipmentForm((f) => ({ ...f, registration_number: e.target.value }))} required />
                </label>
              )}
              <label>
                <span>Make</span>
                <input className="maps-search-input" value={equipmentForm.make} onChange={(e) => setEquipmentForm((f) => ({ ...f, make: e.target.value }))} required />
              </label>
              <label>
                <span>Model</span>
                <input className="maps-search-input" value={equipmentForm.model} onChange={(e) => setEquipmentForm((f) => ({ ...f, model: e.target.value }))} required />
              </label>
              {hasYear(equipmentForm.equipment_type) && (
                <label>
                  <span>Year</span>
                  <input className="maps-search-input" type="number" min="1900" max="2100" value={equipmentForm.year} onChange={(e) => setEquipmentForm((f) => ({ ...f, year: e.target.value }))} required />
                </label>
              )}
              {hasVehicleLastServiceOdometer(equipmentForm.equipment_type) && (
                <label>
                  <span>Last Service Odometer</span>
                  <input
                    className="maps-search-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={equipmentForm.vehicle_last_service_odometer}
                    onChange={(e) =>
                      setEquipmentForm((f) => ({
                        ...f,
                        vehicle_last_service_odometer: e.target.value.replace(/\D/g, ""),
                      }))
                    }
                  />
                </label>
              )}
              {hasSetNumber(equipmentForm.equipment_type) && (
                <label>
                  <span>Set number</span>
                  <select className="maps-search-input" value={setNumberFormValue(equipmentForm.set_number)} onChange={(e) => setEquipmentForm((f) => ({ ...f, set_number: e.target.value }))}>
                    {SET_NUMBERS.map((n) => (
                      <option key={n} value={n === "-" ? "" : n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                <span>Assigned to</span>
                <select className="maps-search-input" value={equipmentForm.assigned_to} onChange={(e) => setEquipmentForm((f) => ({ ...f, assigned_to: e.target.value }))} required>
                  <option value="">Select person…</option>
                  {profileOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="equipment-modal-full">
                <span>Notes</span>
                <textarea className="maps-search-input" rows={4} value={equipmentForm.notes} onChange={(e) => setEquipmentForm((f) => ({ ...f, notes: e.target.value }))} />
              </label>
              <div className="modal-actions equipment-modal-full">
                <button className="btn-pill" type="button" onClick={() => setEquipmentModal({ open: false, mode: "new", item: null })} disabled={saving}>
                  Cancel
                </button>
                <button className="btn-pill primary" type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {serviceModal.open && (
        <div className="modal-backdrop">
          <div className="modal-card equipment-modal-card">
            <div className="modal-header">
              <h3>Service/Calibration history</h3>
              <button className="btn-pill" type="button" onClick={() => setServiceModal({ open: false, item: null })}>
                Close
              </button>
            </div>
            <div className="equipment-service-layout">
              <div>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>
                  {serviceModal.item?.equipment_type} • {[serviceModal.item?.make, serviceModal.item?.model].filter(Boolean).join(" ")}
                </div>
                {(serviceByEquipment.get(serviceModal.item?.id) || []).length === 0 && (
                  <div style={{ color: "#666" }}>No service/calibration records yet.</div>
                )}
                {(serviceByEquipment.get(serviceModal.item?.id) || []).map((record) => (
                  <div key={record.id} className="equipment-service-card">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 900 }}>{formatDate(record.service_date)}</div>
                      {isAdmin && (
                        <button className="btn-pill danger" type="button" onClick={() => deleteServiceRecord(record)} disabled={saving}>
                          Delete record
                        </button>
                      )}
                    </div>
                    {record.notes && <div style={{ marginTop: 6 }}>{record.notes}</div>}
                    <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {(attachmentsByService.get(record.id) || []).map((att) => (
                        <button key={att.id} className="btn-pill" type="button" onClick={() => openAttachment(att)}>
                          {att.file_name || "Attachment"}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {isAdmin && (
                <form onSubmit={saveServiceRecord} className="equipment-service-form">
                  <h4 style={{ margin: 0 }}>Add record</h4>
                  <label>
                    <span>Service/Calibration date</span>
                    <input className="maps-search-input" type="date" value={serviceForm.service_date} onChange={(e) => setServiceForm((f) => ({ ...f, service_date: e.target.value }))} required />
                  </label>
                  <label>
                    <span>Notes/details</span>
                    <textarea className="maps-search-input" rows={4} value={serviceForm.notes} onChange={(e) => setServiceForm((f) => ({ ...f, notes: e.target.value }))} />
                  </label>
                  <label>
                    <span>Attachments</span>
                    <input
                      className="maps-search-input"
                      type="file"
                      multiple
                      accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif,.doc,.docx,.xls,.xlsx,.csv,.txt,.rtf,application/pdf,image/*,text/plain,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      onChange={(e) => setServiceForm((f) => ({ ...f, files: Array.from(e.target.files || []) }))}
                    />
                    <span className="equipment-attachment-help">PDF, image, Word, Excel, CSV, RTF or text files. Max {formatBytes(MAX_ATTACHMENT_SIZE_BYTES)} each.</span>
                  </label>
                  <button className="btn-pill primary" type="submit" disabled={saving}>
                    {saving ? "Saving…" : "Add service/calibration record"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
      <ConfirmationModal
        open={confirmModal.open}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel={confirmModal.confirmLabel}
        busy={saving}
        onCancel={closeConfirmModal}
        onConfirm={confirmModal.onConfirm}
      />
    </PageLayout>
  );
}

export default EquipmentRegister;
