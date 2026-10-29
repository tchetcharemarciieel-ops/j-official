import { LogOut } from "lucide-react";

/** Bouton de déconnexion (formulaire POST : fonctionne même sans JavaScript). */
export function SignOutButton({ className = "btn btn-ghost", label = "Se déconnecter", icon = true }: { className?: string; label?: string; icon?: boolean }) {
  return (
    <form action="/auth/signout" method="post">
      <button type="submit" className={className}>
        {icon && <LogOut className="h-4 w-4" aria-hidden />}
        {label}
      </button>
    </form>
  );
}
