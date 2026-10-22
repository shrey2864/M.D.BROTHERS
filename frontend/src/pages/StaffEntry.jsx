import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Overline } from "@/components/Reveal";

const EMPTY = {
  rough_name: "", packet_no: "", planner_name: "", rough_weight: "", fluorescence: "NON",
  plan_no: "",
  shape: "BR", pol_cts: "", color: "D", clarity: "VS1",
  cut: "EX", polish: "EX", symmetry: "EX",
  black_no_black: "No black", lab: "GIA",
  table_pct: "", girdle_pct: "", td: "", ratio: "", remarks: "",
};

// Full names shown to staff; the "code" is what's actually sent to the backend
// for the Rapaport price lookup. Round Brilliant has its own Rapaport rate list
// ("BR"). Every other shape shares one combined list ("PS"). The exact name the
// staff picked is ALSO saved (shape_name) so it shows in the Excel and dashboard.
const SHAPES = [
  { code: "BR", label: "Round" },
  { code: "PS", label: "Pear" },
  { code: "PS", label: "Marquise" },
  { code: "PS", label: "Oval" },
  { code: "PS", label: "Radiant" },
  { code: "PS", label: "Cushion Brilliant", short: "Cushion BR" },
  { code: "PS", label: "Cushion Modified Brilliant", short: "CMB" },
  { code: "PS", label: "Heart" },
  { code: "PS", label: "Old Mine" },
  { code: "PS", label: "Baguette" },
  { code: "PS", label: "Emerald" },
];
const SHAPE_LABEL = { BR: "Round", PS: "Fancy shape" };

const GRADES = ["EX", "VG", "GD"];
const FLUORESCENCE = ["NON", "FNT", "MED", "STG"];
const LABS = ["GIA", "IGI", "HRD"];

// The planners - fixed names, chosen from a list (not typed)
const PLANNERS = ["RONAKBHAI", "DIXITBHAI", "PINKESHBHAI"];

// Single colours, then two-colour ranges (a range makes one row per colour).
const SINGLE_COLORS = ["D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"];
const COLOR_RANGES = ["D-E", "E-F", "F-G", "G-H", "H-I", "I-J", "J-K", "K-L", "L-M", "M-N"];
const COLORS = [...SINGLE_COLORS, ...COLOR_RANGES];

// Clarity with + and - (VVS1+, VVS1, VVS1-). IF stays plain.
const BASE_CLARITIES = ["IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2", "SI3", "I1", "I2", "I3"];
const CLARITIES = BASE_CLARITIES.flatMap((c) => (c === "IF" ? [c] : [`${c}+`, c, `${c}-`]));

// Rough name + main number -> full packet number, e.g. "CS-1" + "100" -> "CS-1-100"
const composePacket = (rough, main) => {
  const r = (rough || "").trim();
  const m = (main || "").trim();
  if (!r || !m) return m;
  return m.toUpperCase().startsWith(`${r.toUpperCase()}-`) ? m : `${r}-${m}`;
};

const selectClass =
  "mt-2 w-full border-b border-white/20 bg-transparent py-2 text-sm text-white focus:border-gold focus:outline-none [&>option]:bg-black";
