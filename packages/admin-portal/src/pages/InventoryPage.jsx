import { useEffect, useMemo, useState } from "react";
import { createInventoryItem, deleteInventoryItem, getInventory, updateInventoryItem } from "../services/api.js";
import "../styles/pages/Inventory.css";

const EMPTY_FORM = {
  name: "", genericName: "", category: "Medicine", quantity: "", unit: "units",
  reorderLevel: "5", expiryDate: "", batchNumber: "", supplier: "", notes: "",
};
const CATEGORIES = ["Medicine", "First Aid", "Medical Supply", "Other"];
const dateValue = (value) => value ? new Date(value).toLocaleDateString([], { dateStyle: "medium" }) : "—";

function isExpired(item) {
  return item.expiryDate && new Date(item.expiryDate) < new Date(new Date().toDateString());
}

function isExpiringSoon(item) {
  if (!item.expiryDate || isExpired(item)) return false;
  const days = (new Date(item.expiryDate) - new Date()) / 86400000;
  return days <= 60;
}

function itemForm(item) {
  return item ? {
    name: item.name || "", genericName: item.genericName || "", category: item.category || "Medicine",
    quantity: String(item.quantity ?? 0), unit: item.unit || "units", reorderLevel: String(item.reorderLevel ?? 5),
    expiryDate: item.expiryDate ? new Date(item.expiryDate).toISOString().slice(0, 10) : "",
    batchNumber: item.batchNumber || "", supplier: item.supplier || "", notes: item.notes || "",
  } : EMPTY_FORM;
}

