"use client";

import { BarChart3, BellRing, Camera, Copy, Download, KeyRound, PlayCircle, Plus, Power, ShieldCheck, Volume2 } from "lucide-react";
import { useMemo, useState } from "react";
import { periodPreset, type Doc, type Order, type Period, type Table, type TableZone } from "@/lib/venue/model";
import { ALERT_KIND_HINTS, ALERT_KIND_LABELS, ALERT_KINDS, CAMERA_ONLINE_MS, countByStatus, fmtMinutes, minutesBetween, visionStats, type Camera as Cam, type Seat, type VisionAlert, type VisionSettings } from "@/lib/venue/vision";
import { Btn, Card, Empty, Field, inp, isMgr, Modal, PeriodPicker, Stat, useV } from "../ui";
import { ZONE_LABELS, hhmm, useLive, useTableZones } from "./plan";

const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

/** Historique des alertes (toutes, y compris clôturées). */
export function AlertsHistory() {
  const { v, name } = useV();
  const [only, setOnly] = useState<"toutes" | "ouvertes">("toutes");
  const list = ((v.data.valert ?? []) as Doc<VisionAlert>[]).filter((a) => only === "toutes" || !a.data.resolved_at).sort((a, b) => b.data.raised_at.localeCompare(a.data.raised_at)).slice(0, 200);
  return (
    <Card title="Historique des alertes" actions={<select className={`${inp} !w-auto !py-1 text-xs`} value={only} onChange={(e) => setOnly(e.target.value as never)} aria-label="Filtrer"><option value="toutes">Toutes</option><option value="ouvertes">En cours</option></select>}>
      {list.length === 0 ? (
        <Empty text="Aucune alerte enregistrée." icon={BellRing} />
      ) : (
        <div className="-mx-3.5 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr><th className="px-3.5 py-2 font-medium">Déclenchée</th><th className="py-2 font-medium">Table</th><th className="py-2 font-medium">Type</th><th className="py-2 font-medium">Seuil</th><th className="py-2 font-medium">Prise en charge</th><th className="px-3.5 py-2 font-medium">Clôture</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((a) => (
                <tr key={a.id}>
                  <td className="px-3.5 py-2">{dt(a.data.raised_at)}</td>
                  <td className="py-2 font-semibold">{a.data.table_number}</td>
                  <td className="py-2">{ALERT_KIND_LABELS[a.data.kind ?? "service"]}</td>
                  <td className="py-2">{a.data.threshold_min} min</td>
                  <td className="py-2">{a.data.ack_at ? `${name(a.data.ack_by)}, ${fmtMinutes(minutesBetween(a.data.raised_at, a.data.ack_at))} après` : "—"}</td>
                  <td className="px-3.5 py-2">{a.data.resolved_at ? `${hhmm(a.data.resolved_at)} · ${a.data.resolution === "libere" ? "table libérée" : "délai résolu"}` : <span className="font-semibold text-red-600">En cours</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Espace administrateur : situation en direct et statistiques calculées sur les passages enregistrés. */
export function AdminView({ vs, now }: { vs: VisionSettings; now: number }) {
  const { v } = useV();
  const [p, setP] = useState<Period>(() => periodPreset("today"));
  const live = useLive("all", vs, now);
  const c = countByStatus(live);
  const busy = c.occupee + c.attente + c.attente_plat + c.plat_pret;
  const waiting = live.filter((l) => l.status === "attente" || l.status === "attente_plat");
  const tables = v.data.table as Doc<Table>[];
  const st = useMemo(() => visionStats(v.data.vseat as Doc<Seat>[], v.data.valert as Doc<VisionAlert>[], tables, p, v.data.order as Doc<Order>[]), [v, tables, p]);
  const maxHour = Math.max(1, ...st.byHour);
  return (
    <div className="space-y-4">
      <Card title="En ce moment">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Tables libres" value={c.libre} tone="green" />
          <Stat label="Tables occupées" value={busy} tone="red" />
          <Stat label="Tables réservées" value={c.reservee} tone="blue" />
          <Stat label="Clients en attente" value={`${waiting.reduce((a, l) => a + (l.seat?.data.guests ?? 0), 0)} (${waiting.length} table${waiting.length > 1 ? "s" : ""})`} tone="amber" />
          <Stat label="Plats prêts à servir" value={c.plat_pret} tone="violet" />
          <Stat label="Tables à nettoyer" value={c.nettoyage} />
          <Stat label="Taux d'occupation" value={live.length ? `${Math.round((busy / live.length) * 100)} %` : "—"} />
          <Stat label="Délais dépassés" value={live.filter((l) => l.late).length} tone={live.some((l) => l.late) ? "red" : "slate"} />
        </div>
      </Card>
      <Card title={<span className="flex items-center gap-2"><BarChart3 className="h-4 w-4" aria-hidden />Statistiques</span>} actions={<PeriodPicker value={p} onChange={setP} />}>
        {st.seatings === 0 ? (
          <Empty text="Aucun passage enregistré sur cette période." />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Passages (groupes)" value={st.seatings} />
              <Stat label="Clients accueillis" value={st.guests} />
              <Stat label="Temps moyen avant le 1er service" value={fmtMinutes(st.avgWait)} tone="blue" />
              <Stat label="Attente la plus longue" value={fmtMinutes(st.maxWait)} tone={st.maxWait !== null && st.maxWait >= vs.alert_minutes ? "red" : "slate"} />
              <Stat label="Durée moyenne à table" value={fmtMinutes(st.avgStay)} />
              <Stat label="Partis sans être servis" value={st.leftUnserved} tone={st.leftUnserved ? "red" : "slate"} />
              <Stat label="Alertes" value={st.alerts} tone={st.alerts ? "amber" : "slate"} />
              <Stat label="Délai moyen de prise en charge" value={fmtMinutes(st.avgAck)} />
            </div>
            <div>
              <h5 className="mb-2 text-xs font-semibold text-slate-600">Arrivées par heure</h5>
              <div className="flex h-28 items-end gap-0.5" role="img" aria-label="Nombre d'arrivées par heure de la journée">
                {st.byHour.map((n, h) => (
                  <div key={h} className="flex flex-1 flex-col items-center gap-1">
                    <div className="w-full rounded-t bg-[var(--app-primary)] opacity-80" style={{ height: `${(n / maxHour) * 100}%`, minHeight: n ? 3 : 0 }} title={`${h} h : ${n} arrivée(s)`} />
                    <span className="text-[9px] text-slate-400">{h % 3 === 0 ? h : ""}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <h5 className="mb-1 text-xs font-semibold text-slate-600">Tables les plus utilisées</h5>
                <ul className="space-y-1 text-sm">{st.byTable.slice(0, 8).map((x) => <li key={x.table.id} className="flex justify-between"><span>Table {x.table.data.number}</span><span className="font-semibold">{x.count}</span></li>)}</ul>
              </div>
              <div>
                <h5 className="mb-1 text-xs font-semibold text-slate-600">Alertes par type</h5>
                <ul className="space-y-1 text-sm">{st.alertsByKind.map((x) => <li key={x.kind} className="flex justify-between"><span>{ALERT_KIND_LABELS[x.kind]}</span><span className="font-semibold">{x.count}</span></li>)}</ul>
                <h5 className="mb-1 mt-3 text-xs font-semibold text-slate-600">Origine de l&apos;occupation</h5>
                <ul className="space-y-1 text-sm">
                  <li className="flex justify-between"><span>Saisie par l&apos;équipe</span><span className="font-semibold">{st.bySource.manuel}</span></li>
                  <li className="flex justify-between"><span>Caméra</span><span className="font-semibold">{st.bySource.camera}</span></li>
                  {st.bySource.demo > 0 && <li className="flex justify-between text-amber-700"><span>Simulation (démo)</span><span className="font-semibold">{st.bySource.demo}</span></li>}
                </ul>
              </div>
            </div>
          </div>
        )}
      </Card>
      <AlertsHistory />
    </div>
  );
}

/** Réglages : seuils des quatre types d'alerte et son. */
export function VisionSettingsView({ vs, onTest }: { vs: VisionSettings; onTest: () => void }) {
  const { level, act } = useV();
  const [f, setF] = useState({ alert_minutes: String(vs.alert_minutes), order_minutes: String(vs.order_minutes), prep_minutes: String(vs.prep_minutes), ready_minutes: String(vs.ready_minutes), sound: vs.sound });
  const [busy, setBusy] = useState(false);
  const field = { service: "alert_minutes", commande: "order_minutes", preparation: "prep_minutes", plat: "ready_minutes" } as const;
  const mgr = isMgr(level);
  return (
    <Card title="Délais d'alerte">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await act("vision.settings", { alert_minutes: Number(f.alert_minutes), order_minutes: Number(f.order_minutes), prep_minutes: Number(f.prep_minutes), ready_minutes: Number(f.ready_minutes), sound: f.sound });
          setBusy(false);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {ALERT_KINDS.map((k) => (
            <Field key={k} label={`${ALERT_KIND_LABELS[k]} (minutes)`} hint={`${ALERT_KIND_HINTS[k]}. 0 = désactivée.`}>
              <input type="number" min={0} max={180} className={inp} value={f[field[k]]} onChange={(e) => setF({ ...f, [field[k]]: e.target.value })} disabled={!mgr} required />
            </Field>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.sound} onChange={(e) => setF({ ...f, sound: e.target.checked })} disabled={!mgr} />Alerte sonore sur les appareils du restaurant</label>
        <p className="text-xs text-slate-500">Une seule alerte par table et par type : elle reste affichée jusqu&apos;à ce que la cause disparaisse (client servi, plat prêt ou servi, table libérée). Le son retentit une seule fois par nouvelle alerte et par appareil.</p>
        <div className="flex flex-wrap gap-2">
          {mgr && <Btn type="submit" busy={busy}>Enregistrer</Btn>}
          <Btn kind="ghost" onClick={onTest}><Volume2 className="h-4 w-4" aria-hidden />Tester le son</Btn>
        </div>
        {!mgr && <p className="text-xs text-slate-500">Seuls les gérants peuvent modifier les délais.</p>}
      </form>
    </Card>
  );
}

/** Fichier de configuration de la passerelle, prérempli (zones à ajuster avec « --apercu »). */
function downloadConfig(cam: Doc<Cam>, tables: Doc<Table>[], endpoint: string, key = "") {
  const mine = tables.filter((t) => cam.data.table_ids.includes(t.id));
  const cols = Math.max(1, Math.ceil(Math.sqrt(mine.length)));
  const cfg = {
    endpoint,
    camera_id: cam.id,
    key,
    source: "rtsp://utilisateur:motdepasse@ADRESSE_IP_DE_LA_CAMERA:554/stream1",
    stable_seconds: 20,
    interval_seconds: 2,
    tables: mine.map((t, i) => {
      const x = (i % cols) / cols;
      const y = Math.floor(i / cols) / cols;
      const r = (n: number) => Math.round(n * 100) / 100;
      return { nom: `Table ${t.data.number}`, table_id: t.id, zone: [[r(x + 0.02), r(y + 0.02)], [r(x + 1 / cols - 0.02), r(y + 0.02)], [r(x + 1 / cols - 0.02), r(y + 1 / cols - 0.02)], [r(x + 0.02), r(y + 1 / cols - 0.02)]] };
    }),
  };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" }));
  a.download = "config.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Caméras : déclaration, position, clé de la passerelle et mode d'intégration. */
export function CamerasView({ now }: { now: number }) {
  const { v, level, act, mode, projectId } = useV();
  const zones = useTableZones();
  const cams = v.data.vcam as Doc<Cam>[];
  const [edit, setEdit] = useState<Doc<Cam> | "new" | null>(null);
  const [secret, setSecret] = useState<{ token: string; cam: Doc<Cam> } | null>(null);
  const mgr = isMgr(level);
  const status = (c: Cam) => (!c.active ? { text: "Désactivée", tone: "text-slate-500" } : c.last_seen && now - Date.parse(c.last_seen) < CAMERA_ONLINE_MS ? { text: "Connectée", tone: "text-green-700" } : c.last_seen ? { text: `Caméra non connectée (dernier signal ${dt(c.last_seen)})`, tone: "text-amber-700" } : { text: "Caméra non connectée (aucun signal reçu)", tone: "text-slate-600" });
  const endpoint = typeof window !== "undefined" ? `${window.location.origin}/api/apps/${projectId}/venue/vision` : `/api/apps/${projectId}/venue/vision`;
  return (
    <div className="space-y-4">
      <Card title={<span className="flex items-center gap-2"><PlayCircle className="h-4 w-4" aria-hidden />Vidéo : installer et connecter une caméra</span>}>
        <video controls preload="none" playsInline poster="/vision/tutoriel-camera.jpg" className="aspect-video w-full rounded-xl bg-slate-900">
          <source src="/vision/tutoriel-camera.mp4" type="video/mp4" />
        </video>
        <p className="mt-2 text-xs text-slate-500">Durée : 2 min 25. Sous-titrée, sans son.</p>
      </Card>
      <Card title={<span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-green-700" aria-hidden />Confidentialité</span>}>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>Aucune image ni vidéo n&apos;est envoyée à MiniSoft RCA : seulement « table occupée / libre » et un nombre de personnes.</li>
          <li>Aucune reconnaissance ni identification de visage.</li>
          <li>La caméra indique seulement l&apos;occupation : les commandes, le service et les paiements viennent toujours du logiciel et de la cuisine.</li>
        </ul>
      </Card>
      <Card title="Caméras" actions={mgr && <Btn small onClick={() => setEdit("new")}><Plus className="h-3.5 w-3.5" aria-hidden />Ajouter une caméra</Btn>}>
        {cams.length === 0 ? (
          <Empty text="Aucune caméra déclarée. Vous pouvez placer une caméra sur le plan dès maintenant ; elle restera « non connectée » tant qu'une passerelle de détection n'envoie rien." icon={Camera} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {cams.map((c) => {
              const s = status(c.data);
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-2 py-2.5">
                  <Camera className="h-5 w-5 text-slate-500" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{c.data.name} <span className="text-xs font-normal text-slate-500">· {ZONE_LABELS[c.data.zone]} · {c.data.table_ids.length} table(s) surveillée(s)</span></p>
                    <p className={`text-xs ${s.tone}`}>{s.text}{c.data.token_hint ? ` · clé …${c.data.token_hint}` : " · aucune clé"}</p>
                  </div>
                  {mgr && (
                    <div className="flex flex-wrap gap-1.5">
                      <Btn small kind="ghost" onClick={() => setEdit(c)}>Modifier</Btn>
                      <Btn small kind="ghost" onClick={() => downloadConfig(c, v.data.table as Doc<Table>[], endpoint)} title="Fichier config.json de la passerelle (sans la clé)"><Download className="h-3.5 w-3.5" aria-hidden />Configuration</Btn>
                      <Btn small kind="soft" onClick={async () => { const r = await act("vision.camera.token", { id: c.id }, { confirm: c.data.token_hint ? "Générer une nouvelle clé ? L'ancienne cessera de fonctionner." : undefined }); if (r?.secret) setSecret({ token: r.secret, cam: c }); }}><KeyRound className="h-3.5 w-3.5" aria-hidden />{c.data.token_hint ? "Nouvelle clé" : "Générer la clé"}</Btn>
                      <Btn small kind="ghost" onClick={() => act("vision.camera.toggle", { id: c.id, active: !c.data.active }, { confirm: c.data.active ? "Désactiver cette caméra ? Sa clé sera révoquée." : undefined })}><Power className="h-3.5 w-3.5" aria-hidden />{c.data.active ? "Désactiver" : "Réactiver"}</Btn>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card title="Connecter une vraie caméra">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
          <li><b>Caméra</b> : une caméra IP (Wi-Fi ou câble) compatible <b>RTSP</b> ou <b>ONVIF</b>, fixée en hauteur avec une vue dégagée sur les tables, branchée sur le réseau du restaurant.</li>
          <li><b>Passerelle</b> : un ordinateur sur place (PC, mini-PC ou Raspberry Pi 5) allumé pendant le service, avec Python 3. Installez : <code className="rounded bg-slate-100 px-1">pip install opencv-python ultralytics requests</code></li>
          <li>Téléchargez le <a className="font-medium text-blue-700 underline" href="/vision/minisoft_passerelle.py" download>programme de la passerelle</a>.</li>
          <li>Ici : <b>Ajouter une caméra</b>, cochez les tables qu&apos;elle voit, placez-la sur le plan, puis <b>Générer la clé</b> et téléchargez la configuration (avec la clé).</li>
          <li>Dans <code className="rounded bg-slate-100 px-1">config.json</code>, mettez l&apos;adresse RTSP de la caméra. Lancez <code className="rounded bg-slate-100 px-1">python3 minisoft_passerelle.py --apercu</code> et ajustez la zone de chaque table d&apos;après l&apos;image locale (grille de 0 à 1).</li>
          <li>Vérifiez la connexion : <code className="rounded bg-slate-100 px-1">python3 minisoft_passerelle.py --test</code>. La caméra passe « Connectée » ici.</li>
          <li>Démarrez : <code className="rounded bg-slate-100 px-1">python3 minisoft_passerelle.py</code>. Les tables se mettent à jour seules sur le plan.</li>
        </ol>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium text-slate-700">Pour un intégrateur : format d&apos;envoi</summary>
          <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-900 p-3 text-[11px] text-slate-100">{`POST ${endpoint}
Authorization: Bearer <clé de la caméra>
Content-Type: application/json

{ "camera_id": "<identifiant de la caméra>",
  "observations": [
    { "table_id": "<identifiant de la table>", "occupied": true, "people": 3 },
    { "table_id": "<…>", "occupied": false } ] }`}</pre>
        </details>
        <p className="mt-2 text-xs text-slate-500">Seuls les états de table sont acceptés (aucune image). Environ un envoi par seconde au maximum. {mode !== "live" ? "Les caméras ne fonctionnent qu'avec le logiciel publié (données réelles)." : ""}</p>
      </Card>
      {edit && <CameraForm cam={edit === "new" ? null : edit} zones={zones} onClose={() => setEdit(null)} />}
      {secret && (
        <Modal title={`Clé de « ${secret.cam.data.name} »`} onClose={() => setSecret(null)}>
          <p className="text-sm text-slate-700">Copiez cette clé dans la passerelle de détection. <b>Elle ne sera plus affichée</b> : en cas de perte, générez-en une nouvelle.</p>
          <div className="mt-3 flex items-center gap-2"><code className="flex-1 break-all rounded-lg bg-slate-100 p-2 text-xs">{secret.token}</code><Btn small kind="ghost" onClick={() => navigator.clipboard?.writeText(secret.token)}><Copy className="h-3.5 w-3.5" aria-hidden />Copier</Btn></div>
          <p className="mt-3 text-xs text-slate-500">Identifiant de la caméra : <code>{secret.cam.id}</code></p>
          <div className="mt-3"><Btn small onClick={() => downloadConfig(secret.cam, v.data.table as Doc<Table>[], endpoint, secret.token)}><Download className="h-3.5 w-3.5" aria-hidden />Télécharger config.json (avec la clé)</Btn></div>
          <p className="mt-1 text-[11px] text-slate-500">Gardez ce fichier sur l&apos;ordinateur de la passerelle uniquement : il contient la clé.</p>
        </Modal>
      )}
    </div>
  );
}

function CameraForm({ cam, zones, onClose }: { cam: Doc<Cam> | null; zones: TableZone[]; onClose: () => void }) {
  const { v, act } = useV();
  const [f, setF] = useState({ name: cam?.data.name ?? "Caméra salle", zone: cam?.data.zone ?? zones[0]!, table_ids: cam?.data.table_ids ?? [], angle: String(cam?.data.angle ?? 45), fov: String(cam?.data.fov ?? 90), range: String(cam?.data.range ?? 60) });
  const [busy, setBusy] = useState(false);
  const tables = (v.data.table as Doc<Table>[]).filter((t) => t.data.active && t.data.zone === f.zone).sort((a, b) => a.data.number.localeCompare(b.data.number, "fr", { numeric: true }));
  return (
    <Modal title={cam ? "Modifier la caméra" : "Ajouter une caméra"} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await act("vision.camera.save", { id: cam?.id ?? null, name: f.name, zone: f.zone, table_ids: f.table_ids, pos: cam?.data.pos ?? null, angle: Number(f.angle), fov: Number(f.fov), range: Number(f.range) });
          setBusy(false);
          if (r) onClose();
        }}
      >
        <Field label="Nom"><input className={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} required /></Field>
        {zones.length > 1 && <Field label="Zone"><select className={inp} value={f.zone} onChange={(e) => setF({ ...f, zone: e.target.value as TableZone, table_ids: [] })}>{zones.map((z) => <option key={z} value={z}>{ZONE_LABELS[z]}</option>)}</select></Field>}
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-slate-700">Tables visibles par cette caméra</legend>
          {tables.length === 0 ? <p className="text-xs text-slate-500">Aucune table dans cette zone.</p> : (
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setF({ ...f, table_ids: f.table_ids.length === tables.length ? [] : tables.map((t) => t.id) })} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">{f.table_ids.length === tables.length ? "Aucune" : "Toutes"}</button>
              {tables.map((t) => {
                const on = f.table_ids.includes(t.id);
                return <button key={t.id} type="button" aria-pressed={on} onClick={() => setF({ ...f, table_ids: on ? f.table_ids.filter((x) => x !== t.id) : [...f.table_ids, t.id] })} className={`rounded-lg border px-2.5 py-1 text-xs ${on ? "border-[var(--app-primary)] bg-[var(--app-primary)] text-white" : "border-slate-300 text-slate-700"}`}>Table {t.data.number}</button>;
              })}
            </div>
          )}
        </fieldset>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Orientation (°)"><input type="number" min={-360} max={360} className={inp} value={f.angle} onChange={(e) => setF({ ...f, angle: e.target.value })} /></Field>
          <Field label="Angle de vue (°)"><input type="number" min={20} max={180} className={inp} value={f.fov} onChange={(e) => setF({ ...f, fov: e.target.value })} /></Field>
          <Field label="Portée (%)"><input type="number" min={10} max={150} className={inp} value={f.range} onChange={(e) => setF({ ...f, range: e.target.value })} /></Field>
        </div>
        <p className="text-xs text-slate-500">Orientation : 0° vers la droite, 90° vers le bas. Placez ensuite la caméra sur le plan avec « Disposer tables et caméras ». Le champ de vision affiché est indicatif.</p>
        <div className="flex justify-end gap-2"><Btn kind="ghost" onClick={onClose}>Annuler</Btn><Btn type="submit" busy={busy}>Enregistrer</Btn></div>
      </form>
    </Modal>
  );
}
