import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { dirname } from "node:path";
import type { StatsDb } from "./db.js";
import { formatLocalDate } from "./collector.js";
import { getDashboardPayload, getDefaultWeeklyFilters, getReportData } from "./reports.js";
import type { DashboardPayload, UsageFilters } from "./types.js";

export interface DashboardServer {
  url: string;
  server: Server;
}

export interface StartDashboardServerOptions {
  db: StatsDb;
  port?: number;
  host?: string;
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// The page is fully client-rendered from the embedded all-time payload: filter
// changes never touch the network, so a dead or restarted server cannot break them.
export function buildStaticReportHtml(payload: DashboardPayload): string {
  const json = JSON.stringify(payload).replaceAll("<", "\\u003c");
  const generated = payload.generatedAt.slice(0, 16).replace("T", " ");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pi Stats</title>
<style>
:root{color-scheme:dark;
  --page:#0d0d0d;--surface:#1a1a19;--raised:#232322;
  --ink:#ffffff;--ink-2:#c3c2b7;--muted:#898781;
  --grid:#2c2c2a;--baseline:#383835;--border:rgba(255,255,255,.1);
  --accent:#3987e5;--accent-hot:#5598e7;--accent-track:rgba(57,135,229,.18)}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
.shell{max-width:1080px;margin:0 auto;padding:36px 24px 64px}
.topbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:26px}
.brand{display:flex;align-items:center;font-size:14px;color:var(--ink-2)}
.brand .pi-mark{width:20px;height:20px;color:var(--ink);flex:none}
.brand .slash{color:var(--muted);margin:0 8px}
.top-actions{display:flex;gap:10px;align-items:center;color:var(--muted);font-size:12px}
.ghost{background:none;border:1px solid var(--border);color:var(--ink-2);border-radius:8px;padding:6px 12px;font:inherit;font-size:12px;cursor:pointer}
.ghost:hover{background:rgba(255,255,255,.06)}
h1{font-size:22px;font-weight:650;letter-spacing:-.02em;margin:0 0 4px}
#range-note{color:var(--muted);margin:0 0 20px;font-size:13px}
.filters{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:0 0 20px;border:0;padding:0}
.field{display:flex;flex-direction:column;gap:6px;font-size:11px;color:var(--muted)}
.field select{height:36px;min-width:158px;background:var(--surface);border:1px solid var(--border);border-radius:9px;color:var(--ink);padding:0 12px;font:inherit;font-size:13px}
.field select:hover{border-color:rgba(255,255,255,.2)}
.field select:focus-visible,.ghost:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.range-picker{position:relative}
.range-btn{display:flex;align-items:center;justify-content:space-between;gap:10px;height:36px;min-width:190px;padding:0 12px;background:var(--surface);border:1px solid var(--border);border-radius:9px;color:var(--ink);font:inherit;font-size:13px;cursor:pointer}
.range-btn:hover{border-color:rgba(255,255,255,.2)}
.range-btn svg{color:var(--muted);flex:none}
.range-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.popover{position:absolute;top:calc(100% + 6px);left:0;z-index:20;width:274px;background:var(--raised);border:1px solid var(--border);border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,.5);padding:8px}
.preset-row{display:flex;align-items:center;justify-content:space-between;width:100%;padding:8px 10px;border:0;background:none;color:var(--ink-2);font:inherit;font-size:13px;border-radius:8px;cursor:pointer;text-align:left}
.preset-row:hover{background:rgba(255,255,255,.06)}
.preset-row.active{color:var(--ink)}
.preset-row svg{visibility:hidden}
.preset-row.active svg{visibility:visible}
.preset-row:focus-visible,.cal-nav:focus-visible,.cal-day:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.pop-divider{height:1px;background:var(--grid);margin:8px 4px}
.cal-head{display:flex;align-items:center;justify-content:space-between;padding:4px 4px 6px}
.cal-title{font-size:13px;font-weight:600}
.cal-nav{width:28px;height:28px;border:0;background:none;color:var(--muted);border-radius:7px;font:inherit;font-size:15px;cursor:pointer}
.cal-nav:hover{background:rgba(255,255,255,.06);color:var(--ink)}
.cal-grid{display:grid;grid-template-columns:repeat(7,34px);gap:2px 0;justify-content:center}
.cal-dow{display:flex;align-items:center;justify-content:center;height:26px;font-size:11px;color:var(--muted)}
.cal-day{display:flex;align-items:center;justify-content:center;height:32px;border:0;background:none;color:var(--ink-2);font:inherit;font-size:13px;border-radius:8px;cursor:pointer;font-variant-numeric:tabular-nums}
.cal-day:hover:not(:disabled){background:rgba(255,255,255,.08)}
.cal-day:disabled{color:rgba(255,255,255,.22);cursor:default}
.cal-day.mid{background:var(--accent-track);border-radius:0;color:var(--ink)}
.cal-day.edge{background:var(--accent);color:#fff;font-weight:600}
.cal-day.today:not(.edge){box-shadow:inset 0 0 0 1px var(--baseline)}
.cal-hint{padding:8px 4px 2px;font-size:11px;color:var(--muted);text-align:center}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:14px}
.tile{background:var(--surface);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:14px 16px;min-width:0}
.tile .label{font-size:12px;color:var(--muted)}
.tile .value{font-size:24px;font-weight:600;letter-spacing:-.01em;margin-top:6px}
.tile .sub{font-size:12px;color:var(--muted);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card{background:var(--surface);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:18px 20px;margin-bottom:14px;min-width:0}
.card-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:10px}
.card-head h2{font-size:14px;font-weight:600;margin:0}
.card-head span{font-size:12px;color:var(--muted)}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
#chart{min-height:120px}
#chart svg{display:block;max-width:100%}
#chart text.tick{fill:var(--muted);font-size:11px;font-family:inherit;font-variant-numeric:tabular-nums}
#chart line.grid{stroke:var(--grid);stroke-width:1}
#chart line.baseline{stroke:var(--baseline);stroke-width:1}
#chart path.bar{fill:var(--accent)}
#chart path.bar.hot{fill:var(--accent-hot)}
#chart rect.hit{outline:none}
#chart rect.hit:focus-visible{stroke:var(--accent);stroke-width:2;fill:rgba(57,135,229,.08)}
table.breakdown{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed}
.breakdown th{font-size:11px;font-weight:500;color:var(--muted);text-align:left;padding:6px 8px;border-bottom:1px solid var(--grid)}
.breakdown td{padding:10px 8px;border-bottom:1px solid var(--grid);vertical-align:top}
.breakdown tbody tr:last-child td{border-bottom:0}
.breakdown th:first-child{width:34%}
.breakdown th.num,.breakdown td.num{text-align:right;font-variant-numeric:tabular-nums}
.breakdown .name{font-weight:600;overflow-wrap:anywhere}
.breakdown .sub{font-size:12px;color:var(--muted);margin-top:2px}
.meter{height:3px;border-radius:999px;background:var(--accent-track);margin-top:8px;max-width:170px}
.meter-fill{display:block;height:100%;border-radius:999px;background:var(--accent)}
.tooltip{position:fixed;z-index:10;background:var(--raised);border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:12px;pointer-events:none;box-shadow:0 8px 24px rgba(0,0,0,.4);min-width:132px}
.tip-title{color:var(--muted);margin-bottom:5px}
.tip-row{display:flex;justify-content:space-between;gap:16px}
.tip-row .tip-value{color:var(--ink);font-variant-numeric:tabular-nums}
.tip-row.strong .tip-value{font-weight:600}
.tip-label{color:var(--muted)}
.empty{border:1px dashed var(--grid);border-radius:10px;padding:22px;text-align:center;color:var(--muted);font-size:13px}
@media(max-width:820px){.grid-2{grid-template-columns:1fr}.field select,.range-btn{width:100%;min-width:0}.field{flex:1 1 40%}}
@media(max-width:560px){.shell{padding:24px 14px 48px}.tiles{grid-template-columns:1fr 1fr}}
</style>
</head>
<body>
<main class="shell">
  <header class="topbar">
    <div class="brand"><svg class="pi-mark" viewBox="165 165 470 470" role="img" aria-label="Pi"><path fill="currentColor" fill-rule="evenodd" d="M165.29 165.29H517.36V400H400V517.36H282.65V634.72H165.29ZM282.65 282.65V400H400V282.65Z"/><path fill="currentColor" d="M517.36 400H634.72V634.72H517.36Z"/></svg><span class="slash">/</span><span>stats</span></div>
    <div class="top-actions"><span>snapshot ${escapeHtml(generated)}</span><button type="button" class="ghost" id="refresh">Refresh</button></div>
  </header>

