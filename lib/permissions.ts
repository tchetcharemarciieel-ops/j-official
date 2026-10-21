import type { ActionPerms, AppSpec, Entity, Role } from "./spec";

export type Action = "read" | "create" | "update" | "delete";

const DEFAULTS: Record<Role, ActionPerms> = {
  owner: { read: true, create: true, update: true, delete: true, readonlyFields: [] },
  admin: { read: true, create: true, update: true, delete: true, readonlyFields: [] },
  manager: { read: true, create: true, update: true, delete: true, readonlyFields: [] },
  employee: { read: true, create: true, update: true, delete: false, readonlyFields: [] },
  viewer: { read: true, create: false, update: false, delete: false, readonlyFields: [] },
};

/** Le propriétaire garde toujours tous les droits : on ne peut pas s'enfermer dehors. */
export function permsFor(entity: Entity, role: Role): ActionPerms {
  if (role === "owner") return DEFAULTS.owner;
  return entity.permissions?.[role] ?? DEFAULTS[role];
}

export function can(entity: Entity, role: Role, action: Action): boolean {
  return permsFor(entity, role)[action];
}

export function readonlyFields(entity: Entity, role: Role): string[] {
  return permsFor(entity, role).readonlyFields ?? [];
}

/** Gestion de l'équipe, de la publication et des paramètres. */
export function canManageProject(role: Role): boolean {
  return role === "owner" || role === "admin";
}

export function findEntity(spec: AppSpec, key: string): Entity | undefined {
  return spec.entities.find((e) => e.key === key);
}
