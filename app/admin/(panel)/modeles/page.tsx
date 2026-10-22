import { adminClient } from "@/lib/supabase/admin";
import { getSetting } from "@/lib/settings";
import { TEMPLATES } from "@/lib/templates";
import { Card, PageHeader } from "@/components/admin/ui";
import { TemplateToggles } from "@/components/admin/Controls";

export const metadata = { title: "Modèles" };

/** Modèles de mini-logiciels : choisir ceux proposés aux clients (accueil, page Modèles, création). */
export default async function TemplatesAdmin() {
  const [{ disabled }, { data: projects }] = await Promise.all([getSetting("templates"), adminClient().from("projects").select("template_id").not("template_id", "is", null).limit(10000)]);
  const uses = (id: string) => (projects ?? []).filter((p) => p.template_id === id).length;
  return (
    <div className="space-y-4">
      <PageHeader title="Modèles de mini-logiciels" subtitle="Décochez un modèle pour le retirer de l'accueil, de la page Modèles et de la création. Les logiciels déjà créés ne sont pas touchés." />
      <Card subtitle="Le contenu des modèles (tables, champs, tableaux de bord) est défini dans le code de la plateforme et testé automatiquement.">
        <TemplateToggles templates={TEMPLATES.map((t) => ({ id: t.id, name: t.name, category: t.category, uses: uses(t.id) }))} disabled={disabled} />
      </Card>
    </div>
  );
}