  <h1>Token usage</h1>
  <p id="range-note">Loading…</p>

  <form class="filters" id="filters" aria-label="Report filters">
    <div class="field"><span>Date range</span>
      <div class="range-picker" id="range-picker">
        <button type="button" class="range-btn" id="range-btn" aria-haspopup="dialog" aria-expanded="false">
          <span id="range-btn-label"></span>
          <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
        <div class="popover" id="range-pop" role="dialog" aria-label="Select date range" hidden>
          <div id="preset-list"></div>
          <div class="pop-divider"></div>
          <div id="cal"></div>
        </div>
      </div>
    </div>
    <label class="field">Provider<select name="provider"></select></label>
    <label class="field">Model<select name="model"></select></label>
  </form>

  <section class="tiles" id="tiles" aria-label="Summary"></section>

  <section class="card">
    <div class="card-head"><h2>Daily tokens</h2><span id="chart-total"></span></div>
    <div id="chart"></div>
  </section>

  <div class="grid-2">
    <section class="card"><div class="card-head"><h2>Providers</h2><span id="providers-count"></span></div><div id="providers"></div></section>
    <section class="card"><div class="card-head"><h2>Models</h2><span id="models-count"></span></div><div id="models"></div></section>
  </div>
</main>
<div id="tooltip" class="tooltip" hidden></div>
<script type="application/json" id="pi-stats-data">${json}</script>
<script>
(() => {
  'use strict';
  const cells = JSON.parse(document.getElementById('pi-stats-data').textContent).cells;
  const qs = (s) => document.querySelector(s);

  const pad2 = (n) => String(n).padStart(2, '0');
  const fmtDate = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
  const plain = new Intl.NumberFormat('en');
  const fmtTokens = (v) => compact.format(v);
  const fmtCost = (v) => (v === null ? '—' : '$' + v.toFixed(v >= 1 ? 2 : 4));
  const shortDay = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' });

  function presetDates(preset) {
    const to = new Date(); to.setHours(0, 0, 0, 0);
    const from = new Date(to);
    if (preset === 'today') return [fmtDate(to), fmtDate(to)];
    if (preset === '30d') { from.setDate(to.getDate() - 29); return [fmtDate(from), fmtDate(to)]; }
    from.setDate(to.getDate() - 6);
    return [fmtDate(from), fmtDate(to)];
  }

  function daysBetween(from, to) {
    const days = [];
    const cursor = new Date(from + 'T00:00:00');
    const end = new Date(to + 'T00:00:00');
    while (cursor <= end && days.length < 1000) { days.push(fmtDate(cursor)); cursor.setDate(cursor.getDate() + 1); }
    return days;
  }

  // ---- state (deep links via ?range=&from=&to=&provider=&model=)
  const urlParams = new URLSearchParams(location.search);
  const state = { preset: '7d', from: '', to: '', provider: '', model: '' };
  const requested = urlParams.get('range');
  if (['today', '7d', '30d', 'custom'].includes(requested)) state.preset = requested;
  const seed = presetDates(state.preset === 'custom' ? '7d' : state.preset);
  state.from = seed[0]; state.to = seed[1];
  if (state.preset === 'custom') {
    state.from = urlParams.get('from') || state.from;
    state.to = urlParams.get('to') || state.to;
  }
  state.provider = urlParams.get('provider') || '';
  state.model = urlParams.get('model') || '';

  // ---- dom helpers; provider/model names are untrusted, so always textContent
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const key in attrs) node.setAttribute(key, attrs[key]);
    return node;
  }

