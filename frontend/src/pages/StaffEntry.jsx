import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Overline } from "@/components/Reveal";

const EMPTY = {
  packet_no: "", plan_no: "", shape: "BR", pol_cts: "", color: "D", clarity: "VS1",
  cut: "EX", polish: "EX", symmetry: "EX", fluorescence: "NON",
  black_no_black: "No black", table_pct: "", girdle_pct: "", td: "", ratio: "", remarks: "",
};

// Full names shown to staff; the "code" is what's actually sent to the backend.
// Round Brilliant has its own Rapaport rate list ("BR"). Every other shape —
// all "fancy shapes" — shares one combined Rapaport rate list ("PS"), so they
// all map to the same code here. This matches how Rapaport itself prices them.
const SHAPES = [
  { code: "BR", label: "Round" },
  { code: "PS", label: "Pear" },
  { code: "PS", label: "Marquise" },
  { code: "PS", label: "Oval" },
  { code: "PS", label: "Radiant" },
  { code: "PS", label: "Cushion Brilliant" },
  { code: "PS", label: "Cushion Modified Brilliant" },
  { code: "PS", label: "Heart" },
  { code: "PS", label: "Old Mine" },
  { code: "PS", label: "Baguette" },
  { code: "PS", label: "Emerald" },
];
// For display, map the stored code back to a readable label (Round is unambiguous;
// "PS" covers every fancy shape, so it's shown generically as "Fancy shape").
const SHAPE_LABEL = { BR: "Round", PS: "Fancy shape" };

const GRADES = ["EX", "VG", "GD"];
const FLUORESCENCE = ["NON", "FNT", "MED", "STG"];
const COLORS = ["D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"];
const CLARITIES = ["IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2", "SI3", "I1", "I2", "I3"];

