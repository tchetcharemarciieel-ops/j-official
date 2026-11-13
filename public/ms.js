/*! MiniSoft RCA · code de suivi du site connecté (≈2 ko).
 * Sans cookie ni stockage sur l'appareil, sans adresse IP conservée. Respecte « Ne pas me pister »
 * (Do Not Track / Global Privacy Control). Option data-consent="required" : rien n'est envoyé avant
 * minisoft('consent').
 * Événements : minisoft('commande'), minisoft('reservation'), minisoft('contact'), minisoft('devis'),
 * minisoft('rendez_vous'), minisoft('demande_reservation'), minisoft('menu'), minisoft('chambres'),
 * minisoft('services'), minisoft('produits') ; ou attribut data-minisoft="commande" sur un bouton,
 * un lien ou un formulaire.
 */
(function () {
  "use strict";
  var s = document.currentScript || document.querySelector("script[data-site][src*='/ms.js']");
  if (!s) return;
  var key = s.getAttribute("data-site");
  var endpoint = new URL("/api/collect", s.src).href;
  var minisoftHost = new URL(s.src).host;
  var dnt = navigator.doNotTrack === "1" || window.doNotTrack === "1" || navigator.globalPrivacyControl === true;
  var needConsent = s.getAttribute("data-consent") === "required";
  var allowed = !dnt && !needConsent;
  var queue = [];
  var tz = "";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
  var EVENTS = ["menu", "chambres", "services", "produits", "commande", "reservation", "demande_reservation", "devis", "rendez_vous", "contact"];

  function send(e, extra) {
    if (dnt) return;
    var body = { k: key, e: e, p: location.pathname, r: document.referrer || "", tz: tz };
    if (extra) for (var x in extra) body[x] = extra[x];
    if (!allowed) { queue.push(body); return; }
    var data = JSON.stringify(body);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(endpoint, new Blob([data], { type: "text/plain" }))) return;
    } catch (err) {}
    try { fetch(endpoint, { method: "POST", body: data, keepalive: true, mode: "no-cors", headers: { "content-type": "text/plain" } }); } catch (err) {}
  }

  // Durée de lecture : temps passé page visible, envoyé quand la personne quitte la page.
  var shown = Date.now(), engaged = 0, sentLeave = false;
  function pause() { if (shown) { engaged += Date.now() - shown; shown = 0; } }
  function leave() {
    pause();
    if (!sentLeave && engaged > 1000) { sentLeave = true; send("leave", { d: Math.round(engaged / 1000) }); }
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") leave(); else { shown = Date.now(); sentLeave = false; engaged = 0; }
  });
  window.addEventListener("pagehide", leave);

  // Pages de consultation reconnues automatiquement d'après leur adresse.
  function viewEvent(path) {
    var p = path.toLowerCase();
    if (/menu|carte|plats/.test(p)) return "menu";
    if (/chambre|room|suite|hebergement/.test(p)) return "chambres";
    if (/service|prestation|reparation|entretien/.test(p)) return "services";
    if (/produit|product|boutique|shop|medicament/.test(p)) return "produits";
    return null;
  }
  var lastPath = null;
  function pageview() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    send("pageview");
    var v = viewEvent(location.pathname);
    if (v) send(v);
  }

  // Clics : contact (téléphone, WhatsApp, e-mail), menu MiniSoft, éléments marqués data-minisoft.
  document.addEventListener("click", function (ev) {
    var el = ev.target && ev.target.closest ? ev.target.closest("a,button,[data-minisoft]") : null;
    if (!el) return;
    var mark = el.getAttribute("data-minisoft");
    if (mark && EVENTS.indexOf(mark) >= 0 && el.tagName !== "FORM") { send(mark); return; }
    var href = el.getAttribute && el.getAttribute("href") || "";
    if (/^(tel:|mailto:|sms:)|wa\.me\/|api\.whatsapp\.com|whatsapp:\/\//i.test(href)) send("contact");
    else if (href.indexOf(minisoftHost) >= 0 && /\/r\//.test(href)) send("menu");
  }, true);
  document.addEventListener("submit", function (ev) {
    var f = ev.target;
    var mark = f && f.getAttribute && f.getAttribute("data-minisoft");
    if (mark && EVENTS.indexOf(mark) >= 0) send(mark);
  }, true);

  // Sites à navigation sans rechargement (React, Vue…).
  var push = history.pushState;
  history.pushState = function () { var r = push.apply(this, arguments); setTimeout(pageview, 0); return r; };
  window.addEventListener("popstate", pageview);

  var api = function (cmd) {
    if (cmd === "consent") { allowed = !dnt; var q = queue; queue = []; for (var i = 0; i < q.length; i++) { var e = q[i].e; delete q[i].e; send(e, q[i]); } return; }
    if (EVENTS.indexOf(cmd) >= 0) send(cmd);
  };
  var pending = window.minisoft && window.minisoft.q ? window.minisoft.q : [];
  window.minisoft = api;
  pageview();
  for (var j = 0; j < pending.length; j++) api.apply(null, pending[j]);
})();
