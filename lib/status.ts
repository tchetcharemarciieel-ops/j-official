export const STATUS: Record<string, { label: string; cls: string }> = {
  preparation: { label: "En préparation", cls: "bg-slate-500/20 text-slate-200" },
  generation: { label: "En cours de génération", cls: "bg-sky-500/20 text-sky-200" },
  test: { label: "En test", cls: "bg-amber-500/20 text-amber-200" },
  published: { label: "Publié", cls: "bg-emerald-500/20 text-emerald-200" },
  suspended: { label: "Suspendu", cls: "bg-red-500/20 text-red-200" },
  failed: { label: "Échec nécessitant une correction", cls: "bg-red-500/20 text-red-200" },
};

export const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—");
export const fmtDateTime = (d: string | null | undefined) => (d ? new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Douala" }) : "—");
