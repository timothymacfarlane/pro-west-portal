import { useEffect, useMemo, useRef, useState } from "react";
import PageLayout from "../components/PageLayout.jsx";
import { supabase } from "../lib/supabaseClient";

const CATEGORIES = [
  "Safety",
  "Procedures",
  "Templates",
  "Legislation",
  "HR",
  "Checklists",
  "Administration",
  "Miscellaneous",
];

function normalizeSpace(s) {
  return (s || "").toString().trim().replace(/\s+/g, " ");
}

function isPdf(mime, name) {
  const n = (name || "").toLowerCase();
  return mime === "application/pdf" || n.endsWith(".pdf");
}

function extOf(name) {
  const n = (name || "").toLowerCase();
  const idx = n.lastIndexOf(".");
  return idx >= 0 ? n.slice(idx + 1) : "";
}

function prettyType(mime, name) {
  const ext = extOf(name);
  if (ext) return ext.toUpperCase();
  if (!mime) return "FILE";
  if (mime.includes("pdf")) return "PDF";
  if (mime.includes("word")) return "DOC";
  if (mime.includes("excel") || mime.includes("spreadsheet")) return "XLS";
  return "FILE";
}

function useDebounced(value, delayMs = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

async function getUserRole() {
  try {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw authErr;
    const user = authData?.user;
    if (!user) return { role: "basic", userId: null };

    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profErr) throw profErr;

    return { role: profile?.role || "basic", userId: user.id };
  } catch (e) {
    console.error("Error loading user role:", e);
    return { role: "basic", userId: null };
  }
}

