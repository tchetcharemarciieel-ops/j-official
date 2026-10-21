/** Bouton WhatsApp flottant, affiché seulement si NEXT_PUBLIC_WHATSAPP_NUMBER est configuré. */
export function WhatsAppButton() {
  const number = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
  if (number.length < 8) return null;
  const text = encodeURIComponent("Bonjour, je voudrais en savoir plus sur MiniSoft RCA pour mon entreprise.");
  return (
    <a
      href={`https://wa.me/${number}?text=${text}`}
      target="_blank"
      rel="noopener"
      className="no-print fixed bottom-5 right-5 z-[70] flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 font-semibold text-white shadow-lg transition-colors hover:bg-[#1ebe5b]"
      aria-label="Nous écrire sur WhatsApp"
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current" aria-hidden="true">
        <path d="M20.5 3.5A11.8 11.8 0 0 0 1.9 17.8L.5 23.5l5.8-1.5A11.8 11.8 0 0 0 20.5 3.5Zm-8.4 18.1c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.4.9.9-3.3-.2-.4a9.8 9.8 0 1 1 8.1 4.4Zm5.4-7.3c-.3-.1-1.8-.9-2-1s-.5-.1-.7.1-.8 1-1 1.2-.4.2-.7.1a8 8 0 0 1-4-3.5c-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6a1.1 1.1 0 0 0-.8.4 3.4 3.4 0 0 0-1 2.5 5.9 5.9 0 0 0 1.2 3.1 13.4 13.4 0 0 0 5.2 4.6c1.9.8 2.7.9 3.6.7a3.1 3.1 0 0 0 2-1.4 2.5 2.5 0 0 0 .2-1.4c-.1-.1-.3-.2-.6-.3Z" />
      </svg>
      <span className="hidden sm:inline">WhatsApp</span>
    </a>
  );
}
