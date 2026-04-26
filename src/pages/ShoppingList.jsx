import { useEffect, useMemo, useState } from "react";
import PageLayout from "../components/PageLayout.jsx";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

function formatAgo(dateString, nowMs) {
  if (!dateString) return "";
  const then = new Date(dateString).getTime();
  const diffSeconds = Math.max(1, Math.floor((nowMs - then) / 1000));

  if (diffSeconds < 60) return "just now";

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} min${diffMinutes === 1 ? "" : "s"} ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths} month${diffMonths === 1 ? "" : "s"} ago`;

  const diffYears = Math.floor(diffMonths / 12);
  return `${diffYears} year${diffYears === 1 ? "" : "s"} ago`;
}

function cleanText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export default function ShoppingList() {
  const { user, displayName, profile } = useAuth();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemText, setItemText] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => {
  if (!success) return;

  const timer = setTimeout(() => {
    setSuccess("");
  }, 1800); // 👈 duration (1.2 seconds)

  return () => clearTimeout(timer);
}, [success]);
  const [nowMs, setNowMs] = useState(Date.now());

  const addedByName = useMemo(() => {
    return (
      cleanText(displayName) ||
      cleanText(profile?.display_name) ||
      cleanText(profile?.full_name) ||
      cleanText(user?.email) ||
      "Unknown user"
    );
  }, [displayName, profile, user]);

  async function loadItems() {
    setError("");
    setLoading(true);

    // Auto-clear purchased items older than 24 hours
await supabase
  .from("shopping_list_items")
  .delete()
  .eq("is_purchased", true)
  .lt("purchased_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

const { data, error: loadError } = await supabase
  .from("shopping_list_items")
  .select("*")
  .order("is_purchased", { ascending: true })
  .order("created_at", { ascending: false });

    if (loadError) {
      console.error(loadError);
      setError(loadError.message || "Could not load shopping list.");
      setItems([]);
    } else {
      setItems(data || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadItems();

    const channel = supabase
      .channel("shopping-list-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shopping_list_items",
        },
        () => {
          loadItems();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30000);

    return () => window.clearInterval(timer);
  }, []);

  function openAddModal() {
    setEditingItem(null);
    setItemText("");
    setError("");
    setSuccess("");
    setModalOpen(true);
  }

  function openEditModal(item) {
    setEditingItem(item);
    setItemText(item.item_text || "");
    setError("");
    setSuccess("");
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setEditingItem(null);
    setItemText("");
  }

  async function handleSave(e) {
    e.preventDefault();

    const cleaned = cleanText(itemText);
    if (!cleaned) {
      setError("Please enter an item.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    if (editingItem?.id) {
      const { error: updateError } = await supabase
        .from("shopping_list_items")
        .update({
          item_text: cleaned,
        })
        .eq("id", editingItem.id);

      if (updateError) {
        console.error(updateError);
        setError(updateError.message || "Could not update item.");
        setSaving(false);
        return;
      }

      setSuccess("Item updated.");
    } else {
      const { error: insertError } = await supabase
        .from("shopping_list_items")
        .insert({
          item_text: cleaned,
          created_by: user?.id,
          created_by_name: addedByName,
        });

      if (insertError) {
        console.error(insertError);
        setError(insertError.message || "Could not add item.");
        setSaving(false);
        return;
      }

      setSuccess("Item added.");
    }

    setSaving(false);
    closeModal();
    await loadItems();
  }

async function handleTogglePurchased(item) {
  setError("");
  setSuccess("");

  const nextPurchased = !item.is_purchased;

  const { error: updateError } = await supabase
    .from("shopping_list_items")
    .update({
      is_purchased: nextPurchased,
      purchased_at: nextPurchased ? new Date().toISOString() : null,
    })
    .eq("id", item.id);

  if (updateError) {
    console.error(updateError);
    setError(updateError.message || "Could not update purchased status.");
    return;
  }

  setSuccess(nextPurchased ? "Item marked as purchased." : "Item moved back to active list.");
  await loadItems();
}

  async function handleDelete(item) {
    const ok = window.confirm(`Remove "${item.item_text}" from the shopping list?`);
    if (!ok) return;

    setError("");
    setSuccess("");

    const { error: deleteError } = await supabase
      .from("shopping_list_items")
      .delete()
      .eq("id", item.id);

    if (deleteError) {
      console.error(deleteError);
      setError(deleteError.message || "Could not delete item.");
      return;
    }

    setSuccess("Item removed.");
    await loadItems();
  }

async function handleClearList() {
  const ok = window.confirm(
    "Clear the entire shopping list?\n\nThis will remove ALL items."
  );
  if (!ok) return;

  setError("");
  setSuccess("");

  const { error: deleteError } = await supabase
    .from("shopping_list_items")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000"); // delete all

  if (deleteError) {
    console.error(deleteError);
    setError(deleteError.message || "Could not clear list.");
    return;
  }

  setSuccess("Shopping list cleared.");
  await loadItems();
}

  return (
    <PageLayout
      icon="🛒"
      title="Shopping List"
      subtitle="Add items that need to be purchased for the team."
      actions={
  <div style={{ display: "flex", gap: "0.4rem" }}>
    <button
      type="button"
      className="btn-pill primary"
      onClick={openAddModal}
    >
      + Add item
    </button>

    <button
  type="button"
  className="btn-pill danger"
  onClick={handleClearList}
  disabled={items.length === 0}
>
  Clear List
</button>
  </div>
}
    >
      <div className="shopping-list-page">
        {error && <div className="shopping-list-message error">{error}</div>}
        {success && <div className="shopping-list-message success">{success}</div>}

        <div className="card shopping-list-card">
          {loading ? (
            <p className="shopping-list-empty">Loading shopping list...</p>
          ) : items.length === 0 ? (
            <p className="shopping-list-empty">
              No items yet. Use Add item to start the shopping list.
            </p>
          ) : (
            <div className="shopping-list-items">
              {items.map((item) => (
                <div
  className={`shopping-list-item ${item.is_purchased ? "is-purchased" : ""}`}
  key={item.id}
>
                  <div className="shopping-list-item-main">
                    <div className="shopping-list-text">{item.item_text}</div>
                    <div className="shopping-list-meta">
                      Added by{" "}
                      <strong>{item.created_by_name || "Unknown user"}</strong>{" "}
                      · {formatAgo(item.created_at, nowMs)}
                    </div>
                  </div>

                  <div className="shopping-list-actions">
                    <button
                      type="button"
                      className="btn-pill secondary shopping-list-edit-btn"
                      onClick={() => openEditModal(item)}
                    >
                      Edit
                    </button>

                    <button
  type="button"
  className="btn-pill danger"
  onClick={() => handleDelete(item)}
>
  Delete
</button>

<button
  type="button"
  className={`btn-pill ${item.is_purchased ? "secondary" : "primary"}`}
  onClick={() => handleTogglePurchased(item)}
>
  {item.is_purchased ? "Undo" : "Purchased"}
</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {modalOpen && (
          <div className="modal-backdrop">
            <div className="modal-card shopping-list-modal">
              <div className="modal-header">
  <h3>{editingItem ? "Edit item" : "Add item"}</h3>
</div>

              <form onSubmit={handleSave}>
              <div className="form-label">What do we need?</div>

<textarea
  className="form-input shopping-list-textarea"
  value={itemText}
  onChange={(e) => setItemText(e.target.value)}
  placeholder="e.g. Spray paint, flagging tape, pegs, batteries..."
  rows={4}
  autoFocus
/>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-pill secondary"
                    onClick={closeModal}
                    disabled={saving}
                  >
                    Cancel
                  </button>

                  <button type="submit" className="btn-pill primary" disabled={saving}>
                    {saving ? "Saving..." : editingItem ? "Save changes" : "Add item"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}