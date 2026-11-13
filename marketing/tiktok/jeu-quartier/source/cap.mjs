import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const [name, ...ts] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto("file://" + process.cwd() + "/" + name + ".html"); await p.waitForTimeout(800);
for (const t of ts) { await p.evaluate((t) => window.render(t), Number(t)); await p.screenshot({ path: `k-${t}.jpg`, type: "jpeg", quality: 55 }); }
console.log(errs.length ? errs : "ok"); await b.close();
