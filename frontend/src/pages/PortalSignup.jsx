import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { Overline } from "@/components/Reveal";

export default function PortalSignup() {
  const [form, setForm] = useState({ name: "", email: "", password: "", access_code: "" });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/portal/request-access", {
        ...form,
        access_code: form.access_code || null,
      });
      setDone(true);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  if (done)
    return (
      <div className="mx-auto max-w-[560px] px-6 pb-32 pt-32" data-testid="portal-signup-done">
        <Overline>Request sent</Overline>
        <h1 className="mt-4 font-serif text-4xl font-light text-white">
          Waiting for <span className="italic text-gold">approval.</span>
        </h1>
        <p className="mt-4 text-sm text-zinc-500">
          Your account is created. Once the admin gives you access, sign in with the same email and password.
        </p>
        <Link
          to="/portal-access"
          className="mt-8 inline-block border border-gold px-8 py-3 font-mono text-[11px] uppercase tracking-[0.25em] text-gold transition-colors hover:bg-gold hover:text-black"
        >
          Go to sign in
        </Link>
      </div>
    );

  return (
    <div className="mx-auto max-w-[560px] px-6 pb-32 pt-32" data-testid="portal-signup-page">
      <Overline>Portal</Overline>
      <h1 className="mt-4 font-serif text-4xl font-light text-white">
        Request <span className="italic text-gold">access.</span>
      </h1>
      <p className="mt-3 text-sm text-zinc-500">Create your account. The admin will give you access.</p>

      <form onSubmit={submit} className="mt-10 grid gap-8 border border-white/10 bg-[#0C1E30] p-8">
        <input required placeholder="Full name" value={form.name} onChange={(e) => set("name", e.target.value)} className="lux-input" data-testid="portal-signup-name" />
        <input required type="email" placeholder="Email" value={form.email} onChange={(e) => set("email", e.target.value)} className="lux-input" data-testid="portal-signup-email" />
        <input required type="password" minLength={8} placeholder="Password (min 8 characters)" value={form.password} onChange={(e) => set("password", e.target.value)} className="lux-input" data-testid="portal-signup-password" />
        <input placeholder="Access code (if the admin gave you one)" value={form.access_code} onChange={(e) => set("access_code", e.target.value)} className="lux-input" data-testid="portal-signup-code" />
        <button
          type="submit"
          disabled={saving}
          data-testid="portal-signup-submit"
          className="border border-gold px-10 py-3 font-mono text-[11px] uppercase tracking-[0.25em] text-gold transition-colors hover:bg-gold hover:text-black active:scale-95 disabled:opacity-50"
        >
          {saving ? "Sending…" : "Request access"}
        </button>
      </form>
    </div>
  );
}
