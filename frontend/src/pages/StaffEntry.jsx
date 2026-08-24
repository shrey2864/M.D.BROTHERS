import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Overline } from "@/components/Reveal";

const EMPTY = {
  packet_no: "", plan_no: "", shape: "BR", pol_cts: "", color: "D", clarity: "VS1",
  cut: "EX", polish: "EX", symmetry: "EX", fluorescence: "NON",
  black_no_black: "No black", table_pct: "", girdle_pct: "", td: "", ratio: "", remarks: "",
};

// Shape codes match your Rapaport CSV files (e.g. CSV2_ROUND uses "BR", CSV2_PEAR uses "PS").
// Add more here as you upload more shape-wise Rapaport CSVs.
const SHAPES = ["BR", "PS", "EM", "OV", "HR", "RDT", "CU", "MQ"];
const GRADES = ["EX", "VG", "GD"];
const FLUORESCENCE = ["NON", "FNT", "MED", "STG"];
const COLORS = ["D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"];
const CLARITIES = ["IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2", "SI3", "I1", "I2", "I3"];

export default function StaffEntry() {
  const { user } = useAuth();
  const [form, setForm] = useState({ ...EMPTY });
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

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      pol_cts: parseFloat(form.pol_cts),
      table_pct: form.table_pct ? parseFloat(form.table_pct) : null,
      girdle_pct: form.girdle_pct ? parseFloat(form.girdle_pct) : null,
      td: form.td ? parseFloat(form.td) : null,
      ratio: form.ratio ? parseFloat(form.ratio) : null,
    };
    try {
      await api.post("/pricing/quote-stones", payload);
      toast.success(`Stone added — Packet ${form.packet_no}, Plan ${form.plan_no}`);
      setForm({ ...EMPTY, packet_no: form.packet_no, plan_no: form.plan_no }); // keep packet/plan for next stone in same plan
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

      <form onSubmit={submit} className="mt-12 border border-white/10 bg-[#0C1E30] p-8" data-testid="staff-entry-form">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <input required placeholder="Packet No" value={form.packet_no} onChange={(e) => set("packet_no", e.target.value)} className="lux-input" data-testid="staff-packet-input" />
          <input required placeholder="Plan No" value={form.plan_no} onChange={(e) => set("plan_no", e.target.value)} className="lux-input" data-testid="staff-plan-input" />
          <input required type="number" step="0.01" min="0.01" placeholder="Carat" value={form.pol_cts} onChange={(e) => set("pol_cts", e.target.value)} className="lux-input" data-testid="staff-carat-input" />
          <input placeholder="Remarks (optional)" value={form.remarks} onChange={(e) => set("remarks", e.target.value)} className="lux-input" data-testid="staff-remarks-input" />

          {[
            ["shape", "Shape", SHAPES],
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
                <td className="px-5 py-4">{s.shape}</td>
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
