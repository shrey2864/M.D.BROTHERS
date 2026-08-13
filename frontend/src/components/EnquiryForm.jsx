import { useState } from "react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";

export const EnquiryForm = ({ diamondSku = null, testIdPrefix = "enquiry" }) => {
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [sending, setSending] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      await api.post("/enquiries", { ...form, diamond_sku: diamondSku });
      toast.success("Enquiry received. Our team will reach out within 24 hours.");
      setForm({ name: "", email: "", phone: "", message: "" });
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-8" data-testid={`${testIdPrefix}-form`}>
      {diamondSku && (
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-gold">
          Enquiring about {diamondSku}
        </p>
      )}
      <div className="grid gap-8 sm:grid-cols-2">
        <input required placeholder="Full Name" value={form.name} onChange={set("name")}
          className="lux-input" data-testid={`${testIdPrefix}-name-input`} />
        <input required type="email" placeholder="Email Address" value={form.email} onChange={set("email")}
          className="lux-input" data-testid={`${testIdPrefix}-email-input`} />
      </div>
      <input placeholder="Phone (optional)" value={form.phone} onChange={set("phone")}
        className="lux-input" data-testid={`${testIdPrefix}-phone-input`} />
      <textarea required rows={4} placeholder="Tell us about your requirement — shape, carat, quantity, budget…"
        value={form.message} onChange={set("message")}
        className="lux-input resize-none" data-testid={`${testIdPrefix}-message-input`} />
      <button type="submit" disabled={sending}
        data-testid={`${testIdPrefix}-submit-button`}
        className="border border-gold px-10 py-3 font-mono text-[11px] uppercase tracking-[0.25em] text-gold transition-colors duration-300 hover:bg-gold hover:text-black active:scale-95 disabled:opacity-50">
        {sending ? "Sending…" : "Send Enquiry"}
      </button>
    </form>
  );
};
