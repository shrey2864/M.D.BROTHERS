import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Overline } from "@/components/Reveal";

const ROLE_LABEL = {
  portal_pending: "Waiting",
  staff: "Staff",
  pricing_manager: "Pricing manager",
};

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

  const load = () =>
    api
      .get("/admin/portal-users")
      .then((r) => setItems(r.data.items))
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    if (user && user.role === "admin") load();
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
    </div>
  );
}
