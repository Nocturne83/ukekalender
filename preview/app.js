/* Ukeplanen v2.4 – Preact + htm, no build step. */
import { html, render, useState, useEffect, useLayoutEffect, useRef, useReducer } from '../vendor/preact-htm.module.js';

const VERSION = '2.4.1-preview';

// ---------- Icons ----------
const sv = (d, w = 20, sw = 2) => '<svg width="' + w + '" height="' + w + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
const I = {
  bell: sv('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'),
  bellSm: sv('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>', 16),
  moon: sv('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  sun: sv('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  left: sv('<path d="M15 18l-6-6 6-6"/>'),
  right: sv('<path d="M9 18l6-6-6-6"/>'),
  down: sv('<path d="M6 9l6 6 6-6"/>', 18),
  plus: sv('<path d="M12 5v14M5 12h14"/>', 18),
  check: sv('<path d="M20 6L9 17l-5-5"/>', 16, 2.5),
  checkSm: sv('<path d="M20 6L9 17l-5-5"/>', 14, 2.5),
  close: sv('<path d="M18 6L6 18M6 6l12 12"/>', 18),
  pen: sv('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  list: sv('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  chat: sv('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  send: sv('<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/>'),
  car: sv('<path d="M19 17h2v-4l-2.5-5h-13L3 13v4h2"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/>', 16),
  cal: sv('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>', 14),
  pin: sv('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>', 18)
};
const Ico = ({ n, cls }) => html`<span class=${'ic ' + (cls || '')} dangerouslySetInnerHTML=${{ __html: I[n] }}></span>`;

const DAYN = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
const MND = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const TILES = [
  { k: 'middag', label: 'Middag' }, { k: 'bil', label: 'Bilen' },
  { k: 'lev', label: 'Levering bhg.' }, { k: 'hent', label: 'Henting bhg.' }
];
const REM = { sunday: 'søndager kl. 20', daily: 'hver dag kl. 20', off: 'av' };
const REM_NEXT = { sunday: 'daily', daily: 'off', off: 'sunday' };
const FB_VERSION = '10.12.2';
const DONE_AFTER_MIN = 60; // an appointment counts as done one hour after it ends
const UNDO_MS = 5000;
const WORK_FROM = 8 * 60, WORK_TO = 16 * 60; // car warning only between 08:00 and 16:00

// ---------- Connection ----------
const CONN_KEY = 'ukeplanen-conn';
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
function parseLink(s) {
  s = String(s || '');
  const h = s.indexOf('#') >= 0 ? s.slice(s.indexOf('#') + 1) : s;
  const p = {};
  h.split('&').forEach(kv => { const i = kv.indexOf('='); if (i > 0) p[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
  return p.k && p.b ? { k: p.k, b: p.b } : null;
}
const DEMO = !!window.UKEPLANEN_FORCE_DEMO || location.hash.indexOf('demo') >= 0;
let CONN = DEMO ? { k: 'p2', b: 'demo' } : (parseLink(location.hash) || (() => { try { return JSON.parse(store(CONN_KEY)); } catch (e) { return null; } })());
if (CONN && !DEMO) store(CONN_KEY, JSON.stringify(CONN));

function api(name, ...args) {
  if (DEMO) {
    return new Promise((resolve, reject) => {
      setTimeout(() => { try { resolve(JSON.parse(JSON.stringify(MOCK[name](CONN.k, ...args)))); } catch (e) { reject(e); } }, 400);
    });
  }
  return fetch(CONN.b, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ k: CONN.k, fn: name, args }) })
    .then(r => { if (!r.ok) throw new Error('Serveren svarte ikke (' + r.status + ')'); return r.json(); })
    .then(res => { if (!res.ok) throw new Error(res.error || 'Noe gikk galt'); return res.data; }, e => {
      if (e instanceof TypeError) throw new Error('Ingen kontakt med serveren. Sjekk nettet.');
      throw e;
    });
}

// ---------- Dates ----------
const pad = n => (n < 10 ? '0' : '') + n;
const ds = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const pd = s => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2], 12); };
const addDays = (d, n) => { const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; };
const mondayOf = d => addDays(d, -((d.getDay() + 6) % 7));
const dLabel = d => d.getDate() + '. ' + MND[d.getMonth()];
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  return Math.ceil(((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7);
}
const baseMonday = () => mondayOf(pd(S.data.today));
const weekMonday = o => addDays(baseMonday(), o * 7);
function wLabel(o) {
  const a = weekMonday(o), b = addDays(a, 6);
  return 'Uke ' + isoWeek(a) + ' · ' + (a.getMonth() === b.getMonth() ? a.getDate() + '.' : dLabel(a)) + '–' + dLabel(b);
}
const weekOfDate = s => Math.round((mondayOf(pd(s)) - baseMonday()) / (7 * 86400000));
const longDate = s => { const d = pd(s); return DAYN[(d.getDay() + 6) % 7] + ' ' + dLabel(d); };
const dayIdx = date => (pd(date).getDay() + 6) % 7;
const mins = t => { const p = t.split(':').map(Number); return p[0] * 60 + p[1]; };
const addMin = (t, n) => { const p = t.split(':').map(Number), x = (p[0] * 60 + p[1] + n + 1440) % 1440; return pad(Math.floor(x / 60)) + ':' + pad(x % 60); };

// ---------- State ----------
const S = {
  data: null, error: null, tab: 'plan', week: 0, weekOpen: false, openDay: null, tilesOpen: false, tileEdit: null, moreWeeks: 0, grp: {},
  adding: null, form: null, formErr: '', formDup: null, editing: null, edit: null, editErr: '', cancelling: null, cancelText: '', cancelErr: '',
  deleting: null, deleteText: '', deleteErr: '', openCard: null, pastDay: null, replying: null, replyText: '', doneAsk: null, timePick: null,
  panel: false, toast: null, theme: 'light', pushBusy: false, anim: 'tab', now: Date.now(), msgDraft: '', connErr: ''
};
(() => {
  const saved = store('ukeplanen-theme');
  let dark = false;
  try { dark = window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) {}
  S.theme = saved || (dark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', S.theme);
})();

const REDUCED = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
const EASE = 'cubic-bezier(.22,.8,.24,1)';

// ---------- Rendering loop + FLIP ----------
// Every change goes through update(). With {flip: true}, elements marked data-flip
// glide from where they were to where they end up; new ones fade in.
let rerender = () => {};
let flipPrev = null;
function flipSnap() {
  if (REDUCED) return;
  flipPrev = new Map();
  document.querySelectorAll('[data-flip]').forEach(el => {
    const r = el.getBoundingClientRect();
    flipPrev.set(el.dataset.flip, { x: r.left, y: r.top + window.scrollY });
  });
}
function flipPlay() {
  if (!flipPrev) return;
  const prev = flipPrev; flipPrev = null;
  document.querySelectorAll('[data-flip]').forEach(el => {
    const p = prev.get(el.dataset.flip), r = el.getBoundingClientRect();
    if (!p) {
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      el.animate([{ opacity: 0, transform: 'translateY(8px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: EASE });
      return;
    }
    const dx = p.x - r.left, dy = p.y - (r.top + window.scrollY);
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    el.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: 380, easing: EASE });
  });
}
function update(fn, opts) {
  if (opts && opts.flip) flipSnap();
  if (fn) fn(S);
  rerender();
}
// Fold an element away (height and opacity), then apply the change.
function exitThen(key, fn) {
  const el = document.querySelector('[data-flip="' + key + '"]');
  if (!el || REDUCED || !el.animate) { update(fn, { flip: true }); return; }
  const h = el.offsetHeight, cs = getComputedStyle(el);
  el.style.overflow = 'hidden';
  const a = el.animate([
    { height: h + 'px', opacity: 1, transform: 'none', marginTop: cs.marginTop, marginBottom: cs.marginBottom },
    { height: '0px', opacity: 0, transform: 'scale(.97)', marginTop: '0px', marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px', borderTopWidth: '0px', borderBottomWidth: '0px' }
  ], { duration: 300, easing: EASE, fill: 'forwards' });
  a.onfinish = () => {
    update(fn, { flip: true });
    setTimeout(() => { if (el.isConnected) { a.cancel(); el.style.overflow = ''; } }, 60);
  };
}

// ---------- Small helpers ----------
const me = () => S.data.me;
const other = () => (me() === 'p1' ? 'p2' : 'p1');
const N = p => S.data.names[p];
const okKey = p => (p === 'p1' ? 'ok1' : 'ok2');
const okOf = (it, p) => !!it[okKey(p)];
const isConf = it => it.ok1 && it.ok2;
const needsMe = it => !okOf(it, me());
function whoLabel(w) {
  if (w === 'p1' || w === 'p2') return N(w);
  if (w === 'both') return 'Begge';
  if (w === 'grand') return 'Besteforeldre';
  if (w === 'takeaway') return 'Restaurant/takeaway';
  return w;
}
const whoText = w => (w === 'both' ? N('p1') + ' og ' + N('p2') : whoLabel(w));
const whoClass = w => (w === 'p1' ? 'c-p1' : w === 'p2' ? 'c-p2' : w === 'both' ? 'c-both' : 'c-other');
const timeText = it => (it.allDay ? 'Hele dagen' : it.start ? 'kl. ' + it.start + (it.end ? '–' + it.end : '') : 'Uten klokkeslett');
const shortTime = it => timeText(it).replace('kl. ', '');
const sortKey = it => it.date + (it.allDay ? '00' : it.start || '99');
const sortItems = (a, b) => (sortKey(a) < sortKey(b) ? -1 : 1);
const itemsOn = date => S.data.items.filter(it => it.date === date).sort(sortItems);
const myNeeds = () => S.data.items.filter(needsMe).sort(sortItems);
const countLabel = n => n + (n === 1 ? ' avtale' : ' avtaler');
const findItem = id => S.data.items.find(i => i.id === id);
const isTmp = id => String(id).indexOf('tmp') === 0;
const norm = t => String(t || '').toLowerCase().replace(/[^a-zæøå0-9]/g, '');

// Done = ticked off, or one hour after the end time has passed.
function endAt(it) {
  const d = pd(it.date);
  if (it.allDay || !it.start) { d.setHours(24, 0, 0, 0); return d.getTime(); }
  const e = it.end ? mins(it.end) : mins(it.start) + 60;
  d.setHours(0, e, 0, 0);
  return d.getTime();
}
const autoDone = it => !it.done && S.now >= endAt(it) + DONE_AFTER_MIN * 60000;
const isDone = it => !!it.done || autoDone(it);

function whoOptions(current) {
  const base = [me(), other(), 'both', 'grand'];
  const counts = {};
  S.data.items.forEach(it => { if (base.indexOf(it.who) === -1) counts[it.who] = (counts[it.who] || 0) + 1; });
  Object.keys(counts).forEach(w => { if (counts[w] >= 2 && base.length < 7) base.push(w); });
  if (current && current !== 'other' && base.indexOf(current) === -1) base.push(current);
  return base.concat(['other']);
}
const finalWho = f => (f.who === 'other' ? ((f.other || '').trim() || 'Annen') : f.who);
const rowsFor = t => { t = t || ''; return Math.max(2, Math.min(12, t.split('\n').length + Math.floor(t.length / 38))); };
const whereLooksLikeText = w => { w = (w || '').trim(); return w.length > 60 && !/^https?:\/\//i.test(w); };
const DRIVE_WORDS = /kjør|kjøre|hent|lever|trening|øving|kamp|turnering|showakademi|bursdag|forestilling|konsert|skyss|flyplass|stasjon/i;
const isPersonal = f => f.who === 'p1' || f.who === 'p2';
const grow = e => { const t = e.target; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };

function tileList(date, d) {
  return TILES.map(t => {
    const def = (S.data.defaults[t.k] || [])[d];
    if (def === null || def === undefined) return null;
    const key = date + '|' + t.k;
    const val = Object.prototype.hasOwnProperty.call(S.data.tiles, key) ? S.data.tiles[key] : def;
    return { k: t.k, label: t.label, val, changed: val !== def, options: S.data.tileOptions[t.k] || [] };
  }).filter(Boolean);
}
function tileText(t) {
  if (!t.val) return 'Ikke satt';
  if (t.val === 'takeaway') return 'Restaurant/takeaway';
  if (t.val === 'grand' && t.k === 'middag') return 'Hos besteforeldre';
  if (t.val === 'both') return 'Begge';
  return whoLabel(t.val) + (t.k === 'middag' ? ' lager' : t.k === 'bil' ? ' har bilen' : t.k === 'lev' ? ' leverer' : ' henter');
}

// ---------- Duplicates and clashes ----------
// Same day, same title (ignoring case and punctuation) and same start: not allowed.
function duplicateOf(payload, selfId) {
  return S.data.items.find(o => o.id !== selfId && o.date === payload.date && norm(o.title) === norm(payload.title) &&
    (payload.allDay || !payload.start ? (o.allDay || !o.start) : o.start === payload.start));
}
// Similar = every word of the shorter title is also a whole word in the longer one ("Pokemon showcase" vs "Pokemon Showcase Arian").
const words = t => String(t || '').toLowerCase().split(/[^a-zæøå0-9]+/).filter(w => w.length > 1);
function similar(a, b) {
  let x = words(a), y = words(b);
  if (!x.length || !y.length) return false;
  if (x.length > y.length) { const t = x; x = y; y = t; }
  return x.every(w => y.indexOf(w) !== -1);
}
function slots(x) {
  const out = [];
  if (!x.allDay && x.start) out.push({ who: x.who, a: mins(x.start), b: x.end ? mins(x.end) : mins(x.start) + 60, what: x.title });
  if (x.drive && x.driveAt) out.push({ who: x.drive, a: mins(x.driveAt), b: mins(x.driveAt) + 30, what: 'kjøring til ' + x.title });
  if (x.pick && x.pickAt) out.push({ who: x.pick, a: mins(x.pickAt), b: mins(x.pickAt) + 30, what: 'henting fra ' + x.title });
  return out;
}
const involves = (w, person) => w === person || w === 'both';
function clashes(payload, selfId) {
  const warn = [], mine = slots(payload);
  const add = m => { if (warn.indexOf(m) === -1) warn.push(m); };
  S.data.items.forEach(o => {
    if (o.id === selfId || o.date !== payload.date) return;
    if (similar(o.title, payload.title)) add('«' + o.title + '» ' + (o.start ? 'kl. ' + o.start : 'hele dagen') + ' ligner. Er det samme avtale?');
    slots(o).forEach(s2 => mine.forEach(s1 => ['p1', 'p2'].forEach(pp => {
      if (involves(s1.who, pp) && involves(s2.who, pp) && s1.a < s2.b && s2.a < s1.b) add(N(pp) + ' har allerede «' + s2.what + '» kl. ' + pad(Math.floor(s2.a / 60)) + ':' + pad(s2.a % 60) + '.');
    })));
  });
  const car = tileList(payload.date, dayIdx(payload.date)).find(t => t.k === 'bil');
  if (car && car.val && car.val !== 'both') {
    ['drive', 'pick'].forEach(leg => {
      const w = payload[leg], at = payload[leg + 'At'];
      // Only during working hours: after 16:00 the car is home anyway.
      const workHours = at && mins(at) >= WORK_FROM && mins(at) < WORK_TO;
      if (workHours && (w === 'p1' || w === 'p2') && w !== car.val) add(whoLabel(w) + ' skal kjøre, men ' + whoLabel(car.val) + ' har bilen denne dagen.');
    });
  }
  return warn;
}

// ---------- Actions ----------
const emptyForm = () => ({ title: '', desc: '', start: '12:00', end: '13:00', who: me(), other: '', showDesc: false, allDay: false, where: '', drive: '', driveAt: '', pick: '', pickAt: '', showDrive: false, warn: null });
let toastTimer;
function toast(text, action) {
  clearTimeout(toastTimer);
  update(s => { s.toast = { text, action, id: Date.now() }; });
  toastTimer = setTimeout(() => update(s => { s.toast = null; }), action ? UNDO_MS : 2600);
}
let pending = 0;
const typing = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'); };
// Change the screen at once, save in the background, roll back on error.
function opt(mutate, call, okMsg, flip) {
  const backup = JSON.stringify(S.data);
  update(s => mutate(s.data), { flip });
  if (okMsg) toast(okMsg);
  pending++;
  return call().then(state => {
    pending--;
    if (pending === 0) { S.data = state; if (!typing()) update(); }
  }).catch(e => {
    pending--;
    S.data = JSON.parse(backup);
    toast('Ble ikke lagret: ' + (e && e.message ? e.message : 'prøv igjen'));
  });
}
function resetCard() {
  Object.assign(S, { replying: null, doneAsk: null, timePick: null, editing: null, cancelling: null, deleting: null, editErr: '', cancelErr: '', deleteErr: '' });
}
function scrollToItem(id) {
  setTimeout(() => { const el = document.querySelector('[data-flip="' + id + '"]'); if (el) el.scrollIntoView({ block: 'center', behavior: REDUCED ? 'auto' : 'smooth' }); }, 80);
}
function openItem(id, edit) {
  const it = findItem(id);
  if (!it) return;
  update(s => {
    s.panel = false; s.anim = s.tab === 'ov' ? s.anim : 'tab'; s.tab = 'ov'; s.week = weekOfDate(it.date); s.weekOpen = false; s.moreWeeks = 0;
    if (it.date < s.data.today) { s.grp.ovPast = true; s.pastDay = it.date; }
    else if (isDone(it)) s.grp['done|' + it.date] = true;
    resetCard();
    s.openCard = id;
    if (edit) startEdit(it);
  });
  scrollToItem(id);
}
function startEdit(it) {
  const known = whoOptions(it.who).indexOf(it.who) !== -1;
  resetCard();
  S.editing = it.id; S.openCard = it.id;
  S.edit = { title: it.title, date: it.date, start: it.start || '12:00', end: it.end || '13:00', who: known ? it.who : 'other', other: known ? '' : it.who, desc: it.desc || '', where: it.where || '', allDay: !!it.allDay, comment: '',
    drive: it.drive || '', driveAt: it.driveAt || '', pick: it.pick || '', pickAt: it.pickAt || '', showDrive: !!(it.drive || it.pick), driveAuto: false, pickAuto: false, warn: null };
}
function validate(f) {
  if (!f.title.trim()) return 'Skriv hva det gjelder.';
  if (f.showDrive && f.drive && !f.driveAt) return 'Velg tid for kjøring.';
  if (f.showDrive && f.pick && !f.pickAt) return 'Velg tid for henting.';
  if (!f.allDay && f.start && f.end && f.end <= f.start) return 'Sluttid må være etter starttid.';
  return '';
}
function payloadOf(f, date) {
  const legs = f.showDrive ? { drive: f.drive || '', driveAt: f.drive ? f.driveAt : '', pick: f.pick || '', pickAt: f.pick ? f.pickAt : '' } : { drive: '', driveAt: '', pick: '', pickAt: '' };
  return Object.assign({ date, start: f.allDay ? '' : f.start, end: f.allDay ? '' : f.end, title: f.title.trim(), desc: (f.desc || '').trim(), who: finalWho(f), allDay: !!f.allDay, where: (f.where || '').trim() }, legs);
}
function legDefaults(f, force) {
  if (force || !f.driveAt || f.driveAuto) { f.driveAt = f.allDay || !f.start ? '' : addMin(f.start, -30); f.driveAuto = true; }
  if (force || !f.pickAt || f.pickAuto) { f.pickAt = f.allDay || !f.end ? '' : f.end; f.pickAuto = true; }
}
function afterTime(f, k) {
  if (k === 'start' && f.end && f.end <= f.start) f.end = addMin(f.start, 60);
  if (k === 'driveAt') f.driveAuto = false;
  else if (k === 'pickAt') f.pickAuto = false;
  else if (f.showDrive) legDefaults(f);
}
const formOf = p => (p === 'f' ? S.form : S.edit);
function changeWeek(w, dir) {
  update(s => { s.week = w; s.weekOpen = false; s.openDay = null; s.adding = null; s.moreWeeks = 0; s.openCard = null; s.anim = dir; resetCard(); });
  window.scrollTo(0, 0);
}

const A = {
  theme() {
    update(s => { s.theme = s.theme === 'dark' ? 'light' : 'dark'; });
    document.documentElement.setAttribute('data-theme', S.theme);
    store('ukeplanen-theme', S.theme);
  },
  tab(t) {
    if (t === S.tab) return;
    update(s => { s.tab = t; s.anim = 'tab'; s.weekOpen = false; s.moreWeeks = 0; s.openCard = null; resetCard(); });
    if (t === 'msg') {
      if (S.data.unreadMessages) opt(d => { d.unreadMessages = 0; }, () => api('readMessages'));
      setTimeout(scrollMsgs, 40);
    } else window.scrollTo(0, 0);
  },
  toggleDay(d) { update(s => { s.openDay = s.openDay === d ? null : d; s.adding = null; s.tilesOpen = false; s.tileEdit = null; }); },
  toggleGrp(k) { update(s => { s.grp[k] = !s.grp[k]; }); },
  startAdd(date) { update(s => { s.timePick = null; s.adding = date; s.form = emptyForm(); s.formErr = ''; s.formDup = null; }); setTimeout(() => { const i = document.querySelector('[data-f="title"]'); if (i) i.focus(); }, 60); },
  cancelAdd() { update(s => { s.adding = null; s.formErr = ''; s.formDup = null; }); },
  saveAdd() {
    const f = S.form, err = validate(f);
    if (err) { update(s => { s.formErr = err; }); return; }
    const payload = payloadOf(f, S.adding);
    const dup = duplicateOf(payload, null);
    if (dup) { update(s => { s.formErr = '«' + dup.title + '» ' + (dup.start ? 'kl. ' + dup.start : 'hele dagen') + ' er allerede lagt inn denne dagen.'; s.formDup = dup.id; }); return; }
    if (!f.warn) { const w = clashes(payload, null); if (w.length) { update(s => { s.form.warn = w; s.formErr = ''; }); return; } }
    opt(d => {
      S.adding = null;
      d.items.push(Object.assign({ id: 'tmp' + Date.now(), by: me(), ok1: me() === 'p1', ok2: me() === 'p2', note: '', noteBy: '', src: 'app', whereAddr: '', lat: '', lng: '', mapUrl: '' }, payload));
    }, () => api('saveItem', payload), 'Sendt til ' + N(other()), true);
  },
  yes(id) {
    const it = findItem(id);
    if (!it || isTmp(id)) return;
    const both = okOf(it, other());
    opt(d => { d.items.forEach(i => { if (i.id === id) i[okKey(me())] = true; }); }, () => api('confirmItem', id), both ? 'Bekreftet og lagt i kalenderen' : 'Bekreftet', true);
  },
  undo(id) {
    opt(d => { d.items.forEach(i => { if (i.id === id) i[okKey(me())] = false; }); }, () => api('undoConfirm', id), 'Angret – avtalen er ikke avklart ennå');
  },
  edit(id) { const it = findItem(id); if (it && !isTmp(id)) update(() => startEdit(it)); },
  cancelEdit() { update(resetCard); },
  saveEdit(id) {
    const it = findItem(id), f = S.edit;
    let err = validate(f);
    if (!err && (isConf(it) || it.by !== me()) && !f.comment.trim()) err = 'Skriv kort hvorfor det endres.';
    const payload = payloadOf(f, f.date);
    const dup = !err && duplicateOf(payload, it.id);
    if (dup) err = '«' + dup.title + '» ' + (dup.start ? 'kl. ' + dup.start : 'hele dagen') + ' finnes allerede den dagen.';
    if (err) { update(s => { s.editErr = err; }); return; }
    if (!f.warn) { const w = clashes(payload, it.id); if (w.length) { update(s => { s.edit.warn = w; s.editErr = ''; }); return; } }
    const conf = isConf(it), comment = f.comment;
    opt(d => {
      resetCard(); S.week = weekOfDate(f.date);
      d.items.forEach(i => {
        if (i.id !== it.id) return;
        if (i.where !== payload.where) { i.whereAddr = ''; i.mapUrl = ''; i.lat = ''; i.lng = ''; }
        Object.assign(i, payload);
        if (comment.trim()) { i.note = comment.trim(); i.noteBy = me(); i.thread = threadOf(i).concat([{ by: me(), text: comment.trim(), at: new Date().toISOString() }]); }
        if (!conf) { i[okKey(me())] = true; i[okKey(other())] = false; }
      });
    }, () => api('changeItem', it.id, payload, comment), conf ? 'Endret. ' + N(other()) + ' får beskjed.' : 'Sendt til ' + N(other()), true);
  },
  startCancel(id) { if (isTmp(id)) return; update(s => { resetCard(); s.cancelling = id; s.cancelText = ''; }); },
  cancelYes(id) {
    const text = S.cancelText.trim();
    if (!text) { update(s => { s.cancelErr = 'Skriv kort hvorfor.'; }); return; }
    exitThen(id, () => {
      resetCard();
      const backup = JSON.stringify(S.data);
      S.data.items = S.data.items.filter(i => i.id !== id);
      api('cancelItem', id, text).then(st => { if (!pending) { S.data = st; update(); } }).catch(e => { S.data = JSON.parse(backup); toast('Ble ikke lagret: ' + e.message); });
      setTimeout(() => toast('Avlyst. ' + N(other()) + ' får beskjed.'), 0);
    });
  },
  // Delete from Ukesoversikt: asks for a reason, and the other person is told.
  startDelete(id) { if (isTmp(id)) return; update(s => { resetCard(); s.deleting = id; s.deleteText = ''; s.deleteErr = ''; }); },
  planDelete(id) { const it = findItem(id); if (!it) return; if (it.by === me()) A.quietDelete(id); else A.startDelete(id); },
  deleteYes(id) {
    const text = S.deleteText.trim();
    if (!text) { update(s => { s.deleteErr = 'Skriv kort hvorfor.'; }); return; }
    exitThen(id, () => {
      resetCard();
      const backup = JSON.stringify(S.data);
      S.data.items = S.data.items.filter(i => i.id !== id);
      api('deleteItem', id, text, false).then(st => { if (!pending) { S.data = st; update(); } }).catch(e => { S.data = JSON.parse(backup); toast('Ble ikke lagret: ' + e.message); });
      setTimeout(() => toast('Slettet. ' + N(other()) + ' får beskjed.'), 0);
    });
  },
  // Delete from Plan (swipe): silent, with a few seconds to undo before anything is sent.
  quietDelete(id) {
    if (isTmp(id)) return;
    const it = findItem(id);
    if (!it) return;
    let undone = false;
    exitThen(id, () => { S.data.items = S.data.items.filter(i => i.id !== id); });
    const timer = setTimeout(() => {
      if (undone) return;
      api('deleteItem', id, '', true).then(st => { if (!pending) { S.data = st; update(); } }).catch(e => toast('Ble ikke slettet: ' + e.message));
    }, UNDO_MS);
    setTimeout(() => toast('«' + it.title + '» slettet', { label: 'Angre', fn: () => {
      undone = true; clearTimeout(timer);
      update(s => { s.toast = null; s.data.items.push(it); }, { flip: true });
    } }), 320);
  },
  askDone(id) { update(s => { resetCard(); s.doneAsk = id; s.openCard = id; }); },
  doneYes(id) {
    exitThen(id, () => {
      S.doneAsk = null; S.openCard = null;
      S.data.items.forEach(i => { if (i.id === id) i.done = true; });
      api('markDone', id, true).catch(e => toast('Ble ikke lagret: ' + e.message));
      setTimeout(() => toast('Flyttet til Gjennomført'), 0);
    });
  },
  undoDone(id) {
    const it = findItem(id);
    // An appointment that is past its time stays done; untick only works for ticked-off ones.
    if (it && autoDone(Object.assign({}, it, { done: false }))) { toast('Tiden er passert, så den blir stående under Gjennomført.'); return; }
    opt(d => { d.items.forEach(i => { if (i.id === id) i.done = false; }); }, () => api('markDone', id, false), null, true);
  },
  toggleCard(id) {
    update(s => {
      if (s.openCard === id) { s.openCard = null; resetCard(); }
      else { resetCard(); s.openCard = id; }
    });
  },
  replyOpen(id) { update(s => { resetCard(); s.replying = id; s.replyText = ''; }); setTimeout(() => { const t = document.getElementById('replyIn'); if (t) t.focus(); }, 60); },
  replySend(id) {
    const text = (S.replyText || '').trim();
    if (!text) return;
    opt(d => { S.replying = null; S.replyText = ''; d.items.forEach(i => { if (i.id === id) i.thread = threadOf(i).concat([{ by: me(), text, at: new Date().toISOString() }]); }); },
      () => api('addComment', id, text), 'Sendt til ' + N(other()), true);
  },
  tilePick(date, k, v) { opt(d => { S.tileEdit = null; d.tiles[date + '|' + k] = v; }, () => api('setTile', date, k, v)); },
  sendMsg() {
    const t = (S.msgDraft || '').trim();
    if (!t) return;
    opt(d => { S.msgDraft = ''; d.messages = (d.messages || []).concat([{ id: 'tmp' + Date.now(), from: me(), text: t, created: new Date().toISOString() }]); }, () => api('sendMessage', t), null, true);
    setTimeout(scrollMsgs, 40);
  },
  seen(id) { opt(d => { d.notes = d.notes.filter(n => n.id !== id); }, () => api('markSeen', [id]), null, true); },
  seenAll() { opt(d => { d.notes = []; }, () => api('markSeen', 'all')); },
  noteGo(nid, id) { opt(d => { d.notes = d.notes.filter(n => n.id !== nid); }, () => api('markSeen', [nid])); openItem(id, false); },
  cycleRem() { const m = REM_NEXT[S.data.reminder]; opt(d => { d.reminder = m; }, () => api('setReminder', m)); },
  mockSwitch() { CONN.k = CONN.k === 'p1' ? 'p2' : 'p1'; update(s => { resetCard(); s.adding = null; s.openCard = null; }); load(); },
  connect() {
    const c = parseLink(document.getElementById('linkIn').value);
    if (!c) { update(s => { s.connErr = 'Det ser ikke ut som en gyldig lenke.'; }); return; }
    CONN = c; store(CONN_KEY, JSON.stringify(c)); S.connErr = ''; load();
  }
};
function scrollMsgs() { if (S.tab === 'msg') window.scrollTo({ top: document.body.scrollHeight, behavior: REDUCED ? 'auto' : 'smooth' }); }
function threadOf(it) {
  if (it.thread && it.thread.length) return it.thread;
  return it.note ? [{ by: it.noteBy, text: it.note, at: '' }] : [];
}
function msgTime(iso) {
  const d = new Date(iso), t = pad(d.getHours()) + ':' + pad(d.getMinutes());
  return ds(d) === S.data.today ? t : dLabel(d) + ' ' + t;
}

// ---------- Motion components ----------
// Unfolds and folds its content. Content stays mounted while folding away.
function Collapse({ open, children }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      if (REDUCED) { setShown(true); return; }
      let r2;
      const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setShown(true)); });
      return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), REDUCED ? 0 : 380);
    return () => clearTimeout(t);
  }, [open]);
  if (!mounted && !open) return null;
  return html`<div class=${'slide' + (shown ? ' open' : '')}><div>${children}</div></div>`;
}
// Keeps an overlay mounted while it animates away.
function useExit(open, ms) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) { setMounted(true); setClosing(false); return; }
    if (!mounted) return;
    setClosing(true);
    const t = setTimeout(() => { setMounted(false); setClosing(false); }, REDUCED ? 0 : ms);
    return () => clearTimeout(t);
  }, [open]);
  return [mounted || open, closing];
}
const Chev = ({ open }) => html`<span class=${'chev' + (open ? ' up' : '')} dangerouslySetInnerHTML=${{ __html: I.down }}></span>`;
function SlideGroup({ gkey, label, children }) {
  const open = !!S.grp[gkey];
  return html`<button class="pastgrp" aria-expanded=${String(open)} onClick=${() => A.toggleGrp(gkey)}><span class="l">${label}</span><${Chev} open=${open} /></button>
    <${Collapse} open=${open}><div class="pastwrap">${children}</div><//>`;
}

