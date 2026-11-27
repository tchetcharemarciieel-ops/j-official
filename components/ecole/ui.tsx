"use client";

export { Badge, Card, Empty, Field, Modal, Pager, SearchBox, Stat, Tabs, paginate, downloadText, toCsv, dateFmt } from "@/components/shop/ui";
export { Pick, DeleteButton, DualBars } from "@/components/bureau/ui";
import type { Doc, EcoleData, Klass, Student, Year } from "@/lib/ecole/model";

export const uid = () => crypto.randomUUID();
export const sortByName = <T extends { data: { name: string } }>(a: T, b: T) => a.data.name.localeCompare(b.data.name, "fr", { numeric: true });
export const currentYear = (d: EcoleData) => (d.year as Doc<Year>[]).find((y) => y.data.current) ?? (d.year as Doc<Year>[])[0] ?? null;
/** Classes de l'année en cours, triées par nom. */
export const yearClasses = (d: EcoleData) => {
  const y = currentYear(d);
  return (d.class as Doc<Klass>[]).filter((k) => !y || k.data.year_id === y.id).sort(sortByName);
};
export const activeStudents = (d: EcoleData, classId?: string) => (d.student as Doc<Student>[]).filter((s) => s.data.status === "inscrit" && (!classId || s.data.class_id === classId));
export const fmtD = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—");
