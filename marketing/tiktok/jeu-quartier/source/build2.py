import json, re
src = open("build.py").read()
H = src.split('html = r"""', 1)[1].split('"""', 1)[0]
CSS = H.split("<style>", 1)[1].split("</style>", 1)[0]
HELPERS = H.split("// ----- décor : ciel, rue, boutiques -----", 1)[1].split("window.render", 1)[0]
# boutique gagnante : enseigne au nom de Childerick
HELPERS = HELPERS.replace("const nm = named && i < 3;", "const nm = named && i === 0;").replace('nm ? "TON NOM ?" : sign', 'nm ? "CHILDERICK" : sign')
TL = json.load(open("timeline2.json"))
CSS += """
.win{position:absolute;right:-14px;top:-22px;background:#16A34A;color:#fff;font-size:30px;font-weight:900;padding:8px 18px;border-radius:999px;transform:rotate(6deg)}
.opt{position:relative}
.soft{position:absolute;left:150px;right:150px;top:330px;background:#fff;border-radius:44px;border:10px solid #0B1B3F;padding:30px;box-shadow:0 40px 90px rgba(0,0,0,.35)}
.soft .top{display:flex;align-items:center;gap:20px;border-bottom:4px solid #E2E8F0;padding-bottom:20px;margin-bottom:22px}
.soft .top b{font-size:46px;font-weight:900;line-height:1.1}.soft .top small{display:block;font-size:28px;color:#64748B;font-weight:700}
.soft .row{display:flex;align-items:center;gap:20px;font-size:44px;font-weight:800;padding:16px 10px}
.soft .row i{font-style:normal;font-family:"Noto Color Emoji";font-size:56px}
.soft .row span{margin-left:auto;color:#16A34A;font-size:40px}
"""
body = r"""
<svg id="sky" width="1080" height="1920"></svg>
<div class="layer" id="Lgrid"><div style="position:absolute;left:60px;right:60px;top:700px;height:860px;border-radius:40px;background:rgba(11,27,63,.97)"></div><div class="counter"><small>ABONNÉS</small><b id="cnt">0</b></div><svg id="grid" width="1080" height="1920" style="position:absolute;inset:0"></svg></div>
<div class="layer" id="Lres"><div class="board"><h3>RÉSULTAT DU VOTE · JOUR 1</h3><h2>Quel commerce ouvre en premier ?</h2>
<div class="opt" id="rA"><i style="background:#DC2626">A</i><em>🍞</em>Boulangerie<span class="win" id="winA">GAGNANT</span></div>
<div class="opt" id="rB" style="opacity:.55"><i style="background:#2563EB">B</i><em>💊</em>Pharmacie</div>
<div class="opt" id="rC" style="opacity:.55"><i style="background:#7C3AED">C</i><em>🔧</em>Garage</div>
<div class="foot">Règle : le commentaire <span>le plus liké</span> gagne</div></div></div>
<div class="layer" id="Lcom"><div class="comment" style="top:1190px"><div class="av" style="background:#64748B;display:grid;place-items:center;color:#fff;font-size:44px">C</div>Childerick : A<span class="h">❤️</span></div></div>
<div class="layer" id="Lsoft"><div class="soft"><div class="top"><img src="minisoft-icone.svg" style="width:110px"><div><b>Boulangerie Childerick</b><small>Mini-logiciel MiniSoft</small></div></div>
<div class="row" id="s1"><i>💰</i>Ventes du jour<span>✓</span></div>
<div class="row" id="s2"><i>🌾</i>Stock de farine<span>✓</span></div>
<div class="row" id="s3"><i>🧾</i>Commandes<span>✓</span></div></div></div>
<div class="layer" id="Lbar"><div class="bar"><small>PROCHAIN PALIER</small><div class="track"><div class="fill" id="fill" style="width:0"></div></div><b><span id="bn">0</span> / 100 abonnés</b><div style="font-size:34px;margin-top:8px;color:#FACC15;font-weight:800">→ vous nommez le quartier</div></div></div>
<div class="layer" id="Lboard"><div class="board"><h3>AVIS AUX HABITANTS · JOUR 2</h3><h2>Quel commerce ouvre ensuite ?</h2>
<div class="opt" id="oA"><i style="background:#DC2626">A</i><em>💊</em>Pharmacie</div>
<div class="opt" id="oB"><i style="background:#2563EB">B</i><em>🔧</em>Garage</div>
<div class="opt" id="oC"><i style="background:#7C3AED">C</i><em>🍽️</em>Restaurant</div>
<div class="foot">Écris <span>A, B ou C</span> en commentaire<br>Le plus liké gagne · demain : <span>jour 3</span></div></div></div>
<svg id="fg" width="1080" height="1920" style="position:absolute;inset:0;pointer-events:none"></svg>
<div class="banner" id="ban"><small id="bs"></small><b id="bb"></b></div>
<div class="cap" id="cap"></div>
<div class="end" id="end">
 <img src="minisoft-icone.svg" class="t" style="width:280px;left:400px;top:480px" id="eL">
 <div class="t" style="top:820px;font-size:86px" id="e1">MiniSoft <span style="color:#2563EB">RCA</span></div>
 <div class="t" style="top:960px;font-size:62px" id="e2"><span style="background:#FACC15;padding:6px 30px 12px;border-radius:999px">Abonne-toi</span></div>
 <div class="t" style="top:1080px;font-size:52px;color:#334155" id="e3">pour ouvrir ta boutique 🏪</div>
 <div class="t" style="top:1240px;font-size:40px;color:#64748B;font-weight:700" id="e4">@minisolt.rca</div>
</div>
"""
render = r"""
window.render = function(t){
  const tA = st("auj"), tRes = st("resultat"), tCh = st("childerick"), tL = st("logiciel"), tP = st("palier"), tV = st("vote"), tE = en("demain") + .5;
  const seg = caption(t);
  const talking = Boolean(seg);
  const PREV = TL.prev;
  // rue en plein jour ; la boulangerie de Childerick s'illumine à partir de « childerick »
  $("sky").innerHTML = scene(t, 1, 6, t >= tCh);
  // compteur 49 -> 73
  const gv = fade($("Lgrid"), tA + .3, tRes, t);
  const n = Math.round(PREV + (ABO - PREV) * ease((t - tA - .6) / 2.4));
  $("cnt").textContent = t < tA + .3 ? PREV : n;
  $("grid").innerHTML = gv > 0 ? grid(Math.max(PREV, n), Math.abs(Math.sin(t*12))) : "";
  // résultat
  fade($("Lres"), tRes, tCh, t);
  $("Lres").style.transform = `translateY(${(1-ease((t-tRes)/.5))*120}px)`;
  const gw = st("gagne");
  $("rA").style.borderColor = t >= gw ? "#16A34A" : "#E2E8F0"; $("rA").style.background = t >= gw ? "#DCFCE718" : "#fff";
  $("rA").style.transform = `scale(${t >= gw ? 1 + .06*back((t-gw)/.4) : 1})`;
  $("winA").style.opacity = t >= gw ? 1 : 0; $("winA").style.transform = `rotate(6deg) scale(${Math.max(0, back((t-gw)/.4))})`;
  fade($("Lcom"), gw + .8, tCh + .3, t);
  $("Lcom").style.transform = `translateY(${(1-ease((t-gw-.8)/.4))*80}px)`;
  // mini-logiciel
  fade($("Lsoft"), tL, tP, t);
  $("Lsoft").style.transform = `scale(${.9 + .1*ease((t-tL)/.5)})`;
  [["s1",1.6],["s2",2.6],["s3",3.6]].forEach(([id, d]) => { $(id).style.opacity = clamp((t - tL - d)/.3); $(id).style.transform = `translateX(${(1-ease((t-tL-d)/.4))*-60}px)`; });
  // palier
  fade($("Lbar"), tP, tV, t);
  $("fill").style.width = (ABO * ease((t - tP - .3)/1.5)) + "%"; $("bn").textContent = Math.round(ABO * ease((t - tP - .3)/1.5));
  // nouveau vote
  fade($("Lboard"), tV, tE, t);
  $("Lboard").style.transform = `translateY(${(1-ease((t-tV)/.5))*120}px)`;
  for (const [k, id, col] of [["a","oA","#DC2626"],["b","oB","#2563EB"],["c","oC","#7C3AED"]]) {
    const on = t >= st(k) && t < en(k) + .3;
    $(id).style.borderColor = on ? col : "#E2E8F0"; $(id).style.transform = `scale(${on ? 1.06 : 1})`; $(id).style.background = on ? col + "18" : "#fff";
  }
  // Awa, présente de « childerick » à la fin
  const showAwa = (t >= tCh && t < tL) || (t >= tV && t < tE) || t < tA;
  $("fg").innerHTML = showAwa ? awa(170, t < tA || (t >= tCh && t < tL) ? 1430 : 1480, t, talking, (t >= tCh && t < tCh + 1.2) || (t >= st("ecris") && t < en("ecris"))) : "";
  banner(t, "HIER", PREV + " BOUTIQUES", 0, tA) || banner(t, "AUJOURD'HUI", "LE QUARTIER GRANDIT", tA, tRes) ||
  banner(t, "BIENVENUE À", "BOULANGERIE CHILDERICK", tCh, tL) || banner(t, "À 100 ABONNÉS", "VOUS NOMMEZ LE QUARTIER", tP, tV) || ($("ban").style.opacity = 0);
  if ((t >= tRes && t < tCh) || (t >= tL && t < tP) || t >= tV) $("ban").style.opacity = 0;
  const ev = clamp((t - tE)/.4); $("end").style.opacity = ev;
  [["eL",0],["e1",.3],["e2",.6],["e3",.9],["e4",1.2]].forEach(([id, d]) => { const p = back((t - tE - d)/.45); $(id).style.opacity = clamp((t - tE - d)/.2); $(id).style.transform = `scale(${Math.max(0,p)})`; });
};
render(0);
"""
head = r"""
const TL = __TL__;
const S = Object.fromEntries(TL.segs.map(s => [s.k, s]));
const ABO = TL.abo, END = TL.end;
const st = k => S[k].t, en = k => S[k].t + S[k].d;
const clamp = (x,a=0,b=1) => Math.max(a, Math.min(b, x));
const ease = x => 1 - Math.pow(1 - clamp(x), 3);
const back = x => { x = clamp(x); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const lerp = (a,b,x) => a + (b - a) * x;
const mix = (c1, c2, x) => { const p = c => [1,3,5].map(i => parseInt(c.slice(i, i+2), 16)); const A = p(c1), B = p(c2); return "rgb(" + A.map((v,i) => Math.round(lerp(v, B[i], clamp(x)))).join(",") + ")"; };
const $ = id => document.getElementById(id);
function fade(el, a, b, t, d=.35){ const v = Math.min(clamp((t-a)/d), clamp((b-t)/d)); el.style.opacity = v; return v; }
"""
html = f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>{body}<script>{head.replace("__TL__", json.dumps(TL, ensure_ascii=False))}{HELPERS}{render}</script></body></html>'
open("jeu-j2.html", "w").write(html)
print("end", TL["end"], "total", round(TL["end"] + 4.2, 1))
