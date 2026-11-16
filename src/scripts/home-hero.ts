/**
 * Accueil : anneaux de défense en profondeur (canvas) et aperçu animé du Labo.
 * Des attaques arrivent de l'extérieur et s'arrêtent sur l'un des anneaux, qui s'éclaire ;
 * aucune n'atteint le cœur « Données ». Mouvement réduit : une image fixe.
 */
import { onPageLoad, reducedMotion } from "../lib/page-lifecycle";

const C = { slate: "#4B5563", ringBase: "#D5DFEC", accent: "#1D4E89", mid: "#4F7FBF", soft: "#DCE8F5", red: "#D9412F", paper: "#FAFAFA" };
const TAU = Math.PI * 2;
const RING_K = [1, 0.82, 0.64, 0.46];
const IMPACT_S = 1.3;

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgba = (h: string, a: number) => `rgba(${hex(h).join(",")},${Math.max(0, Math.min(1, a))})`;
const mix = (h1: string, h2: string, k: number) => {
  const a = hex(h1), b = hex(h2), c = Math.max(0, Math.min(1, k));
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * c)).join(",")})`;
};

interface Threat { a: number; d: number; v: number; ring: number; dead?: boolean }
interface Impact { a: number; ring: number; t0: number }
interface Frag { x: number; y: number; vx: number; vy: number; life: number; age: number }

function rings(canvas: HTMLCanvasElement, countEl: HTMLElement | null, signal: AbortSignal) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const ctx: CanvasRenderingContext2D = context;
  const names = (canvas.dataset.layers ?? "").split("|");
  const core = canvas.dataset.core ?? "";
  const nf = new Intl.NumberFormat(canvas.dataset.lang === "en" ? "en-GB" : "fr-FR");
  const reduce = reducedMotion();

  let W = 0, H = 0, t = 0, next = 0.2, count = 1284, shown = -1;
  let threats: Threat[] = [], impacts: Impact[] = [], frags: Frag[] = [];

  const geo = () => {
    const R = Math.min(W, H) * 0.45;
    return { cx: W / 2, cy: H / 2, R, r: RING_K.map((k) => k * R), core: R * 0.27 };
  };
  const circle = (x: number, y: number, r: number) => { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU); };

  function step(dt: number) {
    t += dt;
    const g = geo();
    if ((next -= dt) <= 0) {
      next = 0.5 * (0.7 + Math.random() * 0.6);
      const w = Math.random();
      threats.push({ a: Math.random() * TAU, d: g.R * 1.45, v: g.R * (0.34 + Math.random() * 0.14), ring: w < 0.42 ? 0 : w < 0.72 ? 1 : w < 0.9 ? 2 : 3 });
    }
    for (const p of threats) {
      p.d -= p.v * dt;
      const stop = g.r[p.ring];
      if (p.d > stop) continue;
      p.dead = true;
      count++;
      impacts.push({ a: p.a, ring: p.ring, t0: t });
      for (let k = 0; k < 8; k++) {
        const aa = p.a + (Math.random() - 0.5) * 1.6, sp = 30 + Math.random() * 70;
        frags.push({ x: g.cx + Math.cos(p.a) * stop, y: g.cy + Math.sin(p.a) * stop, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, life: 0.5 + Math.random() * 0.4, age: 0 });
      }
    }
    threats = threats.filter((p) => !p.dead);
    impacts = impacts.filter((f) => t - f.t0 < IMPACT_S);
    for (const f of frags) { f.age += dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.93; f.vy *= 0.93; }
    frags = frags.filter((f) => f.age < f.life);
  }

  function draw() {
    const g = geo();
    ctx.clearRect(0, 0, W, H);
    const pulse = 1 + Math.sin(t * 1.5) * 0.035;

    const glow = ctx.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, g.core * 2.1 * pulse);
    glow.addColorStop(0, rgba(C.mid, 0.28));
    glow.addColorStop(0.5, rgba(C.soft, 0.55));
    glow.addColorStop(1, rgba(C.soft, 0));
    ctx.fillStyle = glow;
    circle(g.cx, g.cy, g.core * 2.1 * pulse);
    ctx.fill();

    g.r.forEach((r, i) => {
      const hit = impacts.reduce((m, f) => (f.ring === i ? Math.max(m, 1 - (t - f.t0) / IMPACT_S) : m), 0);
      ctx.strokeStyle = mix(C.ringBase, C.mid, hit * 0.6);
      ctx.lineWidth = 1;
      circle(g.cx, g.cy, r);
      ctx.stroke();
      ctx.setLineDash([2, 9 + i * 3]);
      ctx.lineDashOffset = t * (10 + i * 5) * (i % 2 ? 1 : -1);
      ctx.strokeStyle = rgba(C.mid, 0.5);
      ctx.lineWidth = 1.6;
      circle(g.cx, g.cy, r);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    ctx.lineCap = "round";
    for (const p of threats) {
      const x = g.cx + Math.cos(p.a) * p.d, y = g.cy + Math.sin(p.a) * p.d;
      const tx = g.cx + Math.cos(p.a) * (p.d + 34), ty = g.cy + Math.sin(p.a) * (p.d + 34);
      const trail = ctx.createLinearGradient(tx, ty, x, y);
      trail.addColorStop(0, rgba(C.red, 0));
      trail.addColorStop(1, rgba(C.red, 0.75));
      ctx.strokeStyle = trail;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = rgba(C.red, 0.16); circle(x, y, 7); ctx.fill();
      ctx.fillStyle = C.red; circle(x, y, 2.6); ctx.fill();
    }
    for (const f of frags) { ctx.fillStyle = rgba(C.red, (1 - f.age / f.life) * 0.7); circle(f.x, f.y, 1.5); ctx.fill(); }

    for (const f of impacts) {
      const k = (t - f.t0) / IMPACT_S, al = (1 - k) * (1 - k), r = g.r[f.ring];
      ctx.strokeStyle = rgba(C.mid, al * 0.18); ctx.lineWidth = 12;
      ctx.beginPath(); ctx.arc(g.cx, g.cy, r, f.a - 0.32, f.a + 0.32); ctx.stroke();
      const span = 0.32 * (0.6 + k * 0.4);
      ctx.strokeStyle = rgba(C.accent, al); ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.arc(g.cx, g.cy, r, f.a - span, f.a + span); ctx.stroke();
      ctx.strokeStyle = rgba(C.accent, al * 0.5); ctx.lineWidth = 1.2;
      circle(g.cx + Math.cos(f.a) * r, g.cy + Math.sin(f.a) * r, 4 + k * 28); ctx.stroke();
    }

    ctx.fillStyle = "#fff"; circle(g.cx, g.cy, g.core * pulse); ctx.fill();
    ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = C.accent;
    ctx.font = `600 ${Math.max(12, g.R * 0.06)}px "Geist Sans", system-ui, sans-serif`;
    ctx.fillText(core, g.cx, g.cy);
    ctx.font = `500 11px "Geist Mono", ui-monospace, monospace`;
    g.r.forEach((r, i) => {
      const label = names[i] ?? "", y = g.cy - r, w = ctx.measureText(label).width + 14;
      ctx.fillStyle = C.paper; ctx.fillRect(g.cx - w / 2, y - 8, w, 16);
      ctx.fillStyle = C.slate; ctx.fillText(label, g.cx, y + 0.5);
    });

    if (countEl && count !== shown) { shown = count; countEl.textContent = nf.format(count); }
  }

  function resize() {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  signal.addEventListener("abort", () => ro.disconnect());

  if (reduce) {
    // Image fixe prise en plein mouvement : quelques attaques en vol, deux impacts visibles.
    for (let s = 0; s < 2.6; s += 1 / 30) step(1 / 30);
    resize();
    document.fonts?.ready.then(() => { if (!signal.aborted) draw(); });
    return;
  }

  let raf = 0, last = 0, visible = true;
  const frame = (now: number) => {
    step(Math.min(0.05, (now - last) / 1000 || 0));
    last = now;
    draw();
    raf = requestAnimationFrame(frame);
  };
  const run = () => {
    cancelAnimationFrame(raf);
    if (!visible || document.hidden || signal.aborted) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; run(); });
  io.observe(canvas);
  document.addEventListener("visibilitychange", run, { signal });
  signal.addEventListener("abort", () => { cancelAnimationFrame(raf); io.disconnect(); });
}

function feed(box: HTMLElement, data: HTMLScriptElement | null, signal: AbortSignal) {
  let rows: string[][] = [];
  try { rows = JSON.parse(data?.textContent ?? "[]"); } catch { return; }
  if (!rows.length) return;
  const reduce = reducedMotion();
  let i = 0;
  const push = (animate: boolean) => {
    const [time, text, badge, kind] = rows[i++ % rows.length];
    const row = document.createElement("div");
    row.className = kind ? `row ${kind}` : "row";
    for (const [cls, txt] of [["t", time], ["", text], ["badge", badge]]) {
      const s = document.createElement("span");
      if (cls) s.className = cls;
      s.textContent = txt;
      row.append(s);
    }
    box.prepend(row);
    if (animate) row.animate([{ opacity: 0, transform: "translateY(-10px)" }, { opacity: 1, transform: "none" }], { duration: 450, easing: "cubic-bezier(.2,.8,.2,1)" });
    while (box.children.length > 4) box.lastElementChild?.remove();
  };
  box.replaceChildren(); // remplace les lignes rendues côté serveur (repli sans JavaScript)
  for (let k = 0; k < 4; k++) push(false);
  if (reduce) return;
  const id = window.setInterval(() => { if (!document.hidden) push(true); }, 1800);
  signal.addEventListener("abort", () => window.clearInterval(id));
}

onPageLoad((signal) => {
  const fig = document.querySelector<HTMLElement>("[data-home-rings]");
  const canvas = fig?.querySelector("canvas");
  if (canvas) rings(canvas, fig!.querySelector<HTMLElement>("[data-home-count]"), signal);
  const box = document.querySelector<HTMLElement>("[data-home-feed]");
  if (box) feed(box, document.querySelector<HTMLScriptElement>("[data-home-feed-data]"), signal);
});
