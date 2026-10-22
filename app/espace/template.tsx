/** Rejoué à chaque navigation dans l'espace client : la nouvelle page apparaît en douceur. */
export default function EspaceTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
