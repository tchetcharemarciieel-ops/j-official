import type { AppSpec, Widget } from "./spec";
import type { RecordData } from "./records";

export type Row = { id: string; data: RecordData; created_at: string };

export type WidgetResult =
  | { kind: "number"; value: number; unit?: "FCFA" }
  | { kind: "series"; points: { label: string; value: number }[]; unit?: "FCFA" }
  | { kind: "list"; items: { id: string; label: string; detail: string }[] };

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function monthKey(row: Row, dateField?: string): string {
  const raw = dateField ? row.data[dateField] : row.created_at;
  const s = typeof raw === "string" ? raw : row.created_at;
  return s.slice(0, 7);
}

export function computeWidget(spec: AppSpec, widget: Widget, rows: Row[]): WidgetResult {
  const entity = spec.entities.find((e) => e.key === widget.entity);
  const field = entity?.fields.find((f) => f.key === widget.field);
  const unit = field?.type === "money" ? ("FCFA" as const) : undefined;
  const titleField = entity?.fields.find((f) => f.type === "text") ?? entity?.fields[0];

  switch (widget.type) {
    case "count":
      return { kind: "number", value: rows.length };
    case "sum":
      return { kind: "number", value: rows.reduce((a, r) => a + num(r.data[widget.field ?? ""]), 0), unit };
    case "monthly": {
      const map = new Map<string, number>();
      for (const r of rows) {
        const k = monthKey(r, widget.dateField);
        map.set(k, (map.get(k) ?? 0) + (widget.field ? num(r.data[widget.field]) : 1));
      }
      const points = [...map.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12)
        .map(([label, value]) => ({ label, value }));
      return { kind: "series", points, unit: widget.field ? unit : undefined };
    }
    case "breakdown": {
      const map = new Map<string, number>();
      for (const r of rows) {
        const v = r.data[widget.field ?? ""];
        const label = v === null || v === undefined || v === "" ? "Non renseigné" : typeof v === "boolean" ? (v ? "Oui" : "Non") : String(v);
        map.set(label, (map.get(label) ?? 0) + 1);
      }
      return { kind: "series", points: [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value) };
    }
    case "recent":
      return {
        kind: "list",
        items: [...rows]
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 5)
          .map((r) => ({ id: r.id, label: String(r.data[titleField?.key ?? ""] ?? "—"), detail: new Date(r.created_at).toLocaleDateString("fr-FR") })),
      };
    case "low_stock": {
      const threshold = widget.threshold ?? 5;
      const seuilField = entity?.fields.find((f) => f.key === "seuil");
      return {
        kind: "list",
        items: rows
          .filter((r) => {
            const limit = seuilField && r.data[seuilField.key] !== null && r.data[seuilField.key] !== undefined ? num(r.data[seuilField.key]) : threshold;
            return num(r.data[widget.field ?? ""]) <= limit;
          })
          .slice(0, 8)
          .map((r) => ({ id: r.id, label: String(r.data[titleField?.key ?? ""] ?? "—"), detail: `Reste ${num(r.data[widget.field ?? ""])}` })),
      };
    }
  }
}
