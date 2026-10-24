import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";
import { api, formatApiError, API_BASE } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Overline } from "@/components/Reveal";

const ROLE_LABEL = {
  portal_pending: "Waiting",
  staff: "Staff",
  pricing_manager: "Pricing manager",
};

const SHAPE_NAME = { BR: "Round (BR)", PS: "All fancy shapes (PS)" };

const PERMS = [
  ["view_pricing", "View pricing"],
  ["set_discount", "Set discount"],
  ["export_excel", "Export Excel"],
];

export default function PortalAdmin() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Rapaport rates (uploaded only when you want to - not on a fixed day)
  const fileRef = useRef(null);
  const [rapaport, setRapaport] = useState([]);
  const [rapaportFile, setRapaportFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [includePriced, setIncludePriced] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(null);

  const loadRapaport = () =>
    api
      .get("/admin/rapaport-rates/summary")
      .then((r) => setRapaport(r.data.items))
      .catch(() => {});

  const load = () =>
    api
      .get("/admin/portal-users")
      .then((r) => setItems(r.data.items))
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    if (user && user.role === "admin") {
      load();
      loadRapaport();
    }
  }, [user]);

  if (user === null)
    return <div className="px-6 py-40 font-mono text-xs uppercase tracking-[0.3em] text-zinc-600">Loading…</div>;

  if (!user || user.role !== "admin")
    return (
      <div className="mx-auto max-w-[1440px] px-6 py-40" data-testid="portal-admin-denied">
        <p className="font-serif text-3xl italic text-zinc-500">Not authorized.</p>
      </div>
    );

  const handleLogout = async () => {
    await logout();
    navigate("/portal-access", { replace: true });
  };

  const setRole = async (u, role) => {
    try {
      await api.post(`/admin/portal-users/${u.user_id}/role`, { role });
      toast.success(`${u.name}: ${ROLE_LABEL[role]}`);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const togglePerm = async (u, key) => {
    try {
      await api.put(`/admin/staff-users/${u.user_id}/permissions`, {
        permissions: { [key]: !u.permissions?.[key] },
      });
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const remove = async (u) => {
    if (!window.confirm(`Delete the account of ${u.name} (${u.email})? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/portal-users/${u.user_id}`);
      toast.success("Account deleted");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const uploadRapaport = async () => {
    if (!rapaportFile) {
      toast.error("Choose the CSV file first");
      return;
    }
    setUploading(true);
    setApplied(null);
    try {
      const form = new FormData();
      form.append("file", rapaportFile);
      const r = await api.post("/admin/rapaport-rates/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUploadResult(r.data);
      toast.success(`Rapaport rates updated — ${r.data.rows} rates`);
      setRapaportFile(null);
      if (fileRef.current) fileRef.current.value = "";
      loadRapaport();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setUploading(false);
    }
  };

  const applyRapaport = async () => {
    if (
      includePriced &&
      !window.confirm("This also changes the Gross and Net of stones that are already priced. Continue?")
    )
      return;
    setApplying(true);
    try {
      const r = await api.post("/admin/rapaport-rates/apply-to-stones", null, {
        params: { include_priced: includePriced },
      });
      setApplied(r.data);
      toast.success(`${r.data.changed} stones updated with the new rates`);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setApplying(false);
    }
  };

  const btn = "font-mono text-[10px] uppercase tracking-[0.15em] hover:underline";

  return (
    <div className="mx-auto max-w-[1440px] px-6 pb-32 pt-24" data-testid="portal-admin-page">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Overline>Admin</Overline>
          <h1 className="mt-4 font-serif text-5xl font-light text-white">
            Portal <span className="italic text-gold">access.</span>
          </h1>
          <p className="mt-3 text-sm text-zinc-500">
            People who signed up at /portal-signup. Give each one an access level.
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="border border-white/20 px-6 py-2 font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-400 transition-colors hover:border-gold hover:text-gold"
        >
          Log out
        </button>
      </div>

      <div className="mt-12 overflow-x-auto border border-white/10" data-testid="portal-admin-table">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
              <th className="px-5 py-4">Name</th>
              <th className="px-5 py-4">Email</th>
              <th className="px-5 py-4">Access</th>
              <th className="px-5 py-4">Permissions</th>
              <th className="px-5 py-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.user_id} className="border-b border-white/5 text-zinc-300" data-testid={`portal-user-${u.user_id}`}>
                <td className="px-5 py-4">{u.name}</td>
                <td className="px-5 py-4 font-mono text-xs">{u.email}</td>
                <td className="px-5 py-4">
                  <span
                    className={`font-mono text-[10px] uppercase tracking-[0.15em] ${
                      u.role === "portal_pending" ? "text-gold" : "text-emerald-400"
                    }`}
                  >
                    {ROLE_LABEL[u.role] || u.role}
                  </span>
                </td>
                <td className="px-5 py-4">
                  {u.role === "pricing_manager" ? (
                    <div className="flex flex-wrap gap-4">
                      {PERMS.map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-400">
                          <input type="checkbox" checked={!!u.permissions?.[key]} onChange={() => togglePerm(u, key)} />
                          {label}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <span className="text-zinc-600">—</span>
                  )}
                </td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-4">
                    {u.role !== "staff" && (
                      <button onClick={() => setRole(u, "staff")} className={`${btn} text-gold`}>
                        Make staff
                      </button>
                    )}
                    {u.role !== "pricing_manager" && (
                      <button onClick={() => setRole(u, "pricing_manager")} className={`${btn} text-gold`}>
                        Make pricing manager
                      </button>
                    )}
                    {u.role !== "portal_pending" && (
                      <button onClick={() => setRole(u, "portal_pending")} className={`${btn} text-zinc-400`}>
                        Remove access
                      </button>
                    )}
                    <button onClick={() => remove(u)} className={`${btn} text-red-400`}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center font-mono text-xs uppercase tracking-[0.2em] text-zinc-600">
                  No one has signed up yet
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center font-mono text-xs uppercase tracking-[0.2em] text-zinc-600">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ================= Rapaport rates ================= */}
      <div className="mt-24" data-testid="rapaport-section">
        <Overline>Prices</Overline>
        <h2 className="mt-4 font-serif text-4xl font-light text-white">
          Rapaport <span className="italic text-gold">rates.</span>
        </h2>
        <p className="mt-3 text-sm text-zinc-500">
          Upload a new rate file only when the rates change. Nothing is updated by itself.
        </p>

        <div className="mt-8 border border-white/10" data-testid="rapaport-summary">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
                <th className="px-5 py-4">Shape</th>
                <th className="px-5 py-4">Rates</th>
                <th className="px-5 py-4">Last updated</th>
              </tr>
            </thead>
            <tbody>
              {rapaport.map((x) => (
                <tr key={x.shape} className="border-b border-white/5 text-zinc-300">
                  <td className="px-5 py-4">{SHAPE_NAME[x.shape] || x.shape}</td>
                  <td className="px-5 py-4 font-mono text-xs">{x.rows}</td>
                  <td className="px-5 py-4 font-mono text-xs">
                    {x.updated_at ? new Date(x.updated_at).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
              {rapaport.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-10 text-center font-mono text-xs uppercase tracking-[0.2em] text-zinc-600">
                    No Rapaport rates uploaded yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-8 border border-white/10 bg-[#0C1E30] p-8" data-testid="rapaport-upload">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-gold">1 · Upload the new rates</p>
          <p className="mt-3 text-sm text-zinc-400">
            Choose the CSV file. Every shape in the file is replaced by the new rates; a shape that is not in the file
            stays as it is.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setRapaportFile(e.target.files?.[0] || null)}
              data-testid="rapaport-file"
              className="text-sm text-zinc-300 file:mr-4 file:border file:border-white/30 file:bg-transparent file:px-4 file:py-2 file:font-mono file:text-[11px] file:uppercase file:tracking-[0.2em] file:text-zinc-300"
            />
            <button
              onClick={uploadRapaport}
              disabled={uploading || !rapaportFile}
              data-testid="rapaport-upload-button"
              className="flex items-center gap-2 border border-gold px-6 py-2 font-mono text-[11px] uppercase tracking-[0.25em] text-gold transition-colors hover:bg-gold hover:text-black disabled:opacity-40"
            >
              <Upload className="h-4 w-4" strokeWidth={1.5} /> {uploading ? "Uploading…" : "Upload and replace"}
            </button>
            <a
              href={`${API_BASE}/admin/rapaport-rates/export`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400 hover:text-gold"
            >
              <Download className="h-4 w-4" strokeWidth={1.5} /> Download current rates
            </a>
          </div>

          <div className="mt-6 border border-white/10 p-4 font-mono text-xs text-zinc-400">
            <p className="uppercase tracking-[0.15em] text-zinc-500">File format — one rate per line</p>
            <p className="mt-2">shape, clarity, color, carat_min, carat_max, rate</p>
            <p className="mt-1 text-zinc-300">BR,VS1,D,0.30,0.39,5600</p>
            <p className="mt-1">BR = round · PS = all fancy shapes · a header line is fine, it is skipped.</p>
          </div>

          {uploadResult && (
            <div className="mt-6 border border-emerald-400/40 p-4 font-mono text-xs text-emerald-300" data-testid="rapaport-result">
              <p className="uppercase tracking-[0.15em]">Updated · {uploadResult.rows} rates</p>
              {Object.entries(uploadResult.shapes).map(([shape, c]) => (
                <p key={shape} className="mt-1">
                  {SHAPE_NAME[shape] || shape}: {c.before} → {c.after} rates
                </p>
              ))}
              {uploadResult.skipped > 0 && (
                <p className="mt-1 text-amber-300">{uploadResult.skipped} line(s) skipped (header or not a rate)</p>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 border border-white/10 bg-[#0C1E30] p-8" data-testid="rapaport-apply">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-gold">
            2 · Use the new rates on stones already entered
          </p>
          <p className="mt-3 text-sm text-zinc-400">
            A stone keeps the Rapaport rate it had when it was entered. After uploading new rates, click this so the
            stones still waiting for a discount get the new rate (their Gross and Net follow).
          </p>
          <label className="mt-5 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.1em] text-zinc-300">
            <input
              type="checkbox"
              checked={includePriced}
              onChange={(e) => setIncludePriced(e.target.checked)}
              data-testid="rapaport-include-priced"
            />
            Also stones that are already priced (their Gross and Net will change)
          </label>
          <button
            onClick={applyRapaport}
            disabled={applying}
            data-testid="rapaport-apply-button"
            className="mt-5 border border-gold px-6 py-2 font-mono text-[11px] uppercase tracking-[0.25em] text-gold transition-colors hover:bg-gold hover:text-black disabled:opacity-40"
          >
            {applying ? "Updating…" : "Update stones now"}
          </button>
          {applied && (
            <p className="mt-5 font-mono text-xs text-emerald-300" data-testid="rapaport-applied">
              {applied.checked} stones checked · {applied.changed} updated
              {applied.no_rate_found > 0 && (
                <span className="text-amber-300"> · {applied.no_rate_found} have no matching rate in the file</span>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
