import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";
import { Overline } from "@/components/Reveal";

export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: "", company: "", kyc_name: "", mobile: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(form);
      setDone(true);
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
          Unlock the <span className="italic text-gold">collection.</span>
        </h1>
        <p className="mt-4 text-sm text-zinc-500">
          Register with your company and KYC details. Every application is
          verified and approved personally by our team.
        </p>

        {done ? (
          <div className="mt-12 border border-gold/40 bg-[#0A0A0A] p-10" data-testid="register-success">
            <p className="font-serif text-2xl italic text-gold">Application received.</p>
            <p className="mt-4 text-sm leading-relaxed text-zinc-400">
              Thank you, {form.name}. We are verifying your company and KYC
              details. Once approved, sign in to explore the full collection
              and live pricing.
            </p>
            <Link to="/login" data-testid="register-success-login-link"
              className="mt-8 inline-block border border-gold px-8 py-3 font-mono text-[11px] uppercase tracking-[0.25em] text-gold transition-colors hover:bg-gold hover:text-black active:scale-95">
              Go to Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-12 space-y-8" data-testid="register-form">
            {error && (
              <p className="border border-red-900/50 bg-red-950/30 px-4 py-3 text-xs text-red-400" data-testid="register-error">{error}</p>
            )}
            <input required placeholder="Full Name" value={form.name} onChange={set("name")}
              className="lux-input" data-testid="register-name-input" />
            <input required placeholder="Company Name" value={form.company} onChange={set("company")}
              className="lux-input" data-testid="register-company-input" />
            <input required placeholder="KYC / Legal Name (as per documents)" value={form.kyc_name} onChange={set("kyc_name")}
              className="lux-input" data-testid="register-kyc-input" />
            <input required type="tel" placeholder="Mobile Number" value={form.mobile} onChange={set("mobile")}
              className="lux-input" data-testid="register-mobile-input" />
            <input type="email" required placeholder="Email Address" value={form.email} onChange={set("email")}
              className="lux-input" data-testid="register-email-input" />
            <input type="password" required minLength={8} placeholder="Password (min. 8 characters)" value={form.password} onChange={set("password")}
              className="lux-input" data-testid="register-password-input" />
            <button type="submit" disabled={loading} data-testid="register-submit-button"
              className="w-full bg-gold py-4 font-mono text-[11px] uppercase tracking-[0.25em] text-black transition-colors hover:bg-gold-light active:scale-95 disabled:opacity-50">
              {loading ? "Submitting…" : "Apply for Access"}
            </button>
          </form>
        )}

        <p className="mt-8 text-sm text-zinc-500">
          Already approved?{" "}
          <Link to="/login" data-testid="register-login-link" className="text-gold underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
