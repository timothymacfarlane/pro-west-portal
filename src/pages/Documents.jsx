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

function openUrlInNewTab(url) {
  if (!url || typeof window === "undefined") return false;

  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (opened) {
    opened.opener = null;
    return true;
  }

  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}

function openBlankNewTab() {
  if (typeof window === "undefined") return null;
  const opened = window.open("about:blank", "_blank", "noopener,noreferrer");
  if (opened) opened.opener = null;
  return opened;
}

function sendTabToUrl(tab, url) {
  if (!url) return false;
  if (tab && !tab.closed) {
    tab.location.href = url;
    return true;
  }
  return openUrlInNewTab(url);
}

async function downloadSignedUrl(url, fileName = "document") {
  if (!url) throw new Error("Missing file URL.");

  const res = await fetch(url);
  if (!res.ok) throw new Error("Download failed.");

  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);

  try {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = fileName || "document";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    window.URL.revokeObjectURL(blobUrl);
  }
}

function formatDocumentDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString();
}

function escapePostgrestPattern(value) {
  return value.replace(/[%_]/g, (match) => "\\" + match);
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
const [showSuggestions, setShowSuggestions] = useState(false);
const debouncedQuery = useDebounced(query, 250);

  const [category, setCategory] = useState("All");
  const [showFavouritesOnly, setShowFavouritesOnly] = useState(false);

  const [docs, setDocs] = useState([]);
  const [favouriteSet, setFavouriteSet] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [selectedDoc, setSelectedDoc] = useState(null);
  const [openUrl, setOpenUrl] = useState("");
  const [openKind, setOpenKind] = useState(""); // "pdf" | "office" | "download"
  const [openFileName, setOpenFileName] = useState("");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

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
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Pagination
  const PAGE_SIZE = 50;
  const [offset, setOffset] = useState(0);
  const hasMoreRef = useRef(true);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;

    const media = window.matchMedia("(max-width: 640px)");
    const syncSmallScreen = () => setIsSmallScreen(media.matches);
    syncSmallScreen();

    if (media.addEventListener) {
      media.addEventListener("change", syncSmallScreen);
      return () => media.removeEventListener("change", syncSmallScreen);
    }

    media.addListener(syncSmallScreen);
    return () => media.removeListener(syncSmallScreen);
  }, []);

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

useEffect(() => {
  const handleKey = (e) => {
    if (e.key === "Escape") {
      setViewerOpen(false);
      setVersionsOpen(false);
      setUploadOpen(false);
      if (!deleting) setDeleteConfirm(null);
    }
  };

  window.addEventListener("keydown", handleKey);
  return () => window.removeEventListener("keydown", handleKey);
}, [deleting]);

useEffect(() => {
  if (typeof document === "undefined") return undefined;

  const modalOpen = viewerOpen || versionsOpen || uploadOpen || !!deleteConfirm;
  if (!modalOpen) return undefined;

  const previousOverflow = document.body.style.overflow;
  const previousTouchAction = document.body.style.touchAction;

  document.body.style.overflow = "hidden";
  document.body.style.touchAction = "none";

  return () => {
    document.body.style.overflow = previousOverflow;
    document.body.style.touchAction = previousTouchAction;
  };
}, [viewerOpen, versionsOpen, uploadOpen, deleteConfirm]);

