#!/usr/bin/env node
/**
 * Construit la version statique du site (accueil, démo, modèles) pour un hébergeur
 * sans serveur comme Neocities. Usage : node scripts/build-static.mjs [dossier-de-sortie]
 *
 * Le projet est copié dans un dossier temporaire, les pages qui exigent un serveur
 * (comptes, API, logiciels publiés) en sont retirées, puis `next build` exporte des fichiers HTML.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const outDir = resolve(process.argv[2] ?? join(root, "out-static"));
// Dossier de travail dans le projet : Turbopack doit voir node_modules sous sa racine.
mkdirSync(join(root, ".static-build"), { recursive: true });
const work = mkdtempSync(join(root, ".static-build", "build-"));

const SKIP = new Set(["node_modules", ".next", ".git", "out-static", "out", ".static-build"]);
for (const name of readdirSync(root)) if (!SKIP.has(name)) cpSync(join(root, name), join(work, name), { recursive: true });
symlinkSync(join(root, "node_modules"), join(work, "node_modules"), "dir");

// Pages et routes qui nécessitent un serveur
const SERVER_ONLY = ["app/api", "app/auth", "app/admin", "app/espace", "app/projets", "app/apps", "app/creer", "app/invitation", "app/connexion", "app/inscription", "app/mot-de-passe-oublie", "app/reinitialiser", "app/configuration", "app/compte-suspendu", "proxy.ts"];
for (const p of SERVER_ONLY) rmSync(join(work, p), { recursive: true, force: true });

// Pages restantes : rendu statique
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(name)) {
      const src = readFileSync(p, "utf8");
      if (src.includes('"force-dynamic"')) writeFileSync(p, src.replaceAll('"force-dynamic"', '"force-static"'));
    }
  }
}
walk(join(work, "app"));

writeFileSync(
  join(work, "next.config.ts"),
  `import type { NextConfig } from "next";
const config: NextConfig = { output: "export", trailingSlash: true, images: { unoptimized: true }, turbopack: { root: ${JSON.stringify(root)} } };
export default config;
`,
);

// Neocities n'accepte pas l'extension .webmanifest
const manifest = JSON.parse(readFileSync(join(work, "public/manifest.webmanifest"), "utf8"));
manifest.start_url = "/";
writeFileSync(join(work, "public/manifest.json"), JSON.stringify(manifest, null, 2));
rmSync(join(work, "public/manifest.webmanifest"));
const layout = join(work, "app/layout.tsx");
writeFileSync(layout, readFileSync(layout, "utf8").replace('"/manifest.webmanifest"', '"/manifest.json"'));

const env = { ...process.env, NEXT_PUBLIC_STATIC_SITE: "1", NEXT_TELEMETRY_DISABLED: "1" };
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY"]) delete env[k];
execSync("npx next build", { cwd: work, env, stdio: "inherit" });

rmSync(outDir, { recursive: true, force: true });
renameSync(join(work, "out"), outDir);
rmSync(join(root, ".static-build"), { recursive: true, force: true });
if (!existsSync(join(outDir, "index.html"))) throw new Error("Export incomplet : index.html manquant");
console.log(`\nSite statique prêt : ${outDir}`);
