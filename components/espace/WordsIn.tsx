/** Texte révélé mot par mot (flou → net) au chargement de la page. */
export function WordsIn({ text, delay = 0, step = 70 }: { text: string; delay?: number; step?: number }) {
  const words = text.split(" ");
  return (
    <span aria-label={text}>
      {words.map((w, i) => (
        <span key={i} aria-hidden className="word-in" style={{ animationDelay: `${delay + i * step}ms` }}>
          {w}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}