// ✅ ADD AUTO-HIDE HERE
useEffect(() => {
  if (!success) return;

  const t = setTimeout(() => {
    setSuccess("");
  }, 3000);

  return () => clearTimeout(t);
}, [success]);

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

      const searchText = normalizeSpace(debouncedQuery);
      if (searchText) {
        const pattern = `%${escapePostgrestPattern(searchText)}%`;
        q = q.or(`title.ilike.${pattern},description.ilike.${pattern}`);
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

 const handleSelectDoc = (doc) => {
  setSelectedDoc(doc);
  setQuery(doc.title || "");
  setShowSuggestions(false);
};

  const openDocument = async (docOrVersionContainer) => {
    let pendingExternalTab = null;
    try {
      const doc = docOrVersionContainer;
      const v = doc?.currentVersion;
      if (!v?.storage_path) return;

      const pdf = isPdf(v.mime_type, v.file_name);
      const isOffice = !pdf && /(word|excel|spreadsheet|officedocument|msword|ms-excel)/i.test(v.mime_type);
      const mobileDirectDownload = isSmallScreen && pdf;
      const mobileExternalOpen = isSmallScreen && isOffice;
      if (mobileExternalOpen) pendingExternalTab = openBlankNewTab();

      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(v.storage_path, 60 * 10); // 10 minutes
      if (error) throw error;

      const url = data?.signedUrl || "";
      if (!url) throw new Error("Could not create signed URL.");

      if (mobileDirectDownload) {
        await downloadSignedUrl(url, v.file_name || "document");
        return;
      }

      if (mobileExternalOpen) {
        sendTabToUrl(pendingExternalTab, url);
        return;
      }

      setOpenUrl(url);
      setOpenFileName(v.file_name || "document");     
      setOpenKind(pdf ? "pdf" : isOffice ? "office" : "download");
      setViewerOpen(true);
    } catch (e) {
      if (pendingExternalTab && !pendingExternalTab.closed) pendingExternalTab.close();
      console.error("Open document error:", e);
      setError(e?.message || "Could not open document.");
    }
  };

const downloadCurrentVersion = async (doc) => {
  try {
    const v = doc?.currentVersion;
    if (!v?.storage_path) return;

    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(v.storage_path, 60 * 10);

    if (error) throw error;

    const url = data?.signedUrl || "";
    if (!url) throw new Error("Could not create signed URL.");

    await downloadSignedUrl(url, v.file_name || "document");
  } catch (e) {
    console.error("Download current version error:", e);
    setError(e?.message || "Could not download document.");
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
setSuccess("");

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

const originalFileName = file.name || `document-${Date.now()}`;
const safeFileName = originalFileName
  .replace(/[^a-zA-Z0-9._-]/g, "_")
  .replace(/_+/g, "_");

const fileName = safeFileName;
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

// ✅ SUCCESS MESSAGE
setSuccess(
  uploadMode === "new"
    ? "Document successfully added"
    : "New version uploaded successfully"
);

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
        .select("id, version_number, file_name, mime_type, size_bytes, storage_path, created_at, uploaded_by")
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
    await downloadSignedUrl(openUrl, openFileName || selectedDoc?.currentVersion?.file_name || "document");
  } catch (e) {
    console.error("Download error:", e);
    setError(e?.message || "Could not download file.");
  }
};

const handleOpenDocumentLink = (event) => {
  if (!isSmallScreen || !openUrl) return;
  event.preventDefault();
  handleDownloadCurrent();
};

  const openVersion = async (versionRow) => {
    let pendingExternalTab = null;
    try {
      const pdf = isPdf(versionRow.mime_type, versionRow.file_name);
      const isOffice = !pdf && /(word|excel|spreadsheet|officedocument|msword|ms-excel)/i.test(versionRow.mime_type);
      const mobileDirectDownload = isSmallScreen && pdf;
      const mobileExternalOpen = isSmallScreen && isOffice;
      if (mobileExternalOpen) pendingExternalTab = openBlankNewTab();

      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(versionRow.storage_path, 60 * 10);

      if (error) throw error;
      const url = data?.signedUrl || "";
      if (!url) throw new Error("Could not create signed URL.");

      if (mobileDirectDownload) {
        await downloadSignedUrl(url, versionRow.file_name || "document");
        return;
      }

      if (mobileExternalOpen) {
        sendTabToUrl(pendingExternalTab, url);
        return;
      }

      setOpenUrl(url);
      setOpenFileName(versionRow.file_name || "document");
      setOpenKind(pdf ? "pdf" : isOffice ? "office" : "download");
      setViewerOpen(true);
    } catch (e) {
      if (pendingExternalTab && !pendingExternalTab.closed) pendingExternalTab.close();
      console.error("Open version error:", e);
      setError(e?.message || "Could not open version.");
    }
  };

  const downloadVersion = async (versionRow) => {
    try {
      if (!versionRow?.storage_path) return;

      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(versionRow.storage_path, 60 * 10);

      if (error) throw error;
      const url = data?.signedUrl || "";
      if (!url) throw new Error("Could not create signed URL.");

      await downloadSignedUrl(url, versionRow.file_name || "document");
    } catch (e) {
      console.error("Download version error:", e);
      setError(e?.message || "Could not download version.");
    }
  };

  const requestDeleteDocument = (doc) => {
    if (!isAdmin || !doc?.id) return;
    setDeleteConfirm({ type: "document", item: doc });
  };

  const requestDeleteVersion = (versionRow) => {
    if (!isAdmin || !versionRow?.id) return;
    setDeleteConfirm({ type: "version", item: versionRow });
  };

  
const performDeleteVersion = async (versionRow) => {
  if (!isAdmin) return;
  const docId = selectedDoc?.id;

  try {
    if (versionRow.storage_path) {
      await supabase.storage.from("documents").remove([versionRow.storage_path]);
    }

    await supabase.from("document_versions").delete().eq("id", versionRow.id);

    if (selectedDoc?.currentVersion?.id === versionRow.id) {
      const { data } = await supabase
        .from("document_versions")
        .select("id")
        .eq("document_id", docId)
        .order("version_number", { ascending: false })
        .limit(1);

      await supabase
        .from("documents")
        .update({ current_version_id: data?.[0]?.id || null })
        .eq("id", docId);
    }

    if (docId) loadVersions(docId);
    await fetchDocuments({ reset: true });
  } catch (e) {
    console.error("Delete version error:", e);
    setError(e.message || "Failed to delete version");
    throw e;
  }
};
const performDeleteDocument = async (doc) => {
    if (!isAdmin || !doc?.id) return;

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
      throw e;
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm || deleting) return;

    setDeleting(true);
    try {
      if (deleteConfirm.type === "version") {
        await performDeleteVersion(deleteConfirm.item);
      } else {
        await performDeleteDocument(deleteConfirm.item);
      }
      setDeleteConfirm(null);
    } finally {
      setDeleting(false);
    }
  };

  // Derived list (client-side favourite marker only)
  const listDocs = useMemo(() => {
    return docs.map((d) => ({
      ...d,
      isFavourite: favouriteSet.has(d.id),
    }));
  }, [docs, favouriteSet]);

  const deleteConfirmTitle =
    deleteConfirm?.type === "version"
      ? `Delete version v${deleteConfirm.item?.version_number}?`
      : deleteConfirm?.item?.title
        ? `Delete "${deleteConfirm.item.title}"?`
        : "Delete document?";

  const deleteConfirmBody =
    deleteConfirm?.type === "version"
      ? "This version and its stored file will be permanently removed. If it is the current version, the latest remaining version will become current."
      : "This document and all of its versions will be permanently removed from the portal.";

  return (
    <PageLayout
      icon="📄"
      title="Documents"
      subtitle="Quick reference to Pro West and Global documents"
    >
      {/* Search + filter card */}
      <div className="card">
      <div
  style={{
    display: "flex",
    justifyContent: "space-between",
    gap: "1rem",
    flexWrap: "wrap",
  }}
>
  {/* LEFT SIDE */}
  <div style={{ minWidth: "260px", flex: "1 1 300px" }}>
    <h3 className="card-title" style={{ margin: 0 }}>
      Search documents
    </h3>

    <p className="card-subtitle" style={{ marginTop: "0.4rem" }}>
      Start typing a title or description. Empty search shows all documents.
    </p>

    <div style={{ marginTop: "0.4rem" }}>
      <input
        type="text"
        aria-label="Search documents by title or description"
        inputMode="search"
        className="maps-search-input"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setShowSuggestions(true);
        }}
        placeholder="Search by title or description..."
      />
    </div>
  </div>

  {/* RIGHT SIDE */}
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      gap: "0.5rem",
      flex: "0 1 auto",
    }}
  >
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
      <select
        aria-label="Category filter"
        className="maps-search-input"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        style={{ paddingRight: "2rem" }}
      >
        <option value="All">All categories</option>
        {[...CATEGORIES].sort().map((c) => (
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
        }}
      >
        <input
          type="checkbox"
          checked={showFavouritesOnly}
          onChange={(e) => setShowFavouritesOnly(e.target.checked)}
        />
        Favourites
      </label>
    </div>

    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={() => {
          setQuery("");
          setCategory("All");
          setShowFavouritesOnly(false);
          setSelectedDoc(null);
          fetchDocuments({ reset: true });
        }}
        disabled={loading}
        className="btn-pill secondary"
      >
        {loading ? "Refreshing…" : "Refresh"}
      </button>

      {isAdmin && (
        <button
          type="button"
          onClick={openNewUpload}
          className="btn-pill primary"
        >
          + Add document
        </button>
      )}
    </div>
  </div>
</div>
       
        {error && (
          <div style={{ marginTop: "0.6rem", color: "#b00020" }}>{error}</div>
        )}
        {success && (
  <div
    style={{
      marginTop: "0.6rem",
      color: "#2e7d32",
      fontWeight: 600,
    }}
  >
    {success}
  </div>
)}

        {/* Suggestions like Contacts: only show while typing */}
        {showSuggestions && query.trim() && (
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

      {/* Selected document result/actions */}
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
  className="btn-pill secondary"
>
  Open
</button>

<button
  type="button"
  onClick={() => downloadCurrentVersion(selectedDoc)}
  disabled={!selectedDoc.currentVersion}
  className="btn-pill secondary"
>
  Download
</button>

<button
  type="button"
  onClick={() => toggleFavourite(selectedDoc.id)}
  className="btn-pill secondary"
>
              {favouriteSet.has(selectedDoc.id) ? "★ Unfavourite" : "☆ Favourite"}
            </button>

            <button
  type="button"
  onClick={() => loadVersions(selectedDoc.id)}
  className="btn-pill secondary"
>
              Versions
            </button>

            {isAdmin && (
              <>
               <button
  type="button"
  onClick={openNewVersionUpload}
  className="btn-pill primary"
>
                  + New version
                </button>

                <button
  type="button"
  onClick={() => requestDeleteDocument(selectedDoc)}
  className="btn-pill danger"
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
          Tap a document to select it, then choose Open, Favourite, Versions or Delete.
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
  className="btn-pill secondary"
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
  className="btn-pill secondary"
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
    className="documents-modal-backdrop documents-viewer-backdrop"
    onClick={() => setViewerOpen(false)}
   style={{
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  zIndex: 9999,
  padding: "max(0.5rem, env(safe-area-inset-top)) 0.5rem max(0.5rem, env(safe-area-inset-bottom))",
  display: "flex",
  alignItems: "stretch",
  justifyContent: "center",
}}
  >
    <div
      className="documents-modal-card documents-viewer-card"
      onClick={(e) => e.stopPropagation()}
     style={{
  width: "min(980px, 100vw)",
  height: "100%",
maxHeight: "100%",
  background: "#fff",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
}}
    >
      <div
  className="documents-modal-header documents-viewer-header"
  style={{
  padding: "0.6rem 0.75rem",
  borderBottom: "1px solid rgba(0,0,0,0.1)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
  flexWrap: "wrap",
  flexShrink: 0,
  position: "sticky",
  top: 0,
  background: "#fff",
  zIndex: 2,
}}
      >
        <div className="documents-viewer-title" style={{ fontWeight: 700 }}>
          {selectedDoc?.title || openFileName || "Document"}
        </div>

<div className="documents-viewer-actions" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
 <button
  type="button"
  onClick={handleDownloadCurrent}
  className="btn-pill secondary"
>
    Download
  </button>
  <a
    href={openUrl}
    target="_blank"
    rel="noreferrer"
    onClick={handleOpenDocumentLink}
    className="btn-pill secondary documents-open-link"
  >
    Open document
  </a>
        </div>
        <button
  type="button"
  onClick={() => setViewerOpen(false)}
  className="btn-pill secondary documents-modal-close"
>
          Close
        </button>
      </div>

      <div
  className="documents-viewer-body"
  style={{
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    WebkitOverflowScrolling: "touch",
    paddingBottom: "env(safe-area-inset-bottom)",
  }}
>
        {(openKind === "pdf" || openKind === "office") && (
          <div className="documents-viewer-fallback">
            <span>Preview not fitting your screen?</span>
            <a href={openUrl} target="_blank" rel="noreferrer" onClick={handleOpenDocumentLink} className="btn-pill secondary">
              Open document
            </a>
            <button type="button" onClick={handleDownloadCurrent} className="btn-pill secondary">
              Download
            </button>
          </div>
        )}

        {openKind === "pdf" && (
          <iframe
            title="PDF viewer"
            className="documents-viewer-frame documents-pdf-frame"
            src={openUrl}
           style={{
  width: "100%",
  height: "100%",
  minHeight: "100%",
  border: 0,
  display: "block",
}}
          />
        )}

        {openKind === "office" && (
          <iframe
            title="Office viewer"
            className="documents-viewer-frame documents-office-frame"
            src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(openUrl)}`}
           style={{
  width: "100%",
  height: "100%",
  minHeight: "100%",
  border: 0,
  display: "block",
}}
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
          className="documents-modal-backdrop documents-versions-backdrop"
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
            className="documents-modal-card documents-versions-card"
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
              className="documents-modal-header documents-versions-header"
              style={{
                padding: "0.6rem 0.75rem",
                borderBottom: "1px solid rgba(0,0,0,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div className="documents-modal-title-block">
                <div className="documents-modal-title">Versions</div>
                {selectedDoc?.title && (
                  <div className="documents-modal-subtitle">{selectedDoc.title}</div>
                )}
              </div>
              <button
  type="button"
  onClick={() => setVersionsOpen(false)}
  className="btn-pill secondary documents-modal-close documents-versions-close"
>
                Close
              </button>
            </div>

            <div className="documents-modal-body documents-versions-body" style={{ padding: "0.75rem", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
              {versionsLoading ? (
                <div style={{ color: "#666" }}>Loading…</div>
              ) : versions.length === 0 ? (
                <div style={{ color: "#666" }}>No versions found.</div>
              ) : (
                <div className="documents-version-list" style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {versions.map((v) => (
  <div
    key={v.id}
    className="documents-version-entry"
    style={{
      display: "flex",
      flexDirection: "column",
      gap: "0.35rem",
    }}
  >
    <div
      className="documents-version-row"
      style={{
        textAlign: "left",
        padding: "0.65rem 0.7rem",
        borderRadius: 12,
        border: "1px solid rgba(0,0,0,0.08)",
        background: "#fff",
      }}
    >
      <div className="documents-version-meta" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div className="documents-version-label" style={{ fontWeight: 700 }}>
          v{v.version_number} • {prettyType(v.mime_type, v.file_name)}
          {selectedDoc?.currentVersion?.id !== v.id && (
            <span
              className="documents-version-badge"
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
        <div className="documents-version-date" style={{ color: "#777", fontSize: "0.9rem" }}>
          {formatDocumentDate(v.created_at)}
        </div>
      </div>

      <div className="documents-version-file" style={{ marginTop: 6, color: "#666", fontSize: "0.92rem" }}>
        {v.file_name}
      </div>

      {v.uploaded_by && (
        <div className="documents-version-uploader">
          Uploaded by {v.uploaded_by}
        </div>
      )}

      <div className="documents-version-actions" style={{ display: "flex", justifyContent: "flex-start" }}>
        <button
          type="button"
          onClick={() => openVersion(v)}
          className="btn-pill secondary"
        >
          Open
        </button>
        <button
          type="button"
          onClick={() => downloadVersion(v)}
          className="btn-pill secondary"
        >
          Download
        </button>
   {isAdmin && (
    <button
      type="button"
      onClick={() => requestDeleteVersion(v)}
      className="btn-pill danger"
    >
      Delete version
    </button>
)}
      </div>
    </div>
  </div>
))}
                </div>
              )}
            </div>
            <div className="documents-versions-footer">
              <button
                type="button"
                onClick={() => setVersionsOpen(false)}
                className="btn-pill secondary documents-versions-footer-close"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="documents-delete-title"
          className="documents-modal-backdrop documents-delete-backdrop"
          onClick={() => {
            if (!deleting) setDeleteConfirm(null);
          }}
        >
          <div
            className="documents-modal-card documents-delete-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="documents-modal-header documents-delete-header">
              <div className="documents-modal-title-block">
                <div id="documents-delete-title" className="documents-modal-title">
                  {deleteConfirmTitle}
                </div>
                <div className="documents-modal-subtitle">This action cannot be undone.</div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="btn-pill secondary documents-modal-close"
              >
                Close
              </button>
            </div>

            <div className="documents-modal-body documents-delete-body">
              <p>{deleteConfirmBody}</p>
              {deleteConfirm?.item?.file_name && (
                <div className="documents-delete-file">{deleteConfirm.item.file_name}</div>
              )}
            </div>

            <div className="documents-delete-actions">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="btn-pill secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="btn-pill danger"
              >
                {deleting ? "Deleting…" : "Confirm delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin upload modal */}
      {isAdmin && uploadOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="documents-modal-backdrop"
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
            className="documents-modal-card documents-upload-card"
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
              className="documents-modal-header documents-upload-header"
              style={{
                padding: "0.6rem 0.75rem",
                borderBottom: "1px solid rgba(0,0,0,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div className="documents-modal-title-block">
                <div className="documents-modal-title">
                  {uploadMode === "new" ? "Add document" : "Add Version"}
                </div>
                {uploadMode === "newversion" && selectedDoc?.title && (
                  <div className="documents-modal-subtitle">{selectedDoc.title}</div>
                )}
              </div>
              <button
  type="button"
  onClick={() => setUploadOpen(false)}
  className="btn-pill secondary documents-modal-close"
>
                Close
              </button>
            </div>

            <div className="documents-modal-body documents-upload-body" style={{ padding: "0.75rem", display: "grid", gap: "0.55rem" }}>
              <label className="documents-form-field">
                <span>Document title</span>
                <input
                  className="maps-search-input"
                  type="text"
                  placeholder="Document title"
                  value={uploadTitle}
                  disabled={uploadMode === "newversion"} // keep stable on versions
                  onChange={(e) => setUploadTitle(e.target.value)}
                />
              </label>

              <label className="documents-form-field">
                <span>Category</span>
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
              </label>

              <label className="documents-form-field">
                <span>Description</span>
                <input
                  className="maps-search-input"
                  type="text"
                  placeholder="Description (optional)"
                  value={uploadDesc}
                  onChange={(e) => setUploadDesc(e.target.value)}
                />
              </label>

              <label className="documents-form-field">
                <span>File</span>
                <input
                  className="documents-file-input"
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>

             <div className="documents-upload-actions" style={{ display: "flex", justifyContent: "flex-start" }}>
  <button
    type="button"
    onClick={() => setUploadOpen(false)}
    disabled={uploading}
    className="btn-pill secondary"
  >
    Cancel
  </button>
  <button
    type="button"
    onClick={uploadDocument}
    disabled={uploading}
    className="btn-pill primary"
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
