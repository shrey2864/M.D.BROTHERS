import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X, RefreshCw } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Overline } from "@/components/Reveal";

const EMPTY = {
  sku: "", shape: "Round", carat: "", cut: "Excellent", color: "D",
  clarity: "VVS1", polish: "Excellent", symmetry: "Excellent",
  fluorescence: "None", certification: "GIA", price: "", image: "",
  video_url: "", certificate_url: "", featured: false,
};

const SELECTS = {
  shape: ["Round", "Princess", "Oval", "Cushion", "Emerald", "Pear", "Marquise", "Radiant"],
  cut: ["Excellent", "Very Good", "Good"],
  color: ["D", "E", "F", "G", "H", "I", "J"],
  clarity: ["FL", "IF", "VVS1", "VVS2", "VS1", "VS2", "SI1"],
  polish: ["Excellent", "Very Good", "Good"],
  symmetry: ["Excellent", "Very Good", "Good"],
  fluorescence: ["None", "Faint", "Medium", "Strong"],
  certification: ["GIA", "IGI", "HRD"],
};

export default function Admin() {
  const { user } = useAuth();
  const [diamonds, setDiamonds] = useState([]);
  const [form, setForm] = useState(null); // null = closed, {…} = editing/adding
  const [saving, setSaving] = useState(false);
  const [feed, setFeed] = useState({ url: "", api_key: "" });
  const [lastSync, setLastSync] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [buyers, setBuyers] = useState([]);

  const load = () =>
    api.get("/diamonds", { params: { limit: 200 } }).then((r) => setDiamonds(r.data.items)).catch(() => {});

  const loadBuyers = () =>
    api.get("/admin/users").then((r) => setBuyers(r.data.items)).catch(() => {});

  const setBuyerStatus = async (b, status) => {
    try {
      const { data } = await api.post(`/admin/users/${b.user_id}/status`, { status });
      toast.success(
        status === "approved"
          ? `${b.name} approved${data.email_sent ? " — approval email sent" : ""}`
          : `${b.name} ${status}`
      );
      loadBuyers();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  useEffect(() => {
    if (user && user.role === "admin") {
      load();
      loadBuyers();
      api.get("/stock-feed").then((r) => {
        setFeed((f) => ({ ...f, url: r.data.url || "" }));
        setLastSync(r.data.last_sync || null);
      }).catch(() => {});
    }
  }, [user]);

  const saveFeed = async () => {
    try {
      await api.post("/stock-feed", { url: feed.url, api_key: feed.api_key || null });
      toast.success("Stock feed saved");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      await api.post("/stock-feed", { url: feed.url, api_key: feed.api_key || null });
      const { data } = await api.post("/stock-feed/sync");
      setLastSync(data);
      toast.success(`Sync complete — ${data.added} added, ${data.updated} updated, ${data.skipped} skipped`);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setSyncing(false);
    }
  };

  if (user === null) return <div className="px-6 py-40 font-mono text-xs uppercase tracking-[0.3em] text-zinc-600">Loading…</div>;

  if (!user || user.role !== "admin")
    return (
      <div className="mx-auto max-w-[1440px] px-6 py-40" data-testid="admin-denied">
        <p className="font-serif text-3xl italic text-zinc-500">Admin access only.</p>
        <Link to="/login" className="mt-6 inline-block font-mono text-[11px] uppercase tracking-[0.25em] text-gold">← Sign in as admin</Link>
      </div>
    );

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      carat: parseFloat(form.carat),
      price: parseFloat(form.price),
      image: form.image || null,
      video_url: form.video_url || null,
      certificate_url: form.certificate_url || null,
    };
    try {
      if (form.diamond_id) {
        await api.put(`/diamonds/${form.diamond_id}`, payload);
        toast.success(`${form.sku} updated`);
      } else {
        await api.post("/diamonds", payload);
        toast.success(`${form.sku} added to the collection`);
      }
      setForm(null);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (d) => {
    if (!window.confirm(`Delete ${d.sku}?`)) return;
    try {
      await api.delete(`/diamonds/${d.diamond_id}`);
      toast.success(`${d.sku} deleted`);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  return (
    <div className="mx-auto max-w-[1440px] px-6 pb-32 pt-32" data-testid="admin-page">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Overline>Inventory Manager</Overline>
          <h1 className="mt-4 font-serif text-5xl font-light text-white">Your <span className="italic text-gold">stones.</span></h1>
          <p className="mt-3 text-sm text-zinc-500">{diamonds.length} diamonds in the collection</p>
        </div>
        <button onClick={() => setForm({ ...EMPTY })} data-testid="admin-add-diamond-button"
          className="flex items-center gap-2 bg-gold px-6 py-3 font-mono text-[11px] uppercase tracking-[0.25em] text-black transition-colors hover:bg-gold-light active:scale-95">
          <Plus className="h-4 w-4" strokeWidth={1.5} /> Add Diamond
        </button>
      </div>

      <div className="mt-12 border border-white/10 bg-[#0A0A0A] p-8" data-testid="stock-feed-card">
        <Overline>Stock Feed — API Sync</Overline>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-500">
          Paste the API link (JSON or CSV) from your stock management system.
          Each sync adds new stones and updates existing ones by SKU — your
          whole 1,500+ stone inventory uploads in one click.
        </p>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <input placeholder="https://your-stock-system.com/api/stock" value={feed.url}
            onChange={(e) => setFeed({ ...feed, url: e.target.value })}
            className="lux-input" data-testid="stock-feed-url-input" />
          <input placeholder="API key (optional)" value={feed.api_key}
            onChange={(e) => setFeed({ ...feed, api_key: e.target.value })}
            className="lux-input" data-testid="stock-feed-key-input" />
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button onClick={saveFeed} data-testid="stock-feed-save-button"
            className="border border-white/20 px-6 py-3 font-mono text-[11px] uppercase tracking-[0.25em] text-white transition-colors hover:border-gold hover:text-gold active:scale-95">
            Save Feed
          </button>
          <button onClick={syncNow} disabled={syncing || !feed.url} data-testid="stock-feed-sync-button"
            className="flex items-center gap-2 bg-gold px-6 py-3 font-mono text-[11px] uppercase tracking-[0.25em] text-black transition-colors hover:bg-gold-light active:scale-95 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} strokeWidth={1.5} />
            {syncing ? "Syncing…" : "Sync Now"}
          </button>
          {lastSync && (
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500" data-testid="stock-feed-last-sync">
              Last sync: {lastSync.added} added • {lastSync.updated} updated • {lastSync.skipped} skipped
            </p>
          )}
        </div>
      </div>

      {form && (
        <form onSubmit={submit} className="mt-12 border border-gold/30 bg-[#0A0A0A] p-8" data-testid="admin-diamond-form">
          <div className="mb-8 flex items-center justify-between">
            <Overline>{form.diamond_id ? `Editing ${form.sku}` : "New Diamond"}</Overline>
            <button type="button" onClick={() => setForm(null)} data-testid="admin-form-close-button" aria-label="Close form">
              <X className="h-4 w-4 text-zinc-500 hover:text-white" strokeWidth={1.5} />
            </button>
          </div>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <input required placeholder="SKU (e.g. MDB-001)" value={form.sku} onChange={(e) => set("sku", e.target.value)} className="lux-input" data-testid="admin-sku-input" />
            <input required type="number" step="0.01" min="0.01" placeholder="Carat" value={form.carat} onChange={(e) => set("carat", e.target.value)} className="lux-input" data-testid="admin-carat-input" />
            <input required type="number" step="1" min="0" placeholder="Price (USD)" value={form.price} onChange={(e) => set("price", e.target.value)} className="lux-input" data-testid="admin-price-input" />
            <input placeholder="Photo URL (optional)" value={form.image} onChange={(e) => set("image", e.target.value)} className="lux-input" data-testid="admin-image-input" />
            <input placeholder="Certificate PDF link (optional)" value={form.certificate_url} onChange={(e) => set("certificate_url", e.target.value)} className="lux-input" data-testid="admin-certificate-input" />
            <input placeholder="360° Video link (optional)" value={form.video_url} onChange={(e) => set("video_url", e.target.value)} className="lux-input" data-testid="admin-video-input" />
            {Object.entries(SELECTS).map(([key, opts]) => (
              <label key={key} className="block">
                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">{key}</span>
                <select value={form[key]} onChange={(e) => set(key, e.target.value)} data-testid={`admin-${key}-select`}
                  className="mt-2 w-full border-b border-white/20 bg-transparent py-2 text-sm text-white focus:border-gold focus:outline-none [&>option]:bg-black">
                  {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="mt-8 flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-3 text-sm text-zinc-400">
              <input type="checkbox" checked={form.featured} onChange={(e) => set("featured", e.target.checked)} data-testid="admin-featured-checkbox" className="h-4 w-4 accent-[#CBA153]" />
              Feature on homepage
            </label>
            <button type="submit" disabled={saving} data-testid="admin-save-diamond-button"
              className="border border-gold px-10 py-3 font-mono text-[11px] uppercase tracking-[0.25em] text-gold transition-colors hover:bg-gold hover:text-black active:scale-95 disabled:opacity-50">
              {saving ? "Saving…" : form.diamond_id ? "Save Changes" : "Add to Collection"}
            </button>
          </div>
        </form>
      )}

      <div className="mt-12 overflow-x-auto border border-white/10" data-testid="admin-inventory-table">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
              <th className="px-5 py-4">SKU</th><th className="px-5 py-4">Shape</th><th className="px-5 py-4">Carat</th>
              <th className="px-5 py-4">Specs</th><th className="px-5 py-4">Cert</th><th className="px-5 py-4">Price</th>
              <th className="px-5 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {diamonds.map((d) => (
              <tr key={d.diamond_id} className="border-b border-white/5 text-zinc-300 transition-colors hover:bg-white/[0.02]" data-testid={`admin-row-${d.sku}`}>
                <td className="px-5 py-4 font-mono text-xs">{d.sku}{d.featured && <span className="ml-2 text-gold">✦</span>}</td>
                <td className="px-5 py-4">{d.shape}</td>
                <td className="px-5 py-4 font-mono text-xs">{d.carat.toFixed(2)}</td>
                <td className="px-5 py-4 font-mono text-xs">{d.color} • {d.clarity} • {d.cut}</td>
                <td className="px-5 py-4 font-mono text-xs">{d.certification}</td>
                <td className="px-5 py-4 font-mono text-xs text-gold">${d.price?.toLocaleString()}</td>
                <td className="px-5 py-4 text-right">
                  <button onClick={() => setForm({ ...EMPTY, ...d })} data-testid={`admin-edit-${d.sku}`} aria-label={`Edit ${d.sku}`}
                    className="p-2 text-zinc-500 transition-colors hover:text-gold"><Pencil className="h-4 w-4" strokeWidth={1.5} /></button>
                  <button onClick={() => remove(d)} data-testid={`admin-delete-${d.sku}`} aria-label={`Delete ${d.sku}`}
                    className="p-2 text-zinc-500 transition-colors hover:text-red-400"><Trash2 className="h-4 w-4" strokeWidth={1.5} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-24">
        <Overline>Trade Client Applications</Overline>
        <h2 className="mt-4 font-serif text-3xl font-light text-white">Buyer <span className="italic text-gold">approvals.</span></h2>
        <p className="mt-3 text-sm text-zinc-500">Review KYC details and approve access to the collection and live pricing.</p>
        <div className="mt-8 overflow-x-auto border border-white/10" data-testid="admin-buyers-table">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
                <th className="px-5 py-4">Name</th><th className="px-5 py-4">Company</th><th className="px-5 py-4">KYC Name</th>
                <th className="px-5 py-4">Mobile</th><th className="px-5 py-4">Email</th><th className="px-5 py-4">Status</th>
                <th className="px-5 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {buyers.map((b) => (
                <tr key={b.user_id} className="border-b border-white/5 text-zinc-300" data-testid={`buyer-row-${b.email}`}>
                  <td className="px-5 py-4">{b.name}</td>
                  <td className="px-5 py-4">{b.company || "—"}</td>
                  <td className="px-5 py-4">{b.kyc_name || "—"}</td>
                  <td className="px-5 py-4 font-mono text-xs">{b.mobile || "—"}</td>
                  <td className="px-5 py-4 font-mono text-xs">{b.email}</td>
                  <td className="px-5 py-4">
                    <span className={`px-2 py-1 font-mono text-[10px] uppercase tracking-[0.15em] ${
                      b.status === "approved" ? "text-emerald-400" : b.status === "rejected" ? "text-red-400" : "text-gold"
                    }`} data-testid={`buyer-status-${b.email}`}>{b.status || "pending"}</span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    {b.status !== "approved" && (
                      <button onClick={() => setBuyerStatus(b, "approved")} data-testid={`buyer-approve-${b.email}`}
                        className="mr-2 border border-emerald-500/50 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-emerald-400 transition-colors hover:bg-emerald-500 hover:text-black active:scale-95">
                        Approve
                      </button>
                    )}
                    {b.status !== "rejected" && (
                      <button onClick={() => setBuyerStatus(b, "rejected")} data-testid={`buyer-reject-${b.email}`}
                        className="border border-red-500/40 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-red-400 transition-colors hover:bg-red-500 hover:text-black active:scale-95">
                        Reject
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {buyers.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-10 text-center font-mono text-xs uppercase tracking-[0.2em] text-zinc-600" data-testid="buyers-empty">No applications yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
