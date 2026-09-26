import React, { useEffect, useState } from "react";

const API_BASE = process.env.REACT_APP_BACKEND_URL || "";

// Reuse however your app currently stores the admin JWT (e.g. localStorage key "token")
function authHeaders() {
  const token = localStorage.getItem("token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const EMPTY_FORM = {
  name: "", color: "F", clarity: "VS1", carat: "", price: "",
  description: "", images: [], is_published: true,
};

export default function JewelleryAdmin() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadItems = () => {
    fetch(`${API_BASE}/api/jewellery/admin/all`, { headers: authHeaders() })
      .then((r) => r.json())
      .then(setItems)
      .catch(() => setItems([]));
  };

  useEffect(loadItems, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = { ...form, carat: parseFloat(form.carat), price: form.price ? parseFloat(form.price) : null };

    const url = editingId
      ? `${API_BASE}/api/jewellery/admin/${editingId}`
      : `${API_BASE}/api/jewellery/admin`;
    const method = editingId ? "PUT" : "POST";

    await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(payload) });
    setSaving(false);
    resetForm();
    loadItems();
  };

  const handleEdit = (item) => {
    setForm({
      name: item.name, color: item.color, clarity: item.clarity,
      carat: item.carat, price: item.price || "", description: item.description || "",
      images: item.images || [], is_published: item.is_published,
    });
    setEditingId(item.id);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this piece?")) return;
    await fetch(`${API_BASE}/api/jewellery/admin/${id}`, { method: "DELETE", headers: authHeaders() });
    loadItems();
  };

  return (
    <div style={s.page}>
      <h2 style={s.heading}>Jewellery Inventory</h2>

      <form onSubmit={handleSubmit} style={s.form}>
        <input style={s.input} placeholder="Name" required
          value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

        <select style={s.input} value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}>
          {["D","E","F","G","H","I"].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <select style={s.input} value={form.clarity} onChange={(e) => setForm({ ...form, clarity: e.target.value })}>
          {["VVS1","VVS2","VS1","VS2","SI1","SI2","I1"].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <input style={s.input} type="number" step="0.01" placeholder="Carat (size)" required
          value={form.carat} onChange={(e) => setForm({ ...form, carat: e.target.value })} />

        <input style={s.input} type="number" placeholder="Price (₹, blank = Enquire)"
          value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />

        <input style={s.input} placeholder="Image URL (Cloudinary link)"
          value={form.images[0] || ""} onChange={(e) => setForm({ ...form, images: [e.target.value] })} />

        <textarea style={{ ...s.input, gridColumn: "1 / -1" }} placeholder="Description"
          value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

        <label style={s.checkboxLabel}>
          <input type="checkbox" checked={form.is_published}
            onChange={(e) => setForm({ ...form, is_published: e.target.checked })} />
          Published (visible to customers)
        </label>

        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" disabled={saving} style={s.saveBtn}>
            {editingId ? "Update Piece" : "Add Piece"}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} style={s.cancelBtn}>Cancel</button>
          )}
        </div>
      </form>

      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Name</th><th style={s.th}>Colour</th><th style={s.th}>Clarity</th>
            <th style={s.th}>Ct</th><th style={s.th}>Price</th><th style={s.th}>Published</th><th style={s.th}></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td style={s.td}>{item.name}</td>
              <td style={s.td}>{item.color}</td>
              <td style={s.td}>{item.clarity}</td>
              <td style={s.td}>{item.carat}</td>
              <td style={s.td}>{item.price ? `₹${item.price}` : "Enquire"}</td>
              <td style={s.td}>{item.is_published ? "Yes" : "No"}</td>
              <td style={s.td}>
                <button onClick={() => handleEdit(item)} style={s.linkBtn}>Edit</button>{" "}
                <button onClick={() => handleDelete(item.id)} style={{ ...s.linkBtn, color: "#e05555" }}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const s = {
  page: { background: "#0b0b0d", minHeight: "100vh", padding: 32, color: "#eee" },
  heading: { color: "#d4af37", marginBottom: 20 },
  form: {
    display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12,
    background: "#141416", padding: 20, borderRadius: 12, marginBottom: 32,
    border: "1px solid #262626",
  },
  input: {
    padding: "10px 12px", borderRadius: 8, border: "1px solid #333",
    background: "#0b0b0d", color: "#eee", fontSize: 13,
  },
  checkboxLabel: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#ccc" },
  saveBtn: {
    padding: "10px 20px", borderRadius: 8, border: "none",
    background: "#d4af37", color: "#0b0b0d", fontWeight: 700, cursor: "pointer",
  },
  cancelBtn: {
    padding: "10px 20px", borderRadius: 8, border: "1px solid #555",
    background: "transparent", color: "#aaa", cursor: "pointer",
  },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: 10, borderBottom: "1px solid #262626", color: "#888", fontSize: 12 },
  td: { padding: 10, borderBottom: "1px solid #1c1c1f", fontSize: 13 },
  linkBtn: { background: "none", border: "none", color: "#d4af37", cursor: "pointer", fontSize: 12 },
};
