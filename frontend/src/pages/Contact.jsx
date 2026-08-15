import { Overline, MaskedLine, Reveal } from "@/components/Reveal";
import { EnquiryForm } from "@/components/EnquiryForm";
import { MapPin, Mail, Phone, Factory } from "lucide-react";

const INFO = [
  { icon: MapPin, label: "Head Office — Mumbai", value: "Bharat Diamond Bourse, Bandra Kurla Complex, Mumbai" },
  { icon: Factory, label: "Manufacturing Unit — Surat", value: "Mahidharpura, Surat, Gujarat" },
  { icon: Mail, label: "Email", value: "shreydoshi16@gmail.com" },
  { icon: Phone, label: "Phone", value: "+91 261 000 0000" },
];

export default function Contact() {
  return (
    <div className="mx-auto max-w-[1440px] px-6 pb-32 pt-32" data-testid="contact-page">
      <div className="grid gap-20 lg:grid-cols-2">
        <div>
          <Overline>Private Enquiries</Overline>
          <MaskedLine className="mt-6">
            <h1 className="font-serif text-5xl font-light leading-tight text-white sm:text-6xl">
              Let's find your <span className="italic text-gold">stone.</span>
            </h1>
          </MaskedLine>
          <Reveal delay={0.2} className="mt-8 max-w-md">
            <p className="text-sm leading-relaxed text-zinc-400">
              Whether you need a single certified solitaire or a parcel of
              calibrated melee, our sourcing desk responds within 24 hours.
            </p>
          </Reveal>
          <div className="mt-16 space-y-10">
            {INFO.map(({ icon: Icon, label, value }, i) => (
              <Reveal key={label} delay={0.1 * i} className="flex items-start gap-5">
                <Icon className="mt-1 h-4 w-4 text-gold" strokeWidth={1.5} />
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">{label}</p>
                  <p className="mt-2 text-sm text-white" data-testid={`contact-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{value}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal delay={0.2} className="border border-white/10 bg-[#0A0A0A] p-10 lg:p-14">
          <Overline className="mb-10">Send an Enquiry</Overline>
          <EnquiryForm testIdPrefix="contact-enquiry" />
        </Reveal>
      </div>
    </div>
  );
}
