import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Overline } from "@/components/Reveal";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: password });
      setDone(true);
      setTimeout(() => navigate("/login"), 2500);
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="mx-auto flex min-h-screen max-w-[1440px] items-center px-6 pt-20" data-testid="reset-password-page">
        <div className="w-full max-w-md">
          <Overline>Trade Client Access</Overline>
          <h1 className="mt-4 font-serif text-5xl font-light text-white">
            Invalid <span className="italic text-gold">link.</span>
          </h1>
          <p className="mt-4 text-sm text-zinc-500">This reset link is missing or invalid. Please request a new one.</p>
          <p className="mt-8 text-sm text-zinc-500">
            <Link to="/forgot-password" className="text-gold underline-offset-4 hover:underline">Request a new link</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[1440px] items-center px-6 pt-20" data-testid="reset-password-page">
      <div className="w-full max-w-md">
        <Overline>Trade Client Access</Overline>
        <h1 className="mt-4 font-serif text-5xl font-light text-white">
          Set a new <span className="italic text-gold">password.</span>
        </h1>
        {done ? (
          <p className="mt-4 text-sm text-zinc-500" data-testid="reset-password-success">
            Your password has been reset. Redirecting you to sign in…
          </p>
        ) : (
          <form onSubmit={submit} className="mt-12 space-y-8" data-testid="reset-password-form">
            {error && (
              <p className="border border-red-900/50 bg-red-950/30 px-4 py-3 text-xs text-red-400" data-testid="reset-password-error">{error}</p>
            )}
            <input
              type="password" required placeholder="New Password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="lux-input" data-testid="reset-password-new-input"
            />
            <input
              type="password" required placeholder="Confirm New Password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="lux-input" data-testid="reset-password-confirm-input"
            />
            <button type="submit" disabled={loading} data-testid="reset-password-submit-button"
              className="w-full bg-gold py-4 font-mono text-[11px] uppercase tracking-[0.25em] text-black transition-colors hover:bg-gold-light active:scale-95 disabled:opacity-50">
              {loading ? "Resetting…" : "Reset Password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
