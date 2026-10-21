export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Chargement">
      <div className="skeleton h-10 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}</div>
      <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <div key={i} className="skeleton h-56 rounded-2xl" />)}</div>
    </div>
  );
}
