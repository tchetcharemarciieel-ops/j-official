import { NextResponse } from "next/server";
import { createClient as createAnon } from "@supabase/supabase-js";
import { assertSameOrigin, route } from "@/lib/api";
import { draftSpec, getAccess, HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { runChecks, sampleRecord, summarize, type CheckResult } from "@/lib/checks";
import { validateRecord } from "@/lib/records";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Lance la batterie complète : tests de structure, de formulaires et de calculs,
 * puis tests réels contre la base (écriture/lecture/modification/suppression
 * en données de démonstration, et isolation entre clients via la RLS).
 */
export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const { profile, project } = await getAccess(id, ["owner", "admin"]);
  const spec = draftSpec(project);
  if (!spec) throw new HttpError(409, "Le logiciel n'a pas encore été généré.");
  const results: CheckResult[] = runChecks(spec);
  const db = adminClient();

  // 1. Cycle complet en base sur des données de démonstration
  const entity = spec.entities[0]!;
  const valid = validateRecord(entity, sampleRecord(entity, 1));
  let crud: CheckResult;
  if (!valid.ok) {
    crud = { id: "db_crud", category: "Base de données", name: "Ajout, lecture, modification, suppression", status: "fail", message: "Impossible de préparer un enregistrement de test valide." };
  } else {
    const steps: string[] = [];
    const { data: created, error: e1 } = await db.from("records").insert({ project_id: id, entity: entity.key, data: valid.data, is_demo: true, created_by: profile.id }).select("id").single();
    if (e1 || !created) steps.push("ajout échoué");
    else {
      const { data: read } = await db.from("records").select("data").eq("id", created.id).eq("project_id", id).single();
      if (!read || JSON.stringify(read.data) !== JSON.stringify(valid.data)) steps.push("lecture incohérente");
      const { error: e2 } = await db.from("records").update({ data: { ...valid.data, __test: true } }).eq("id", created.id);
      if (e2) steps.push("modification échouée");
      const { error: e3 } = await db.from("records").delete().eq("id", created.id);
      if (e3) steps.push("suppression échouée");
      const { data: gone } = await db.from("records").select("id").eq("id", created.id).maybeSingle();
      if (gone) steps.push("fiche toujours présente après suppression");
    }
    crud = {
      id: "db_crud",
      category: "Base de données",
      name: "Ajout, lecture, modification, suppression",
      status: steps.length ? "fail" : "pass",
      message: steps.length ? steps.join(" ; ") : `Cycle complet réussi sur « ${entity.labelPlural} » (données de démonstration, supprimées ensuite).`,
    };
  }
  results.push(crud);

  // 2. Isolation : un visiteur non connecté ne lit rien et ne peut rien écrire
  const anon = createAnon(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data: anonRows } = await anon.from("records").select("id").eq("project_id", id).limit(1);
  const { error: anonWrite } = await anon.from("records").insert({ project_id: id, entity: entity.key, data: {} });
  results.push({
    id: "isolation_anon",
    category: "Sécurité",
    name: "Accès sans connexion bloqué",
    status: (anonRows?.length ?? 0) === 0 && anonWrite ? "pass" : "fail",
    message: (anonRows?.length ?? 0) === 0 && anonWrite ? "Un visiteur non connecté ne peut ni lire ni écrire les données." : "Des données sont accessibles sans connexion !",
  });

  // 3. Isolation entre clients : la session de l'utilisateur ne voit pas les projets d'autrui
  const userDb = await createClient();
  const { data: foreign } = await db.from("projects").select("id").neq("id", id).limit(20);
  const { data: mine } = await db.from("project_members").select("project_id").eq("user_id", profile.id);
  const mineIds = new Set((mine ?? []).map((m) => m.project_id));
  const other = (foreign ?? []).find((p) => !mineIds.has(p.id));
  if (other) {
    const { data: leak } = await userDb.from("records").select("id").eq("project_id", other.id).limit(1);
    const { data: leakProject } = await userDb.from("projects").select("id").eq("id", other.id).maybeSingle();
    const ok = (leak?.length ?? 0) === 0 && !leakProject;
    results.push({ id: "isolation_tenant", category: "Sécurité", name: "Séparation des données entre clients", status: ok ? "pass" : "fail", message: ok ? "Votre session ne peut pas lire les logiciels ni les données d'un autre client, même en changeant l'identifiant." : "Fuite de données entre clients détectée !" });
  } else {
    results.push({ id: "isolation_tenant", category: "Sécurité", name: "Séparation des données entre clients", status: "warn", message: "Aucun autre client sur la plateforme pour l'instant : test de séparation non exécutable. La règle d'accès (RLS) reste active." });
  }
  const { error: userWrite } = await userDb.from("records").insert({ project_id: id, entity: entity.key, data: {} });
  results.push({ id: "server_only_writes", category: "Sécurité", name: "Écritures contrôlées par le serveur", status: userWrite ? "pass" : "fail", message: userWrite ? "Les écritures directes depuis le navigateur sont refusées : chaque action passe par la vérification des permissions côté serveur." : "Écriture directe possible sans vérification serveur !" });

  const summary = summarize(results);
  await db.from("project_versions").update({ test_report: { checks: results, summary, ranAt: new Date().toISOString(), full: true } }).eq("project_id", id).eq("version", project.draft_version);
  return NextResponse.json({ checks: results, summary, version: project.draft_version });
});