const labelClass = "font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500";

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

  // The packet whose details (planner / rough weight / fluorescence) the form is carrying
  const activePacket = useRef("");

  const load = () =>
    api.get("/pricing/quote-stones").then((r) => setItems(r.data.items)).catch(() => {});

  useEffect(() => {
    if (user && ["staff", "pricing_manager", "admin"].includes(user.role)) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Packet-level details stay the same for one packet:
  //  - typing a packet that already exists fills planner, rough weight, fluorescence
  //  - switching to a NEW packet clears them so old values don't carry over
  useEffect(() => {
    const full = form.packet_no.trim() ? composePacket(form.rough_name, form.packet_no) : "";
    if (!full) return;
    const match = items.find((s) => s.packet_no === full);
    if (match && activePacket.current !== full) {
      activePacket.current = full;
      setForm((f) => ({
        ...f,
        planner_name: match.planner_name ?? f.planner_name,
        rough_weight: match.rough_weight != null ? String(match.rough_weight) : f.rough_weight,
        fluorescence: match.fluorescence ?? f.fluorescence,
      }));
    } else if (!match && activePacket.current && activePacket.current !== full) {
      activePacket.current = "";
      setForm((f) => ({ ...f, planner_name: "", rough_weight: "", fluorescence: "NON" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.rough_name, form.packet_no, items]);

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
  // so "Marquise", "Oval", etc. all send shape: "PS" for pricing, while the
  // exact name is saved too (shape_name).
  const setShapeLabel = (label) => {
    const match = SHAPES.find((s) => s.label === label);
    setForm((f) => ({ ...f, shapeLabel: label, shape: match ? match.code : f.shape }));
  };

  const deleteStone = async (s) => {
    const label = s.color_range ? `${s.color_range} (both colour rows)` : s.color;
    if (!window.confirm(`Delete this stone (Packet ${s.packet_no}, Plan ${s.plan_no}, ${label}, ${s.pol_cts?.toFixed(2)} ct)?`)) return;
    try {
      await api.delete(`/pricing/quote-stones/${s.quote_stone_id}`);
      toast.success("Stone deleted");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const deletePlan = async (packetNo, planNo) => {
    if (!window.confirm(`Delete all your unpriced stones in Packet ${packetNo}, Plan ${planNo}?`)) return;
    try {
      await api.delete("/pricing/plans", { params: { packet_no: packetNo, plan_no: planNo } });
      toast.success(`Plan ${planNo} deleted`);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const canDelete = (s) => s.created_by === user.user_id && s.status !== "priced";
  const myPlans = [
    ...new Map(items.filter(canDelete).map((s) => [`${s.packet_no}||${s.plan_no}`, s])).values(),
  ];

  // rough names already used, offered as suggestions while typing
  const roughNames = [...new Set(items.map((s) => s.rough_name).filter(Boolean))];
  const packetPreview = form.packet_no.trim() ? composePacket(form.rough_name, form.packet_no) : null;
  const packetIsKnown = packetPreview ? items.some((s) => s.packet_no === packetPreview) : false;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { shapeLabel, ...rest } = form;
    const payload = {
      ...rest,
      shape_name: (SHAPES.find((s) => s.label === shapeLabel) || {}).short || shapeLabel,
      rough_name: form.rough_name.trim(),
      packet_no: form.packet_no.trim(),
      planner_name: form.planner_name.trim(),
      rough_weight: form.rough_weight ? parseFloat(form.rough_weight) : null,
      pol_cts: parseFloat(form.pol_cts),
      table_pct: form.table_pct ? parseFloat(form.table_pct) : null,
      girdle_pct: form.girdle_pct ? parseFloat(form.girdle_pct) : null,
      td: form.td ? parseFloat(form.td) : null,
      ratio: form.ratio ? parseFloat(form.ratio) : null,
      remarks: form.remarks ? form.remarks : null,
    };
    try {
      await api.post("/pricing/quote-stones", payload);
      toast.success(`Stone added — Packet ${composePacket(form.rough_name, form.packet_no)}, Plan ${form.plan_no}`);
      // keep the packet-level details so the next plan in this packet is quick to enter
      activePacket.current = composePacket(form.rough_name, form.packet_no);
      setForm({
        ...EMPTY,
        shapeLabel: "Round",
        rough_name: form.rough_name,
        packet_no: form.packet_no,
        planner_name: form.planner_name,
        rough_weight: form.rough_weight,
        fluorescence: form.fluorescence,
        plan_no: form.plan_no,
      });
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
        {/* ---------- Packet details: same for every plan in this packet ---------- */}
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-gold">
          Packet details — entered once, stays for every plan in this packet
        </p>
        <div className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          <input required list="rough-names" placeholder="Rough name (CS, CS-1, CS-2…)" value={form.rough_name} onChange={(e) => set("rough_name", e.target.value)} className="lux-input" data-testid="staff-rough-name-input" />
          <datalist id="rough-names">
            {roughNames.map((n) => <option key={n} value={n} />)}
          </datalist>
          <input required placeholder="Packet No (100)" value={form.packet_no} onChange={(e) => set("packet_no", e.target.value)} className="lux-input" data-testid="staff-packet-input" />
          <label className="block">
            <span className={labelClass}>Planner</span>
            <select required value={form.planner_name} onChange={(e) => set("planner_name", e.target.value)} data-testid="staff-planner-input" className={selectClass}>
              <option value="" disabled>Select planner</option>
              {PLANNERS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <input required type="number" step="0.001" min="0.001" placeholder="Rough weight" value={form.rough_weight} onChange={(e) => set("rough_weight", e.target.value)} className="lux-input" data-testid="staff-rough-weight-input" />
          <label className="block">
            <span className={labelClass}>Fluorescence</span>
            <select value={form.fluorescence} onChange={(e) => set("fluorescence", e.target.value)} data-testid="staff-fluorescence-select" className={selectClass}>
              {FLUORESCENCE.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        </div>
        {packetPreview && (
          <p className="mt-6 font-mono text-xs uppercase tracking-[0.2em] text-zinc-400" data-testid="staff-packet-preview">
            Packet will be saved as: <span className="text-gold">{packetPreview}</span>
            {packetIsKnown && <span className="ml-3 text-emerald-400">· existing packet — details filled in</span>}
          </p>
        )}

        {/* ---------- Plan / stone details ---------- */}
        <p className="mt-12 font-mono text-[11px] uppercase tracking-[0.25em] text-gold">Plan / stone details</p>
        <div className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <input required placeholder="Plan No (1, 1A, 2…)" value={form.plan_no} onChange={(e) => set("plan_no", e.target.value)} className="lux-input" data-testid="staff-plan-input" />
          <input required type="number" step="0.01" min="0.01" placeholder="Carat" value={form.pol_cts} onChange={(e) => set("pol_cts", e.target.value)} className="lux-input" data-testid="staff-carat-input" />
          <input placeholder="Remarks (optional)" value={form.remarks} onChange={(e) => set("remarks", e.target.value)} className="lux-input" data-testid="staff-remarks-input" />

          <label className="block">
            <span className={labelClass}>Shape</span>
            <select value={form.shapeLabel} onChange={(e) => setShapeLabel(e.target.value)} data-testid="staff-shape-select" className={selectClass}>
              {SHAPES.map((s) => <option key={s.label} value={s.label}>{s.label}</option>)}
            </select>
          </label>

          {[
            ["color", "Color", COLORS],
            ["clarity", "Clarity", CLARITIES],
            ["cut", "Cut", GRADES],
            ["polish", "Polish", GRADES],
            ["symmetry", "Symmetry", GRADES],
            ["black_no_black", "Black / No-Black", ["No black", "Black"]],
            ["lab", "Lab", LABS],
          ].map(([key, label, opts]) => (
            <label key={key} className="block">
              <span className={labelClass}>{label}</span>
              <select value={form[key]} onChange={(e) => set(key, e.target.value)} data-testid={`staff-${key}-select`} className={selectClass}>
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

      {myPlans.length > 0 && (
        <div className="mt-12 flex flex-wrap items-center gap-3" data-testid="staff-plan-chips">
          <span className={labelClass}>Your plans</span>
          {myPlans.map((s) => (
            <span key={`${s.packet_no}-${s.plan_no}`} className="flex items-center gap-2 border border-white/10 px-3 py-1 font-mono text-xs text-zinc-300">
              {s.packet_no} · Plan {s.plan_no}
              <button
                onClick={() => deletePlan(s.packet_no, s.plan_no)}
                title="Delete this plan"
                className="text-red-400 hover:text-red-300"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mt-12 overflow-x-auto border border-white/10" data-testid="staff-entry-table">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
              <th className="px-5 py-4">Packet</th><th className="px-5 py-4">Plan</th><th className="px-5 py-4">Shape</th>
              <th className="px-5 py-4">Carat</th><th className="px-5 py-4">Color/Clarity</th><th className="px-5 py-4">Status</th><th className="px-5 py-4"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.quote_stone_id} className="border-b border-white/5 text-zinc-300" data-testid={`staff-row-${s.quote_stone_id}`}>
                <td className="px-5 py-4 font-mono text-xs">{s.packet_no}</td>
                <td className="px-5 py-4 font-mono text-xs">{s.plan_no}</td>
                <td className="px-5 py-4">{s.shape_display || SHAPE_LABEL[s.shape] || s.shape}</td>
                <td className="px-5 py-4 font-mono text-xs">{s.pol_cts?.toFixed(2)}</td>
                <td className="px-5 py-4 font-mono text-xs">{s.color}{s.color_range ? ` (${s.color_range})` : ""} • {s.clarity}</td>
                <td className="px-5 py-4">
                  <span className={`font-mono text-[10px] uppercase tracking-[0.15em] ${s.status === "priced" ? "text-emerald-400" : "text-gold"}`}>
                    {s.status}
                  </span>
                </td>
                <td className="px-5 py-4">
                  {canDelete(s) && (
                    <button
                      onClick={() => deleteStone(s)}
                      data-testid={`staff-delete-${s.quote_stone_id}`}
                      className="font-mono text-[10px] uppercase tracking-[0.15em] text-red-400 hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-10 text-center font-mono text-xs uppercase tracking-[0.2em] text-zinc-600">No stones added yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
