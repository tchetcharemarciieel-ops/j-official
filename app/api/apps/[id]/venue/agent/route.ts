import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { appContext } from "@/lib/app-data";
import { CREDIT_COSTS } from "@/lib/config";
import { aiAssistant, assistantChain, refreshAiSettings } from "@/lib/ai";
import { burstLimited, checkAiQuota } from "@/lib/ai-quota";
import { withCredits } from "@/lib/credits";
import { effectiveWorkspace } from "@/lib/workspace";
import { LEVEL, type Doc } from "@/lib/venue/model";
import { kitchenReport, reportAdvice, type FullOrder } from "@/lib/venue/online";
import { visionSettings, visionStats, type Seat, type VisionAlert } from "@/lib/venue/vision";
import { SupabaseStore } from "@/lib/venue/supabase-store";

export const maxDuration = 120;
type Ctx = { params: Promise<{ id: string }> };

const SYSTEM = `Tu es l'agent de gestion d'un restaurant utilisant MiniSoft RCA (Centrafrique, montants en FCFA).
On te donne UNIQUEMENT des indicateurs calculés à partir des événements réels enregistrés dans la base (commandes, préparation, service, alertes).
Règles :
- N'invente aucun chiffre, aucun client, aucun plat : appuie chaque constat sur un chiffre fourni et cite-le.
- Si les données sont insuffisantes, dis-le simplement.
- Réponds en français simple, en 5 à 8 points courts : ce qui va bien, ce qui ralentit le service, 3 actions concrètes et réalistes pour demain.
- Ne promets aucun résultat chiffré et ne recommande aucune action sur les paiements autre que la vérification par l'équipe.`;

/** Analyse IA du rapport quotidien (gérants) : seuls des chiffres agrégés sont envoyés au modèle, aucune donnée personnelle. */
export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const input = z.object({ mode: z.enum(["demo", "live"]), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(await readJson(req, 2_000));
  const ctx = await appContext(id, input.mode);
  const layout = effectiveWorkspace(ctx.spec).layout;
  if (layout !== "restaurant" && layout !== "hotel") throw new HttpError(404, "Ce logiciel n'a pas de module restaurant.");
  if (LEVEL[ctx.role] < 2) throw new HttpError(403, "L'analyse IA est réservée aux gérants.");
  if (burstLimited(`agent:${ctx.profile.id}`)) throw new HttpError(429, "Trop de demandes en peu de temps. Patientez quelques minutes.");
  const store = new SupabaseStore(id, input.mode === "demo", ctx.profile.id);
  const data = await store.all();
  const vs = visionSettings(data.settings[0]?.data as never);
  const p = { from: input.from, to: input.to };
  const report = kitchenReport(data.order as Doc<FullOrder>[], p, vs.prep_minutes);
  const service = visionStats(data.vseat as Doc<Seat>[], data.valert as Doc<VisionAlert>[], data.table as never, p, data.order as never);
  if (report.orders === 0 && service.seatings === 0) return NextResponse.json({ reply: "Aucune commande ni aucun passage enregistré sur cette période : il n'y a pas encore de données à analyser.", creditsUsed: 0 });
  await refreshAiSettings();
  if (!assistantChain().length) throw new HttpError(503, "L'IA n'est pas disponible pour le moment. Les recommandations calculées restent affichées.");
  const quota = await checkAiQuota(ctx.profile.id);
  if (!quota.ok) throw new HttpError(429, quota.reason);
  const facts = {
    periode: p,
    seuil_preparation_min: vs.prep_minutes,
    commandes: { total: report.orders, annulees: report.cancelled, par_qr: report.qr, payees_confirmees: report.paidOrders, montant_commande_fcfa: report.revenueOrdered },
    cuisine: { preparation_moyenne_min: report.avgPrep, preparation_max_min: report.maxPrep, commandes_lentes: report.slowCount, acceptation_moyenne_min: report.avgAccept, problemes: report.problems.map((x) => x.text) },
    plats_les_plus_commandes: report.topItems,
    commandes_par_heure: report.byHour,
    service: { passages: service.seatings, clients: service.guests, attente_moyenne_avant_service_min: service.avgWait, partis_sans_service: service.leftUnserved, alertes: service.alerts },
    recommandations_calculees: reportAdvice(report, vs.prep_minutes),
  };
  const { result, creditsUsed } = await withCredits({ userId: ctx.profile.id, operation: "assistant", credits: CREDIT_COSTS.ask, engine: "ai", notifyOnFailure: false }, async () => {
    const { answer, usage } = await aiAssistant(SYSTEM, [{ role: "user", text: `Indicateurs réels du restaurant (JSON) :\n${JSON.stringify(facts)}\n\nAnalyse ces chiffres et propose des améliorations.` }]);
    return { result: answer.reply, usage };
  });
  return NextResponse.json({ reply: result, creditsUsed });
});
