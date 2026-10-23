import { adminClient } from "@/lib/supabase/admin";
import { aiChain, aiConfig, aiKeySource, refreshAiSettings } from "@/lib/ai";
import { lastAiSuccess } from "@/lib/ai-quota";
import { encryptionAvailable, maskSecret } from "@/lib/crypto";
import { getSetting } from "@/lib/settings";
import { sinceDays, weeklyCounts } from "@/lib/admin-stats";
import { fmtDateTime } from "@/lib/status";
import { Badge, BarChart, Card, Empty, PageHeader, Table, Tile, fmtXaf } from "@/components/admin/ui";
import { AiSettingsForm, ApiKeyRow } from "@/components/admin/AiForms";
import { AiTestButton } from "../AiTestButton";

export const metadata = { title: "Intelligence artificielle" };

export default async function AiAdmin() {
  await refreshAiSettings(true);
  const s = await getSetting("ai");
  const cfg = aiConfig();
  const chain = aiChain();
  const db = adminClient();
  const [last, { data: usage }, { data: users }] = await Promise.all([
    cfg ? lastAiSuccess().catch(() => null) : Promise.resolve(null),
    db.from("ai_usage").select("user_id,operation,engine,model,status,error,cost_xaf,created_at").gte("created_at", sinceDays(84)).order("created_at", { ascending: false }).limit(10000),
    db.from("profiles").select("id,email").limit(10000),
  ]);
  const u = usage ?? [];
  const month = u.filter((x) => x.created_at >= sinceDays(30));
  const errors = u.filter((x) => x.status !== "success" && x.engine === "ai").slice(0, 15);
  const byUser = new Map<string, number>();
  for (const x of month.filter((y) => y.engine === "ai")) byUser.set(x.user_id, (byUser.get(x.user_id) ?? 0) + 1);
  const top = [...byUser.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const email = (id: string) => users?.find((x) => x.id === id)?.email ?? id.slice(0, 8);
  const providers = [
    { id: "gemini", label: "Google Gemini" },
    { id: "openai", label: "OpenAI" },
    { id: "anthropic", label: "Anthropic" },
  ] as const;

  return (
    <div className="space-y-4">
      <PageHeader title="Intelligence artificielle" subtitle="Fournisseur, clés, modèles, quotas et suivi des coûts." />

      <Card>
        {cfg ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="green">IA configurée</Badge>
            <span>{cfg.label} · {cfg.model}</span>
            {chain.length > 1 && <span className="text-slate-500">· secours : {chain.slice(1).map((c) => c.model).join(" → ")}</span>}
            <span className="w-full text-slate-500">{last ? `Dernière réponse réelle réussie : ${fmtDateTime(last.at)}${last.model ? ` (${last.model})` : ""}.` : "Aucune requête IA réussie pour l'instant : la connexion n'est pas encore vérifiée."}</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="amber">Règles prédéfinies uniquement</Badge>
            <span className="text-slate-600">{s.enabled ? "Aucune clé de fournisseur n'est disponible." : "La génération IA est désactivée."}</span>
          </div>
        )}
        {cfg && <div className="mt-3"><AiTestButton /></div>}
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Requêtes IA (30 j)" value={month.filter((x) => x.engine === "ai").length} />
        <Tile label="Erreurs IA (30 j)" value={month.filter((x) => x.engine === "ai" && x.status !== "success").length} tone={month.some((x) => x.engine === "ai" && x.status !== "success") ? "warn" : "default"} />
        <Tile label="Analyses par règles (30 j)" value={month.filter((x) => x.engine === "rules").length} />
        <Tile label="Coût estimé (30 j)" value={fmtXaf(month.reduce((a, x) => a + (x.cost_xaf ?? 0), 0))} hint="estimation selon le prix public du modèle" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Réglages">
          <AiSettingsForm initial={{ enabled: s.enabled, provider: s.provider, model: s.model, fallbackModels: s.fallbackModels, userHourly: s.userHourly, userDaily: s.userDaily, globalDaily: s.globalDaily }} />
        </Card>
        <div className="space-y-4">
          <Card title="Clés API" subtitle="Chiffrées sur le serveur (AES-256). Seuls les 4 derniers caractères sont affichés.">
            {!encryptionAvailable() && <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Enregistrement de clés impossible : aucun secret serveur n&apos;est disponible pour le chiffrement (APP_ENCRYPTION_KEY).</p>}
            <div className="space-y-2">
              {providers.map((p) => (
                <ApiKeyRow key={p.id} provider={p.id} label={p.label} masked={s.keys[p.id] ? maskSecret(`xxxx${s.keys[p.id]!.last4}`) : ""} savedAt={s.keys[p.id]?.savedAt} source={aiKeySource(p.id)} canStore={encryptionAvailable()} />
              ))}
            </div>
          </Card>
          <Card title="Requêtes IA par semaine">
            <BarChart points={weeklyCounts(u.filter((x) => x.engine === "ai").map((x) => x.created_at))} />
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Utilisateurs les plus consommateurs (30 j)">
          {top.length === 0 ? <Empty>Aucune requête IA.</Empty> : <ul className="space-y-1 text-sm">{top.map(([id, n]) => <li key={id} className="flex justify-between"><span className="truncate">{email(id)}</span><span className="font-medium">{n}</span></li>)}</ul>}
        </Card>
        <Card title="Dernières erreurs IA">
          {errors.length === 0 ? <Empty>Aucune erreur.</Empty> : (
            <Table head={["Date", "Opération", "Modèle", "Erreur"]}>
              {errors.map((e, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap px-3 py-1.5 text-xs">{fmtDateTime(e.created_at)}</td>
                  <td className="px-3 py-1.5 text-xs">{e.operation}</td>
                  <td className="px-3 py-1.5 text-xs">{e.model ?? "—"}</td>
                  <td className="max-w-72 truncate px-3 py-1.5 text-xs text-red-700" title={e.error ?? ""}>{e.error ?? "—"}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