  // ---- filter form (rendered once, never re-rendered: selections cannot reset)
  const form = qs('#filters');
  function fillSelect(select, values, current, allLabel) {
    const all = el('option', null, allLabel);
    all.value = '';
    select.append(all);
    for (const value of values) {
      const opt = el('option', null, value);
      opt.value = value;
      if (value === current) opt.selected = true;
      select.append(opt);
    }
  }
  const modelsForProvider = (provider) => provider
    ? [...new Set(cells.filter((c) => c.provider === provider).map((c) => c.model))].sort()
    : [...new Set(cells.map((c) => c.model))].sort();
  const fillModel = (selected) => {
    const sel = form.elements.model;
    sel.textContent = '';
    fillSelect(sel, modelsForProvider(state.provider), selected, 'All models');
  };

  fillSelect(form.elements.provider, [...new Set(cells.map((c) => c.provider))].sort(), state.provider, 'All providers');
  fillModel(state.model);

  form.elements.provider.addEventListener('change', () => {
    state.provider = form.elements.provider.value;
    state.model = '';
    fillModel('');
    render();
  });
  form.elements.model.addEventListener('change', () => {
    state.model = form.elements.model.value;
    render();
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); render(); });
  qs('#refresh').addEventListener('click', () => location.reload());

  // ---- date-range picker: one button, preset rows + two-click calendar
  const PRESETS = [
    { key: 'today', label: 'Today' },
    { key: '7d', label: 'Last 7 days' },
    { key: '30d', label: 'Last 30 days' },
  ];
  const rangeBtn = qs('#range-btn');
  const pop = qs('#range-pop');
  let calMonth = null;
  let pending = null;

  function rangeLabel() {
    const preset = PRESETS.find((p) => p.key === state.preset);
    if (preset) return preset.label;
    return shortDay(state.from) + ' – ' + shortDay(state.to) + ', ' + state.to.slice(0, 4);
  }
  function syncLabel() {
    qs('#range-btn-label').textContent = rangeLabel();
    for (const row of document.querySelectorAll('.preset-row')) {
      row.classList.toggle('active', row.dataset.preset === state.preset);
    }
  }
  function applyRange(preset, from, to) {
    state.preset = preset; state.from = from; state.to = to;
    pending = null;
    syncLabel(); render(); closePop();
  }

  const presetList = qs('#preset-list');
  for (const p of PRESETS) {
    const row = el('button', 'preset-row');
    row.type = 'button';
    row.dataset.preset = p.key;
    row.append(el('span', null, p.label));
    const check = svgEl('svg', { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': 'true' });
    check.append(svgEl('path', { d: 'M3 8.5 6.5 12 13 4.5', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    row.append(check);
    row.addEventListener('click', () => {
      const range = presetDates(p.key);
      applyRange(p.key, range[0], range[1]);
    });
    presetList.append(row);
  }

  function renderCal() {
    const host = qs('#cal');
    host.textContent = '';
    const head = el('div', 'cal-head');
    const prev = el('button', 'cal-nav', '‹'); prev.type = 'button';
    prev.setAttribute('aria-label', 'Previous month');
    const next = el('button', 'cal-nav', '›'); next.type = 'button';
    next.setAttribute('aria-label', 'Next month');
    prev.addEventListener('click', () => { calMonth.setMonth(calMonth.getMonth() - 1); renderCal(); });
    next.addEventListener('click', () => { calMonth.setMonth(calMonth.getMonth() + 1); renderCal(); });
    head.append(prev, el('div', 'cal-title', calMonth.toLocaleDateString('en', { month: 'long', year: 'numeric' })), next);
    host.append(head);

    const grid = el('div', 'cal-grid');
    for (const dow of ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']) grid.append(el('span', 'cal-dow', dow));
    for (let i = 0; i < calMonth.getDay(); i++) grid.append(el('span'));
    const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
    const todayIso = fmtDate(new Date());
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = fmtDate(new Date(calMonth.getFullYear(), calMonth.getMonth(), day));
      const cell = el('button', 'cal-day', String(day));
      cell.type = 'button';
      cell.dataset.date = iso;
      if (iso > todayIso) cell.disabled = true;
      if (pending) {
        if (iso === pending) cell.classList.add('edge');
      } else {
        if (iso === state.from || iso === state.to) cell.classList.add('edge');
        if (iso > state.from && iso < state.to) cell.classList.add('mid');
      }
      if (iso === todayIso) cell.classList.add('today');
      cell.addEventListener('click', () => {
        if (!pending) { pending = iso; renderCal(); return; }
        const from = pending <= iso ? pending : iso;
        const to = pending <= iso ? iso : pending;
        applyRange('custom', from, to);
      });
      grid.append(cell);
    }
    host.append(grid);
    host.append(el('div', 'cal-hint', pending ? 'Now pick the end date' : 'Pick a start date, then an end date'));
  }

  function openPop() {
    pending = null;
    calMonth = new Date(state.to + 'T00:00:00');
    calMonth.setDate(1);
    renderCal();
    syncLabel();
    pop.hidden = false;
    rangeBtn.setAttribute('aria-expanded', 'true');
  }
  function closePop() {
    pop.hidden = true;
    rangeBtn.setAttribute('aria-expanded', 'false');
  }
  rangeBtn.addEventListener('click', () => (pop.hidden ? openPop() : closePop()));
  document.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && e.target instanceof Element && !e.target.closest('#range-picker')) closePop();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !pop.hidden) { closePop(); rangeBtn.focus(); }
  });

  // ---- aggregation
  function zero() {
    return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, cost: 0, knownCostEvents: 0, unknownCostEvents: 0, eventCount: 0 };
  }
  function add(acc, c) {
    acc.inputTokens += c.inputTokens; acc.outputTokens += c.outputTokens;
    acc.cacheReadTokens += c.cacheReadTokens; acc.cacheWriteTokens += c.cacheWriteTokens;
    acc.totalTokens += c.totalTokens; acc.cost += c.knownCost;
    acc.knownCostEvents += c.knownCostEvents; acc.unknownCostEvents += c.unknownCostEvents;
    acc.eventCount += c.eventCount;
    return acc;
  }
  const costOf = (t) => (t.knownCostEvents > 0 ? t.cost : null);

  function aggregate() {
    const match = cells.filter((c) =>
      c.usageDate >= state.from && c.usageDate <= state.to &&
      (!state.provider || c.provider === state.provider) &&
      (!state.model || c.model === state.model));
    const groupBy = (key) => {
      const map = new Map();
      for (const c of match) {
        if (!map.has(c[key])) map.set(c[key], zero());
        add(map.get(c[key]), c);
      }
      return map;
    };
    return { summary: match.reduce(add, zero()), byDay: groupBy('usageDate'), byProvider: groupBy('provider'), byModel: groupBy('model') };
  }

  // ---- tooltip (values lead, labels follow)
  const tooltip = qs('#tooltip');
  function showTooltip(title, rows, x, y) {
    tooltip.textContent = '';
    tooltip.append(el('div', 'tip-title', title));
    for (const row of rows) {
      const line = el('div', row.strong ? 'tip-row strong' : 'tip-row');
      line.append(el('span', 'tip-value', row.value), el('span', 'tip-label', row.label));
      tooltip.append(line);
    }
    tooltip.hidden = false;
    const rect = tooltip.getBoundingClientRect();
    tooltip.style.left = Math.max(8, Math.min(x + 14, window.innerWidth - rect.width - 8)) + 'px';
    tooltip.style.top = Math.max(8, y - rect.height - 14) + 'px';
  }
  function hideTooltip() { tooltip.hidden = true; }

  // ---- daily column chart (single series: sequential accent, no legend)
  function niceMax(rough) {
    if (rough <= 0) return 1;
    const power = Math.pow(10, Math.floor(Math.log10(rough)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * power >= rough) return m * power;
    return 10 * power;
  }

  function renderChart(days, byDay) {
    const holder = qs('#chart');
    holder.textContent = '';
    if (days.length === 0) { holder.append(el('div', 'empty', 'No days in this range')); return; }
    const width = Math.max(320, holder.clientWidth || 640);
    const height = 230, padLeft = 46, padRight = 8, padTop = 10, padBottom = 26;
    const innerW = width - padLeft - padRight, innerH = height - padTop - padBottom;
    const values = days.map((d) => (byDay.get(d) ? byDay.get(d).totalTokens : 0));
    const step = niceMax(Math.max.apply(null, values.concat(1)) / 4);
    const top = step * 4;
    const y = (v) => padTop + innerH * (1 - v / top);
    const svg = svgEl('svg', { width: width, height: height, role: 'img', 'aria-label': 'Daily token usage' });

    for (let i = 0; i <= 4; i++) {
      const yy = y(step * i);
      if (i > 0) svg.append(svgEl('line', { x1: padLeft, x2: width - padRight, y1: yy, y2: yy, class: 'grid' }));
      const label = svgEl('text', { x: padLeft - 8, y: yy + 3.5, class: 'tick', 'text-anchor': 'end' });
      label.textContent = fmtTokens(step * i);
      svg.append(label);
    }
    svg.append(svgEl('line', { x1: padLeft, x2: width - padRight, y1: y(0), y2: y(0), class: 'baseline' }));

    const band = innerW / days.length;
    const barW = Math.max(2, Math.min(24, band - 2));
    const labelEvery = Math.max(1, Math.ceil(days.length / Math.max(4, Math.floor(innerW / 84))));

    days.forEach((day, i) => {
      const totals = byDay.get(day);
      const value = totals ? totals.totalTokens : 0;
      const xCenter = padLeft + band * i + band / 2;
      if (value > 0) {
        const h = Math.max(1.5, (value / top) * innerH);
        const r = Math.min(4, barW / 2, h);
        const x = xCenter - barW / 2;
        const yTop = y(0) - h;
        svg.append(svgEl('path', {
          class: 'bar',
          'data-day': day,
          d: 'M' + x + ' ' + y(0) + ' V' + (yTop + r) +
            ' Q' + x + ' ' + yTop + ' ' + (x + r) + ' ' + yTop +
            ' H' + (x + barW - r) +
            ' Q' + (x + barW) + ' ' + yTop + ' ' + (x + barW) + ' ' + (yTop + r) +
            ' V' + y(0) + ' Z',
        }));
      }
      const lastLabelAt = Math.floor((days.length - 1) / labelEvery) * labelEvery;
      if (i % labelEvery === 0 && (i !== lastLabelAt || i === days.length - 1 || (days.length - 1 - i) * band >= 56)) {
        const label = svgEl('text', { x: xCenter, y: height - 6, class: 'tick', 'text-anchor': 'middle' });
        label.textContent = shortDay(day);
        svg.append(label);
      }

      const hit = svgEl('rect', { x: padLeft + band * i, y: padTop, width: band, height: innerH, fill: 'transparent', class: 'hit', tabindex: '0' });
      hit.setAttribute('aria-label', shortDay(day) + ': ' + plain.format(value) + ' tokens');
      const rows = () => [
        { value: fmtTokens(value), label: 'total tokens', strong: true },
        { value: fmtTokens(totals ? totals.inputTokens : 0), label: 'input' },
        { value: fmtTokens(totals ? totals.outputTokens : 0), label: 'output' },
        { value: fmtCost(totals ? costOf(totals) : null), label: 'est. cost' },
      ];
      const hover = (on) => {
        const bar = svg.querySelector('.bar[data-day="' + day + '"]');
        if (bar) bar.classList.toggle('hot', on);
      };
      hit.addEventListener('pointerenter', () => hover(true));
      hit.addEventListener('pointermove', (e) => showTooltip(shortDay(day), rows(), e.clientX, e.clientY));
      hit.addEventListener('pointerleave', () => { hover(false); hideTooltip(); });
      hit.addEventListener('focus', () => {
        const r = hit.getBoundingClientRect();
        hover(true);
        showTooltip(shortDay(day), rows(), r.left + r.width / 2, r.top + 30);
      });
      hit.addEventListener('blur', () => { hover(false); hideTooltip(); });
      svg.append(hit);
    });
    holder.append(svg);
  }

  // ---- provider/model breakdown tables (table view doubles as the a11y fallback)
  function renderBreakdown(id, map, emptyText) {
    const container = qs(id);
    container.textContent = '';
    const rows = [...map.entries()]
      .map(([name, t]) => ({ name, t }))
      .sort((a, b) => b.t.totalTokens - a.t.totalTokens || a.name.localeCompare(b.name));
    qs(id + '-count').textContent = rows.length + ' shown';
    if (rows.length === 0) { container.append(el('div', 'empty', emptyText)); return; }
    const maxTokens = rows[0].t.totalTokens || 1;
    const table = el('table', 'breakdown');
    const headRow = el('tr');
    ['Name', 'Total', 'Input', 'Output', 'Cost'].forEach((h, i) => headRow.append(el('th', i === 0 ? '' : 'num', h)));
    const thead = el('thead');
    thead.append(headRow);
    const tbody = el('tbody');
    for (const row of rows) {
      const tr = el('tr');
      const nameCell = el('td');
      nameCell.append(el('div', 'name', row.name));
      nameCell.append(el('div', 'sub', plain.format(row.t.eventCount) + (row.t.eventCount === 1 ? ' response' : ' responses')));
      const meter = el('div', 'meter');
      const fill = el('span', 'meter-fill');
      fill.style.width = Math.max(2, Math.round((row.t.totalTokens / maxTokens) * 100)) + '%';
      meter.append(fill);
      nameCell.append(meter);
      tr.append(
        nameCell,
        el('td', 'num', fmtTokens(row.t.totalTokens)),
        el('td', 'num', fmtTokens(row.t.inputTokens)),
        el('td', 'num', fmtTokens(row.t.outputTokens)),
        el('td', 'num', fmtCost(costOf(row.t))),
      );
      tbody.append(tr);
    }
    table.append(thead, tbody);
    container.append(table);
  }

  function tile(label, value, sub) {
    const node = el('div', 'tile');
    node.append(el('div', 'label', label), el('div', 'value', value), el('div', 'sub', sub));
    return node;
  }

  function describeRange(days, summary) {
    const scope = [];
    if (state.provider) scope.push(state.provider);
    if (state.model) scope.push(state.model);
    const span = days.length + (days.length === 1 ? ' day' : ' days') + ' · ' + state.from + ' to ' + state.to;
    const lead = summary.eventCount === 0 ? 'No usage recorded' : plain.format(summary.eventCount) + (summary.eventCount === 1 ? ' response' : ' responses');
    return lead + ' · ' + span + (scope.length ? ' · ' + scope.join(' · ') : '');
  }

  function render() {
    hideTooltip();
    const agg = aggregate();
    const days = daysBetween(state.from, state.to);

    qs('#range-note').textContent = describeRange(days, agg.summary);
    const tiles = qs('#tiles');
    tiles.textContent = '';
    tiles.append(
      tile('Total tokens', fmtTokens(agg.summary.totalTokens), plain.format(agg.summary.eventCount) + (agg.summary.eventCount === 1 ? ' response' : ' responses')),
      tile('Input tokens', fmtTokens(agg.summary.inputTokens), 'prompt and context'),
      tile('Output tokens', fmtTokens(agg.summary.outputTokens), 'assistant responses'),
      tile('Cache tokens', fmtTokens(agg.summary.cacheReadTokens + agg.summary.cacheWriteTokens), fmtTokens(agg.summary.cacheReadTokens) + ' read · ' + fmtTokens(agg.summary.cacheWriteTokens) + ' write'),
      tile('Estimated cost', fmtCost(costOf(agg.summary)), agg.summary.unknownCostEvents > 0 ? plain.format(agg.summary.unknownCostEvents) + ' events without pricing' : 'all events priced'),
    );
    qs('#chart-total').textContent = fmtTokens(agg.summary.totalTokens) + ' tokens in range';
    renderChart(days, agg.byDay);
    renderBreakdown('#providers', agg.byProvider, 'No provider usage in this range');
    renderBreakdown('#models', agg.byModel, 'No model usage in this range');

    try {
      const params = new URLSearchParams();
      params.set('range', state.preset);
      if (state.preset === 'custom') { params.set('from', state.from); params.set('to', state.to); }
      if (state.provider) params.set('provider', state.provider);
      if (state.model) params.set('model', state.model);
      history.replaceState(null, '', location.pathname + '?' + params);
    } catch (err) { /* file: export — no history access needed */ }
  }

  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 150); });

  syncLabel();
  render();
})();
</script>
</body>
</html>`;
}

export function writeStaticReport(filePath: string, payload: DashboardPayload): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, buildStaticReportHtml(payload), "utf8");
}

function filtersForRange(range: string | null, now = new Date()): UsageFilters {
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from = new Date(to);

  if (range === "today") {
    return { fromDate: formatLocalDate(to), toDate: formatLocalDate(to) };
  }

  if (range === "30d") {
    from.setDate(to.getDate() - 29);
    return { fromDate: formatLocalDate(from), toDate: formatLocalDate(to) };
  }

  return getDefaultWeeklyFilters(now);
}

function filtersFromUrl(url: URL): UsageFilters {
  const range = url.searchParams.get("range");
  const useCustomDates = range === "custom" || (!range && (url.searchParams.has("from") || url.searchParams.has("to")));
  const defaults = useCustomDates ? getDefaultWeeklyFilters() : filtersForRange(range);
  return {
    fromDate: useCustomDates ? url.searchParams.get("from") || defaults.fromDate : defaults.fromDate,
    toDate: useCustomDates ? url.searchParams.get("to") || defaults.toDate : defaults.toDate,
    provider: url.searchParams.get("provider") || undefined,
    model: url.searchParams.get("model") || undefined,
  };
}

// Stable default port so the dashboard URL survives session restarts (stale tabs recover on reload).
const DEFAULT_PORT = 7478;

export function startDashboardServer(options: StartDashboardServerOptions): Promise<DashboardServer> {
  const host = options.host ?? "127.0.0.1";
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://${host}`);
    if (url.pathname === "/api/report") {
      const report = getReportData(options.db, filtersFromUrl(url));
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(report));
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(buildStaticReportHtml(getDashboardPayload(options.db)));
  });

  return new Promise((resolve, reject) => {
    const onListening = () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Dashboard server did not return a TCP address"));
        return;
      }
      resolve({ server, url: `http://${host}:${address.port}/` });
    };
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (options.port === undefined && error.code === "EADDRINUSE") {
        server.once("error", reject);
        server.listen(0, host, onListening);
        return;
      }
      reject(error);
    });
    server.listen(options.port ?? DEFAULT_PORT, host, onListening);
  });
}

export function openBrowser(url: string): void {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}