function Documents() {
  const [userRole, setUserRole] = useState("basic");
  const isAdmin = userRole === "admin";
  const [userId, setUserId] = useState(null);

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 250);

  const [category, setCategory] = useState("All");
  const [showFavouritesOnly, setShowFavouritesOnly] = useState(false);

  const [docs, setDocs] = useState([]);
  const [favouriteSet, setFavouriteSet] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const [selectedDoc, setSelectedDoc] = useState(null);
  const [openUrl, setOpenUrl] = useState("");
  const [openKind, setOpenKind] = useState(""); // "pdf" | "office" | "download"
  const [openFileName, setOpenFileName] = useState("");
  const [viewerOpen, setViewerOpen] = useState(false);

  // Admin upload modal
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadMode, setUploadMode] = useState("new"); // new | newversion
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadCategory, setUploadCategory] = useState("Miscellaneous");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Versions modal
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versions, setVersions] = useState([]);

  // Pagination
  const PAGE_SIZE = 50;
  const [offset, setOffset] = useState(0);
  const hasMoreRef = useRef(true);

  // Load role
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { role, userId } = await getUserRole();
      if (!cancelled) {
        setUserRole(role);
        setUserId(userId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load favourites (per user) — fast and separate
  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setFavouriteSet(new Set());
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase
          .from("document_favourites")
          .select("document_id")
          .eq("user_id", userId);

        if (error) throw error;
        const s = new Set((data || []).map((r) => r.document_id));
        if (!cancelled) setFavouriteSet(s);
      } catch (e) {
        console.error("Error loading favourites:", e);
        if (!cancelled) setFavouriteSet(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Core fetch (server-side)
  const fetchDocuments = async ({ reset }) => {
    if (reset) {
      setLoading(true);
      setError("");
      setOffset(0);
      hasMoreRef.current = true;
    } else {
      setLoadingMore(true);
      setError("");
    }

    try {
      const currentOffset = reset ? 0 : offset;

      // Base select includes current version join (via current_version_id)
      // We fetch current version details by a follow-up query to keep it simple + fast.
      let q = supabase
        .from("documents")
        .select("id, title, category, description, current_version_id, updated_at")
        .order("title", { ascending: true })
        .range(currentOffset, currentOffset + PAGE_SIZE - 1);

      const titleQ = normalizeSpace(debouncedQuery);
      if (titleQ) {
        // Fast contains search (works well with trigram index)
        q = q.ilike("title", `%${titleQ}%`);
      }

      if (category !== "All") {
        q = q.eq("category", category);
      }

      if (showFavouritesOnly && userId) {
        // Two-step: filter using favouriteSet locally (fast) if it’s small,
        // otherwise query the favourites table to get IDs.
        const { data: favRows, error: favErr } = await supabase
          .from("document_favourites")
          .select("document_id")
          .eq("user_id", userId);

        if (favErr) throw favErr;
        const favIds = (favRows || []).map((r) => r.document_id);
        if (!favIds.length) {
          if (reset) setDocs([]);
          else setDocs((prev) => prev);
          hasMoreRef.current = false;
          return;
        }
        q = q.in("id", favIds);
      }

      const { data: docRows, error: docErr } = await q;
      if (docErr) throw docErr;

      const rows = docRows || [];
      if (rows.length < PAGE_SIZE) hasMoreRef.current = false;

      // Pull current versions in one query
      const versionIds = rows.map((r) => r.current_version_id).filter(Boolean);
      let versionMap = {};
      if (versionIds.length) {
        const { data: vRows, error: vErr } = await supabase
          .from("document_versions")
          .select("id, file_name, mime_type, size_bytes, version_number, storage_path, document_id")
          .in("id", versionIds);

        if (vErr) throw vErr;
        versionMap = Object.fromEntries((vRows || []).map((v) => [v.id, v]));
      }

      const hydrated = rows.map((d) => {
        const v = d.current_version_id ? versionMap[d.current_version_id] : null;
        return {
          ...d,
          currentVersion: v
            ? {
                id: v.id,
                file_name: v.file_name,
                mime_type: v.mime_type,
                size_bytes: v.size_bytes,
                version_number: v.version_number,
                storage_path: v.storage_path,
              }
            : null,
        };
      });

      if (reset) {
        setDocs(hydrated);
      } else {
        setDocs((prev) => prev.concat(hydrated));
      }

      setOffset(currentOffset + PAGE_SIZE);
    } catch (e) {
      console.error("Error loading documents:", e);
      setError(e?.message || "Could not load documents.");
      if (reset) setDocs([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Refresh on filters/search change
  useEffect(() => {
    fetchDocuments({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, category, showFavouritesOnly, userId]);

  // Suggestions like Contacts: only while typing
  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    return docs.slice(0, 6);
  }, [docs, query]);

  const handleSelectDoc = async (doc) => {
    setSelectedDoc(doc);
    setQuery(doc.title || "");

    // open immediately on tap (fast UX)
    await openDocument(doc);
  };

  const openDocument = async (docOrVersionContainer) => {
    try {
      const doc = docOrVersionContainer;
      const v = doc?.currentVersion;
      if (!v?.storage_path) return;

      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(v.storage_path, 60 * 10); // 10 minutes
      if (error) throw error;

      const url = data?.signedUrl || "";
      if (!url) throw new Error("Could not create signed URL.");

      const pdf = isPdf(v.mime_type, v.file_name);
      const isOffice = !pdf && /(word|excel|spreadsheet|officedocument|msword|ms-excel)/i.test(v.mime_type);
      setOpenUrl(url);
      setOpenFileName(v.file_name || "document");
      setOpenKind(pdf ? "pdf" : isOffice ? "office" : "download");
      setViewerOpen(true);
    } catch (e) {
      console.error("Open document error:", e);
      setError(e?.message || "Could not open document.");
    }
  };

  const toggleFavourite = async (docId) => {
    if (!userId) return;
    const isFav = favouriteSet.has(docId);

    // optimistic update
    setFavouriteSet((prev) => {
      const next = new Set(prev);
      if (isFav) next.delete(docId);
      else next.add(docId);
      return next;
    });

    try {
      if (isFav) {
        const { error } = await supabase
          .from("document_favourites")
          .delete()
          .eq("user_id", userId)
          .eq("document_id", docId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("document_favourites").insert({
          user_id: userId,
          document_id: docId,
        });
        if (error) throw error;
      }
    } catch (e) {
      console.error("Favourite toggle error:", e);
      // revert on fail
      setFavouriteSet((prev) => {
        const next = new Set(prev);
        if (isFav) next.add(docId);
        else next.delete(docId);
        return next;
      });
      setError(e?.message || "Could not update favourite.");
    }
  };

  const openNewUpload = () => {
    setUploadMode("new");
    setUploadTitle("");
    setUploadCategory("Miscellaneous");
    setUploadDesc("");
    setUploadFile(null);
    setUploadOpen(true);
  };

  const openNewVersionUpload = () => {
    if (!selectedDoc) return;
    setUploadMode("newversion");
    setUploadTitle(selectedDoc.title || "");
    setUploadCategory(selectedDoc.category || "Miscellaneous");
    setUploadDesc(selectedDoc.description || "");
    setUploadFile(null);
    setUploadOpen(true);
  };

  const uploadDocument = async () => {
    if (!isAdmin) return;
    if (!uploadFile) {
      setError("Please select a file to upload.");
      return;
    }

    setUploading(true);
    setError("");

    try {
      const safeTitle = normalizeSpace(uploadTitle);
      if (uploadMode === "new" && !safeTitle) {
        setError("Please enter a document title.");
        setUploading(false);
        return;
      }

      // 1) Create doc row if new
      let docId = selectedDoc?.id || null;

      if (uploadMode === "new") {
        const { data: insDoc, error: insDocErr } = await supabase
          .from("documents")
          .insert({
            title: safeTitle,
            category: uploadCategory,
            description: normalizeSpace(uploadDesc),
            created_by: userId,
          })
          .select("id")
          .single();

        if (insDocErr) throw insDocErr;
        docId = insDoc.id;
      }

      if (!docId) throw new Error("Missing document id.");

      // 2) Determine next version number
      const { data: latestV, error: latestErr } = await supabase
        .from("document_versions")
        .select("version_number")
        .eq("document_id", docId)
        .order("version_number", { ascending: false })
        .limit(1);

      if (latestErr) throw latestErr;

      const nextVersion = (latestV?.[0]?.version_number || 0) + 1;

      // 3) Upload to Storage
      const file = uploadFile;
      const fileName = file.name || `document-${Date.now()}`;
      const path = `global/${docId}/v${nextVersion}/${fileName}`;

      const { error: upErr } = await supabase.storage
        .from("documents")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (upErr) throw upErr;

      // 4) Insert version row
      const { data: insVer, error: insVerErr } = await supabase
        .from("document_versions")
        .insert({
          document_id: docId,
          version_number: nextVersion,
          file_name: fileName,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size || 0,
          storage_path: path,
          uploaded_by: userId,
        })
        .select("id")
        .single();

      if (insVerErr) throw insVerErr;

      // 5) Update documents.current_version_id (and other metadata if desired)
      const updatePayload =
        uploadMode === "new"
          ? {
              current_version_id: insVer.id,
            }
          : {
              current_version_id: insVer.id,
              // Allow admins to adjust metadata while adding versions:
              title: safeTitle || selectedDoc?.title || "",
              category: uploadCategory,
              description: normalizeSpace(uploadDesc),
            };

      const { error: updDocErr } = await supabase
        .from("documents")
        .update(updatePayload)
        .eq("id", docId);

      if (updDocErr) throw updDocErr;

      setUploadOpen(false);
      setUploadFile(null);

      // refresh list
      await fetchDocuments({ reset: true });

      // reselect if possible
      if (uploadMode === "new") {
        setQuery(safeTitle);
      }
    } catch (e) {
      console.error("Upload error:", e);
      setError(e?.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const loadVersions = async (docId) => {
    setVersionsOpen(true);
    setVersionsLoading(true);
    setVersions([]);
    setError("");

    try {
      const { data, error } = await supabase
        .from("document_versions")
        .select("id, version_number, file_name, mime_type, size_bytes, storage_path, created_at")
        .eq("document_id", docId)
        .order("version_number", { ascending: false });

      if (error) throw error;
      setVersions(data || []);
    } catch (e) {
      console.error("Load versions error:", e);
      setError(e?.message || "Could not load versions.");
    } finally {
      setVersionsLoading(false);
    }
  };


const handleDownloadCurrent = async () => {
  try {
    if (!openUrl) return;

    // Force a real file download (works for PDF + Office + anything)
    const res = await fetch(openUrl);
    if (!res.ok) throw new Error("Download failed.");

    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = openFileName || selectedDoc?.currentVersion?.file_name || "document";
    document.body.appendChild(a);
    a.click();
    a.remove();

    window.URL.revokeObjectURL(blobUrl);
  } catch (e) {
    console.error("Download error:", e);
    setError(e?.message || "Could not download file.");
  }
};

  const openVersion = async (versionRow) => {
    try {
      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(versionRow.storage_path, 60 * 10);

      if (error) throw error;
      const url = data?.signedUrl || "";
      if (!url) throw new Error("Could not create signed URL.");

      const pdf = isPdf(versionRow.mime_type, versionRow.file_name);
      const isOffice = !pdf && /(word|excel|spreadsheet|officedocument|msword|ms-excel)/i.test(versionRow.mime_type);
      setOpenUrl(url);
      setOpenFileName(v.file_name || "document");
      setOpenKind(pdf ? "pdf" : isOffice ? "office" : "download");
      setViewerOpen(true);
    } catch (e) {
      console.error("Open version error:", e);
      setError(e?.message || "Could not open version.");
    }
  };

  
const deleteVersion = async (versionRow) => {
  if (!isAdmin) return;

  const ok = window.confirm(
    `Delete version v${versionRow.version_number}? This cannot be undone.`
  );
  if (!ok) return;

  try {
    if (versionRow.storage_path) {
      await supabase.storage.from("documents").remove([versionRow.storage_path]);
    }

    await supabase.from("document_versions").delete().eq("id", versionRow.id);

    if (selectedDoc?.currentVersion?.id === versionRow.id) {
      const { data } = await supabase
        .from("document_versions")
        .select("id")
        .eq("document_id", selectedDoc.id)
        .order("version_number", { ascending: false })
        .limit(1);

      await supabase
        .from("documents")
        .update({ current_version_id: data?.[0]?.id || null })
        .eq("id", selectedDoc.id);
    }

    loadVersions(selectedDoc.id);
    fetchDocuments({ reset: true });
  } catch (e) {
    setError(e.message || "Failed to delete version");
  }
};
const deleteDocument = async (doc) => {
    if (!isAdmin || !doc?.id) return;
    const ok = window.confirm(
      `Delete "${doc.title}" and all versions? This cannot be undone.`
    );
    if (!ok) return;

    setError("");
    try {
      // load all versions to delete storage objects
      const { data: vRows, error: vErr } = await supabase
        .from("document_versions")
        .select("storage_path")
        .eq("document_id", doc.id);

      if (vErr) throw vErr;

      const paths = (vRows || []).map((r) => r.storage_path).filter(Boolean);

      if (paths.length) {
        const { error: rmErr } = await supabase.storage
          .from("documents")
          .remove(paths);
        if (rmErr) throw rmErr;
      }

      const { error: delErr } = await supabase.from("documents").delete().eq("id", doc.id);
      if (delErr) throw delErr;

      setSelectedDoc(null);
      setQuery("");
      await fetchDocuments({ reset: true });
    } catch (e) {
      console.error("Delete document error:", e);
      setError(e?.message || "Could not delete document.");
    }
  };

  // Derived list (client-side favourite marker only)
  const listDocs = useMemo(() => {
    return docs.map((d) => ({
      ...d,
      isFavourite: favouriteSet.has(d.id),
    }));
  }, [docs, favouriteSet]);

  return (
    <PageLayout
      icon="📄"
      title="Documents"
      subtitle="Global reference documents for Pro West Portal"
    >
      {/* Search + filter card */}
      <div className="card">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <h3 className="card-title" style={{ margin: 0 }}>
            Search documents
          </h3>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <select
              aria-label="Category filter"
              className="maps-search-input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ paddingRight: "2rem" }}
            >
              <option value="All">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: "0.95rem",
                color: "#444",
                cursor: "pointer",
                padding: "0.2rem 0.35rem",
              }}
            >
              <input
                type="checkbox"
                checked={showFavouritesOnly}
                onChange={(e) => setShowFavouritesOnly(e.target.checked)}
              />
              Favourites
            </label>

            {isAdmin && (
              <button
                type="button"
                onClick={openNewUpload}
                style={{
                  padding: "0.35rem 0.6rem",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.15)",
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: "0.92rem",
                }}
              >
                + Add document
              </button>
            )}
          </div>
        </div>

        <p className="card-subtitle">
          Start typing a title. Empty search shows all documents.
        </p>

        <div style={{ marginTop: "0.4rem" }}>
          <input
            type="text"
            aria-label="Search documents by title"
            inputMode="search"
            className="maps-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by document title..."
          />
        </div>

        {error && (
          <div style={{ marginTop: "0.6rem", color: "#b00020" }}>{error}</div>
        )}

        {/* Suggestions like Contacts: only show while typing */}
        {query.trim() && (
          <div
            style={{
              marginTop: "0.4rem",
              maxHeight: "220px",
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              display: "flex",
              flexDirection: "column",
              gap: "0.35rem",
            }}
          >
            {suggestions.length === 0 && !loading && (
              <div style={{ padding: "0.6rem", color: "#666" }}>
                No documents found.
              </div>
            )}

            {suggestions.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => handleSelectDoc(d)}
                style={{
                  textAlign: "left",
                  padding: "0.65rem 0.7rem",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.08)",
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 700 }}>{d.title}</div>
                  <div style={{ color: "#777", fontSize: "0.9rem" }}>
                    {d.category}
                  </div>
                </div>
                <div style={{ marginTop: 6, color: "#666", fontSize: "0.92rem" }}>
                  {d.currentVersion
                    ? `v${d.currentVersion.version_number} • ${prettyType(
                        d.currentVersion.mime_type,
                        d.currentVersion.file_name
                      )}`
                    : "No file uploaded yet"}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected doc actions (optional, lightweight) */}
      {selectedDoc && (
        <div className="card">
          <h3 className="card-title" style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span>{selectedDoc.title}</span>
            <span style={{ color: "#777", fontSize: "0.95rem", fontWeight: 500 }}>
              {selectedDoc.category}
            </span>
          </h3>

          {selectedDoc.description && (
            <p className="card-subtitle" style={{ marginTop: 4 }}>
              {selectedDoc.description}
            </p>
          )}

          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginTop: "0.6rem" }}>
            <button
              type="button"
              onClick={() => openDocument(selectedDoc)}
              disabled={!selectedDoc.currentVersion}
              style={{
                padding: "0.45rem 0.8rem",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.15)",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              Open
            </button>

            <button
              type="button"
              onClick={() => toggleFavourite(selectedDoc.id)}
              style={{
                padding: "0.45rem 0.8rem",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.15)",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              {favouriteSet.has(selectedDoc.id) ? "★ Unfavourite" : "☆ Favourite"}
            </button>

            <button
              type="button"
              onClick={() => loadVersions(selectedDoc.id)}
              style={{
                padding: "0.45rem 0.8rem",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.15)",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              Versions
            </button>

            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={openNewVersionUpload}
                  style={{
                    padding: "0.45rem 0.8rem",
                    borderRadius: 10,
                    border: "1px solid rgba(0,0,0,0.15)",
                    background: "#fff",
                    cursor: "pointer",
                  }}
                >
                  + New version
                </button>

                <button
                  type="button"
                  onClick={() => deleteDocument(selectedDoc)}
                  style={{
                    padding: "0.45rem 0.8rem",
                    borderRadius: 10,
                    border: "1px solid rgba(0,0,0,0.15)",
                    background: "#fff",
                    cursor: "pointer",
                  }}
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* All documents list */}
      <div className="card">
        <h3 className="card-title">All documents</h3>
        <p className="card-subtitle">
          Tap a document to open. Use favourites to pin your most-used items.
        </p>

        {loading ? (
          <div style={{ padding: "0.8rem", color: "#666" }}>Loading…</div>
        ) : listDocs.length === 0 ? (
          <div style={{ padding: "0.8rem", color: "#666" }}>
            No documents to show.
          </div>
        ) : (
          <div
            style={{
              marginTop: "0.6rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.35rem",
            }}
          >
            {listDocs.map((d) => (
              <div
                key={d.id}
                onClick={() => handleSelectDoc(d)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") handleSelectDoc(d);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "0.65rem 0.7rem",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.08)",
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {d.title}
                  </div>
                  <div style={{ marginTop: 6, color: "#666", fontSize: "0.92rem", display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span>{d.category}</span>
                    <span style={{ opacity: 0.6 }}>•</span>
                    <span>
                      {d.currentVersion
                        ? `v${d.currentVersion.version_number} • ${prettyType(
                            d.currentVersion.mime_type,
                            d.currentVersion.file_name
                          )}`
                        : "No file"}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavourite(d.id);
                  }}
                  aria-label={d.isFavourite ? "Unfavourite" : "Favourite"}
                  style={{
                    flex: "0 0 auto",
                    padding: "0.35rem 0.55rem",
                    borderRadius: 10,
                    border: "1px solid rgba(0,0,0,0.15)",
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: "1rem",
                  }}
                >
                  {d.isFavourite ? "★" : "☆"}
                </button>
              </div>
            ))}

            {hasMoreRef.current && (
              <button
                type="button"
                onClick={() => fetchDocuments({ reset: false })}
                disabled={loadingMore}
                style={{
                  marginTop: "0.6rem",
                  padding: "0.55rem 0.8rem",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.15)",
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Viewer modal (PDF inline; others download) */}
      {viewerOpen && (
  <div
    role="dialog"
    aria-modal="true"
    onClick={() => setViewerOpen(false)}
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.45)",
      zIndex: 9999,
      padding: "1rem",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "min(980px, 96vw)",
        height: "min(78vh, 760px)",
        background: "#fff",
        borderRadius: 14,
        border: "1px solid rgba(0,0,0,0.12)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "0.6rem 0.75rem",
          borderBottom: "1px solid rgba(0,0,0,0.1)",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontWeight: 700 }}>
          {selectedDoc?.title || "Document"}
        </div>

<div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
  <button
    type="button"
    onClick={handleDownloadCurrent}
    style={{
      padding: "0.35rem 0.6rem",
      borderRadius: 10,
      border: "1px solid rgba(0,0,0,0.15)",
      background: "#fff",
      cursor: "pointer",
    }}
  >
    Download
  </button>
        </div>
        <button
          onClick={() => setViewerOpen(false)}
          style={{
            padding: "0.35rem 0.6rem",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.15)",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>

      <div style={{ flex: 1 }}>
        {openKind === "pdf" && (
          <iframe
            title="PDF viewer"
            src={openUrl}
            style={{ width: "100%", height: "100%", border: 0 }}
          />
        )}

        {openKind === "office" && (
          <iframe
            title="Office viewer"
            src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(openUrl)}`}
            style={{ width: "100%", height: "100%", border: 0 }}
          />
        )}

        {openKind === "download" && (
          <div style={{ padding: "1rem" }}>
            <a href={openUrl} target="_blank" rel="noreferrer">
              Click here to download / open file
            </a>
          </div>
        )}
      </div>
    </div>
  </div>
)}

{/* Versions modal */}
      {versionsOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setVersionsOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 9999,
            padding: "1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(780px, 96vw)",
              maxHeight: "80vh",
              background: "#fff",
              borderRadius: 14,
              border: "1px solid rgba(0,0,0,0.12)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "0.6rem 0.75rem",
                borderBottom: "1px solid rgba(0,0,0,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 700 }}>Versions</div>
              <button
                type="button"
                onClick={() => setVersionsOpen(false)}
                style={{
                  padding: "0.35rem 0.6rem",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.15)",
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: "0.92rem",
                }}
              >
                Close
              </button>
            </div>

            <div style={{ padding: "0.75rem", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
              {versionsLoading ? (
                <div style={{ color: "#666" }}>Loading…</div>
              ) : versions.length === 0 ? (
                <div style={{ color: "#666" }}>No versions found.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {versions.map((v) => (
  <div
    key={v.id}
    style={{
      display: "flex",
      flexDirection: "column",
      gap: "0.35rem",
    }}
  >
    <button
      type="button"
      onClick={() => openVersion(v)}
      style={{
        textAlign: "left",
        padding: "0.65rem 0.7rem",
        borderRadius: 12,
        border: "1px solid rgba(0,0,0,0.08)",
        background: "#fff",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 700 }}>
          v{v.version_number} • {prettyType(v.mime_type, v.file_name)}
          {selectedDoc?.currentVersion?.id !== v.id && (
            <span
              style={{
                marginLeft: 8,
                padding: "2px 6px",
                borderRadius: 8,
                background: "#eee",
                fontSize: "0.75rem",
              }}
            >
              Superseded
            </span>
          )}
        </div>
        <div style={{ color: "#777", fontSize: "0.9rem" }}>
          {new Date(v.created_at).toLocaleDateString()}
        </div>
      </div>

      <div style={{ marginTop: 6, color: "#666", fontSize: "0.92rem" }}>
        {v.file_name}
      </div>
    </button>

    {isAdmin && (
      <button
        type="button"
        onClick={() => deleteVersion(v)}
        style={{
          alignSelf: "flex-end",
          padding: "0.35rem 0.6rem",
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.15)",
          background: "#fff",
          cursor: "pointer",
          fontSize: "0.85rem",
        }}
      >
        Delete version
      </button>
    )}
  </div>
))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Admin upload modal */}
      {isAdmin && uploadOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setUploadOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 9999,
            padding: "1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(720px, 96vw)",
              background: "#fff",
              borderRadius: 14,
              border: "1px solid rgba(0,0,0,0.12)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "0.6rem 0.75rem",
                borderBottom: "1px solid rgba(0,0,0,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 700 }}>
                {uploadMode === "new" ? "Add document" : "Upload new version"}
              </div>
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                disabled={uploading}
                style={{
                  padding: "0.35rem 0.6rem",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.15)",
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: "0.92rem",
                }}
              >
                Close
              </button>
            </div>

            <div style={{ padding: "0.75rem", display: "grid", gap: "0.55rem" }}>
              <input
                className="maps-search-input"
                type="text"
                placeholder="Document title"
                value={uploadTitle}
                disabled={uploadMode === "newversion"} // keep stable on versions
                onChange={(e) => setUploadTitle(e.target.value)}
              />

              <select
                className="maps-search-input"
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <input
                className="maps-search-input"
                type="text"
                placeholder="Description (optional)"
                value={uploadDesc}
                onChange={(e) => setUploadDesc(e.target.value)}
              />

              <input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              />

              <button
                type="button"
                onClick={uploadDocument}
                disabled={uploading}
                style={{
                  padding: "0.6rem 0.9rem",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.15)",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}

export default Documents;