// A Plan card you can swipe left to reveal «Slett».
function SwipeCard({ it }) {
  const st = useRef({ x0: null, y0: 0, lock: null, base: 0, moved: false });
  const [off, setOff] = useState(0);
  const [drag, setDrag] = useState(false);
  if (S.deleting === it.id) return html`<div class="swipe" data-flip=${it.id}><${DeleteBox} it=${it} /></div>`;
  const down = e => { const s = st.current; s.x0 = e.clientX; s.y0 = e.clientY; s.lock = null; s.base = off; s.moved = false; };
  const move = e => {
    const s = st.current;
    if (s.x0 === null) return;
    const dx = e.clientX - s.x0, dy = e.clientY - s.y0;
    if (!s.lock) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.lock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (s.lock === 'x') { try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {} setDrag(true); }
    }
    if (s.lock !== 'x') return;
    s.moved = true;
    setOff(Math.max(-150, Math.min(0, s.base + dx)));
  };
  const up = () => {
    const s = st.current;
    if (s.lock === 'x') { setDrag(false); setOff(o => (o < -56 ? -96 : 0)); }
    s.x0 = null;
  };
  const click = () => {
    if (st.current.moved) { st.current.moved = false; return; }
    if (off !== 0) { setOff(0); return; }
    openItem(it.id, false);
  };
  const stop = fn => e => { e.stopPropagation(); if (st.current.moved) { st.current.moved = false; return; } fn(); };
  const conf = isConf(it), ask = needsMe(it) && !isTmp(it.id);
  return html`<div class="swipe" data-flip=${it.id}>
    <div class="under" aria-hidden=${String(off === 0)}><button tabindex=${off === 0 ? -1 : 0} onClick=${() => { setOff(0); A.planDelete(it.id); }}>Slett</button></div>
    <div role="button" tabindex="0" class=${'mini' + (conf ? ' ok' : '') + (drag ? ' drag' : '')} style=${{ transform: off ? 'translateX(' + off + 'px)' : '' }}
      onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up} onClick=${click} onKeyDown=${e => { if (e.key === 'Enter') click(); }}>
      <span class="time">${timeText(it)}</span><span class="ttl">${it.title}</span>
      <span class="row wrap"><span class=${'chip ' + whoClass(it.who)}>Hvem: ${whoText(it.who)}</span>${statusChip(it)}</span>
      ${ask ? html`<div class="btns" style="margin-top:6px"><button class="btn sm" onClick=${stop(() => openItem(it.id, true))}>Nei, endre</button><button class="btn sm pri" onClick=${stop(() => A.yes(it.id))}>Ja, stemmer</button></div>` : null}
    </div>
  </div>`;
}
function DeleteBox({ it }) {
  return html`<div class="delbox"><span class="q">Slette «${it.title}»?</span>
    <label class="f">Begrunnelse<input class="inp" type="text" placeholder="F.eks. Lagt inn to ganger" value=${S.deleteText} onInput=${e => { S.deleteText = e.target.value; }} /></label>
    ${S.deleteErr ? html`<span class="err">${S.deleteErr}</span>` : null}
    <div class="btns"><button class="btn" onClick=${() => update(resetCard)}>Nei, behold</button><button class="btn danger" onClick=${() => A.deleteYes(it.id)}>Ja, slett</button></div>
    <span class="small">Avtalen fjernes helt, også fra kalenderen. ${N(other())} får beskjed om at du slettet den, med begrunnelsen.</span></div>`;
}
// A finished appointment: one line that unfolds to its details.
function DoneLine({ it, readOnly }) {
  const open = S.openCard === it.id;
  const ticked = it.done && !autoDone(Object.assign({}, it, { done: false }));
  return html`<div data-flip=${it.id}>
    <button class="lline done" aria-expanded=${String(open)} onClick=${() => A.toggleCard(it.id)}>
      <span class=${'lw ' + whoClass(it.who)}>${whoLabel(it.who)}</span>
      <span class="ct"><strong>${shortTime(it)}</strong> ${it.title}</span>
      <span class="ck">${isConf(it) ? html`<${Ico} n="check" />` : html`<span class="small" style="font-weight:700">?</span>`}</span>
    </button>
    <${Collapse} open=${open}><div class="dets donedets">
      ${it.desc ? html`<span class="desc">${it.desc}</span>` : null}
      ${placeView(it)}${legsView(it)}
      <div class="chips"><span class=${'chip ' + whoClass(it.who)}>Hvem: ${whoText(it.who)}</span><span class="sp"></span>${statusChip(it)}</div>
      <${Thread} it=${it} past=${true} />
      ${!readOnly && ticked ? html`<button class="link" onClick=${() => A.undoDone(it.id)}>Angre gjennomført</button>` : null}
    </div><//>
  </div>`;
}

