/** Barre de recherche et de filtres (formulaire GET : les filtres restent dans l'adresse). */
export function Filters({ q, placeholder, selects, extra }: { q?: string; placeholder: string; selects?: { name: string; value?: string; label: string; options: { value: string; label: string }[] }[]; extra?: React.ReactNode }) {
  return (
    <form className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap" role="search">
      <label className="sr-only" htmlFor="f-q">Rechercher</label>
      <input id="f-q" name="q" defaultValue={q} placeholder={placeholder} className="input sm:max-w-xs" />
      {selects?.map((s) => (
        <label key={s.name} className="sm:w-48">
          <span className="sr-only">{s.label}</span>
          <select name={s.name} defaultValue={s.value ?? ""} className="input">
            <option value="">{s.label} : tous</option>
            {s.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      ))}
      <button className="btn btn-ghost">Filtrer</button>
      {extra}
    </form>
  );
}
