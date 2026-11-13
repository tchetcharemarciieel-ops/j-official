import json
TL = json.load(open("timeline.json"))
html = r"""<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
html,body{width:1080px;height:1920px;overflow:hidden}
body{font-family:Inter,sans-serif;color:#0B1B3F;position:relative;background:#0B1B3F}
#sky{position:absolute;inset:0}
.layer{position:absolute;inset:0;opacity:0}
.banner{position:absolute;left:90px;right:90px;top:150px;background:rgba(11,27,63,.82);border-radius:28px;padding:20px 20px 26px;text-align:center;color:#fff;box-shadow:0 20px 50px rgba(0,0,0,.25)}
.banner small{display:block;font-weight:800;font-size:34px;letter-spacing:3px;opacity:.85}
.banner b{display:block;font-weight:900;font-size:66px;color:#FACC15;letter-spacing:-1px;line-height:1.05}
.cap{position:absolute;left:30px;right:30px;top:1600px;text-align:center;font-weight:900;font-size:92px;color:#fff;letter-spacing:-1px;text-shadow:0 6px 0 #0B1B3F,0 0 30px rgba(0,0,0,.35);-webkit-text-stroke:3px #0B1B3F}
.cap span{color:#FACC15}
.counter{position:absolute;left:50%;top:420px;transform:translateX(-50%);background:#0B1B3F;border:8px solid #2563EB;border-radius:36px;padding:14px 60px 18px;text-align:center;color:#fff}
.counter small{font-weight:800;font-size:30px;letter-spacing:4px;color:#93C5FD}
.counter b{display:block;font-size:170px;font-weight:900;line-height:1;color:#4ADE80;font-variant-numeric:tabular-nums}
.board{position:absolute;left:110px;right:110px;top:330px;background:#fff;border-radius:40px;border:10px solid #0B1B3F;padding:34px 34px 30px;box-shadow:0 40px 90px rgba(0,0,0,.35)}
.board h3{font-size:30px;letter-spacing:3px;color:#DC2626;text-align:center;font-weight:900}
.board h2{font-size:58px;text-align:center;font-weight:900;margin:8px 0 22px;line-height:1.1}
.opt{display:flex;align-items:center;gap:26px;border:6px solid #E2E8F0;border-radius:28px;padding:16px 22px;margin-bottom:18px;font-size:52px;font-weight:900;transition:none}
.opt i{font-style:normal;display:grid;place-items:center;width:96px;height:96px;border-radius:22px;color:#fff;font-size:60px;flex:none}
.opt em{font-style:normal;font-family:"Noto Color Emoji";font-size:64px}
.foot{background:#0B1B3F;color:#fff;border-radius:22px;padding:16px;text-align:center;font-size:30px;font-weight:800;line-height:1.35}
.foot span{color:#FACC15}
.bar{position:absolute;left:120px;right:120px;top:430px;background:#0B1B3F;border-radius:30px;padding:26px 34px;color:#fff;text-align:center}
.bar small{font-size:32px;font-weight:800;letter-spacing:3px;color:#93C5FD}
.track{height:54px;border-radius:999px;background:#1E3A8A;margin:16px 0 12px;overflow:hidden;border:4px solid #3B82F6}
.fill{height:100%;background:linear-gradient(90deg,#22C55E,#4ADE80);border-radius:999px}
.bar b{font-size:44px}
.comment{position:absolute;left:200px;right:200px;background:#fff;border-radius:30px;padding:20px 26px;display:flex;gap:20px;align-items:center;box-shadow:0 20px 50px rgba(0,0,0,.3);font-size:40px;font-weight:800}
.comment .av{width:84px;height:84px;border-radius:50%;flex:none}
.comment .h{margin-left:auto;color:#EF4444;font-size:50px;font-family:"Noto Color Emoji"}
.end{position:absolute;inset:0;background:#F7F9FF;opacity:0;text-align:center}
.end .t{position:absolute;left:0;right:0;font-weight:900}
</style></head><body>
<svg id="sky" width="1080" height="1920"></svg>
<div class="layer" id="Lgrid"><div style="position:absolute;left:60px;right:60px;top:700px;height:860px;border-radius:40px;background:rgba(11,27,63,.97)"></div><div class="counter"><small>ABONNÉS</small><b id="cnt">0</b></div><svg id="grid" width="1080" height="1920" style="position:absolute;inset:0"></svg></div>
<div class="layer" id="Lbar"><div class="bar"><small>PROCHAIN PALIER</small><div class="track"><div class="fill" id="fill" style="width:0"></div></div><b><span id="bn">0</span> / 100 abonnés</b><div style="font-size:34px;margin-top:8px;color:#FACC15;font-weight:800">→ vous nommez le quartier</div></div></div>
<div class="layer" id="Lboard"><div class="board"><h3>AVIS AUX HABITANTS · JOUR 1</h3><h2>Quel commerce ouvre en premier ?</h2>
<div class="opt" id="oA"><i style="background:#DC2626">A</i><em>🍞</em>Boulangerie</div>
<div class="opt" id="oB"><i style="background:#2563EB">B</i><em>💊</em>Pharmacie</div>
<div class="opt" id="oC"><i style="background:#7C3AED">C</i><em>🔧</em>Garage</div>
<div class="foot">Écris <span>A, B ou C</span> en commentaire<br>Le plus liké gagne · demain : <span>jour 2</span></div></div></div>
<div class="layer" id="Lcom"><div class="comment" style="top:1190px"><div class="av" style="background:#F59E0B"></div>A&nbsp;!!<span class="h">❤️</span></div></div>
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
<script>
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

// ----- décor : ciel, rue, boutiques -----
const SHOPS = [["#F59E0B","BOUTIQUE"],["#22C55E","MARCHÉ"],["#3B82F6","COUTURE"],["#EF4444","SALON"],["#8B5CF6","CAFÉ"],["#14B8A6","TÉLÉPHONES"]];
function shop(x, y, w, h, col, sign, lit, day, named){
  const wall = mix("#475569", col, day*0 + (lit ? 1 : .0));
  const win = lit ? "#FDE68A" : mix("#1E293B", "#94A3B8", day);
  let s = `<g transform="translate(${x},${y})">`;
  s += `<rect x="0" y="40" width="${w}" height="${h}" rx="10" fill="${lit ? col : mix('#334155','#CBD5E1',day)}" stroke="#0B1B3F" stroke-width="6"/>`;
  s += `<path d="M-14 46 L${w/2} -10 L${w+14} 46 Z" fill="${lit ? '#B45309' : mix('#1E293B','#94A3B8',day)}" stroke="#0B1B3F" stroke-width="6" stroke-linejoin="round"/>`;
  s += `<rect x="${w*.12}" y="70" width="${w*.76}" height="52" rx="8" fill="#fff" stroke="#0B1B3F" stroke-width="5"/>`;
  s += `<text x="${w/2}" y="107" text-anchor="middle" font-family="Inter" font-weight="900" font-size="${named ? 26 : 24}" fill="${named ? '#DC2626' : '#0B1B3F'}">${lit || named ? sign : ""}</text>`;
  s += `<rect x="${w*.14}" y="150" width="${w*.3}" height="${h*.38}" rx="8" fill="${win}" stroke="#0B1B3F" stroke-width="5"/>`;
  s += `<rect x="${w*.56}" y="150" width="${w*.3}" height="${h-112}" rx="8" fill="${lit ? '#7C2D12' : mix('#0F172A','#64748B',day)}" stroke="#0B1B3F" stroke-width="5"/>`;
  if (lit) s += `<circle cx="${w*.29}" cy="${150+h*.19}" r="${w*.5}" fill="#FDE68A" opacity="${.18*(1-day)}"/>`;
  return s + "</g>";
}
function scene(t, day, litN, named){
  let s = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix('#0B1B3F','#7DD3FC',day)}"/><stop offset="1" stop-color="${mix('#1E3A8A','#E0F2FE',day)}"/></linearGradient></defs>`;
  s += `<rect width="1080" height="1920" fill="url(#g)"/>`;
  // étoiles / soleil
  for (let i = 0; i < 40; i++) s += `<circle cx="${(i*263)%1080}" cy="${(i*137)%700}" r="${2+(i%3)}" fill="#fff" opacity="${(1-day)*(.4+.6*Math.abs(Math.sin(t*2+i)))}"/>`;
  s += `<circle cx="860" cy="${lerp(860, 560, day)}" r="80" fill="${mix('#E2E8F0','#FDE047',day)}" opacity=".95"/>`;
  // collines
  s += `<ellipse cx="200" cy="1040" rx="520" ry="200" fill="${mix('#14532D','#4ADE80',day)}"/><ellipse cx="900" cy="1060" rx="560" ry="220" fill="${mix('#166534','#22C55E',day)}"/>`;
  s += `<rect y="1040" width="1080" height="880" fill="${mix('#334155','#D6D3D1',day)}"/>`;
  s += `<rect y="1520" width="1080" height="400" fill="${mix('#1E293B','#78716C',day)}"/>`;
  for (let i = 0; i < 8; i++) s += `<rect x="${i*150 - ((t*60)%150)*0}" y="1700" width="90" height="16" rx="8" fill="#FDE68A" opacity=".8"/>`;
  // boutiques : 2 rangées
  const W = 300, H = 300;
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
    const i = r*3 + c, [col, sign] = SHOPS[i];
    const nm = named && i < 3;
    s += shop(60 + c*340, 760 + r*390, W - 40, H - 60, col, nm ? "TON NOM ?" : sign, i < litN, day, nm);
  }
  return s;
}
// ----- Awa (personnage) -----
function awa(x, y, t, talk, wave){
  const bob = Math.sin(t*3)*6, m = talk ? (Math.abs(Math.sin(t*17)) > .45 ? 22 : 6) : 5;
  const arm = wave ? -40 + Math.sin(t*8)*18 : 10;
  return `<g transform="translate(${x},${y + bob})">
   <ellipse cx="0" cy="430" rx="120" ry="22" fill="#000" opacity=".2"/>
   <rect x="-70" y="340" width="40" height="90" rx="16" fill="#3B2314"/><rect x="30" y="340" width="40" height="90" rx="16" fill="#3B2314"/>
   <path d="M-110 360 Q-100 170 0 160 Q100 170 110 360 Z" fill="#2563EB" stroke="#0B1B3F" stroke-width="7"/>
   <path d="M-60 360 L-40 200 L40 200 L60 360 Z" fill="#FACC15" stroke="#0B1B3F" stroke-width="6"/>
   <g transform="rotate(${arm} 95 190)"><rect x="80" y="180" width="34" height="140" rx="17" fill="#7C4A2D" stroke="#0B1B3F" stroke-width="6"/></g>
   <rect x="-114" y="180" width="34" height="130" rx="17" fill="#7C4A2D" stroke="#0B1B3F" stroke-width="6"/>
   <circle cx="0" cy="90" r="78" fill="#7C4A2D" stroke="#0B1B3F" stroke-width="7"/>
   <path d="M-86 70 Q-80 -40 0 -36 Q80 -40 86 70 Q60 20 0 22 Q-60 20 -86 70 Z" fill="#16A34A" stroke="#0B1B3F" stroke-width="7"/>
   <path d="M40 -20 Q110 -60 90 20" fill="#FACC15" stroke="#0B1B3F" stroke-width="6"/>
   <circle cx="-28" cy="90" r="9" fill="#0B1B3F"/><circle cx="28" cy="90" r="9" fill="#0B1B3F"/>
   <circle cx="-48" cy="116" r="11" fill="#F87171" opacity=".5"/><circle cx="48" cy="116" r="11" fill="#F87171" opacity=".5"/>
   <ellipse cx="0" cy="${126 + m/4}" rx="22" ry="${m/2 + 3}" fill="#7F1D1D" stroke="#0B1B3F" stroke-width="4"/>
  </g>`;
}
// ----- grille 1 abonné = 1 boutique -----
function grid(n, pulse){
  let s = "";
  for (let i = 0; i < 100; i++) {
    const r = Math.floor(i/10), c = i%10, x = 105 + c*90, y = 760 + r*78, on = i < n;
    const sc = on && i === n-1 ? 1 + .25*pulse : 1;
    s += `<g transform="translate(${x+35},${y+30}) scale(${sc}) translate(${-35},${-30})"><path d="M0 26 L35 0 L70 26 Z" fill="${on ? '#DC2626' : '#334155'}"/><rect x="8" y="24" width="54" height="40" rx="4" fill="${on ? '#FDE68A' : '#1E293B'}" stroke="${on ? '#B45309' : '#475569'}" stroke-width="3"/></g>`;
  }
  return s;
}
function caption(t){
  const seg = TL.segs.find(s => t >= s.t - .1 && t < s.t + s.d + .25);
  const el = $("cap");
  if (!seg) { el.style.opacity = 0; return null; }
  const p = clamp((t - seg.t + .1) / .25);
  el.style.opacity = 1; el.style.transform = `scale(${back(p)})`;
  el.innerHTML = `<span>${seg.hl}</span>`; el.style.fontSize = (seg.hl.length > 14 ? 70 : 92) + 'px';
  return seg;
}
function banner(t, small, big, a, b){
  const el = $("ban");
  if (t < a || t >= b) return false;
  const p = ease((t - a)/.4), q = clamp((b - t)/.3);
  el.style.opacity = Math.min(p, q); el.style.transform = `translateY(${(1-p)*-60}px)`;
  $("bs").textContent = small; $("bb").textContent = big;
  return true;
}
window.render = function(t){
  const tA = st("auj"), tR = st("regle"), tW = st("awa"), tN = st("nom"), tP = st("palier"), tV = st("vote"), tE = en("demain") + .5;
  const day = clamp((t - tA) / 1.6);
  const seg = caption(t);
  const talking = Boolean(seg);
  // ciel et rue (scène principale) jusqu'au vote
  const inStreet = t < tV;
  const lit = t < tA ? 0 : t < tW ? 0 : 6;
  $("sky").innerHTML = scene(t, t < tA ? 0 : day, t >= tW ? Math.min(6, Math.floor((t - tW)*4) + 1) : 0, t >= tN && t < tP);
  // grille + compteur pendant « aujourd'hui » et « la règle »
  const gv = fade($("Lgrid"), tA + .3, tW, t);
  const n = Math.round(ABO * ease((t - tA - .5) / 2.2));
  $("cnt").textContent = Math.max(0, n);
  $("grid").innerHTML = gv > 0 ? grid(Math.max(0, n), Math.abs(Math.sin(t*12))) : "";
  // palier
  fade($("Lbar"), tP, tV, t);
  $("fill").style.width = (ABO * ease((t - tP - .3)/1.5)) + "%"; $("bn").textContent = Math.round(ABO * ease((t - tP - .3)/1.5));
  // tableau du vote
  const bv = fade($("Lboard"), tV, tE, t);
  $("Lboard").style.transform = `translateY(${(1-ease((t-tV)/.5))*120}px)`;
  for (const [k, id, col] of [["a","oA","#DC2626"],["b","oB","#2563EB"],["c","oC","#7C3AED"]]) {
    const on = t >= st(k) && t < en(k) + .3;
    $(id).style.borderColor = on ? col : "#E2E8F0"; $(id).style.transform = `scale(${on ? 1.06 : 1})`; $(id).style.background = on ? col + "18" : "#fff";
  }
  fade($("Lcom"), st("ecris") + .4, st("logiciel"), t);
  $("Lcom").style.transform = `translateY(${(1-ease((t-st("ecris")-.4)/.4))*80}px)`;
  // personnage
  let fg = "";
  if (t >= tW && t < tA + 99) {
    const p = ease((t - tW)/.6);
    const x = t < tV ? lerp(-200, 170, p) : 170;
    if (!(t >= tA && t < tW)) fg = awa(x, t < tV ? 1430 : 1480, t, talking, t < tW + 1.2 || (t >= st("ecris") && t < en("ecris")));
  }
  $("fg").innerHTML = t >= tW && t < tE ? fg : "";
  // bannières
  banner(t, "HIER", "0 BOUTIQUE", 0, tA) || banner(t, "AUJOURD'HUI", "LE QUARTIER S'ALLUME", tA, tR) || banner(t, "LA RÈGLE", "1 ABONNÉ = 1 BOUTIQUE", tR, tW) ||
  banner(t, "BIENVENUE", "QUARTIER MINISOFT", tW, tN) || banner(t, "VOS BOUTIQUES", "À VOTRE NOM", tN, tP) || banner(t, "À 100 ABONNÉS", "VOUS NOMMEZ LE QUARTIER", tP, tV) || ($("ban").style.opacity = 0);
  if (t >= tV) $("ban").style.opacity = 0;
  // fin
  const ev = clamp((t - tE)/.4); $("end").style.opacity = ev;
  [["eL",0],["e1",.3],["e2",.6],["e3",.9],["e4",1.2]].forEach(([id, d]) => { const p = back((t - tE - d)/.45); $(id).style.opacity = clamp((t - tE - d)/.2); $(id).style.transform = `scale(${Math.max(0,p)})`; });
};
render(0);
</script></body></html>"""
open("jeu-j1.html", "w").write(html.replace("__TL__", json.dumps(TL, ensure_ascii=False)))
print("end", TL["end"], "total", TL["end"] + 4.2)
