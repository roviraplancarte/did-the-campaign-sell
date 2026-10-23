// "Did the campaign sell?" demo: draws every chart and number from resultado.json (written by analisis.py).
// The page's <html lang> picks the strings below; resultado.json is resolved next to this script, so the same code
// serves /incrementalidad/ and /es/incrementalidad/.
var BASE = document.currentScript.src.replace(/[^/]*$/, "");
var LANG = (document.documentElement.lang || "en").slice(0, 2) === "es" ? "es" : "en";
var S = {
  en: {
    chart: "Chart", campaign: "Campaign", control: "Control", campaignLower: "campaign", controlLower: "control",
    city: "city", lift: "lift", perDay: "units/day", day: "day", before: "before", actual: "actual", predicted: "predicted",
    hh: "High-High cluster", ns: "not significant", seg: ["High lift", "Mid lift", "Low lift"],
    estado: function (n) { return "Simulated data · " + n + " stores · seed 20260412"; },
    tests: function (mc, mk, w, m) { return "Median lift: <b>" + mc + "</b> campaign vs <b>" + mk + "</b> control · Wilcoxon signed-rank p = <b>" + w + "</b> · Mann-Whitney p = <b>" + m + "</b>"; },
    moran: function (I, p, hh, n) { return "Moran's I = <b>" + I + "</b> (permutation p = <b>" + p + "</b>) · <b>" + hh + "</b> of " + n + " campaign stores in a High-High cluster"; },
    cf: function (e, lo, hi, l) { return "Estimated effect: <b>" + e + "</b> extra units (95% interval " + lo + " to " + hi + "), <b>+" + l + "</b> over the prediction."; },
    truth: function (inc, lp, e, el, inside) {
      return "The simulation added " + inc + " units, a " + lp + " lift. The estimate was " + e + " units (+" + el + "), and the true value is " +
        (inside ? "inside" : "outside") + " its 95% interval. The rank tests confirm the lift is real, and the segments and the cluster map " +
        "point to the same campaign city, the one where the simulation put a large effect (its other strong area fell in a control city, " +
        "so the campaign never ran there). With real data there is no answer key, which is why each step checks the previous one from a different angle.";
    },
    segHead: "<thead><tr><th>Segment</th><th>Stores</th><th>Avg lift</th><th>Share of effect</th></tr></thead><tbody>",
    dailyHead: "<thead><tr><th>Day</th><th>Period</th><th>Actual</th><th>Predicted without campaign</th></tr></thead><tbody>",
    storeHead: "<thead><tr><th>Store</th><th>City</th><th>Group</th><th>Units/day</th><th>Measured lift</th><th>True lift</th><th>Segment</th><th>LISA</th></tr></thead><tbody>",
    noData: "The results couldn't be loaded. Reload the page; if it keeps happening, let me know.",
    lisa: { HH: "High-High", ns: "n.s." },
  },
  es: {
    chart: "Gráfica", campaign: "Campaña", control: "Control", campaignLower: "campaña", controlLower: "control",
    city: "ciudad", lift: "lift", perDay: "unidades/día", day: "día", before: "antes", actual: "real", predicted: "predicho",
    hh: "grupo Alto-Alto", ns: "no significativo", seg: ["Lift alto", "Lift medio", "Lift bajo"],
    estado: function (n) { return "Datos simulados · " + n + " tiendas · semilla 20260412"; },
    tests: function (mc, mk, w, m) { return "Lift mediano: <b>" + mc + "</b> campaña contra <b>" + mk + "</b> control · Wilcoxon de rangos con signo p = <b>" + w + "</b> · Mann-Whitney p = <b>" + m + "</b>"; },
    moran: function (I, p, hh, n) { return "I de Moran = <b>" + I + "</b> (p por permutaciones = <b>" + p + "</b>) · <b>" + hh + "</b> de " + n + " tiendas con campaña en un grupo Alto-Alto"; },
    cf: function (e, lo, hi, l) { return "Efecto estimado: <b>" + e + "</b> unidades extra (intervalo de 95%: " + lo + " a " + hi + "), <b>+" + l + "</b> sobre la predicción."; },
    truth: function (inc, lp, e, el, inside) {
      return "La simulación agregó " + inc + " unidades, un lift de " + lp + ". La estimación fue de " + e + " unidades (+" + el + ") y el valor real queda " +
        (inside ? "dentro" : "fuera") + " de su intervalo de 95%. Las pruebas de rangos confirman que el lift es real, y los segmentos y el mapa de grupos " +
        "apuntan a la misma ciudad con campaña, donde la simulación puso un efecto grande (su otra zona fuerte cayó en una ciudad de control, así que " +
        "ahí nunca hubo campaña). Con datos reales no hay una respuesta correcta contra la cual comparar; por eso cada paso revisa al anterior desde otro ángulo.";
    },
    segHead: "<thead><tr><th>Segmento</th><th>Tiendas</th><th>Lift promedio</th><th>Parte del efecto</th></tr></thead><tbody>",
    dailyHead: "<thead><tr><th>Día</th><th>Periodo</th><th>Real</th><th>Predicho sin campaña</th></tr></thead><tbody>",
    storeHead: "<thead><tr><th>Tienda</th><th>Ciudad</th><th>Grupo</th><th>Unidades/día</th><th>Lift medido</th><th>Lift real</th><th>Segmento</th><th>LISA</th></tr></thead><tbody>",
    noData: "Los resultados no se pudieron cargar. Recarga la página; si el problema sigue, avísame.",
    lisa: { HH: "Alto-Alto", ns: "no sig." },
  },
}[LANG];
var NS = "http://www.w3.org/2000/svg";
var pct = function (v, d) { var t = (v * 100).toFixed(d == null ? 1 : d); return (/^-0(\.0+)?$/.test(t) ? t.slice(1) : t) + "%"; };
var fmt = function (v) { return Math.round(v).toLocaleString(LANG === "es" ? "es-MX" : "en-US"); };
var css = function (v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); };

