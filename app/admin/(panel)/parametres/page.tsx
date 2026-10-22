import { getSite } from "@/lib/site";
import { Card, PageHeader } from "@/components/admin/ui";
import { FaqEditor, JsonForm } from "@/components/admin/Controls";

export const metadata = { title: "Paramètres" };

/** Personnalisation de la plateforme : appliquée sur tout le site en 30 secondes au plus. */
export default async function SettingsPage() {
  const s = await getSite();
  return (
    <div className="space-y-4">
      <PageHeader title="Paramètres de la plateforme" subtitle="Marque, textes de l'accueil, annonces, coordonnées et FAQ. Les changements apparaissent sur le site en moins d'une minute." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Identité">
          <JsonForm
            url="/api/admin/settings"
            settingKey="branding"
            initial={s.branding}
            done="Identité enregistrée."
            fields={[
              { name: "name", label: "Nom de la plateforme", max: 40 },
              { name: "slogan", label: "Slogan", max: 120 },
              { name: "logoUrl", label: "Logo (adresse https d'une image, vide = initiales)", type: "url", max: 500 },
              { name: "primaryColor", label: "Couleur principale (boutons)", type: "color" },
            ]}
          />
        </Card>
        <Card title="Textes de la page d'accueil" subtitle="Laissez vide pour garder le texte d'origine.">
          <JsonForm
            url="/api/admin/settings"
            settingKey="home"
            initial={s.home}
            done="Textes enregistrés."
            fields={[
              { name: "heroTitle", label: "Titre principal", max: 120 },
              { name: "heroSubtitle", label: "Sous-titre", type: "textarea", max: 300 },
            ]}
          />
        </Card>
        <Card title="Annonce et maintenance" subtitle="Bandeau affiché en haut de toutes les pages.">
          <JsonForm
            url="/api/admin/settings"
            settingKey="announcement"
            initial={s.announcement}
            done="Annonce enregistrée."
            fields={[
              { name: "active", label: "Afficher le bandeau", type: "checkbox" },
              { name: "level", label: "Type", type: "select", options: [{ value: "info", label: "Annonce" }, { value: "maintenance", label: "Maintenance" }] },
              { name: "message", label: "Message", type: "textarea", max: 300 },
            ]}
          />
        </Card>
        <Card title="Coordonnées de contact" subtitle="Affichées dans le pied de page.">
          <JsonForm
            url="/api/admin/settings"
            settingKey="contact"
            initial={s.contact}
            done="Coordonnées enregistrées."
            fields={[
              { name: "whatsapp", label: "WhatsApp (vide = numéro configuré sur le serveur)", max: 30 },
              { name: "email", label: "E-mail de contact", max: 120 },
              { name: "address", label: "Adresse", max: 160 },
            ]}
          />
        </Card>
      </div>
      <Card title="Questions fréquentes">
        <FaqEditor initial={s.faq.items} />
      </Card>
    </div>
  );
}
