// WhatsApp business number in international format without "+" (placeholder — replace with real number)
export const WHATSAPP_NUMBER = "910000000000";

export const waLink = (message) =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
