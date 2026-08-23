import { useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Overline } from "@/components/Reveal";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[1440px] items-center px-6 pt-20" data-testid="forgot-password-page">
      <div className="w-full max-w-md">
        <Overline>Trade Client Access</Overline>
        <h1 className="mt-4 font-serif text-5xl font-light text-white">
          Reset your <span className="italic text-gold">password.</span>
        </h1>
        {sent ? (
          <p className="mt-4 text-sm text-zinc-500" data-testid="forgot-password-sent">
            If an account exists for that email, we've sent a link to reset your password. Check your inbox.
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm text-zinc-500">Enter your email and we'll send you a reset link.</p>
            <form onSubmit={submit} className="mt-12 space-y-8" data-testid="forgot-password-form">
              {error && (
                <p className="border border-red-900/50 bg-red-950/30 px-4 py-3 text-xs text-red-400" data-testid="forgot-password-error">{error}</p>
              )}
              <input
                type="email" required placeholder="Email Address" value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="lux-input" data-testid="forgot-password-email-input"
              />
              <button type="submit" disabled={loading} data-testid="forgot-password-submit-button"
                className="w-full bg-gold py-4 font-mono text-[11px] uppercase tracking-[0.25em] text-black transition-colors hover:bg-gold-light active:scale-95 disabled:opacity-50">
                {loading ? "Sending…" : "Send Reset Link"}
              </button>
            </form>
          </>
        )}
        <p className="mt-8 text-sm text-zinc-500">
          <Link to="/login" data-testid="forgot-password-back-link" className="text-gold underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