// ---------- Views ----------
function statusChip(it) {
  if (isConf(it)) return html`<span class="st st-ok"><${Ico} n="checkSm" /> Bekreftet</span>`;
  if (needsMe(it)) return html`<span class="st st-me">${it.note && it.noteBy !== me() ? 'Endret · ' : ''}Venter på deg</span>`;
  return html`<span class="st st-wait">Venter på ${N(other())}</span>`;
}
function oneLine(it, onClick, extra, cls) {
  const inner = html`<span class=${'lw ' + whoClass(it.who)}>${whoLabel(it.who)}</span>
    <span class="ct"><strong>${shortTime(it)}</strong> ${it.title}</span>
    <span class="ck">${isConf(it) ? html`<${Ico} n="check" />` : html`<span class="small" style="font-weight:700">?</span>`}</span>${extra || ''}`;
  return onClick
    ? html`<button key=${it.id} data-flip=${it.id} class=${'lline ' + (cls || '')} onClick=${onClick}>${inner}</button>`
    : html`<div key=${it.id} data-flip=${it.id} class=${'lline ' + (cls || '')}>${inner}</div>`;
}
function placeView(it) {
  if (!it.where) return null;
  if (!(it.lat && it.lng) && !/^https?:\/\//i.test(it.where)) return html`<div class="place"><${Ico} n="pin" cls="pin" /><span class="addr">${it.where}</span></div>`;
  const addr = it.whereAddr || it.where;
  const dest = it.lat && it.lng ? it.lat + ',' + it.lng : '';
  const href = dest ? 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(dest) : it.where;
  return html`<a class="place" href=${href} target="_blank" rel="noopener">
    ${it.mapUrl ? html`<img src=${it.mapUrl} alt="" loading="lazy" onError=${e => e.target.remove()} />` : html`<${Ico} n="pin" cls="pin" />`}
    <span class="addr">${addr}<span class="dir">Veibeskrivelse ›</span></span></a>`;
}
function legsView(it) {
  if (!it.drive && !it.pick) return null;
  return html`<div class="legs">
    ${it.drive ? html`<span><${Ico} n="car" /> Kjører dit: <strong>${whoLabel(it.drive)}</strong> kl. ${it.driveAt}</span>` : null}
    ${it.pick ? html`<span><${Ico} n="car" /> Henter: <strong>${whoLabel(it.pick)}</strong> kl. ${it.pickAt}</span>` : null}
  </div>`;
}

function Header() {
  const count = myNeeds().length;
  const weeks = [];
  if (S.weekOpen) {
    for (let w = -S.data.weeksBack; w <= S.data.weeksAhead; w++) {
      const mstart = w > -S.data.weeksBack && weekMonday(w - 1).getMonth() !== weekMonday(w).getMonth();
      weeks.push(html`<button key=${w} class=${(w === S.week ? 'cur ' : '') + (mstart ? 'mstart' : '')} onClick=${() => changeWeek(w, w < S.week ? 'prev' : 'next')}>${wLabel(w)}${w === 0 ? '  (nå)' : ''}</button>`);
    }
  }
  const title = S.tab === 'plan' ? 'Planlegg' : S.tab === 'msg' ? 'Beskjeder' : 'Ukesoversikt';
  return html`<header>
    <div class="hrow"><div style="display:flex;flex-direction:column;gap:2px"><span class="hello">Hei, ${N(me())}</span><span class="htitle">${title}</span></div>
      <div class="icons">
        <button class="ibtn" onClick=${A.theme} aria-label=${S.theme === 'dark' ? 'Bytt til lys modus' : 'Bytt til mørk modus'}><${Ico} n=${S.theme === 'dark' ? 'sun' : 'moon'} /></button>
        <button class="ibtn" onClick=${() => update(s => { s.panel = true; s.weekOpen = false; })} aria-label=${'Varsler' + (count ? ', ' + count + ' nye' : '')}><${Ico} n="bell" />${count ? html`<span class="badge">${count}</span>` : null}</button>
      </div></div>
    ${S.tab === 'msg' ? null : html`<div class="weeknav">
      <button class="ibtn" aria-label="Forrige uke" disabled=${S.week <= -S.data.weeksBack} onClick=${() => changeWeek(S.week - 1, 'prev')}><${Ico} n="left" /></button>
      <button class="weekbtn" aria-expanded=${String(S.weekOpen)} onClick=${() => update(s => { s.weekOpen = !s.weekOpen; })}><span>${wLabel(S.week)}</span><${Chev} open=${S.weekOpen} /></button>
      <button class="ibtn" aria-label="Neste uke" disabled=${S.week >= S.data.weeksAhead} onClick=${() => changeWeek(S.week + 1, 'next')}><${Ico} n="right" /></button>
    </div>`}
    ${S.weekOpen && S.tab !== 'msg' ? html`<div class="weekmenu">${weeks}</div>` : null}
  </header>`;
}

function Banner() {
  const n = myNeeds().length, c = S.data.notes.length;
  if (!n && !c) return null;
  return html`<button class="banner" onClick=${() => update(s => { s.panel = true; })}><span class="lines">
    ${n ? html`<span>${n} ting venter på svar fra deg</span>` : null}
    ${c ? html`<span>${c}${c === 1 ? ' ny endring' : ' nye endringer'} til informasjon</span>` : null}
  </span><${Ico} n="right" /></button>`;
}

// ----- Plan -----
function PlanDay({ date }) {
  const d = dayIdx(date);
  const all = itemsOn(date);
  const active = all.filter(it => !isDone(it)), done = all.filter(isDone);
  const pend = active.filter(it => !isConf(it));
  const open = S.openDay === date;
  const isPast = date < S.data.today;
  const waitMe = pend.filter(needsMe).length;
  let sum = !all.length ? 'Ingen avtaler'
    : waitMe ? waitMe + ' venter på deg'
    : pend.length ? pend.length + ' venter på ' + N(other())
    : active.length ? active.length + (active.length === 1 ? ' avtale, bekreftet' : ' avtaler, bekreftet')
    : done.length + ' gjennomført';
  if (isPast) sum = !all.length ? 'Ingen avtaler' : countLabel(all.length);
  const tiles = isPast ? [] : tileList(date, d);
  const tileChanged = tiles.some(t => t.changed);
  const sel = tiles.find(t => S.tileEdit === date + '|' + t.k);
  return html`<section class=${'day' + (open ? ' open' : '') + (isPast ? ' past' : '')}>
    <button class="dayhead" aria-expanded=${String(open)} onClick=${() => A.toggleDay(date)}><span class="t">
      <span class="dname">${DAYN[d]} <span class="dt">${dLabel(pd(date))}</span>${date === S.data.today ? html`<span class="today">I dag</span>` : null}</span>
      <span class="sum">${sum}${tileChanged && !open ? ' · endret oppsett' : ''}</span></span><${Chev} open=${open} /></button>
    <${Collapse} open=${open}>
      ${isPast ? html`<div class="daybody">${all.length ? all.map(it => oneLine(it, () => openItem(it.id), null, 'done')) : html`<span class="small" style="padding:8px 0">Ingen avtaler denne dagen.</span>`}</div>`
      : html`<div class="daybody">
        ${done.length ? html`<div class="donesec"><${SlideGroup} gkey=${'pdone|' + date} label=${'Gjennomført · ' + done.length}>${done.map(it => oneLine(it, () => openItem(it.id), null, 'done'))}<//></div>` : null}
        ${active.map(it => html`<${SwipeCard} key=${it.id} it=${it} />`)}
        ${S.adding === date ? html`<${ItemForm} p="f" />` : html`<button class="addbtn" onClick=${() => A.startAdd(date)}><${Ico} n="plus" />Ny avtale</button>`}
        ${tiles.length ? html`
          <button class="tilerow" aria-expanded=${String(S.tilesOpen)} onClick=${() => update(s => { s.tilesOpen = !s.tilesOpen; s.tileEdit = null; })}><span class="l">Middag, bil og barnehage</span>${tileChanged ? html`<span class="tag">Endret</span>` : null}<${Chev} open=${S.tilesOpen} /></button>
          <${Collapse} open=${S.tilesOpen}>
            <div class="tiles">${tiles.map(t => {
              const key = date + '|' + t.k;
              return html`<button key=${t.k} class=${'tile ' + (t.val ? whoClass(t.val) : 'c-none') + (t.changed ? ' changed' : '') + (S.tileEdit === key ? ' sel' : '')} onClick=${() => update(s => { s.tileEdit = s.tileEdit === key ? null : key; })}><span class="tl">${t.label}</span><span class="tv">${tileText(t)}</span></button>`;
            })}</div>
            <${Collapse} open=${!!sel}>${sel ? html`<div class="chooser" style="margin-top:8px"><span class="small" style="font-size:13px;font-weight:600;color:var(--text2)">${sel.label} – hvem?</span><div class="row wrap">
              ${sel.options.map(o => html`<button key=${o} class=${'wchip ' + (o ? whoClass(o) : 'c-other')} aria-pressed=${String(sel.val === o)} onClick=${() => A.tilePick(date, sel.k, o)}>${o ? whoLabel(o) : 'Ikke satt'}</button>`)}
            </div><span class="small">${N(other())} får beskjed.</span></div>` : null}<//>
          <//>` : null}
      </div>`}
    <//>
  </section>`;
}
function planWeek(o, first) {
  const mon = weekMonday(o), today = S.data.today;
  const dates = [];
  for (let d = 0; d < 7; d++) dates.push(ds(addDays(mon, d)));
  const count = list => list.reduce((n, x) => n + itemsOn(x).length, 0);
  const boxes = list => list.map(x => html`<${PlanDay} key=${x} date=${x} />`);
  const ti = dates.indexOf(today);
  if (ti === -1) return html`${first ? html`<${Banner} />` : null}${boxes(dates)}`;
  const before = dates.slice(0, ti), rest = dates.slice(ti + 2);
  const tomorrow = ti < 6 ? dates[ti + 1] : ds(addDays(pd(today), 1));
  let tail;
  if (rest.length) {
    tail = html`<h3 class="dsec">Resten av uka</h3><${SlideGroup} gkey="planRest" label=${DAYN[dayIdx(rest[0])] + '–' + DAYN[6].toLowerCase() + ' · ' + countLabel(count(rest))}>${boxes(rest)}<//>`;
  } else {
    const next = [];
    for (let k = 0; k < 7; k++) next.push(ds(addDays(weekMonday(o + 1), k)));
    const nx = next.filter(x => x !== tomorrow);
    tail = html`<h3 class="dsec">Neste uke</h3><${SlideGroup} gkey="planNext" label=${wLabel(o + 1) + ' · ' + countLabel(count(nx))}>${boxes(nx)}<//>`;
  }
  return html`${first ? html`<${Banner} />` : null}
    ${before.length ? html`<${SlideGroup} gkey="planPast" label=${'Tidligere denne uka · ' + countLabel(count(before))}>${boxes(before)}<//>` : null}
    <h3 class="dsec">I dag</h3><${PlanDay} date=${today} />
    <h3 class="dsec">I morgen</h3><${PlanDay} date=${tomorrow} />
    ${tail}`;
}
// Weeks below the current one. The week right after is open; later weeks start folded.
function moreWeeks(fn, skipNext) {
  const out = [];
  for (let k = skipNext ? 2 : 1; k <= S.moreWeeks && S.week + k <= S.data.weeksAhead; k++) {
    const o = S.week + k, rel = o === 0 ? 'denne uka' : o === 1 ? 'neste uke' : o > 1 ? 'om ' + o + ' uker' : '';
    if (k === 1) {
      out.push(html`<h2 class="wkhead" key=${'h' + o}>${wLabel(o)}<span>(${rel})</span></h2>`, fn(o, false));
    } else {
      let n = 0;
      for (let d = 0; d < 7; d++) n += itemsOn(ds(addDays(weekMonday(o), d))).length;
      out.push(html`<div class="wkgrp" key=${'g' + o}><${SlideGroup} gkey=${'wk' + o} label=${html`<span class="wkl">${wLabel(o)}</span><span class="wkn">${rel} · ${n ? countLabel(n) : 'ingen avtaler'}</span>`}>${fn(o, false)}<//></div>`);
    }
  }
  if (S.week + S.moreWeeks < S.data.weeksAhead) out.push(html`<${LoadMore} key="more" />`);
  return out;
}
// Loads the next week whenever the end of the list comes into view.
function LoadMore() {
  const ref = useRef();
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) update(s => { s.moreWeeks++; }); }, { rootMargin: '400px' });
    io.observe(ref.current);
    return () => io.disconnect();
  });
  return html`<div ref=${ref} style="height:1px"></div>`;
}
function PlanView() {
  const ti = S.week === 0 ? dayIdx(S.data.today) : -1;
  return html`${planWeek(S.week, true)}${moreWeeks(planWeek, ti >= 5)}
    <button class="rem" onClick=${A.cycleRem}><${Ico} n="bellSm" /><span>Påminnelse: <strong>${REM[S.data.reminder]}</strong></span></button>
    <p class="hint">Tips: dra et kort mot venstre for å slette det.</p>
    ${DEMO ? html`<div class="demo">Mockup med testdata (v${VERSION}). Ingenting lagres.<br /><button onClick=${A.mockSwitch}>Vis som ${N(other())}</button></div>` : null}`;
}

