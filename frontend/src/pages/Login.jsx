import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";
import { Overline } from "@/components/Reveal";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate("/collection");
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[1440px] items-center px-6 pt-20" data-testid="login-page">
      <div className="w-full max-w-md">
        <Overline>Trade Client Access</Overline>
        <h1 className="mt-4 font-serif text-5xl font-light text-white">
          Welcome <span className="italic text-gold">back.</span>
        </h1>
        <p className="mt-4 text-sm text-zinc-500">Sign in to view live pricing across the collection.</p>

        <form onSubmit={submit} className="mt-12 space-y-8" data-testid="login-form">
          {error && (
            <p className="border border-red-900/50 bg-red-950/30 px-4 py-3 text-xs text-red-400" data-testid="login-error">{error}</p>
          )}
          <input type="email" required placeholder="Email Address" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="lux-input" data-testid="login-email-input" />
          <input type="password" required placeholder="Password" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="lux-input" data-testid="login-password-input" />
          <button type="submit" disabled={loading} data-testid="login-submit-button"
            className="w-full bg-gold py-4 font-mono text-[11px] uppercase tracking-[0.25em] text-black transition-colors hover:bg-gold-light active:scale-95 disabled:opacity-50">
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p className="mt-8 text-sm text-zinc-500">
          New trade client?{" "}
          <Link to="/register" data-testid="login-register-link" className="text-gold underline-offset-4 hover:underline">
            Request an account
          </Link>
        </p>
      </div>
    </div>
  );
}
