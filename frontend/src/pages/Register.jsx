import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";
import { Overline } from "@/components/Reveal";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", company: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register({ ...form, company: form.company || null });
      navigate("/collection");
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[1440px] items-center px-6 py-24" data-testid="register-page">
      <div className="w-full max-w-md">
        <Overline>Become a Trade Client</Overline>
        <h1 className="mt-4 font-serif text-5xl font-light text-white">
          Unlock <span className="italic text-gold">pricing.</span>
        </h1>
        <p className="mt-4 text-sm text-zinc-500">Register for instant access to live prices and priority sourcing.</p>

        <form onSubmit={submit} className="mt-12 space-y-8" data-testid="register-form">
          {error && (
            <p className="border border-red-900/50 bg-red-950/30 px-4 py-3 text-xs text-red-400" data-testid="register-error">{error}</p>
          )}
          <input required placeholder="Full Name" value={form.name} onChange={set("name")}
            className="lux-input" data-testid="register-name-input" />
          <input placeholder="Company (optional)" value={form.company} onChange={set("company")}
            className="lux-input" data-testid="register-company-input" />
          <input type="email" required placeholder="Email Address" value={form.email} onChange={set("email")}
            className="lux-input" data-testid="register-email-input" />
          <input type="password" required minLength={8} placeholder="Password (min. 8 characters)" value={form.password} onChange={set("password")}
            className="lux-input" data-testid="register-password-input" />
          <button type="submit" disabled={loading} data-testid="register-submit-button"
            className="w-full bg-gold py-4 font-mono text-[11px] uppercase tracking-[0.25em] text-black transition-colors hover:bg-gold-light active:scale-95 disabled:opacity-50">
            {loading ? "Creating account…" : "Create Account"}
          </button>
        </form>

        <p className="mt-8 text-sm text-zinc-500">
          Already registered?{" "}
          <Link to="/login" data-testid="register-login-link" className="text-gold underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