// ----- Ukesoversikt -----
function Thread({ it, past }) {
  const t = threadOf(it);
  return html`
    ${t.length ? html`<div class="thread">${t.map((c, i) => html`<div key=${i} data-flip=${it.id + '-c' + i} class=${'tmsg ' + (c.by === me() ? 'mine' : '')}><span class="tby">${N(c.by) || ''}${c.at ? ' · ' + msgTime(c.at) : ''}</span>${c.text}</div>`)}</div>` : null}
    ${past ? null : S.replying === it.id ? html`<div class="reply"><textarea class="inp grow" id="replyIn" rows="2" placeholder=${'Svar ' + N(other()) + '…'} value=${S.replyText} onInput=${e => { S.replyText = e.target.value; grow(e); }}></textarea>
      <div class="btns"><button class="btn fixed" onClick=${() => update(s => { s.replying = null; })}>Avbryt</button><button class="btn pri" onClick=${() => A.replySend(it.id)}>Send svar</button></div></div>`
    : S.editing !== it.id && S.cancelling !== it.id && S.deleting !== it.id && S.doneAsk !== it.id ? html`<button class="undo" onClick=${() => A.replyOpen(it.id)}>${t.length ? 'Svar' : 'Skriv en kommentar'}</button>` : null}`;
}
function Actions({ it }) {
  const canUndo = okOf(it, me()) && it.by !== me();
  if (S.doneAsk === it.id) {
    return html`<div class="donebox2"><span class="q">Er aktiviteten gjennomført?</span><div class="btns"><button class="btn" onClick=${() => update(s => { s.doneAsk = null; })}>Nei</button><button class="btn pri" onClick=${() => A.doneYes(it.id)}>Ja</button></div></div>`;
  }
  if (S.editing === it.id) return html`<${ItemForm} p="e" it=${it} />`;
  if (S.cancelling === it.id) {
    return html`<div class="cancelbox"><span class="q">Avlyse «${it.title}»?</span>
      <label class="f">Hvorfor?<input class="inp" type="text" placeholder="F.eks. Ble flyttet til neste uke" value=${S.cancelText} onInput=${e => { S.cancelText = e.target.value; }} /></label>
      ${S.cancelErr ? html`<span class="err">${S.cancelErr}</span>` : null}
      <div class="btns"><button class="btn" onClick=${() => update(resetCard)}>Nei, behold</button><button class="btn danger" onClick=${() => A.cancelYes(it.id)}>Ja, avlys</button></div>
      <span class="small">Avtalen fjernes fra kalenderen, og ${N(other())} får beskjed.</span></div>`;
  }
  if (S.deleting === it.id) return html`<${DeleteBox} it=${it} />`;
  if (needsMe(it)) {
    const q = it.note && it.noteBy !== me() ? N(it.noteBy) + ' foreslår en endring. Stemmer det?' : N(it.by) + ' har lagt inn dette. Stemmer det?';
    return html`<span class="q">${q}</span><div class="btns"><button class="btn" onClick=${() => A.edit(it.id)}>Nei, endre</button><button class="btn pri" onClick=${() => A.yes(it.id)}>Ja, stemmer</button></div>
      <div class="acts2"><span></span><button class="link danger" onClick=${() => A.startDelete(it.id)}>Slett</button></div>`;
  }
  return html`<div class="acts"><button class="btn sm" onClick=${() => A.edit(it.id)}>Endre</button><span class="grow"></span><button class="btn sm ghostdanger" onClick=${() => A.startCancel(it.id)}>Avlys</button></div>
    <div class="acts2">${canUndo ? html`<button class="link" onClick=${() => A.undo(it.id)}>Angre «ja»</button>` : html`<span></span>`}<button class="link danger" onClick=${() => A.startDelete(it.id)}>Slett</button></div>`;
}
// mode: 'past' (read only), 'today' (with a done box) or 'future'
function Card({ it, mode }) {
  const past = mode === 'past';
  const open = S.openCard === it.id;
  return html`<article class=${'card compact' + (open ? ' isopen' : '')} data-flip=${it.id} id=${'item-' + it.id}>
    <div class="chead" role="button" tabindex="0" aria-expanded=${String(open)} onClick=${() => A.toggleCard(it.id)} onKeyDown=${e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); A.toggleCard(it.id); } }}>
      <div class="ctop"><span class="ttl">${it.title}</span><span class="time">${shortTime(it)}</span>
        ${mode === 'today' && isConf(it) ? html`<button class="donebox" aria-label="Marker som gjennomført" onClick=${e => { e.stopPropagation(); A.askDone(it.id); }}></button>` : null}</div>
      <div class="chips" style="flex-wrap:nowrap"><span class=${'chip ' + whoClass(it.who)}>Hvem: ${whoText(it.who)}</span>
        ${it.src === 'kalender' ? html`<span class="calmark" title="Lagt inn fra kalenderen" aria-label="Lagt inn fra kalenderen"><${Ico} n="cal" /></span>` : null}
        <span class="sp"></span>${statusChip(it)}</div>
    </div>
    <${Collapse} open=${open}>
      <div class="dets">
        ${it.desc ? html`<span class="desc">${it.desc}</span>` : null}
        ${placeView(it)}${legsView(it)}
        <${Thread} it=${it} past=${past} />
        ${past ? null : html`<div class="actions"><${Actions} it=${it} /></div>`}
      </div>
    <//>
  </article>`;
}
function overviewWeek(o) {
  const mon = weekMonday(o), today = S.data.today;
  const pastDays = [], rest = [];
  for (let d = 0; d < 7; d++) {
    const date = ds(addDays(mon, d));
    (date < today ? pastDays : rest).push({ d, date, all: itemsOn(date) });
  }
  const out = [];
  if (pastDays.length) {
    const n = pastDays.reduce((a, x) => a + x.all.length, 0);
    const body = html`<div class="pastwrap">${pastDays.map(x => {
      const open = S.pastDay === x.date;
      return html`<div key=${x.date}><button class="pday" aria-expanded=${String(open)} onClick=${() => update(s => { s.pastDay = s.pastDay === x.date ? null : x.date; })}><span class="s">${DAYN[x.d]} <span class="n">${dLabel(pd(x.date))} · ${x.all.length ? countLabel(x.all.length) : 'ingen avtaler'}</span></span><${Chev} open=${open} /></button>
        <${Collapse} open=${open}><section class="ovday past" style="padding-top:8px">${x.all.length ? x.all.map(it => html`<${Card} key=${it.id} it=${it} mode="past" />`) : html`<span class="small" style="padding:4px">Ingen avtaler denne dagen.</span>`}</section><//></div>`;
    })}</div>`;
    out.push(rest.length ? html`<${SlideGroup} key="ovPast" gkey="ovPast" label=${'Tidligere denne uka · ' + countLabel(n)}>${body}<//>` : body);
  }
  rest.forEach(x => {
    const isToday = x.date === today;
    if (!x.all.length && !isToday) return;
    const todo = x.all.filter(it => !isDone(it)), done = x.all.filter(isDone);
    out.push(html`<section class="ovday" key=${x.date}><h2>${DAYN[x.d]} <span>${dLabel(pd(x.date))}</span>${isToday ? html` <span class="today" style="vertical-align:2px">I dag</span>` : null}</h2>
      ${done.length ? html`<${SlideGroup} gkey=${'done|' + x.date} label=${'Gjennomført · ' + done.length}>${done.map(it => html`<${DoneLine} key=${it.id} it=${it} />`)}<//>` : null}
      ${isToday ? html`<span class="sect" style="margin-top:6px">Kommende</span>` : null}
      ${todo.length ? todo.map(it => html`<${Card} key=${it.id} it=${it} mode=${isToday ? 'today' : 'future'} />`) : isToday ? html`<span class="small" style="padding:0 4px">Ingenting mer i dag.</span>` : null}
    </section>`);
  });
  return out.length ? out : html`<div class="empty">Ingen avtaler registrert.</div>`;
}
const OverviewView = () => html`${overviewWeek(S.week)}`;

// ----- Item form (new and edit) -----
function TimeBtn({ f, p, k, label }) {
  const open = S.timePick && S.timePick.p === p && S.timePick.k === k;
  const dis = f.allDay && (k === 'start' || k === 'end');
  const btn = html`<button type="button" class=${'inp tbtn' + (open ? ' on' : '')} disabled=${dis} aria-label=${label || TLABEL[k]} onClick=${() => update(s => { s.timePick = open ? null : { p, k }; })}>${f[k] || '--:--'}</button>`;
  return label ? html`<label class="f">${label}${btn}</label>` : btn;
}
const TLABEL = { start: 'Fra', end: 'Til', driveAt: 'Kjøring', pickAt: 'Henting' };
function TimePicker({ f, p, keys }) {
  keys = keys || ['start', 'end'];
  if (!S.timePick || S.timePick.p !== p || keys.indexOf(S.timePick.k) === -1) return null;
  if (f.allDay && (S.timePick.k === 'start' || S.timePick.k === 'end')) return null;
  const k = S.timePick.k, cur = (f[k] || '12:00').split(':');
  const hours = [], minutes = [];
  for (let i = 6; i < 30; i++) hours.push(pad(i % 24));
  for (let j = 0; j < 60; j += 5) minutes.push(pad(j));
  const set = (part, v) => update(s => {
    f.warn = null;
    const c = (f[k] || '12:00').split(':');
    f[k] = part === 'h' ? v + ':' + c[1] : c[0] + ':' + v;
    afterTime(f, k);
    if (part === 'm') s.timePick = null;
  });
  const done = () => update(s => { s.timePick = null; });
  return html`<div class="tback" onClick=${done}></div><div class="tsheet" role="dialog" aria-label="Velg tid">
    <div class="hrow"><span class="tval">${TLABEL[k]} <strong>${f[k] || '--:--'}</strong></span><button type="button" class="btn sm pri" style="flex:0 0 auto" onClick=${done}>Ferdig</button></div>
    <span class="small">Time</span><div class="tgrid h">${hours.map(hh => html`<button key=${hh} type="button" class=${'tchip' + (hh === cur[0] ? ' on' : '')} onClick=${() => set('h', hh)}>${hh}</button>`)}</div>
    <span class="small">Minutter</span><div class="tgrid m">${minutes.map(mm => html`<button key=${mm} type="button" class=${'tchip' + (mm === cur[1] ? ' on' : '')} onClick=${() => set('m', mm)}>${mm}</button>`)}</div></div>`;
}
function LegBox({ f, p }) {
  if (!f.showDrive) return html`<button class="link" onClick=${() => update(() => { f.showDrive = true; legDefaults(f); f.warn = null; })}><${Ico} n="car" /> + Kjøring og henting</button>`;
  const chips = leg => [me(), other(), 'both', 'grand'].map(w => html`<button key=${w} type="button" class=${'wchip ' + whoClass(w)} aria-pressed=${String(f[leg] === w)} onClick=${() => update(() => { f[leg] = w; f.warn = null; })}>${whoLabel(w)}</button>`)
    .concat(html`<button key="none" type="button" class="wchip c-other" aria-pressed=${String(!f[leg])} onClick=${() => update(() => { f[leg] = ''; f.warn = null; })}>Ingen</button>`);
  return html`<div class="legbox">
    <div class="legrow"><div class="lh"><span>Kjører dit</span><${TimeBtn} f=${f} p=${p} k="driveAt" label="" /></div><div class="row wrap">${chips('drive')}</div></div>
    <${TimePicker} f=${f} p=${p} keys=${['driveAt']} />
    <div class="legrow"><div class="lh"><span>Henter</span><${TimeBtn} f=${f} p=${p} k="pickAt" label="" /></div><div class="row wrap">${chips('pick')}</div></div>
    <${TimePicker} f=${f} p=${p} keys=${['pickAt']} />
    ${isPersonal(f) && (f.drive === f.who || f.pick === f.who) ? html`<p class="small" style="margin:6px 2px">${N(f.who)} kjører selv. Det vises i appen, men blir ikke egne oppføringer i kalenderen.</p>` : null}
    <button class="link" onClick=${() => update(() => { f.showDrive = false; f.driveDismissed = true; f.drive = ''; f.pick = ''; f.warn = null; })}>Fjern kjøring og henting</button></div>`;
}
function ItemForm({ p, it }) {
  const isEdit = p === 'e', f = formOf(p);
  const err = isEdit ? S.editErr : S.formErr;
  const needC = isEdit && (isConf(it) || it.by !== me());
  const set = (k, rerender) => e => { f[k] = e.target.value; f.warn = null; if (k === 'title' || k === 'start') S.formDup = null; if (e.target.classList.contains('grow')) grow(e); if (rerender) update(); };
  const onChange = k => e => {
    if (k === 'where' && whereLooksLikeText(e.target.value)) { update(); return; }
    if ((k === 'title' || k === 'desc') && !f.showDrive && !f.driveDismissed && !isPersonal(f) && DRIVE_WORDS.test((f.title || '') + ' ' + (f.desc || ''))) update(() => { f.showDrive = true; legDefaults(f); });
  };
  const whoChip = w => html`<button key=${w} type="button" class=${'wchip ' + whoClass(w)} aria-pressed=${String(f.who === w)} onClick=${() => update(() => { f.who = w; })}>${w === 'other' ? 'Annen…' : whoLabel(w)}</button>`;
  return html`<div class=${isEdit ? '' : 'form'} style="display:flex;flex-direction:column;gap:12px">
    <label class="f">Hva?<input class="inp" data-f=${isEdit ? null : 'title'} type="text" placeholder="F.eks. Tannlegen" value=${f.title} onInput=${set('title')} onChange=${onChange('title')} /></label>
    <label class="f">Hvor?<input class="inp" type="text" placeholder="Adresse eller Google Maps-lenke (valgfritt)" value=${f.where} onInput=${set('where')} onChange=${onChange('where')} /></label>
    ${whereLooksLikeText(f.where) ? html`<div class="warn">Dette ser ut som en beskrivelse, ikke et sted. <button class="link" style="min-height:32px" onClick=${() => update(() => { f.desc = (f.desc ? f.desc + '\n' : '') + f.where; f.where = ''; f.showDesc = true; })}>Flytt til Beskrivelse</button></div>` : null}
    ${isEdit ? html`<label class="f">Dato<input class="inp" type="date" value=${f.date} onInput=${set('date')} /></label>` : null}
    <div class="times"><${TimeBtn} f=${f} p=${p} k="start" label="Fra" /><${TimeBtn} f=${f} p=${p} k="end" label="Til" /></div>
    <label class="allday"><input type="checkbox" checked=${f.allDay} onChange=${() => update(() => { f.allDay = !f.allDay; f.warn = null; })} />Hele dagen</label>
    <${TimePicker} f=${f} p=${p} />
    <fieldset><legend>Hvem tar det?</legend><div class="row wrap">${whoOptions(f.who).map(whoChip)}</div></fieldset>
    ${f.who === 'other' ? html`<label class="f">Hvem?<input class="inp" type="text" placeholder="F.eks. en venn" value=${f.other} onInput=${set('other')} /></label>` : null}
    <${LegBox} f=${f} p=${p} />
    ${f.showDesc || isEdit ? html`<label class="f">Beskrivelse<textarea class="inp grow" rows=${rowsFor(f.desc)} placeholder="Detaljer" value=${f.desc} onInput=${set('desc')} onChange=${onChange('desc')}></textarea></label>`
      : html`<button class="link" onClick=${() => update(() => { f.showDesc = true; })}>+ Legg til beskrivelse</button>`}
    ${isEdit ? html`<label class="f">${needC ? 'Hvorfor endres det?' : 'Kommentar (valgfritt)'}<textarea class="inp grow" rows=${rowsFor(f.comment)} placeholder="F.eks. Jeg må jobbe sent" value=${f.comment} onInput=${set('comment')}></textarea></label>` : null}
    ${f.allDay ? html`<span class="small">Heldagsavtaler legges i Husholdning-kalenderen.</span>` : null}
    ${err ? html`<div class="errbox"><span class="err">${err}</span>${!isEdit && S.formDup ? html`<button class="link" onClick=${() => { const id = S.formDup; update(s => { s.adding = null; s.formErr = ''; s.formDup = null; }); openItem(id); }}>Vis avtalen</button>` : null}</div>` : null}
    ${f.warn ? html`<div class="warn">${f.warn.map((w, i) => html`<span key=${i}>${w}<br /></span>`)}</div>` : null}
    <div class="btns"><button class="btn fixed" onClick=${isEdit ? A.cancelEdit : A.cancelAdd}>Avbryt</button>
      <button class="btn pri" disabled=${!isEdit && !!S.formDup} onClick=${() => (isEdit ? A.saveEdit(it.id) : A.saveAdd())}>${f.warn ? 'Lagre likevel' : 'Send til ' + N(other())}</button></div>
  </div>`;
}

// ----- Messages -----
function MessagesView() {
  const ms = (S.data.messages || []).slice().sort((a, b) => (a.created < b.created ? -1 : 1));
  return html`<div class="msgs">
    ${!ms.length ? html`<div class="empty">Ingen beskjeder ennå. Skriv en kort beskjed, f.eks. «Husk å sette ut bossdunken».</div>` : null}
    ${ms.map(m => {
      const mine = m.from === me();
      return html`<div key=${m.id} data-flip=${m.id} style=${'display:flex;flex-direction:column;gap:2px;' + (mine ? 'align-items:flex-end' : 'align-items:flex-start')}>
        <span class=${'bmeta' + (mine ? ' mine' : '')}>${N(m.from)} · ${msgTime(m.created)}</span><div class=${'bub ' + (mine ? 'mine' : 'theirs')} style="max-width:82%">${m.text}</div></div>`;
    })}
  </div>
  <div class="compose"><div class="in"><textarea class="inp" id="msgIn" rows="1" placeholder="Skriv en beskjed…" maxlength="500" value=${S.msgDraft}
    onInput=${e => { S.msgDraft = e.target.value; const t = e.target; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; }}></textarea>
    <button class="btn pri" style="flex:0 0 auto;width:52px;padding:0" aria-label="Send" onClick=${A.sendMsg}><${Ico} n="send" /></button></div></div>`;
}

// ----- Varsler panel -----
function PushBox() {
  if (DEMO || !S.data.firebase) return null;
  if (isIOS() && !isStandalone()) return html`<div class="pushbox">For å få varsler på iPhone: trykk Del-knappen i Safari og velg «Legg til på Hjem-skjerm». Åpne appen derfra og trykk på bjella.</div>`;
  if (!pushSupported()) return null;
  if (Notification.permission === 'denied') return html`<div class="pushbox">Varsler er blokkert for appen. Slå dem på i telefonens innstillinger.</div>`;
  if (Notification.permission === 'granted' && S.data.pushDevices > 0) return null;
  return html`<div class="pushbox"><span>Få beskjed med en gang når noe er lagt inn eller endret.</span><button class="btn pri" disabled=${S.pushBusy} onClick=${() => enablePush(false)}>${S.pushBusy ? 'Slår på…' : 'Slå på varsler'}</button></div>`;
}
function Panel() {
  const [mounted, closing] = useExit(S.panel, 240);
  if (!mounted) return null;
  const needs = myNeeds(), notes = S.data.notes;
  const close = () => update(s => { s.panel = false; });
  return html`<div class=${'overlay' + (closing ? ' closing' : '')} onClick=${e => { if (e.target === e.currentTarget) close(); }}>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Varsler">
      <div class="hrow"><h2>Varsler</h2><button class="ibtn" aria-label="Lukk" onClick=${close}><${Ico} n="close" /></button></div>
      <${PushBox} />
      ${!needs.length && !notes.length ? html`<div class="empty">Ingenting nytt. Alt er avklart.</div>` : null}
      ${needs.length ? html`<h3>Trenger svar fra deg</h3>${needs.map(it => html`<div key=${it.id} data-flip=${'n-' + it.id} class="ncard"><span class="time">${longDate(it.date)} · ${timeText(it)}</span>
        <div class="ntop"><span class="ttl">${it.title}</span><span class=${'chip ' + whoClass(it.who)}>${whoText(it.who)}</span></div>
        ${it.note && it.noteBy !== me() ? html`<span class="note">${N(it.noteBy)}: «${it.note}»</span>` : null}
        <div class="btns"><button class="btn" onClick=${() => openItem(it.id, true)}>Nei, endre</button><button class="btn pri" onClick=${() => A.yes(it.id)}>Ja, stemmer</button></div></div>`)}` : null}
      ${notes.length ? html`<div class="hrow"><h3>Til informasjon</h3><button class="link" onClick=${A.seenAll}>Merk alle som sett</button></div>
        ${notes.map(n => {
          const exists = n.itemId && S.data.items.some(i => i.id === n.itemId);
          return html`<div key=${n.id} data-flip=${n.id} class="ncard"><span class="ntext">${n.text}</span><div class="row"><span class="small" style="flex:1 1 auto">${(n.created || '').replace('T', ' kl. ')}</span>
            ${exists ? html`<button class="btn sm" onClick=${() => A.noteGo(n.id, n.itemId)}>Vis</button>` : null}<button class="btn sm" onClick=${() => A.seen(n.id)}>OK</button></div></div>`;
        })}` : null}
    </div></div>`;
}

function NavBar() {
  const tab = (t, icon, label, badge) => html`<button aria-pressed=${String(S.tab === t)} onClick=${() => A.tab(t)}><${Ico} n=${icon} /><span>${label}</span>${badge ? html`<span class="tabbadge">${badge}</span>` : null}</button>`;
  const unread = S.tab !== 'msg' && S.data.unreadMessages;
  return html`<nav aria-label="Faner"><div class="in">${tab('plan', 'pen', 'Plan')}${tab('ov', 'list', 'Ukesoversikt')}${tab('msg', 'chat', 'Beskjeder', unread)}</div></nav>`;
}

function App() {
  const [, force] = useReducer(x => x + 1, 0);
  rerender = force;
  useLayoutEffect(flipPlay);
  if (!CONN) {
    return html`<div class="center"><img src="icons/icon-192.png" alt="" width="72" height="72" style="border-radius:18px" /><h1>Ukeplanen</h1>
      <span>Lim inn den personlige lenken du har fått.</span>
      <input class="inp" id="linkIn" type="url" placeholder="https://…#k=…" autocomplete="off" onKeyDown=${e => { if (e.key === 'Enter') A.connect(); }} />
      ${S.connErr ? html`<span class="err">${S.connErr}</span>` : null}
      <button class="btn pri" style="max-width:420px;width:100%" onClick=${A.connect}>Koble til</button></div>`;
  }
  if (S.error && !S.data) {
    return html`<div class="center"><h1>Noe gikk galt</h1><span>${S.error}</span><button class="btn" onClick=${() => location.reload()}>Prøv igjen</button>
      <button class="link" style="align-self:center" onClick=${() => { store(CONN_KEY, null); CONN = null; S.data = null; S.error = null; history.replaceState(null, '', location.pathname); update(); }}>Koble fra</button></div>`;
  }
  if (!S.data) return html`<div class="center">Laster…</div>`;
  const view = S.tab === 'plan' ? html`<${PlanView} />` : S.tab === 'msg' ? html`<${MessagesView} />` : html`<${OverviewView} />`;
  return html`<${Header} />
    <main key=${S.tab + ':' + S.week} class=${'anim-' + S.anim}>${view}</main>
    <${NavBar} />
    <${Panel} />
    ${S.toast ? html`<div key=${S.toast.id} class=${'toast' + (S.tab === 'msg' ? ' up' : '')} role="status"><span>${S.toast.text}</span>${S.toast.action ? html`<button onClick=${S.toast.action.fn}>${S.toast.action.label}</button>` : null}</div>` : null}`;
}

// ---------- Global listeners ----------
document.addEventListener('keydown', e => { if (e.key === 'Escape' && (S.panel || S.weekOpen)) update(s => { s.panel = false; s.weekOpen = false; }); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !S.data) return;
  S.now = Date.now();
  if (!pending && S.editing === null && S.cancelling === null && S.deleting === null && S.adding === null) {
    api('getState').then(st => { if (!pending) { S.data = st; update(null, { flip: true }); } }).catch(() => {});
  } else update();
});
// Re-check the clock every minute so finished appointments move to Gjennomført.
setInterval(() => { if (S.data) update(s => { s.now = Date.now(); }, { flip: true }); }, 60000);
setInterval(() => {
  if (S.tab === 'msg' && S.data && document.visibilityState === 'visible' && !pending && !typing()) {
    api('getState').then(st => {
      if (pending) return;
      const newer = st.unreadMessages > 0;
      S.data = st; update(null, { flip: true }); scrollMsgs();
      if (newer) opt(d => { d.unreadMessages = 0; }, () => api('readMessages'));
    }).catch(() => {});
  }
}, 20000);

// ---------- Push ----------
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
let swReg = null;
if ('serviceWorker' in navigator && !DEMO) {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => { swReg = r; r.update(); }).catch(() => {});
}
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Kunne ikke laste ' + src)); document.head.appendChild(s); });
}
function enablePush(silent) {
  const fb = S.data.firebase;
  if (!fb || S.pushBusy) return;
  S.pushBusy = true; if (!silent) update();
  (Notification.permission === 'granted' ? Promise.resolve('granted') : Notification.requestPermission()).then(perm => {
    if (perm !== 'granted') throw new Error('Varsler ble ikke tillatt.');
    return loadScript('https://www.gstatic.com/firebasejs/' + FB_VERSION + '/firebase-app-compat.js');
  }).then(() => loadScript('https://www.gstatic.com/firebasejs/' + FB_VERSION + '/firebase-messaging-compat.js'))
    .then(() => { if (!firebase.apps.length) firebase.initializeApp(fb.config); return swReg ? swReg : navigator.serviceWorker.ready; })
    .then(reg => firebase.messaging().getToken({ vapidKey: fb.vapidKey, serviceWorkerRegistration: reg }))
    .then(token => { if (!token) throw new Error('Fikk ingen nøkkel for varsler.'); store('ukeplanen-push', token); return api('registerPush', token); })
    .then(st => {
      S.data = st; S.pushBusy = false;
      if (!silent) toast(st.pushTest === 'ok' || !st.pushTest ? 'Varsler er slått på' : 'Registrert, men testvarselet feilet: ' + String(st.pushTest).slice(0, 120));
      else update();
    }).catch(e => { S.pushBusy = false; if (!silent) toast(e && e.message ? e.message : 'Kunne ikke slå på varsler'); else update(); });
}
let autoPushTried = false;
function maybeReRegister() {
  if (autoPushTried || DEMO || !S.data || !S.data.firebase || !pushSupported()) return;
  if (Notification.permission !== 'granted' || S.data.pushDevices > 0) return;
  autoPushTried = true;
  enablePush(true);
}

// ---------- Demo data (only in the mockup or with #demo) ----------
const MOCK = (() => {
  if (!DEMO) return null;
  const t = new Date(), today = ds(t), mon = mondayOf(t);
  const on = (w, d) => ds(addDays(mon, w * 7 + d));
  // Times today relative to now, so one appointment has just passed (auto Gjennomført) and some are still ahead.
  const hm = h => { const x = Math.max(0, Math.min(23, h)); return pad(x) + ':00'; };
  const H = t.getHours();
  const NAMES = { p1: 'Ola', p2: 'Kari' };
  const db = {
    items: [
      { id: 'm1', date: on(0, 0), start: '16:30', end: '18:00', title: 'Foreldremøte', desc: 'Informasjonsmøte for foreldre.', who: 'both', by: 'p1', ok1: true, ok2: false, note: '', noteBy: '', src: 'kalender', allDay: false, where: 'Storgata 1, Oslo', whereAddr: 'Storgata 1, 0155 Oslo', lat: '59.9133', lng: '10.7522', mapUrl: '' },
      { id: 'm2', date: on(0, 1), start: '18:30', end: '21:00', title: 'Kjøring til trening', desc: 'Kjøre 18.30, hente 21.00.', who: 'p1', by: 'p1', ok1: true, ok2: true, note: '', noteBy: '', src: 'app', allDay: false, where: '' },
      { id: 'm3', date: on(0, 2), start: '11:00', end: '12:00', title: 'Tannlegen', desc: 'Kontroll, 2. etg.', who: 'p2', by: 'p1', ok1: true, ok2: false, note: '', noteBy: '', src: 'app', allDay: false, where: '' },
      { id: 'm5', date: today, start: hm(H - 4), end: hm(H - 3), title: 'Levere pakke på posten', desc: '', who: 'p2', by: 'p2', ok1: true, ok2: true, note: '', noteBy: '', src: 'app', allDay: false, where: '', done: true },
      { id: 'm9', date: today, start: hm(H - 3), end: hm(H - 2), title: 'Tannlege Julian', desc: 'Passerte for over en time siden, så den ligger under Gjennomført av seg selv.', who: 'p1', by: 'p1', ok1: true, ok2: true, note: '', noteBy: '', src: 'app', allDay: false, where: '' },
      { id: 'm6', date: today, start: hm(H + 1), end: hm(H + 2), title: 'Pokemon Showcase', desc: 'Eg kan og ta det hvis du fikser en god middag 🙂', who: 'Annen', by: 'p2', ok1: true, ok2: true, note: '', noteBy: '', src: 'app', allDay: false, where: 'Dalsnuten', drive: 'p2', driveAt: addMin(hm(H + 1), -30), pick: 'p2', pickAt: hm(H + 2) },
      { id: 'm7', date: today, start: hm(H + 2), end: hm(H + 3), title: 'Foreldremøte bhg.', desc: '', who: 'p1', by: 'p1', ok1: true, ok2: false, note: '', noteBy: '', src: 'app', allDay: false, where: '' },
      { id: 'm10', date: on(0, 2) > today ? on(0, 2) : ds(addDays(t, 1)), start: '17:00', end: '18:00', title: 'Padel', desc: '', who: 'p1', by: 'p1', ok1: true, ok2: true, note: '', noteBy: '', src: 'app', allDay: false, where: '' },
      { id: 'm11', date: ds(addDays(t, 2)), start: '08:00', end: '09:00', title: 'Elnett kommer', desc: 'Måleren i gangen.', who: 'p2', by: 'p2', ok1: true, ok2: true, note: '', noteBy: '', src: 'app', allDay: false, where: '' },
      { id: 'm8', date: on(1, 2), start: '18:50', end: '19:00', title: 'Vaske', desc: '', who: 'p2', by: 'p2', ok1: true, ok2: true, note: '', noteBy: '', src: 'app', allDay: false, where: 'Skal se Norges dummeste når jeg kommer hjem, så kan vi vaske etterpå' },
      { id: 'm4', date: on(0, 6), start: '', end: '', title: 'Farsdag', desc: 'Ønsker:\n- Sove lenge\n- Gå tur med ungene\n- Filmkveld', thread: [{ by: 'p1', text: 'Bestille mat eller gå ut og spise?', at: new Date(Date.now() - 7200000).toISOString() }, { by: 'p2', text: 'Vi skal i bursdag kl. 14, så regner med vi får mat der :-)', at: new Date(Date.now() - 3600000).toISOString() }], who: 'both', by: 'p2', ok1: true, ok2: true, note: '', noteBy: '', src: 'app', allDay: true, where: '' }
    ],
    tiles: {},
    notes: [{ id: 'n1', to: 'p2', text: 'Ola endret «Kjøring til trening»: hvem: Kari → Ola – «Jeg har fri likevel»', itemId: 'm2', created: today + 'T09:12', seen: false }],
    rem: { p1: 'sunday', p2: 'sunday' }, n: 10,
    messages: [{ id: 'b1', from: 'p1', text: 'Husk å legge pakken i postkassen før kl. 12!', created: new Date(Date.now() - 3600000).toISOString() }],
    read: { p1: new Date().toISOString(), p2: '' }
  };
  const oth = p => (p === 'p1' ? 'p2' : 'p1');
  const okF = p => (p === 'p1' ? 'ok1' : 'ok2');
  const note = (to, text, itemId) => db.notes.push({ id: 'n' + (db.n++), to, text, itemId: itemId || '', created: today + 'T12:00', seen: false });
  const get = id => db.items.find(i => i.id === id);
  const state = p => ({
    me: p, names: NAMES, today, weeksBack: 2, weeksAhead: 13,
    items: db.items.filter(i => !i.cancelled), tiles: db.tiles,
    defaults: { middag: ['p2', 'p2', 'p2', 'p2', 'p2', 'p2', 'p2'], bil: ['p1', 'p1', 'p1', 'p1', 'p1', 'p1', 'p1'], lev: ['p1', 'p1', 'p1', 'p1', 'p1', null, null], hent: ['p2', 'p2', 'p2', 'p2', 'p2', null, null] },
    tileOptions: { middag: ['p2', 'p1', 'both', 'grand', 'takeaway', ''], bil: ['p1', 'p2', 'both', ''], lev: ['p1', 'p2', 'both', 'grand', ''], hent: ['p2', 'p1', 'both', 'grand', ''] },
    notes: db.notes.filter(n => n.to === p && !n.seen).slice().reverse(),
    reminder: db.rem[p], firebase: null, pushDevices: 0,
    messages: db.messages, unreadMessages: db.messages.filter(m => m.from !== p && m.created > db.read[p]).length
  });
  return {
    getState: k => state(k),
    saveItem: (k, f) => {
      const dup = db.items.find(i => !i.cancelled && i.date === f.date && norm(i.title) === norm(f.title) && (i.start || '') === (f.start || ''));
      if (dup) throw new Error('«' + dup.title + '» er allerede lagt inn.');
      const it = Object.assign({ id: 'x' + (db.n++), by: k, ok1: k === 'p1', ok2: k === 'p2', note: '', noteBy: '', src: 'app', whereAddr: f.where, lat: '', lng: '', mapUrl: '' }, f);
      db.items.push(it); note(oth(k), NAMES[k] + ' har lagt inn «' + it.title + '»', it.id); return state(k);
    },
    confirmItem: (k, id) => { get(id)[okF(k)] = true; return state(k); },
    undoConfirm: (k, id) => { get(id)[okF(k)] = false; return state(k); },
    changeItem: (k, id, f, c) => { const it = get(id), conf = it.ok1 && it.ok2; Object.assign(it, f); if (f.where !== it.whereAddr) it.whereAddr = f.where; if (c) { it.note = c; it.noteBy = k; it.thread = (it.thread || []).concat([{ by: k, text: c, at: new Date().toISOString() }]); } if (!conf) { it[okF(k)] = true; it[okF(oth(k))] = false; } return state(k); },
    cancelItem: (k, id) => { get(id).cancelled = true; return state(k); },
    deleteItem: (k, id, reason, silent) => { const it = get(id); if (it) { it.cancelled = true; if (!silent) note(oth(k), NAMES[k] + ' slettet «' + it.title + '»: «' + reason + '»'); } return state(k); },
    setTile: (k, date, key, v) => { db.tiles[date + '|' + key] = v; return state(k); },
    markSeen: (k, ids) => { db.notes.forEach(n => { if (n.to === k && (ids === 'all' || ids.indexOf(n.id) !== -1)) n.seen = true; }); return state(k); },
    setReminder: (k, m) => { db.rem[k] = m; return state(k); },
    sendMessage: (k, txt) => { db.messages.push({ id: 'b' + (db.n++), from: k, text: txt, created: new Date().toISOString() }); db.read[k] = new Date().toISOString(); return state(k); },
    addComment: (k, id, txt) => { const it = get(id); it.thread = (it.thread || []).concat([{ by: k, text: txt, at: new Date().toISOString() }]); return state(k); },
    markDone: (k, id, v) => { get(id).done = !!v; return state(k); },
    readMessages: k => { db.read[k] = new Date().toISOString(); return state(k); }
  };
})();

// ---------- Start ----------
function load() {
  S.error = null; update();
  api('getState').then(st => { S.data = st; S.now = Date.now(); if (S.openDay === null) S.openDay = st.today; update(); maybeReRegister(); })
    .catch(e => { S.error = e && e.message ? e.message : 'Kunne ikke laste.'; update(); });
}
const root = document.getElementById('app');
root.textContent = '';
render(html`<${App} />`, root);
if (CONN) load();