export default function StaffEntry() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  
const handleLogout = async () => {
  await logout();
  navigate("/portal-access", { replace: true });
};
  const [form, setForm] = useState({ ...EMPTY, shapeLabel: "Round" });
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState([]);

  const load = () =>
    api.get("/pricing/quote-stones").then((r) => setItems(r.data.items)).catch(() => {});

  useEffect(() => {
    if (user && ["staff", "pricing_manager", "admin"].includes(user.role)) load();
  }, [user]);

  if (user === null)
    return <div className="px-6 py-40 font-mono text-xs uppercase tracking-[0.3em] text-zinc-600">Loading…</div>;

  if (!user || !["staff", "pricing_manager", "admin"].includes(user.role))
    return (
      <div className="mx-auto max-w-[1440px] px-6 py-40" data-testid="staff-entry-denied">
        <p className="font-serif text-3xl italic text-zinc-500">Not authorized.</p>
      </div>
    );

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Staff picks a full shape name; we look up its Rapaport code separately
  // so "Marquise", "Oval", etc. all correctly send shape: "PS" to the backend,
  // while what's shown on screen stays the specific name they picked.
  const setShapeLabel = (label) => {
    const match = SHAPES.find((s) => s.label === label);
    setForm((f) => ({ ...f, shapeLabel: label, shape: match ? match.code : f.shape }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { shapeLabel, ...rest } = form;
    const payload = {
      ...rest,
      pol_cts: parseFloat(form.pol_cts),
      table_pct: form.table_pct ? parseFloat(form.table_pct) : null,
      girdle_pct: form.girdle_pct ? parseFloat(form.girdle_pct) : null,
      td: form.td ? parseFloat(form.td) : null,
      ratio: form.ratio ? parseFloat(form.ratio) : null,
      remarks: form.remarks ? `${form.remarks} [${shapeLabel}]` : `[${shapeLabel}]`, // keep the specific shape name on record
    };
    try {
      await api.post("/pricing/quote-stones", payload);
      toast.success(`Stone added — Packet ${form.packet_no}, Plan ${form.plan_no}`);
      setForm({ ...EMPTY, shapeLabel: "Round", packet_no: form.packet_no, plan_no: form.plan_no });
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1440px] px-6 pb-32 pt-24" data-testid="staff-entry-page">
      <Overline>Stone Entry</Overline>
      <h1 className="mt-4 font-serif text-5xl font-light text-white">
        Add <span className="italic text-gold">stone details.</span>
      </h1>
      <p className="mt-3 text-sm text-zinc-500">Enter the specs — pricing is handled separately.</p>
      <div className="mt-6 flex justify-end">
  <button
    onClick={handleLogout}
    data-testid="staff-logout-button"
    className="border border-white/20 px-6 py-2 font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-400 transition-colors hover:border-gold hover:text-gold"
  >
    Log out
  </button>
</div>

      <form onSubmit={submit} className="mt-12 border border-white/10 bg-[#0C1E30] p-8" data-testid="staff-entry-form">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <input required placeholder="Packet No" value={form.packet_no} onChange={(e) => set("packet_no", e.target.value)} className="lux-input" data-testid="staff-packet-input" />
          <input required placeholder="Plan No" value={form.plan_no} onChange={(e) => set("plan_no", e.target.value)} className="lux-input" data-testid="staff-plan-input" />
          <input required type="number" step="0.01" min="0.01" placeholder="Carat" value={form.pol_cts} onChange={(e) => set("pol_cts", e.target.value)} className="lux-input" data-testid="staff-carat-input" />
          <input placeholder="Remarks (optional)" value={form.remarks} onChange={(e) => set("remarks", e.target.value)} className="lux-input" data-testid="staff-remarks-input" />

          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">Shape</span>
            <select value={form.shapeLabel} onChange={(e) => setShapeLabel(e.target.value)} data-testid="staff-shape-select"
              className="mt-2 w-full border-b border-white/20 bg-transparent py-2 text-sm text-white focus:border-gold focus:outline-none [&>option]:bg-black">
              {SHAPES.map((s) => <option key={s.label} value={s.label}>{s.label}</option>)}
            </select>
          </label>

          {[
            ["color", "Color", COLORS],
            ["clarity", "Clarity", CLARITIES],
            ["cut", "Cut", GRADES],
            ["polish", "Polish", GRADES],
            ["symmetry", "Symmetry", GRADES],
            ["fluorescence", "Fluorescence", FLUORESCENCE],
            ["black_no_black", "Black / No-Black", ["No black", "Black"]],
          ].map(([key, label, opts]) => (
            <label key={key} className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">{label}</span>
              <select value={form[key]} onChange={(e) => set(key, e.target.value)} data-testid={`staff-${key}-select`}
                className="mt-2 w-full border-b border-white/20 bg-transparent py-2 text-sm text-white focus:border-gold focus:outline-none [&>option]:bg-black">
                {opts.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          ))}

          <input type="number" step="0.1" placeholder="Table %" value={form.table_pct} onChange={(e) => set("table_pct", e.target.value)} className="lux-input" data-testid="staff-table-input" />
          <input type="number" step="0.1" placeholder="Girdle %" value={form.girdle_pct} onChange={(e) => set("girdle_pct", e.target.value)} className="lux-input" data-testid="staff-girdle-input" />
          <input type="number" step="0.01" placeholder="TD" value={form.td} onChange={(e) => set("td", e.target.value)} className="lux-input" data-testid="staff-td-input" />
          <input type="number" step="0.01" placeholder="Ratio" value={form.ratio} onChange={(e) => set("ratio", e.target.value)} className="lux-input" data-testid="staff-ratio-input" />
        </div>

        <div className="mt-8 flex justify-end">
          <button type="submit" disabled={saving} data-testid="staff-submit-button"
            className="border border-gold px-10 py-3 font-mono text-[11px] uppercase tracking-[0.25em] text-gold transition-colors hover:bg-gold hover:text-black active:scale-95 disabled:opacity-50">
            {saving ? "Saving…" : "Add Stone"}
          </button>
        </div>
      </form>

      <div className="mt-12 overflow-x-auto border border-white/10" data-testid="staff-entry-table">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
              <th className="px-5 py-4">Packet</th><th className="px-5 py-4">Plan</th><th className="px-5 py-4">Shape</th>
              <th className="px-5 py-4">Carat</th><th className="px-5 py-4">Color/Clarity</th><th className="px-5 py-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.quote_stone_id} className="border-b border-white/5 text-zinc-300" data-testid={`staff-row-${s.quote_stone_id}`}>
                <td className="px-5 py-4 font-mono text-xs">{s.packet_no}</td>
                <td className="px-5 py-4 font-mono text-xs">{s.plan_no}</td>
                <td className="px-5 py-4">{SHAPE_LABEL[s.shape] || s.shape}</td>
                <td className="px-5 py-4 font-mono text-xs">{s.pol_cts?.toFixed(2)}</td>
                <td className="px-5 py-4 font-mono text-xs">{s.color} • {s.clarity}</td>
                <td className="px-5 py-4">
                  <span className={`font-mono text-[10px] uppercase tracking-[0.15em] ${s.status === "priced" ? "text-emerald-400" : "text-gold"}`}>
                    {s.status}
                  </span>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-10 text-center font-mono text-xs uppercase tracking-[0.2em] text-zinc-600">No stones added yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
