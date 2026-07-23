import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";
import {
  getChecklistDefinition,
  getChecklistHeading,
  hasChecklistActivity,
} from "../lib/jobChecklists.js";

function formatDateTimeAU(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildChecklistRowsFromDefinition(category, existingRows = []) {
  const definition = getChecklistDefinition(category) || [];
  const byKey = new Map((existingRows || []).map((row) => [row.item_key, row]));

  return definition.map((item, idx) => {
    const saved = byKey.get(item.key);
    return {
      id: saved?.id || null,
      job_id: saved?.job_id || null,
      job_category: category,
      item_key: item.key,
      item_order: idx + 1,
      item_text: item.text,
      definition_text: item.text,
      saved_item_text: saved?.item_text || "",
      saved_item_order: saved?.item_order ?? null,
      subpoints: item.subpoints || [],
      is_completed: Boolean(saved?.is_completed),
      comments: saved?.comments || "",
      saved_comments: saved?.comments || "",
      completed_by: saved?.completed_by || null,
      completed_at: saved?.completed_at || null,
      completed_by_name: saved?.completed_by_name || "",
    };
  });
}

export function checklistRowsToDraft(category, rows = [], options = {}) {
  const markSaved = Boolean(options.markSaved);
  return {
    opened: true,
    category,
    rows: rows.map((row) => ({
      ...row,
      job_category: category,
      saved_comments: markSaved ? row.comments || "" : row.saved_comments || "",
    })),
  };
}

export function checklistDraftHasUnsavedComments(draft) {
  return (draft?.rows || []).some((row) => (row.comments || "") !== (row.saved_comments || ""));
}

export function checklistDraftHasActivity(draft) {
  return hasChecklistActivity(draft?.rows || []);
}

async function resolveProfileNames(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return {};

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", ids);

  if (error) throw error;

  return Object.fromEntries(
    (data || []).map((profile) => [profile.id, profile.display_name || "Unknown user"])
  );
}

async function loadChecklistRowsForJob(jobId, category) {
  if (!jobId || !category) return [];

  const { data, error } = await supabase
    .from("job_checklist_items")
    .select("id, job_id, job_category, item_key, item_order, item_text, is_completed, comments, completed_by, completed_at")
    .eq("job_id", jobId)
    .eq("job_category", category)
    .order("item_order", { ascending: true });

  if (error) throw error;

  const profileNames = await resolveProfileNames((data || []).map((row) => row.completed_by));

  return (data || []).map((row) => ({
    ...row,
    completed_by_name: row.completed_by ? profileNames[row.completed_by] || "Unknown user" : "",
  }));
}

export async function saveDraftChecklistsForJob(jobId, drafts = {}) {
  if (!jobId) return;

  const payload = Object.entries(drafts)
    .filter(([, draft]) => draft?.opened && (draft.rows || []).length)
    .flatMap(([category, draft]) =>
      (draft.rows || []).map((row) => ({
        job_id: jobId,
        job_category: category,
        item_key: row.item_key,
        item_order: row.item_order,
        item_text: row.item_text || row.definition_text,
        is_completed: Boolean(row.is_completed),
        comments: row.comments || "",
        completed_by: row.is_completed ? row.completed_by || null : null,
        completed_at: row.is_completed ? row.completed_at || new Date().toISOString() : null,
      }))
    );

  if (!payload.length) return;

  const { error } = await supabase
    .from("job_checklist_items")
    .upsert(payload, { onConflict: "job_id,job_category,item_key" });

  if (error) throw error;
}

export function PortalConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  secondaryLabel = "",
  cancelLabel = "Cancel",
  busy = false,
  danger = false,
  onCancel,
  onConfirm,
  onSecondary,
}) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => cancelRef.current?.focus());
    const onKeyDown = (event) => {
      if (event.key === "Escape") onCancel?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="checklist-confirm-overlay" role="presentation">
      <div
        className="checklist-confirm-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="checklist-confirm-title"
      >
        <div className="checklist-confirm-header">
          <h3 id="checklist-confirm-title" className="card-title">
            {title}
          </h3>
          <button className="btn-pill" type="button" onClick={onCancel} disabled={busy} aria-label="Close confirmation">
            Close
          </button>
        </div>
        <p className="checklist-confirm-message">{message}</p>
        <div className="checklist-confirm-actions">
          <button ref={cancelRef} className="btn-pill" type="button" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          {secondaryLabel && (
            <button className="btn-pill" type="button" onClick={onSecondary} disabled={busy}>
              {secondaryLabel}
            </button>
          )}
          <button
            className={`btn-pill ${danger ? "danger" : "primary"}`}
            type="button"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Saving…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function JobChecklistModal({
  open,
  jobId,
  jobNumber,
  category,
  draft,
  onDraftChange,
  onClose,
  onSaved,
}) {
  const { user, profile } = useAuth();
  const [rows, setRows] = useState([]);
  const [baselineRows, setBaselineRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmState, setConfirmState] = useState(null);
  const [pendingClose, setPendingClose] = useState(false);
  const lastFocusedRef = useRef(null);

  const definition = getChecklistDefinition(category);
  const hasConfiguredChecklist = Boolean(definition?.length);
  const completedCount = rows.filter((row) => row.is_completed).length;
  const totalCount = definition?.length || 0;
  const hasUnsavedComments = rows.some((row) => (row.comments || "") !== (row.saved_comments || ""));

  useEffect(() => {
    if (!open) return;
    setError("");
    setSuccess("");
    setPendingClose(false);

    if (!category || !hasConfiguredChecklist) {
      setRows([]);
      setBaselineRows([]);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        let nextRows;
        if (jobId) {
          const savedRows = await loadChecklistRowsForJob(jobId, category);
          nextRows = buildChecklistRowsFromDefinition(category, savedRows);
        } else if (draft?.opened) {
          nextRows = buildChecklistRowsFromDefinition(category, draft.rows || []);
        } else {
          nextRows = buildChecklistRowsFromDefinition(category, []);
        }

        if (cancelled) return;
        setRows(nextRows);
        setBaselineRows(nextRows);
        if (!jobId) onDraftChange?.(category, checklistRowsToDraft(category, nextRows));
      } catch (e) {
        if (!cancelled) setError(e?.message || "Could not load checklist.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, jobId, category, hasConfiguredChecklist]);

  useEffect(() => {
    if (!open || jobId || !category || !hasConfiguredChecklist) return;
    onDraftChange?.(category, checklistRowsToDraft(category, rows));
  }, [rows, open, jobId, category, hasConfiguredChecklist, onDraftChange]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !confirmState) requestClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, confirmState, hasUnsavedComments]);

  if (!open) return null;

  function updateRow(itemKey, updater) {
    setRows((prev) => prev.map((row) => (row.item_key === itemKey ? updater(row) : row)));
  }

  function requestClose() {
    setSuccess("");
    if (hasUnsavedComments) {
      setPendingClose(true);
      setConfirmState({
        type: "unsaved-close",
        title: "You have unsaved checklist comments.",
        message: "Save the checklist before leaving, or discard the unsaved changes.",
      });
      return;
    }
    onClose?.();
  }

  async function persistCheckbox(row, nextCompleted) {
    if (!user?.id) throw new Error("Could not identify the current user.");

    if (!jobId) {
      const completedAt = nextCompleted ? new Date().toISOString() : null;
      return {
        ...row,
        is_completed: nextCompleted,
        completed_by: nextCompleted ? user.id : null,
        completed_at: completedAt,
        completed_by_name: nextCompleted ? profile?.display_name || user.email || "Current user" : "",
      };
    }

    const payload = nextCompleted
      ? {
          job_id: jobId,
          job_category: category,
          item_key: row.item_key,
          item_order: row.item_order,
          item_text: row.item_text || row.definition_text,
          is_completed: true,
          completed_by: user.id,
          completed_at: new Date().toISOString(),
        }
      : {
          job_id: jobId,
          job_category: category,
          item_key: row.item_key,
          item_order: row.item_order,
          item_text: row.item_text || row.definition_text,
          is_completed: false,
          completed_by: null,
          completed_at: null,
        };

    const mutation = row.id
      ? supabase.from("job_checklist_items").update(payload).eq("id", row.id)
      : supabase
          .from("job_checklist_items")
          .upsert(
            {
              ...payload,
              comments: row.comments || "",
            },
            { onConflict: "job_id,job_category,item_key" }
          );

    const { data, error: updateError } = await mutation
      .select("id, job_id, job_category, item_key, item_order, item_text, is_completed, comments, completed_by, completed_at")
      .single();

    if (updateError) throw updateError;

    let completedByName = "";
    if (data.completed_by) {
      const names = await resolveProfileNames([data.completed_by]);
      completedByName = names[data.completed_by] || "Unknown user";
    }

    return {
      ...row,
      ...data,
      saved_comments: data.comments || "",
      saved_item_text: data.item_text || "",
      saved_item_order: data.item_order ?? null,
      completed_by_name: completedByName,
      subpoints: row.subpoints || [],
      definition_text: row.definition_text,
    };
  }

  async function confirmCheckboxChange() {
    const pending = confirmState;
    if (!pending?.row) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const updated = await persistCheckbox(pending.row, pending.nextCompleted);
      updateRow(pending.row.item_key, () => updated);
      setBaselineRows((prev) => prev.map((row) => (row.item_key === updated.item_key ? updated : row)));
      setConfirmState(null);
      onSaved?.({ category, rows: rows.map((row) => (row.item_key === updated.item_key ? updated : row)) });
      requestAnimationFrame(() => lastFocusedRef.current?.focus?.());
    } catch (e) {
      setError(e?.message || "Could not update checklist item.");
    } finally {
      setSaving(false);
    }
  }

  async function saveChecklist({ closeAfterSave = true } = {}) {
    if (saving) return false;

    if (!hasConfiguredChecklist) {
      if (closeAfterSave) onClose?.();
      return true;
    }

    const hasDefinitionSyncChanges = rows.some(
      (row) =>
        !row.id ||
        row.saved_item_text !== row.item_text ||
        Number(row.saved_item_order) !== Number(row.item_order)
    );

    if (closeAfterSave && !hasUnsavedComments && !hasDefinitionSyncChanges) {
      onClose?.();
      return true;
    }

    if (!hasConfiguredChecklist || saving) return false;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const changedRows = rows.filter(
        (row) =>
          (row.comments || "") !== (row.saved_comments || "") ||
          !row.id ||
          row.saved_item_text !== row.item_text ||
          Number(row.saved_item_order) !== Number(row.item_order)
      );

      if (jobId && changedRows.length) {
        const payload = changedRows.map((row) => {
          const nextRow = {
            job_id: jobId,
            job_category: category,
            item_key: row.item_key,
            item_order: row.item_order,
            item_text: row.item_text || row.definition_text,
            is_completed: row.is_completed,
            comments: row.comments || "",
            completed_by: row.is_completed ? row.completed_by || null : null,
            completed_at: row.is_completed ? row.completed_at : null,
          };

          if (row.id) nextRow.id = row.id;
          return nextRow;
        });

        const { error: upsertError } = await supabase
          .from("job_checklist_items")
          .upsert(payload, { onConflict: "job_id,job_category,item_key" });

        if (upsertError) throw upsertError;
      }

      const savedRows = rows.map((row) => ({
        ...row,
        saved_comments: row.comments || "",
        saved_item_text: row.item_text || row.definition_text,
        saved_item_order: row.item_order,
      }));
      setRows(savedRows);
      setBaselineRows(savedRows);
      if (!jobId) onDraftChange?.(category, checklistRowsToDraft(category, savedRows, { markSaved: true }));
      setSuccess("Checklist saved.");
      onSaved?.({ category, rows: savedRows });
      if (closeAfterSave) onClose?.();
      return true;
    } catch (e) {
      setError(e?.message || "Could not save checklist comments.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function discardCommentChanges() {
    setRows(baselineRows);
    setConfirmState(null);
    if (pendingClose) {
      setPendingClose(false);
      onClose?.();
    }
  }

  return (
    <div className="checklist-modal-overlay" role="presentation">
      <div
        className="card checklist-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-checklist-title"
      >
        <div className="checklist-modal-header">
          <div>
            <h3 id="job-checklist-title" className="card-title">
              Job Checklist
            </h3>
            <p className="card-subtitle checklist-modal-subtitle">
              {jobNumber ? `Job #${jobNumber} · ` : ""}
              {category || "No category selected"}
            </p>
          </div>
          <button className="btn-pill" type="button" onClick={requestClose} disabled={saving}>
            Close
          </button>
        </div>

        <div className="checklist-modal-body">
          {error && <div className="checklist-message error" role="alert">{error}</div>}
          {success && <div className="checklist-message success" role="status">{success}</div>}

          {!category ? (
            <div className="checklist-empty">Select a job category to open its checklist.</div>
          ) : !hasConfiguredChecklist ? (
            <div className="checklist-empty">A checklist has not yet been configured for this job category.</div>
          ) : (
            <>
              <div className="checklist-summary">
                <div>
                  <div className="checklist-heading">{getChecklistHeading(category)}</div>
                  <div className="checklist-progress-text">
                    Progress: {completedCount} / {totalCount} completed
                  </div>
                </div>
                <div className="checklist-progress-bar" aria-hidden="true">
                  <div style={{ width: `${totalCount ? (completedCount / totalCount) * 100 : 0}%` }} />
                </div>
              </div>

              {loading ? (
                <div className="checklist-empty">Loading checklist…</div>
              ) : (
                <div className="checklist-items">
                  {rows.map((row, index) => {
                    const itemId = `checklist-item-${row.item_key}`;
                    const commentId = `checklist-comment-${row.item_key}`;

                    return (
                      <div className="checklist-item" key={row.item_key}>
                        <div className="checklist-item-main">
                          <label className="checklist-checkbox-wrap" htmlFor={itemId}>
                            <input
                              id={itemId}
                              ref={(node) => {
                                if (node && confirmState?.row?.item_key === row.item_key) lastFocusedRef.current = node;
                              }}
                              type="checkbox"
                              checked={row.is_completed}
                              disabled={saving}
                              onChange={(event) => {
                                event.preventDefault();
                                lastFocusedRef.current = event.currentTarget;
                                const nextCompleted = !row.is_completed;
                                setConfirmState({
                                  type: "checkbox",
                                  row,
                                  nextCompleted,
                                  title: nextCompleted
                                    ? `Complete checklist item ${index + 1}?`
                                    : `Mark checklist item ${index + 1} as incomplete?`,
                                  message: nextCompleted
                                    ? "This will record you as the user who completed the item and save the current date and time."
                                    : "The recorded completion user, date and time will be removed.",
                                });
                              }}
                            />
                            <span className="checklist-item-number">{index + 1}</span>
                          </label>

                          <div className="checklist-item-copy">
                            <div className="checklist-item-text">{row.item_text}</div>
                            {row.subpoints?.length ? (
                              <ul className="checklist-subpoints">
                                {row.subpoints.map((point) => (
                                  <li key={point}>{point}</li>
                                ))}
                              </ul>
                            ) : null}
                            {row.is_completed && (
                              <div className="checklist-completion">
                                Completed by {row.completed_by_name || "Unknown user"} — {formatDateTimeAU(row.completed_at)}
                              </div>
                            )}
                          </div>
                        </div>

                        <label className="checklist-comments-label" htmlFor={commentId}>
                          Comments
                        </label>
                        <textarea
                          id={commentId}
                          className="input checklist-comments"
                          rows={2}
                          value={row.comments || ""}
                          disabled={saving}
                          onChange={(event) => {
                            const value = event.target.value;
                            updateRow(row.item_key, (current) => ({ ...current, comments: value }));
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <div className="checklist-modal-footer">
          <button className="btn-pill" type="button" onClick={requestClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn-pill primary"
            type="button"
            onClick={() => saveChecklist({ closeAfterSave: true })}
            disabled={saving}
          >
            {saving ? "Saving & Closing..." : "Save & Close"}
          </button>
        </div>
      </div>

      <PortalConfirmModal
        open={Boolean(confirmState)}
        title={confirmState?.title || ""}
        message={confirmState?.message || ""}
        confirmLabel={
          confirmState?.type === "checkbox"
            ? confirmState.nextCompleted
              ? "Mark Complete"
              : "Mark Incomplete"
            : "Discard Changes"
        }
        secondaryLabel={confirmState?.type === "unsaved-close" ? (saving ? "Saving & Closing..." : "Save & Close") : ""}
        busy={saving}
        danger={confirmState?.type === "unsaved-close"}
        onCancel={() => {
          setPendingClose(false);
          setConfirmState(null);
          requestAnimationFrame(() => lastFocusedRef.current?.focus?.());
        }}
        onSecondary={async () => {
          const saved = await saveChecklist({ closeAfterSave: true });
          if (saved) {
            setConfirmState(null);
            setPendingClose(false);
          }
        }}
        onConfirm={confirmState?.type === "checkbox" ? confirmCheckboxChange : discardCommentChanges}
      />
    </div>
  );
}

export default JobChecklistModal;