function el(tag, attrs, parent) {
  var e = document.createElementNS(NS, tag);
  for (var k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function svg(host, w, h) {
  host.innerHTML = "";
  host.style.aspectRatio = w + " / " + h;
  var s = el("svg", { viewBox: "0 0 " + w + " " + h, role: "img", "aria-label": host.getAttribute("data-label") || S.chart }, host);
  var tip = document.createElement("div"); tip.className = "tip"; tip.hidden = true; host.appendChild(tip);
  s.tip = function (html, x, y) {
    if (html == null) { tip.hidden = true; return; }
    var r = s.getBoundingClientRect(), k = r.width / w;
    tip.innerHTML = html; tip.hidden = false; tip.style.left = (x * k) + "px"; tip.style.top = (y * k) + "px";
  };
  return s;
}
function scale(d0, d1, r0, r1) { return function (v) { return r0 + (v - d0) / (d1 - d0) * (r1 - r0); }; }
function dot(s, x, y, r, fill, html, opts) {
  opts = opts || {};
  var c = el("circle", { cx: x, cy: y, r: r, fill: fill, stroke: css("--paper"), "stroke-width": 2 }, s);
  if (opts.hollow) { c.setAttribute("fill", css("--paper")); c.setAttribute("stroke", fill); c.setAttribute("stroke-width", 1.5); }
  var hit = el("circle", { cx: x, cy: y, r: Math.max(r + 5, 9), fill: "transparent" }, s);
  hit.addEventListener("mouseenter", function () { s.tip(html, x, y - r); });
  hit.addEventListener("mouseleave", function () { s.tip(null); });
  hit.addEventListener("click", function () { s.tip(html, x, y - r); });   // tap on touch screens
  return c;
}
function storeTip(t) {
  return (t.campana ? S.campaign : S.control) + " · " + S.city + " " + (t.ciudad + 1) + "<br>" + S.lift + " " + pct(t.lift) +
         " · " + fmt(t.base) + " " + S.perDay;
}

function render(d) {
  var T = d.tiendas, camp = T.filter(function (t) { return t.campana; });
  var cf = d.contrafactual, P = d.parametros;

  // The header and the setup paragraph are in the HTML with their final size, so filling them doesn't move the page.
  document.getElementById("v-est").textContent = "+" + pct(cf.lift_pct);
  document.getElementById("v-true").textContent = "+" + pct(d.verdad.lift_pct);
  document.getElementById("v-moran").textContent = d.moran.I.toFixed(2);
  document.getElementById("estado").textContent = S.estado(P.tiendas);
  document.getElementById("tests").innerHTML = S.tests(pct(d.pruebas.lift_mediano_campana), pct(d.pruebas.lift_mediano_control),
    d.pruebas.wilcoxon_p.toExponential(1), d.pruebas.mannwhitney_p.toExponential(1));
  var hh = camp.filter(function (t) { return t.lisa === "HH"; }).length;
  document.getElementById("moran").innerHTML = S.moran(d.moran.I.toFixed(2), d.moran.p.toFixed(3), hh, camp.length);
  document.getElementById("cf-text").innerHTML = S.cf(fmt(cf.efecto), fmt(cf.intervalo[0]), fmt(cf.intervalo[1]), pct(cf.lift_pct));
  var inside = d.verdad.incremental >= cf.intervalo[0] && d.verdad.incremental <= cf.intervalo[1];
  document.getElementById("truth-text").textContent = S.truth(fmt(d.verdad.incremental), pct(d.verdad.lift_pct), fmt(cf.efecto),
    pct(cf.lift_pct), inside);

  drawMap(document.getElementById("map-setup"), T, function (t) { return t.campana ? css("--c1") : css("--c3"); }, false);
  drawStrip(document.getElementById("strip"), T, d.pruebas);
  drawSegments(document.getElementById("segments"), camp, d.segmentos);
  drawMap(document.getElementById("map-lisa"), camp, function (t) { return t.lisa === "HH" ? css("--c2") : css("--ns"); }, true);
  drawSeries(document.getElementById("series"), cf, P);
  // The 160-row table is built only when opened, so it does not slow the first paint.
  var det = document.getElementById("store-details");
  if (det.open) storeTable(T); else det.addEventListener("toggle", function () { if (det.open && !det.dataset.done) { det.dataset.done = 1; storeTable(T); } });
  var dd = document.getElementById("daily-details");
  dd.addEventListener("toggle", function () { if (dd.open && !dd.dataset.done) { dd.dataset.done = 1; dailyTable(cf, P); } });
}

var SEG = [{ name: S.seg[0], c: "--c2" }, { name: S.seg[1], c: "--c1" }, { name: S.seg[2], c: "--c3" }];

function drawMap(host, stores, color, lisa) {
  // Region bounds from the data (all stores, so both maps share one frame), kept at true aspect ratio.
  var xs = DATA.tiendas.map(function (t) { return t.x; }), ys = DATA.tiendas.map(function (t) { return t.y; });
  var x0 = Math.min.apply(null, xs) - 4, x1 = Math.max.apply(null, xs) + 4;
  var y0 = Math.min.apply(null, ys) - 4, y1 = Math.max.apply(null, ys) + 4;
  var W = 640, m = 10, k = (W - 2 * m) / (x1 - x0), Hm = (y1 - y0) * k, H = Hm + 2 * m + 26, s = svg(host, W, H);
  var x = function (v) { return m + (v - x0) * k; }, y = function (v) { return m + (y1 - v) * k; };
  el("rect", { x: m, y: m, width: W - 2 * m, height: Hm, fill: "none", stroke: css("--rule") }, s);
  stores.slice().sort(function (a, b) { return (a.lisa === "HH") - (b.lisa === "HH"); }).forEach(function (t) {
    var html = storeTip(t) + (lisa ? "<br>" + (t.lisa === "HH" ? S.hh : S.ns) + " (p " + t.p_lisa + ")" : "");
    dot(s, x(t.x), y(t.y), 5, color(t), html, { hollow: lisa && t.lisa !== "HH" });
  });
  var sc = 20 * k, by = m + Hm + 16;
  el("line", { x1: m, x2: m + sc, y1: by, y2: by, stroke: css("--muted"), "stroke-width": 1.5 }, s);
  el("text", { x: m + sc + 8, y: by + 4 }, s).textContent = "20 km";
}

function drawStrip(host, T, tests) {
  var W = 640, H = 210, L = 78, R = 16, s = svg(host, W, H);
  var lo = -0.06, hi = 0.22, x = scale(lo, hi, L, W - R);
  for (var v = -0.05; v <= 0.2001; v += 0.05) {
    el("line", { x1: x(v), x2: x(v), y1: 14, y2: H - 30, stroke: v === 0 ? css("--muted") : css("--grid"), "stroke-width": 1 }, s);
    el("text", { x: x(v), y: H - 12, "text-anchor": "middle" }, s).textContent = pct(v, 0);
  }
  [[S.campaign, true, 62, "--c1", tests.lift_mediano_campana], [S.control, false, 138, "--c3", tests.lift_mediano_control]].forEach(function (row) {
    el("text", { x: 0, y: row[2] + 4, class: "lab" }, s).textContent = row[0];
    var seed = 7;
    T.filter(function (t) { return t.campana === row[1]; }).forEach(function (t) {
      seed = (seed * 9301 + 49297) % 233280;
      dot(s, x(Math.max(lo, Math.min(hi, t.lift))), row[2] + (seed / 233280 - 0.5) * 36, 4, css(row[3]), storeTip(t));
    });
    el("line", { x1: x(row[4]), x2: x(row[4]), y1: row[2] - 26, y2: row[2] + 26, stroke: css("--ink"), "stroke-width": 2 }, s);
  });
}

function drawSegments(host, camp, resumen) {
  document.getElementById("seg-legend").innerHTML = SEG.map(function (g) {
    return "<span><i style='background:var(" + g.c + ")'></i>" + g.name + "</span>"; }).join("");
  var W = 640, H = 340, L = 46, R = 16, Tp = 12, B = 34, s = svg(host, W, H);
  var bases = camp.map(function (t) { return t.base; });
  var lx0 = Math.log10(Math.min.apply(null, bases) * 0.9), lx1 = Math.log10(Math.max.apply(null, bases) * 1.1);
  var x = scale(lx0, lx1, L, W - R), y = scale(-0.04, 0.2, H - B, Tp);
  [-0.0, 0.05, 0.1, 0.15, 0.2].forEach(function (v) {
    el("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: v === 0 ? css("--muted") : css("--grid") }, s);
    el("text", { x: L - 8, y: y(v) + 4, "text-anchor": "end" }, s).textContent = pct(v, 0);
  });
  [500, 1000, 2000, 4000].forEach(function (v) {
    if (Math.log10(v) < lx0 || Math.log10(v) > lx1) return;
    el("text", { x: x(Math.log10(v)), y: H - 12, "text-anchor": "middle" }, s).textContent = fmt(v);
  });
  el("text", { x: W - R, y: H - 12 + 0, "text-anchor": "end" }, s).textContent = "";
  camp.forEach(function (t) {
    var g = SEG[t.segmento];
    dot(s, x(Math.log10(t.base)), y(t.lift), 5, css(g.c), storeTip(t) + "<br>" + g.name);
  });
  document.getElementById("seg-table").innerHTML = S.segHead +
    resumen.map(function (r) {
      var g = SEG[r.segmento];
      return "<tr><td><span class='sw' style='background:var(" + g.c + ")'></span>" + g.name + "</td><td>" + r.tiendas +
             "</td><td>" + pct(r.lift_medio) + "</td><td>" + pct(r.parte_del_efecto, 0) + "</td></tr>";
    }).join("") + "</tbody>";
}

function drawSeries(host, cf, P) {
  var W = 640, H = 300, L = 46, R = 16, Tp = 12, B = 30, s = svg(host, W, H);
  var n = cf.real.length, pre = P.dias_antes;
  var all = cf.real.concat(cf.predicho);
  var lo = Math.floor(Math.min.apply(null, all) * 0.98 / 10000) * 10000, hi = Math.ceil(Math.max.apply(null, all) * 1.02 / 10000) * 10000;
  var x = scale(0, n - 1, L, W - R), y = scale(lo, hi, H - B, Tp);
  el("rect", { x: x(pre - 0.5), y: Tp, width: x(n - 1) - x(pre - 0.5), height: H - B - Tp, fill: css("--grid") }, s);
  for (var v = lo; v <= hi; v += 10000) {
    el("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: css("--grid") }, s);
    el("text", { x: L - 8, y: y(v) + 4, "text-anchor": "end" }, s).textContent = Math.round(v / 1000);
  }
  [0, 28, 56, 84, 111].forEach(function (dday) {
    el("text", { x: x(dday), y: H - 10, "text-anchor": "middle" }, s).textContent = dday === 84 ? S.campaignLower : S.day + " " + (dday + 1);
  });
  var band = [];
  for (var j = pre; j < n; j++) band.push([x(j), y(cf.predicho[j] + cf.banda)]);
  for (j = n - 1; j >= pre; j--) band.push([x(j), y(cf.predicho[j] - cf.banda)]);
  el("polygon", { points: band.map(function (p) { return p.join(","); }).join(" "), fill: css("--quiet"), opacity: 0.8 }, s);
  var path = function (arr) { return arr.map(function (v, k) { return (k ? "L" : "M") + x(k).toFixed(1) + "," + y(v).toFixed(1); }).join(""); };
  el("path", { d: path(cf.predicho), fill: "none", stroke: css("--ink"), "stroke-width": 1.5, "stroke-dasharray": "4 3" }, s);
  el("path", { d: path(cf.real), fill: "none", stroke: css("--c1"), "stroke-width": 2 }, s);
  var cross = el("line", { y1: Tp, y2: H - B, stroke: css("--muted"), "stroke-width": 1, visibility: "hidden" }, s);
  var hit = el("rect", { x: L, y: Tp, width: W - L - R, height: H - B - Tp, fill: "transparent" }, s);
  var onPoint = function (e) {
    var r = s.getBoundingClientRect(), px = (e.clientX - r.left) * W / r.width;
    var k = Math.max(0, Math.min(n - 1, Math.round((px - L) / (W - L - R) * (n - 1))));
    cross.setAttribute("x1", x(k)); cross.setAttribute("x2", x(k)); cross.setAttribute("visibility", "visible");
    s.tip(S.day + " " + (k + 1) + (k >= pre ? " · " + S.campaignLower : "") + "<br>" + S.actual + " " + fmt(cf.real[k]) + "<br>" + S.predicted + " " + fmt(cf.predicho[k]),
          x(k), y(Math.max(cf.real[k], cf.predicho[k])));
  };
  hit.addEventListener("mousemove", onPoint);
  hit.addEventListener("click", onPoint);   // tap on touch screens
  hit.addEventListener("mouseleave", function () { cross.setAttribute("visibility", "hidden"); s.tip(null); });
}

function dailyTable(cf, P) {
  document.getElementById("daily-table").innerHTML = S.dailyHead +
    cf.real.map(function (v, k) {
      return "<tr><td>" + (k + 1) + "</td><td>" + (k >= P.dias_antes ? S.campaignLower : S.before) + "</td><td>" + fmt(v) + "</td><td>" + fmt(cf.predicho[k]) + "</td></tr>";
    }).join("") + "</tbody>";
}

function storeTable(T) {
  document.getElementById("store-table").innerHTML = S.storeHead +
    T.map(function (t, i) {
      return "<tr><td>" + (i + 1) + "</td><td>" + (t.ciudad + 1) + "</td><td>" + (t.campana ? S.campaignLower : S.controlLower) + "</td><td>" +
             fmt(t.base) + "</td><td>" + pct(t.lift) + "</td><td>" + pct(t.efecto_real) + "</td><td>" + (t.campana ? SEG[t.segmento].name : "–") +
             "</td><td>" + (t.lisa ? S.lisa[t.lisa] || t.lisa : "–") + "</td></tr>";
    }).join("") + "</tbody>";
}

var DATA;
fetch(BASE + "resultado.json").then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) { DATA = d; render(d); })
  .catch(function () {
    ["v-est", "v-true", "v-moran"].forEach(function (id) { document.getElementById(id).textContent = "–"; });
    document.querySelectorAll("figure, details, #step-6").forEach(function (e) { e.hidden = true; });   // no empty charts or sections
    document.getElementById("estado").textContent = S.noData; });
if (window.matchMedia) {
  var mq = matchMedia("(prefers-color-scheme: dark)"), redo = function () { if (DATA) render(DATA); };
  mq.addEventListener ? mq.addEventListener("change", redo) : mq.addListener(redo);
}

(function () {
  // The language switch keeps the section the reader is on (#step-3 → #step-3 in the other language)
  var keepHash = function () { document.querySelectorAll(".lang a").forEach(function (a) { a.hash = location.hash; }); };
  keepHash(); addEventListener("hashchange", keepHash);
})();