export default function InventoryPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  async function refresh() {
    setLoading(true);
    setError("");
    try { setItems(await getInventory()); }
    catch { setError("Could not load medicine inventory. Check the server connection and your access."); }
    finally { setLoading(false); }
  }

  useEffect(() => { refresh(); }, []);

  const lowStockCount = items.filter((item) => item.quantity <= item.reorderLevel).length;
  const visibleItems = useMemo(() => items.filter((item) => {
    const matchesQuery = `${item.name} ${item.genericName || ""} ${item.category} ${item.batchNumber || ""}`.toLowerCase().includes(query.trim().toLowerCase());
    const matchesFilter = filter === "all" || (filter === "low" ? item.quantity <= item.reorderLevel : isExpiringSoon(item) || isExpired(item));
    return matchesQuery && matchesFilter;
  }), [items, query, filter]);

  function startEdit(item) {
    setEditing(item);
    setForm(itemForm(item));
    setNotice("");
    setError("");
    document.querySelector(".inventory-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetForm() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const payload = {
      ...form,
      quantity: Number(form.quantity),
      reorderLevel: Number(form.reorderLevel),
      expiryDate: form.expiryDate || null,
    };
    try {
      if (editing) {
        const updated = await updateInventoryItem(editing._id, payload);
        setItems((current) => current.map((item) => item._id === updated._id ? updated : item));
        setNotice(`${updated.name} was updated.`);
      } else {
        const created = await createInventoryItem(payload);
        setItems((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
        setNotice(`${created.name} was added to inventory.`);
      }
      resetForm();
    } catch (saveError) {
      setError(saveError?.response?.data?.message || "Could not save this inventory item. Check the values and try again.");
    } finally { setSaving(false); }
  }

  async function removeItem(item) {
    if (!window.confirm(`Remove ${item.name} from the active inventory?`)) return;
    setError("");
    try {
      await deleteInventoryItem(item._id);
      setItems((current) => current.filter((row) => row._id !== item._id));
      if (editing?._id === item._id) resetForm();
      setNotice(`${item.name} was removed from active inventory.`);
    } catch (deleteError) {
      setError(deleteError?.response?.data?.message || "Could not remove this inventory item.");
    }
  }

  return <div className="inventory-page">
    <div className="page-header inventory-heading">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="M3 8v9l9 5 9-5V8M12 13v9" /></svg>
      <div><h1>Medicine Inventory</h1><p className="page-subtitle">Track clinic medicines and supplies, stock levels, and expiry dates.</p></div>
    </div>

    <div className="stat-cards inventory-stats">
      <div className="stat-card"><div className="stat-label">Active Items</div><div className="stat-value">{items.length}</div></div>
      <div className="stat-card"><div className="stat-label">Low Stock</div><div className="stat-value">{lowStockCount}</div></div>
      <div className="stat-card"><div className="stat-label">Expiry Alerts</div><div className="stat-value">{items.filter((item) => isExpiringSoon(item) || isExpired(item)).length}</div></div>
    </div>

    <section className="card inventory-form-card">
      <div className="inventory-section-heading"><div><h2>{editing ? "Edit Inventory Item" : "Add Inventory Item"}</h2><p className="page-subtitle">Record stock quantity and optional batch details.</p></div>{editing && <button className="btn btn-outline" type="button" onClick={resetForm}>Cancel Edit</button>}</div>
      <form className="inventory-form" onSubmit={submit}>
        <label className="field-label">Item Name<input className="text-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={120} required /></label>
        <label className="field-label">Generic Name<input className="text-input" value={form.genericName} onChange={(event) => setForm({ ...form, genericName: event.target.value })} maxLength={120} /></label>
        <label className="field-label">Category<select className="text-input" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
        <label className="field-label">Quantity<input className="text-input" type="number" min="0" step="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required /></label>
        <label className="field-label">Unit<input className="text-input" value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} placeholder="tablets, boxes, pieces" maxLength={30} required /></label>
        <label className="field-label">Low Stock Alert At<input className="text-input" type="number" min="0" step="1" value={form.reorderLevel} onChange={(event) => setForm({ ...form, reorderLevel: event.target.value })} required /></label>
        <label className="field-label">Expiry Date<input className="text-input" type="date" value={form.expiryDate} onChange={(event) => setForm({ ...form, expiryDate: event.target.value })} /></label>
        <label className="field-label">Batch Number<input className="text-input" value={form.batchNumber} onChange={(event) => setForm({ ...form, batchNumber: event.target.value })} maxLength={80} /></label>
        <label className="field-label">Supplier<input className="text-input" value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })} maxLength={120} /></label>
        <label className="field-label inventory-notes-field">Notes<textarea className="text-input" rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} maxLength={1000} /></label>
        <div className="inventory-form-actions"><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save Changes" : "Add to Inventory"}</button></div>
      </form>
      {error && <p className="error-text" role="alert">{error}</p>}
      {notice && <p className="inventory-notice" role="status">{notice}</p>}
    </section>

    <section className="inventory-list-section">
      <div className="inventory-list-heading"><div><h2>Current Stock</h2><p className="page-subtitle">{visibleItems.length} of {items.length} item{items.length === 1 ? "" : "s"}</p></div>
        <div className="inventory-tools"><input className="text-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search inventory" aria-label="Search inventory" /><select className="text-input" value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter inventory"><option value="all">All stock</option><option value="low">Low stock</option><option value="expiry">Expiring / expired</option></select><button className="btn btn-outline" type="button" onClick={refresh} disabled={loading}>Refresh</button></div>
      </div>
      {loading ? <p className="page-subtitle">Loading inventory…</p> : visibleItems.length ? <div className="table-wrap inventory-table-wrap"><table className="data-table"><thead><tr><th>Item</th><th>Category</th><th>Stock</th><th>Reorder At</th><th>Expiry</th><th>Batch</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {visibleItems.map((item) => {
          const low = item.quantity <= item.reorderLevel;
          const expired = isExpired(item);
          const expiring = isExpiringSoon(item);
          return <tr key={item._id}>
            <td><strong>{item.name}</strong>{item.genericName && <small className="inventory-secondary">{item.genericName}</small>}</td>
            <td>{item.category}</td><td>{item.quantity} {item.unit}</td><td>{item.reorderLevel} {item.unit}</td><td>{dateValue(item.expiryDate)}</td><td>{item.batchNumber || "—"}</td>
            <td>{expired ? <span className="badge badge-high">Expired</span> : low ? <span className="badge badge-high">Low stock</span> : expiring ? <span className="badge badge-standard">Expiring soon</span> : <span className="badge badge-routine">In stock</span>}</td>
            <td><div className="inventory-row-actions"><button className="btn btn-outline btn-sm" type="button" onClick={() => startEdit(item)}>Edit</button><button className="btn btn-danger btn-sm" type="button" onClick={() => removeItem(item)}>Remove</button></div></td>
          </tr>;
        })}
      </tbody></table></div> : <div className="table-wrap"><div className="table-empty">{items.length ? "No inventory items match this filter." : "No inventory items have been added yet."}</div></div>}
    </section>
  </div>;
}
