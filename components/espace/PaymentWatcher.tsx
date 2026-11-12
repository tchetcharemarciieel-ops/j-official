"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Après un paiement SasPay : vérifie toutes les 4 s (pendant 3 min) si SasPay a confirmé le
 * paiement, puis recharge la page dès que la formule est activée.
 */
export function PaymentWatcher() {
  const router = useRouter();
  const [state, setState] = useState<"wait" | "slow">("wait");
  useEffect(() => {
    let stop = false;
    const started = Date.now();
    const tick = async () => {
      if (stop) return;
      try {
        const r = await fetch("/api/billing/status", { cache: "no-store" });
        const b = await r.json().catch(() => ({}));
        if (b.activated || (r.ok && !b.pending)) {
          router.replace("/espace/abonnement?paiement=ok");
          router.refresh();
          return;
        }
      } catch {
        /* réseau : on réessaie */
      }
      if (Date.now() - started > 180_000) return setState("slow");
      setTimeout(tick, 4000);
    };
    const t = setTimeout(tick, 1500);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [router]);
  return (
    <p role="status" className="mt-6 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
      {state === "wait" ? <><span className="spinner" aria-hidden />Vérification de votre paiement auprès de SasPay… Votre formule s&apos;activera automatiquement.</> : <>Le paiement n&apos;est pas encore confirmé par SasPay. Si vous avez payé, rechargez cette page dans quelques minutes ; sinon, touchez « Payer » pour réessayer.</>}
    </p>
  );
}
