import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api, formatApiError } from "@/lib/api";
import { Overline } from "@/components/Reveal";

// Hidden route — no link to this page anywhere in the site nav/footer.
// Staff and Pricing Manager accounts are created by the admin via the
// /admin/staff-users endpoint and handed out directly; there is no
// "Request an account" link here on purpose.

export default function PortalAccess() {
  const { login, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await login(form.email, form.password);
      if (data.role === "staff") {
        navigate("/portal-access/entry");
      } else if (data.role === "pricing_manager" || data.role === "admin") {
        navigate("/portal-access/pricing");
      } else {
        // A buyer/other account tried this hidden door — kick them straight back out.
        await logout();
        setError("This login isn't valid here.");
      }
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[1440px] items-center px-6" data-testid="portal-access-page">
      <div className="w-full max-w-md">
        <Overline>Internal Access</Overline>
        <h1 className="mt-4 font-serif text-5xl font-light text-white">
          Pricing <span className="italic text-gold">portal.</span>
        </h1>
        <p className="mt-4 text-sm text-zinc-500">Sign in with the credentials you were given.</p>
        <form onSubmit={submit} className="mt-12 space-y-8" data-testid="portal-access-form">
          {error && (
            <p className="border border-red-900/50 bg-red-950/30 px-4 py-3 text-xs text-red-400" data-testid="portal-access-error">
              {error}
            </p>
          )}
          <input
            type="email"
            required
            placeholder="Email Address"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="lux-input"
            data-testid="portal-access-email-input"
          />
          <input
            type="password"
            required
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="lux-input"
            data-testid="portal-access-password-input"
          />
          <button
            type="submit"
            disabled={loading}
            data-testid="portal-access-submit-button"
            className="w-full bg-gold py-4 font-mono text-[11px] uppercase tracking-[0.25em] text-black transition-colors hover:bg-gold-light active:scale-95 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
