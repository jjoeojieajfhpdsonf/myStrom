// myStrom app – backend
// Finds the myStrom WiFi Switches on the home network, measures every 30 s, stores the history in SQLite, runs the rules
// (schedule, off at night when idle, vacation, sun, temperature, power saving, timer) and sends alarms as Web Push.
// Fully local, no myStrom account and no cloud. No npm dependencies (Node >= 22.13).

import http from 'node:http';
import dgram from 'node:dgram';
import { readFile } from 'node:fs/promises';
import { mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import os from 'node:os';
import { EN, EN_PATTERNS } from './i18n-server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;

const CFG = {
  port: Number(env.PORT || 8091),
  pollMs: Number(env.POLL_SECONDS || 30) * 1000,
  dbPath: env.DB_PATH || path.join(__dirname, 'data', 'mystrom.db'),
  tz: env.TZ || 'Europe/Zurich',
  demo: env.DEMO === '1',
  hosts: (env.DEVICES || '').split(',').map((s) => s.trim()).filter(Boolean), // fixed IPs in addition to automatic discovery
  pushContact: env.PUSH_CONTACT || 'mailto:mystrom-app@example.com',
  // Address at which buttons reach this server over WiFi (otherwise the machine's first IPv4 address)
  lanUrl: env.LAN_URL || '',
};

const DEFAULT_SETTINGS = { price: Number(env.TARIFF || 0.30), lat: Number(env.LAT || 47.37), lon: Number(env.LON || 8.54), place: '', lang: env.UI_LANG === 'en' ? 'en' : 'de' };
const TYPES = { 101: 'WiFi Switch CH v1', 106: 'WiFi Switch CH v2', 107: 'WiFi Switch EU', 120: 'WiFi Switch Zero', 125: 'WiFi Switch CH v2',
  102: 'WiFi Bulb', 105: 'WiFi LED Strip', 103: 'WiFi Button Plus', 104: 'WiFi Button', 118: 'WiFi Button Plus (2. Gen.)', 110: 'WiFi Motion Sensor' };
// Device kind: switch (socket), bulb (bulb, LED strip), button (button), motion (motion sensor)
const KINDS = { 101: 'switch', 106: 'switch', 107: 'switch', 120: 'switch', 125: 'switch', 102: 'bulb', 105: 'bulb', 103: 'button', 104: 'button', 118: 'button', 110: 'motion' };
const kindOf = (d) => KINDS[d.type] || 'switch';
const switchable = (d) => ['switch', 'bulb'].includes(kindOf(d));
const BTN_ACTS = ['single', 'double', 'long', 'touch'];

// ---------- Database ----------
mkdirSync(path.dirname(CFG.dbPath), { recursive: true });
const db = new DatabaseSync(CFG.dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS devices (mac TEXT PRIMARY KEY, ip TEXT, type INTEGER, fw TEXT, cfg TEXT, added INTEGER);
  CREATE TABLE IF NOT EXISTS samples (mac TEXT, ts INTEGER, w REAL, relay INTEGER, temp REAL, wh REAL, PRIMARY KEY (mac, ts)) WITHOUT ROWID;
  CREATE INDEX IF NOT EXISTS samples_ts ON samples (ts);
  CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, ts INTEGER, mac TEXT, kind TEXT, text TEXT);
  CREATE INDEX IF NOT EXISTS events_mac ON events (mac, ts);
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
`);
const q = {
  devices: db.prepare('SELECT * FROM devices ORDER BY added, mac'),
  putDevice: db.prepare('INSERT OR REPLACE INTO devices (mac, ip, type, fw, cfg, added) VALUES (?, ?, ?, ?, ?, ?)'),
  delDevice: db.prepare('DELETE FROM devices WHERE mac = ?'),
  addSample: db.prepare('INSERT OR REPLACE INTO samples (mac, ts, w, relay, temp, wh) VALUES (?, ?, ?, ?, ?, ?)'),
  samples: db.prepare('SELECT ts, w, wh FROM samples WHERE mac = ? AND ts >= ? AND ts < ? ORDER BY ts'),
  samplesAll: db.prepare('SELECT mac, ts, w, wh FROM samples WHERE ts >= ? AND ts < ? ORDER BY ts'),
  sumWh: db.prepare('SELECT COALESCE(SUM(wh), 0) AS wh FROM samples WHERE mac = ? AND ts >= ?'),
  sumWhAll: db.prepare('SELECT COALESCE(SUM(wh), 0) AS wh FROM samples WHERE ts >= ?'),
  sumBetween: db.prepare('SELECT COALESCE(SUM(wh), 0) AS wh FROM samples WHERE mac = ? AND ts >= ? AND ts < ?'),
  sumBetweenAll: db.prepare('SELECT COALESCE(SUM(wh), 0) AS wh FROM samples WHERE ts >= ? AND ts < ?'),
  firstTs: db.prepare('SELECT MIN(ts) AS ts FROM samples WHERE mac = ?'),
  temps: db.prepare('SELECT ts, temp FROM samples WHERE mac = ? AND ts >= ? AND ts < ? AND temp IS NOT NULL ORDER BY ts'),
  tempStats: db.prepare('SELECT MIN(temp) AS min, MAX(temp) AS max, AVG(temp) AS avg FROM samples WHERE mac = ? AND ts >= ? AND ts < ? AND temp IS NOT NULL'),
  onPowers: db.prepare('SELECT w FROM samples WHERE mac = ? AND ts >= ? AND relay = 1'),
  delSamples: db.prepare('DELETE FROM samples WHERE mac = ?'),
  addEvent: db.prepare('INSERT INTO events (ts, mac, kind, text) VALUES (?, ?, ?, ?)'),
  events: db.prepare('SELECT ts, mac, kind, text FROM events WHERE (? IS NULL OR mac = ?) ORDER BY ts DESC LIMIT ?'),
  lastSwitch: db.prepare("SELECT ts, kind, text FROM events WHERE mac = ? AND kind IN ('on', 'off') ORDER BY ts DESC LIMIT 1"),
  pruneEvents: db.prepare('DELETE FROM events WHERE ts < ?'),
  setMeta: db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)'),
  getMeta: db.prepare('SELECT value FROM meta WHERE key = ?'),
};
const meta = (k, fallback) => { const r = q.getMeta.get(k); return r ? JSON.parse(r.value) : fallback; };
const setMeta = (k, v) => q.setMeta.run(k, JSON.stringify(v));
let settings = { ...DEFAULT_SETTINGS, ...meta('settings', {}) };
// UI language for texts the server writes (status, errors, notifications). German is the source text and the key;
// {0}, {1} … are placeholders. Stored history stays German and is translated when read (trText).
const tr = (de, ...a) => (settings.lang === 'en' ? EN[de] ?? de : de).replace(/\{(\d)\}/g, (_, i) => a[i] ?? '');
function trText(de) {
  if (settings.lang !== 'en' || !de) return de;
  if (EN[de]) return EN[de];
  // {0} = capture group as is, {t0} = capture group translated as well (e.g. the reason inside an alarm text)
  for (const [re, en] of EN_PATTERNS) { const m = re.exec(de); if (m) return en.replace(/\{(t?)(\d)\}/g, (_, t, i) => (t ? trText(m[Number(i) + 1] ?? '') : m[Number(i) + 1] ?? '')); }
  return de;
}
delete settings.priceFromSolar; // left over from the former sync with the solar dashboard

// ---------- Time in the home's time zone ----------
const fmtDay = new Intl.DateTimeFormat('sv-SE', { timeZone: CFG.tz, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHM = new Intl.DateTimeFormat('en-GB', { timeZone: CFG.tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const fmtWd = new Intl.DateTimeFormat('en-US', { timeZone: CFG.tz, weekday: 'short' });
const dayKey = (ts) => fmtDay.format(ts);
const clock = (ts) => fmtHM.format(ts);
const minOfDay = (ts) => { const [h, m] = clock(ts).split(':').map(Number); return h * 60 + m; };
const weekday = (ts) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(fmtWd.format(ts)); // 0 = Sunday
const hm2min = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };
const min2hm = (m) => { m = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const addDays = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// Start of a calendar day in the time zone (via the offset at UTC noon, DST-safe enough for day boundaries)
function dayStart(day) {
  const noon = Date.parse(`${day}T12:00:00Z`), off = minOfDay(noon) - 720;
  return Date.parse(`${day}T00:00:00Z`) - off * 60e3;
}
const dShort = (day) => { const [, m, d] = day.split('-').map(Number); return `${d}.${m}.`; };
const pw = (w) => (w < 1000 ? `${Math.round(w)} W` : `${(w / 1000).toFixed(2)} kW`);
const hash01 = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };

// Sunrise and sunset (NOAA approximation, accurate to a minute or two), in minutes after local midnight
function sunTimes(day, lat = settings.lat, lon = settings.lon) {
  const d = new Date(`${day}T12:00:00Z`), n = Math.round((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5), g = 2 * Math.PI / 365 * (n - 1);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const la = lat * Math.PI / 180, cosH = Math.cos(90.833 * Math.PI / 180) / (Math.cos(la) * Math.cos(decl)) - Math.tan(la) * Math.tan(decl);
  if (cosH > 1 || cosH < -1) return null;
  const ha = Math.acos(cosH) * 180 / Math.PI, off = minOfDay(d.getTime()) - 720;
  return { rise: Math.round(720 - 4 * (lon + ha) - eqt + off), set: Math.round(720 - 4 * (lon - ha) - eqt + off) };
}

// ---------- Per-socket settings ----------
// Every feature of the myStrom app (including PLUS, PRO, DATA PRO, HOME GUARD) as a block; everything is free here.
const DEFAULT_CFG = () => {
  const today = dayKey(Date.now());
  return {
    name: '', room: '', icon: '', tcorr: 0, lock: false,
    actions: [], // Power Actions: if above/below X W, then …
    // several schedules with their own times; each weekday (0 = Sun … 6 = Sat) belongs to at most one
    // idle: only off once no longer in use (under `below` W for `mins` minutes), instead of exactly at "off at"
    schedule: { on: false, entries: [{ id: 's1', start: '07:00', end: '23:00', days: [1, 2, 3, 4, 5, 6, 0], idle: false, below: 25, mins: 10 }] },
    temp: { on: false, max: 45 },
    sun: { on: false, off: false, onOffset: 0, offOffset: 0 },
    vacation: { on: false, from: today, to: addDays(today, 7), morning: { on: true, from: '06:30', to: '07:30' }, evening: { on: true, from: '19:00', to: '22:30' } },
    alarms: { offline: true, unusual: true, switchedOn: false, hot: true },
    saver: { on: false, below: 5, mins: 30, back: 'time', at: '07:00', hours: 2 },
    timer: { on: false, mins: 120 },
    // shut the computer behind the plug down first (shutdown agent at url), cut the power once it is off (at most `wait` s)
    shutdown: { on: false, url: '', token: '', wait: 90 },
    // Bulb: last chosen color as HSV (hue 0–360, saturation 0–100, brightness 1–100)
    light: { h: 30, s: 20, v: 80 },
    // Button: per press either nothing, toggle/on/off a device, or a scene
    button: Object.fromEntries(BTN_ACTS.map((k) => [k, { do: 'none', mac: '', scene: '' }])),
    // Motion sensor: switch devices on when motion is detected (optionally only when dark), off again after x min without motion
    motion: { on: false, targets: [], dark: true, lux: 30, mins: 5 },
  };
};
// Validate input against the shape of the defaults: time, date, number, yes/no, text, weekdays
const LIMITS = { wait: [20, 600], h: [0, 360], s: [0, 100], v: [1, 100], lux: [0, 2000], price: [0, 5], lat: [-90, 90], lon: [-180, 180], tcorr: [-10, 10], below: [0, 3000], mins: [1, 1440], max: [20, 90], onOffset: [-180, 180], offOffset: [-180, 180], hours: [1, 48] };
function clean(def, val, key = '') {
  if (val === undefined || val === null) return def;
  if (typeof def === 'boolean') return Boolean(val);
  if (typeof def === 'number') { const n = Number(val), [lo, hi] = LIMITS[key] || [-1e6, 1e6]; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; }
  if (key === 'actions') return cleanActions(val);
  if (key === 'schedule') return cleanSchedule(val);
  if (key === 'targets') return Array.isArray(val) ? [...new Set(val.map(String).filter((m) => /^[0-9A-Z]{12}$/.test(m)))].slice(0, 20) : def;
  if (Array.isArray(def)) return Array.isArray(val) ? [...new Set(val.map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))] : def;
  if (typeof def === 'object') return Object.fromEntries(Object.entries(def).map(([k, d]) => [k, clean(d, val[k], k)]));
  const s = String(val).trim();
  if (/^\d{2}:\d{2}$/.test(def)) return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : def;
  if (/^\d{4}-\d{2}-\d{2}$/.test(def)) return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : def;
  if (key === 'back') return ['hand', 'time', 'after'].includes(s) ? s : def;
  if (key === 'do') return ['none', 'toggle', 'on', 'off', 'scene'].includes(s) ? s : def;
  if (key === 'url') return s === '' || /^https?:\/\/[\w.-]+(:\d{1,5})?\/?$/.test(s) ? s.replace(/\/$/, '') : def;
  if (key === 'token') return /^[\w-]{0,200}$/.test(s) ? s : def;
  return s.slice(0, 40);
}
// Validate schedules; the old form (a single start/end/days) becomes the first entry. A day already taken is dropped from later entries.
function cleanSchedule(v) {
  const hm = (x, d) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(x)) ? String(x) : d), used = new Set();
  const raw = Array.isArray(v.entries) ? v.entries : v.start ? [{ id: 's1', start: v.start, end: v.end, days: v.days }] : [{ id: 's1' }];
  const entries = raw.slice(0, 7).map((e, i) => {
    const days = [...new Set((Array.isArray(e.days) ? e.days : [1, 2, 3, 4, 5, 6, 0]).map(Number))].filter((x) => Number.isInteger(x) && x >= 0 && x <= 6 && !used.has(x));
    days.forEach((x) => used.add(x));
    const num = (x, lo, hi, d) => (Number.isFinite(Number(x)) ? Math.min(hi, Math.max(lo, Number(x))) : d);
    return { id: /^[\w-]{1,16}$/.test(e.id) ? e.id : `s${i + 1}`, start: hm(e.start, '07:00'), end: hm(e.end, '23:00'), days,
      idle: Boolean(e.idle), below: num(e.below, 0, 3000, 25), mins: Math.round(num(e.mins, 1, 240, 10)) };
  });
  return { on: Boolean(v.on), entries };
}
// Validate Power Actions: condition (above/below watts, minimum duration) and what happens then
const ACT_THEN = ['notify', 'off', 'other-on', 'other-off'];
function cleanActions(list) {
  if (!Array.isArray(list)) return [];
  const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  return list.slice(0, 20).map((a) => ({
    id: String(a?.id || crypto.randomUUID()).replace(/[^\w-]/g, '').slice(0, 24) || crypto.randomUUID().slice(0, 8),
    on: a?.on !== false,
    when: a?.when === 'below' ? 'below' : 'above',
    watts: num(a?.watts, 0, 3600, 10),
    mins: num(a?.mins, 0, 1440, 1),
    then: ACT_THEN.includes(a?.then) ? a.then : 'notify',
    target: /^[0-9A-Z]{12}$/.test(String(a?.target || '')) ? String(a.target) : '',
    text: String(a?.text || '').trim().slice(0, 60),
  }));
}
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const merge = (a, b) => (isObj(a) && isObj(b) ? Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map((k) => [k, merge(a[k], b[k])])) : b === undefined ? a : b);

// ---------- Devices ----------
const devices = new Map(); // mac -> { mac, ip, type, fw, cfg, added }
// the former "off at night" feature (own time window) becomes a schedule with "only off once no longer in use"
function migrateIdle(c) {
  const i = c.idle; delete c.idle;
  if (!i?.on) return c;
  const old = c.schedule || {}, extra = { idle: true, below: i.below ?? 25, mins: i.mins ?? 10 };
  if (old.on) old.entries = (old.entries || (old.start ? [{ id: 's1', start: old.start, end: old.end, days: old.days }] : [])).map((e) => ({ ...e, ...extra }));
  else Object.assign(old, { on: true, entries: [{ id: 's1', start: i.to || '07:00', end: i.from || '23:00', days: [1, 2, 3, 4, 5, 6, 0], ...extra }] });
  c.schedule = old; return c;
}
for (const r of q.devices.all()) devices.set(r.mac, { ...r, cfg: clean(DEFAULT_CFG(), migrateIdle(JSON.parse(r.cfg || '{}'))) });
const saveDevice = (d) => q.putDevice.run(d.mac, d.ip, d.type, d.fw, JSON.stringify(d.cfg), d.added);
const nameOf = (d) => d.cfg.name || `${{ bulb: tr('Lampe'), button: tr('Taster'), motion: tr('Bewegungsmelder') }[kindOf(d)] || tr('Steckdose')} ${d.mac.slice(-4)}`;
// Runtime state (not persisted): readings, connection errors, rule counters
const rt = new Map();
const R = (mac) => { if (!rt.has(mac)) rt.set(mac, { online: false, fails: 0, w: 0, relay: false, temp: null, seen: 0 }); return rt.get(mac); };

// Demo: three simulated sockets so the app can be tried out without real devices
const demo = { DEMO00000001: { relay: true, e: 0 }, DEMO00000002: { relay: true, e: 0 }, DEMO00000003: { relay: false, e: 0 },
  DEMO00000004: { on: false, color: '30;20;80' }, DEMO00000005: { voltage: 3.9, charge: false }, DEMO00000006: { motionUntil: 0 } };
const DEMO_EXTRA = [['DEMO00000004', 102, 'Stehlampe', 'Wohnzimmer'], ['DEMO00000005', 104, 'Taster Eingang', 'Eingang'], ['DEMO00000006', 110, 'Bewegung Flur', 'Flur']];
// Demo motion sensor: someone in the hallway every few minutes; brightness roughly follows the day
function demoSensors() {
  const s = demo.DEMO00000006, now = Date.now(), m = minOfDay(now);
  if (now > s.motionUntil + 4 * 60e3 && Math.random() < 0.15) s.motionUntil = now + 45e3;
  const day = m > 7 * 60 && m < 19 * 60, lux = day ? 180 + Math.round(Math.random() * 60) : 4 + Math.round(Math.random() * 6);
  return { motion: now < s.motionUntil, light: lux, temperature: 21 + Math.random() };
}
function demoReport(mac) {
  const s = demo[mac], m = minOfDay(Date.now()), j = Math.random();
  const base = mac.endsWith('1') ? (m >= 7 * 60 + 30 && m < 23 * 60 + 40 ? 95 + j * 40 : 28 + j * 3) : mac.endsWith('2') ? 26 + j * 4 : 9;
  const w = s.relay ? base : 0; s.e += w * CFG.pollMs / 1000;
  return { power: w, relay: s.relay, temperature: 22 + j, boot_id: 'DEMO', energy_since_boot: s.e };
}

async function devFetch(d, p, timeout = 4000, body) {
  if (CFG.demo) {
    const s = demo[d.mac];
    if (p.startsWith('/api/v1/device/')) {
      if (kindOf(d) === 'button') return { [d.mac]: { type: 'button', battery: true, reachable: true, charge: s.charge, voltage: s.voltage, fw_version: '2.74', ...Object.fromEntries(BTN_ACTS.map((k) => [k, s[k] || ''])) } };
      if (body) {
        const f = new URLSearchParams(body);
        if (kindOf(d) === 'button') { for (const k of BTN_ACTS) if (f.has(k)) s[k] = f.get(k); return {}; }
        const a = f.get('action'); if (a) s.on = a === 'toggle' ? !s.on : a === 'on'; if (f.get('color')) s.color = f.get('color');
      }
      const v = Number(s.color.split(';')[2] || 100);
      return { [d.mac]: { type: 'rgblamp', on: s.on, color: s.color, mode: 'hsv', power: s.on ? Math.round((1.2 + 8.3 * v / 100) * 10) / 10 : 0.4, fw_version: '2.58' } };
    }
    if (p === '/api/v1/sensors') return demoSensors();
    if (p === '/report') return demoReport(d.mac);
    const m = /relay\?state=(\d)/.exec(p); if (m) demo[d.mac].relay = m[1] === '1';
    return {};
  }
  const r = await fetch(`http://${d.ip}${p}`, body ? { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(timeout) } : { signal: AbortSignal.timeout(timeout) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const t = await r.text();
  return t ? JSON.parse(t) : {};
}
// Add or update a device by IP (name and rules are kept)
async function addByIp(ip, hint) {
  let info;
  try { info = await fetch(`http://${ip}/api/v1/info`, { signal: AbortSignal.timeout(4000) }).then((r) => r.json()); }
  catch (e) { if (!hint) throw e; info = { mac: hint.mac, type: hint.type }; } // sleeping button: details from the UDP announcement
  const mac = String(info.mac || '').toUpperCase().replace(/[^0-9A-F]/g, '');
  if (mac.length !== 12) throw new Error(tr('Unter dieser Adresse antwortet kein myStrom-Gerät.'));
  const old = devices.get(mac);
  const d = { mac, ip, type: info.type ?? hint?.type ?? old?.type ?? null, fw: info.version ?? old?.fw ?? null, cfg: old?.cfg || DEFAULT_CFG(), added: old?.added || Date.now() };
  if (!old) logEvent(mac, 'info', `Gefunden unter ${ip}`);
  else if (old.ip !== ip) logEvent(mac, 'info', `Neue Adresse ${ip}`);
  devices.set(mac, d); saveDevice(d);
  return d;
}
// Automatic discovery: every myStrom device announces itself every few seconds via UDP broadcast on port 7979
// (6 bytes MAC, 1 byte device type). This way known devices also pick up a new IP.
function discover() {
  if (CFG.demo) return;
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const busy = new Set();
  sock.on('message', async (msg, from) => {
    if (msg.length < 7) return;
    const mac = msg.subarray(0, 6).toString('hex').toUpperCase(), type = msg[6];
    if (!KINDS[type]) return; // sockets, bulbs, buttons, motion sensors (not gateways etc.)
    const d = devices.get(mac);
    if (d && kindOf(d) === 'button') { const r = R(mac); r.seen = Date.now(); r.online = true; if (d.ip === from.address) { buttonAwake(d); return; } }
    if ((d && d.ip === from.address) || busy.has(mac)) return;
    busy.add(mac);
    try { const n = await addByIp(from.address, { mac, type }); if (kindOf(n) === 'button') buttonAwake(n); else await pollDevice(n); } catch (e) { console.error('Suche:', from.address, e.message); } finally { busy.delete(mac); }
  });
  sock.on('error', (e) => console.error('Suche (UDP 7979):', e.message));
  sock.bind(7979);
}

// ---------- Events and switching ----------
function logEvent(mac, kind, text) { q.addEvent.run(Date.now(), mac, kind, text); }
// Switch with a reason; the reason shows up in the history and the status ("Aus seit 23:31 · nicht mehr benutzt")
async function setRelay(mac, on, why, opt = {}) {
  const d = devices.get(mac), r = R(mac);
  if (!d) throw new Error(tr('Unbekanntes Gerät.'));
  if (!on && !opt.force && kindOf(d) === 'switch' && d.cfg.shutdown.on && d.cfg.shutdown.url && r.relay) return shutdownThenOff(d, why, opt);
  if (on && r.shutting) { r.shutting.thenOn = true; return; } // switched on again while shutting down: power-cycle afterwards so it boots
  if (kindOf(d) === 'bulb') await devFetch(d, `/api/v1/device/${d.mac}`, 4000, `action=${on ? 'on' : 'off'}&ramp=400`);
  else if (kindOf(d) === 'switch') await devFetch(d, `/relay?state=${on ? 1 : 0}`);
  else throw new Error(tr('{0} lässt sich nicht schalten.', nameOf(d)));
  r.expect = { relay: on, until: Date.now() + CFG.pollMs * 2 };
  if (r.relay !== on) edge(d, on, why);
  r.relay = on; if (!on) r.w = 0;
}
// Clean shutdown before cutting the power: ask the shutdown agent on the computer, wait until it no longer answers
// (plus a margin for the last writes), then switch the relay off. Runs in the background; the relay stays on meanwhile.
// Only for automatic switch-offs; by hand in the app the power goes off at once. If the agent can't be reached, the power stays on (and a notification goes out).
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function shutdownThenOff(d, why, opt) {
  const r = R(d.mac), sd = d.cfg.shutdown;
  if (r.shutting) return;
  try {
    const res = await fetch(`${sd.url}/shutdown`, { method: 'POST', headers: { Authorization: `Bearer ${sd.token}` }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(res.status === 401 ? 'token' : `HTTP ${res.status}`);
  } catch (e) {
    const reason = e.message === 'token' ? 'Token falsch' : /^HTTP \d+$/.test(e.message) ? e.message : 'keine Antwort'; // network errors read as 'no answer'
    logEvent(d.mac, 'info', `Herunterfahren nicht möglich, bleibt an (${reason})`);
    notify(d, 'shutdown', `${nameOf(d)} wurde nicht ausgeschaltet`, `Herunterfahren nicht möglich: ${reason}`);
    return;
  }
  const job = (r.shutting = { since: Date.now(), why });
  logEvent(d.mac, 'info', `Fährt herunter (${why})`);
  (async () => {
    const until = Date.now() + sd.wait * 1000;
    while (Date.now() < until) {
      await sleep(3000);
      try { await fetch(`${sd.url}/health`, { signal: AbortSignal.timeout(2000) }); } catch { break; } // gone: network is down
    }
    await sleep(Math.max(0, Math.min(15000, until - Date.now()))); // margin for the last writes and the halt
    r.shutting = null;
    try {
      await setRelay(d.mac, false, why, { force: true });
      if (job.thenOn) { await sleep(5000); await setRelay(d.mac, true, 'von Hand in der App'); }
    } catch (e) { logEvent(d.mac, 'info', `Herunterfahren nicht möglich, bleibt an (${e.message})`); }
  })();
}
// Bulb: color and brightness (HSV), also switches it on
async function setLight(mac, { h, s: sat, v }) {
  const d = devices.get(mac), r = R(mac);
  d.cfg.light = clean(DEFAULT_CFG().light, { h, s: sat, v }); saveDevice(d);
  const c = d.cfg.light;
  await devFetch(d, `/api/v1/device/${d.mac}`, 4000, `action=on&ramp=300&color=${encodeURIComponent(`${c.h};${c.s};${c.v}`)}`);
  r.color = `${c.h};${c.s};${c.v}`; r.expect = { relay: true, until: Date.now() + CFG.pollMs * 2 };
  if (!r.relay) edge(d, true, 'von Hand in der App'); r.relay = true;
}
// Button: our own address on the WiFi so the button can call us
function lanBase() {
  if (CFG.lanUrl) return CFG.lanUrl.replace(/\/$/, '').replace(/^https?:\/\//, '');
  const ip = Object.values(os.networkInterfaces()).flat().find((x) => x && x.family === 'IPv4' && !x.internal)?.address || '127.0.0.1';
  return `${ip}:${CFG.port}`;
}
// What the button calls on each press: empty = nothing, otherwise our address; get:// means GET (see the button's REST API)
const buttonUrls = (d) => Object.fromEntries(BTN_ACTS.map((k) => [k, d.cfg.button[k].do === 'none' ? '' : `get://${lanBase()}/api/button/${d.mac}/${k}`]));
// Button is awake (reports after a press or while on USB): read the battery and, if needed, push the actions
async function buttonAwake(d) {
  const r = R(d.mac); if (r.syncing) return; r.syncing = true;
  try {
    const want = buttonUrls(d), info = (await devFetch(d, `/api/v1/device/${d.mac}`, 3000))[d.mac] || {};
    r.voltage = info.voltage ?? r.voltage; r.charge = info.charge ?? r.charge; r.online = true; r.seen = Date.now();
    const diff = BTN_ACTS.filter((k) => (info[k] ?? '') !== want[k] && !(k === 'touch' && d.type === 104));
    if (diff.length) { await devFetch(d, `/api/v1/device/${d.mac}`, 3000, diff.map((k) => `${k}=${encodeURIComponent(want[k])}`).join('&')); logEvent(d.mac, 'info', 'Tasten-Aktionen übertragen'); }
    r.synced = JSON.stringify(want);
  } catch (e) { r.synced = null; } finally { r.syncing = false; }
}
// Handle a press on a button
async function buttonPress(d, k) {
  const a = d.cfg.button[k], r = R(d.mac);
  r.seen = Date.now(); r.online = true; r.lastPress = { k, ts: Date.now() };
  const label = { single: 'einmal gedrückt', double: 'zweimal gedrückt', long: 'lang gedrückt', touch: 'berührt' }[k];
  setTimeout(() => buttonAwake(d), 300); // awake: read the battery and sync actions right away
  if (a.do === 'scene') { await runScene(a.scene); logEvent(d.mac, 'info', `${label}: Szene`); return; }
  const t = devices.get(a.mac);
  if (!t || !switchable(t) || t.cfg.lock) return;
  const on = a.do === 'toggle' ? !R(t.mac).relay : a.do === 'on';
  if (R(t.mac).relay !== on) await setRelay(t.mac, on, `über ${nameOf(d)}`);
  logEvent(d.mac, 'info', `${label}: ${nameOf(t)} ${on ? 'an' : 'aus'}`);
}
// Switch-on or switch-off detected (by us, on the device, or by another app)
function edge(d, on, why) {
  const r = R(d.mac), now = Date.now();
  logEvent(d.mac, on ? 'on' : 'off', why);
  r.lowSince = null; r.saverSince = null;
  if (on) { r.onSince = now; r.offBy = null; if (d.cfg.alarms.switchedOn && !/App|Szene/.test(why)) notify(d, 'on', `${nameOf(d)} wurde eingeschaltet`, why); }
  else r.onSince = null;
}

// ---------- Measuring ----------
// Bulb reports on/off, color and power; shaped like a socket report so consumption and rules work the same
function bulbReport(d, x) { R(d.mac).color = x.color ?? null; return { relay: Boolean(x.on), power: Number(x.power) || 0 }; }
let lastTick = Date.now();
async function pollDevice(d) {
  const r = R(d.mac), now = Date.now(), kind = kindOf(d);
  if (kind === 'button') { if (r.seen && now - r.seen > 36 * 3600e3) r.online = false; return; } // buttons sleep and report on their own
  try {
    if (kind === 'motion') {
      const x = await devFetch(d, '/api/v1/sensors');
      r.online = true; r.fails = 0; r.seen = now; r.offlineSent = false;
      r.motion = Boolean(x.motion); if (r.motion) r.lastMotion = now;
      r.light = x.light ?? null; r.temp = x.temperature ?? null;
      q.addSample.run(d.mac, now, 0, r.motion ? 1 : 0, r.temp, 0);
      return;
    }
    const rep = kind === 'bulb' ? bulbReport(d, (await devFetch(d, `/api/v1/device/${d.mac}`))[d.mac] || {}) : await devFetch(d, '/report');
    const relay = Boolean(rep.relay), w = Math.max(0, Number(rep.power) || 0);
    // Energy from the device's counter (watt-seconds since boot), otherwise power times time
    let wh = 0;
    const dt = r.lastTs ? (now - r.lastTs) / 1000 : CFG.pollMs / 1000;
    if (rep.boot_id && rep.boot_id === r.bootId && rep.energy_since_boot >= r.energy && dt < 600) wh = (rep.energy_since_boot - r.energy) / 3600;
    else if (dt < 600) wh = w * dt / 3600;
    r.bootId = rep.boot_id; r.energy = rep.energy_since_boot; r.lastTs = now;
    if (!r.online && r.seen && r.offlineSent) { notify(d, 'online', `${nameOf(d)} ist wieder erreichbar`, ''); }
    r.online = true; r.fails = 0; r.seen = now; r.offlineSent = false;
    if (r.relay !== relay && r.seenRelay) {
      const ours = r.expect && r.expect.relay === relay && now < r.expect.until;
      if (!ours) edge(d, relay, 'am Gerät oder in einer anderen App');
    }
    r.relay = relay; r.seenRelay = true; r.w = relay ? w : 0; r.temp = rep.temperature ?? null;
    q.addSample.run(d.mac, now, r.w, relay ? 1 : 0, r.temp, wh);
  } catch (e) {
    r.fails++;
    if (r.fails >= 3) r.online = false;
    if (r.fails >= 6 && !r.offlineSent && d.cfg.alarms.offline) { r.offlineSent = true; notify(d, 'offline', `${nameOf(d)} ist offline`, `Seit ${clock(r.seen || now)} keine Antwort von ${d.ip}.`); }
  }
}
async function pollAll() {
  await Promise.all([...devices.values()].map(pollDevice));
  const prev = lastTick; lastTick = Date.now();
  for (const d of devices.values()) await runRules(d, prev, lastTick).catch((e) => console.error('Regeln', nameOf(d), e.message));
  // Scenes at fixed times
  const crossed = crossedFn(prev, lastTick);
  for (const sc of meta('scenes', defaultScenes())) {
    if (sc.time?.on && sc.time.days.includes(weekday(lastTick)) && crossed(hm2min(sc.time.at))) await runScene(sc.id).catch((e) => console.error('Szene', sc.name, e.message));
  }
}

// ---------- Rules ----------
// Time-of-day rules switch exactly once when the clock passes the set minute (as with myStrom);
// in between you can switch by hand at any time. Conditions (power, temperature) are checked on every poll.
function crossedFn(prev, now) {
  const a = minOfDay(prev), b = minOfDay(now), sameDay = dayKey(prev) === dayKey(now);
  return (m) => { m = ((m % 1440) + 1440) % 1440; if (a === b && sameDay) return false; return a < b ? m > a && m <= b : m > a || m <= b; };
}
// Vacation: a different but fixed time in the window each day (random from device + date), short in the morning, longer in the evening
function vacationSlots(d, day) {
  const v = d.cfg.vacation;
  if (!v.on || day < v.from || day > v.to) return [];
  const slot = (w, key, minDur, maxDur) => {
    const a = hm2min(w.from), b = hm2min(w.to) + (hm2min(w.to) < a ? 1440 : 0);
    const start = a + hash01(`${d.mac}|${day}|${key}`) * Math.max(0, b - a), dur = minDur + hash01(`${d.mac}|${day}|${key}|d`) * (maxDur - minDur);
    return { key, start: Math.round(start), end: Math.round(start + dur) };
  };
  return [v.morning.on && slot(v.morning, 'morgens', 20, 60), v.evening.on && slot(v.evening, 'abends', 60, 180)].filter(Boolean);
}
let p99Cache = { at: 0, v: {} };
function usualMax(mac) {
  if (Date.now() - p99Cache.at > 3600e3) p99Cache = { at: Date.now(), v: {} };
  if (!(mac in p99Cache.v)) {
    const ws = q.onPowers.all(mac, Date.now() - 14 * 864e5).map((x) => x.w).sort((a, b) => a - b);
    p99Cache.v[mac] = ws.length > 2000 ? ws[Math.floor(ws.length * 0.99)] : null; // only after a few days of measurements
  }
  return p99Cache.v[mac];
}
// Light on motion: switch on (only when dark, if desired), off again after x min without motion – but only
// what the sensor itself switched on (anything switched on by hand stays on)
async function motionRule(d, now) {
  const c = d.cfg.motion, r = R(d.mac); r.mOn ||= new Set();
  if (!c.on) { r.mOn.clear(); return; }
  const targets = c.targets.map((m) => devices.get(m)).filter((t) => t && switchable(t) && !t.cfg.lock);
  if (r.motion && (!c.dark || r.light == null || r.light < c.lux || r.mOn.size)) {
    for (const t of targets) if (!R(t.mac).relay && R(t.mac).online) { await setRelay(t.mac, true, `Bewegung (${nameOf(d)})`); r.mOn.add(t.mac); }
  } else if (r.mOn.size && now - (r.lastMotion || 0) >= c.mins * 60e3) {
    for (const m of r.mOn) if (R(m).relay) await setRelay(m, false, `keine Bewegung mehr (${nameOf(d)})`).catch(() => {});
    r.mOn.clear();
  }
}
// Schedule with "only off once no longer in use": applies from "off at" until the next "on at", at most 12 hours.
// Computed without stored state so a server restart loses nothing.
function idleWatch(c, now) {
  if (!c.schedule.on || !c.schedule.entries.some((e) => e.idle)) return null;
  const today = dayKey(now), at = (day, hm) => dayStart(day) + hm2min(hm) * 60e3;
  const entryOf = (day) => c.schedule.entries.find((e) => e.days.includes(weekday(dayStart(day) + 12 * 3600e3)));
  const ons = [];
  for (let k = -2; k <= 8; k++) { const day = addDays(today, k), e = entryOf(day); if (e) ons.push(at(day, e.start)); }
  for (let k = -2; k <= 0; k++) {
    const day = addDays(today, k), e = entryOf(day);
    if (!e?.idle) continue;
    const off = at(hm2min(e.end) <= hm2min(e.start) ? addDays(day, 1) : day, e.end), next = Math.min(...ons.filter((x) => x > off), off + 12 * 3600e3);
    if (now >= off && now < next) return e;
  }
  return null;
}
async function runRules(d, prev, now) {
  const c = d.cfg, r = R(d.mac), m = minOfDay(now), day = dayKey(now), crossed = crossedFn(prev, now);
  if (!r.online) return;
  if (kindOf(d) === 'motion') return motionRule(d, now);
  if (kindOf(d) === 'button') return;
  const sw = async (on, why) => { if (r.relay !== on) await setRelay(d.mac, on, why); };
  // Schedule
  const t = c.schedule.on && c.schedule.entries.find((e) => e.days.includes(weekday(now)));
  if (t) {
    if (crossed(hm2min(t.start))) await sw(true, 'Zeitplan');
    if (!t.idle && crossed(hm2min(t.end))) await sw(false, 'Zeitplan');
  }
  // "only off once no longer in use": from "off at", switch off once power stays below the threshold long enough
  const w = idleWatch(c, now);
  if (w && r.relay && r.w < w.below) {
    r.lowSince ||= now;
    if (now - r.lowSince >= w.mins * 60e3) await sw(false, 'nicht mehr benutzt');
  } else r.lowSince = null;
  // Temperature
  const temp = r.temp == null ? null : r.temp + c.tcorr;
  if (c.temp.on && r.relay && temp != null && temp > c.temp.max) { await sw(false, `zu warm (${temp.toFixed(1)} °C)`); }
  if (c.alarms.hot && temp != null && temp > (c.temp.on ? c.temp.max : 45) && now - (r.hotSent || 0) > 6 * 3600e3) {
    r.hotSent = now; notify(d, 'hot', `${nameOf(d)} ist ${temp.toFixed(1)} °C warm`, 'Die Steckdose misst eine ungewöhnlich hohe Temperatur.');
  }
  // Sunrise and sunset
  const sun = sunTimes(day);
  if (sun && c.sun.on && crossed(sun.set + c.sun.onOffset)) await sw(true, 'Sonnenuntergang');
  if (sun && c.sun.off && crossed(sun.rise + c.sun.offOffset)) await sw(false, 'Sonnenaufgang');
  // Vacation (Home Guard): also consider last evening's window in case it runs past midnight
  for (const [dd, shift] of [[day, 0], [addDays(day, -1), -1440]]) {
    for (const s of vacationSlots(d, dd)) {
      if (crossed(s.start + shift)) await sw(true, `Ferien ${s.key}`);
      if (crossed(s.end + shift)) await sw(false, `Ferien ${s.key}`);
    }
  }
  // Power saving: if the device is only sitting in standby, switch off; back on depending on the setting
  if (c.saver.on) {
    if (r.relay && r.w < c.saver.below) {
      r.saverSince ||= now;
      if (now - r.saverSince >= c.saver.mins * 60e3) { await sw(false, 'Standby, Strom gespart'); r.offBy = 'saver'; r.saverOff = now; }
    } else r.saverSince = null;
    if (r.offBy === 'saver' && !r.relay) {
      if (c.saver.back === 'time' && crossed(hm2min(c.saver.at))) await sw(true, 'nach Stromsparen wieder an');
      if (c.saver.back === 'after' && now - r.saverOff >= c.saver.hours * 3600e3) await sw(true, 'nach Stromsparen wieder an');
    }
  }
  // Timer: stays on for a set time after switching on
  if (c.timer.on && r.relay && r.onSince && now - r.onSince >= c.timer.mins * 60e3) await sw(false, `Timer ${c.timer.mins} min abgelaufen`);
  // Power Actions: once the condition holds long enough, fire once; only again after it has stopped holding in between.
  // "Below X W" only counts after the device has run above it; otherwise "washing machine done" would fire without a wash cycle.
  r.acts ||= {};
  for (const a of c.actions) {
    if (!a.on) continue;
    const st = (r.acts[a.id] ||= { since: null, armed: a.when === 'above', fired: false });
    if (a.when === 'above') st.armed = true;
    else if (r.w > a.watts) st.armed = true;
    const cond = a.when === 'above' ? r.w > a.watts : r.w < a.watts;
    if (cond && st.armed && !st.fired) {
      st.since ||= now;
      if (now - st.since >= a.mins * 60e3) { st.fired = true; if (a.when === 'below') st.armed = false; await runAction(d, a).catch((e) => console.error('Power Action:', e.message)); }
    } else if (!cond) { st.since = null; st.fired = false; }
  }
  // unusual consumption: three readings in a row well above what the device normally draws
  const usual = usualMax(d.mac);
  if (c.alarms.unusual && usual != null && r.w > 20 && r.w > Math.max(usual * 1.5, usual + 30)) {
    r.highCount = (r.highCount || 0) + 1;
    if (r.highCount >= 3 && now - (r.unusualSent || 0) > 6 * 3600e3) { r.unusualSent = now; notify(d, 'unusual', `${nameOf(d)} zieht ${pw(r.w)}`, `Sonst höchstens etwa ${pw(usual)}.`); }
  } else r.highCount = 0;
}

async function runAction(d, a) {
  const cond = `${a.when === 'below' ? 'unter' : 'über'} ${a.watts} W${a.mins ? ` seit ${a.mins} min` : ''}`;
  if (a.then === 'notify') { notify(d, `action-${a.id}`, a.text || `${nameOf(d)}: ${a.when === 'below' ? 'fertig' : `über ${a.watts} W`}`, `Leistung ${cond}.`); return; }
  if (a.then === 'off') { if (R(d.mac).relay) await setRelay(d.mac, false, `Power Action: ${cond}`); return; }
  const t = devices.get(a.target), on = a.then === 'other-on';
  if (!t || t.cfg.lock || !R(t.mac).online) return;
  if (R(t.mac).relay !== on) await setRelay(t.mac, on, `Power Action von ${nameOf(d)} (${cond})`);
}

// ---------- Status for the app ----------
const ago = (ts) => { const m = Math.round((Date.now() - ts) / 60e3); return m < 1 ? tr('gerade eben') : m < 60 ? tr('vor {0} min', m) : m < 1440 ? tr('um {0}', clock(ts)) : tr('am {0}', dShort(dayKey(ts))); };
function statusText(d) {
  const r = R(d.mac), c = d.cfg, now = Date.now(), m = minOfDay(now);
  if (kindOf(d) === 'button') return r.lastPress ? tr('zuletzt {0} gedrückt', ago(r.lastPress.ts)) : r.seen ? tr('zuletzt aktiv {0}', ago(r.seen)) : tr('meldet sich nach dem ersten Drücken');
  if (kindOf(d) === 'motion') { if (!r.online) return r.seen ? tr('Offline seit {0}', clock(r.seen)) : tr('Wird verbunden …'); return r.motion ? tr('Bewegung') : r.lastMotion ? tr('Bewegung {0}', ago(r.lastMotion)) : tr('keine Bewegung'); }
  if (!r.online) return r.seen ? tr('Offline seit {0}', clock(r.seen)) : tr('Wird verbunden …');
  if (r.shutting) return tr('Fährt herunter …');
  const iw = r.relay && idleWatch(c, now);
  if (iw) {
    if (r.lowSince) return tr('Unter {0} W · aus in {1} min', iw.below, Math.max(1, Math.ceil(iw.mins - (now - r.lowSince) / 60e3)));
    return tr('{0} · wartet, du arbeitest noch', pw(r.w));
  }
  if (r.relay && c.timer.on && r.onSince) return tr('{0} · Timer, aus um {1}', pw(r.w), clock(r.onSince + c.timer.mins * 60e3));
  if (r.relay) return pw(r.w);
  const e = q.lastSwitch.get(d.mac);
  if (e?.kind === 'off' && now - e.ts < 18 * 3600e3) return tr('Aus seit {0} · {1}', clock(e.ts), trText(e.text));
  const today = dayKey(now);
  if (c.vacation.on && today < c.vacation.from) return tr('Aus · Ferien ab {0}', dShort(c.vacation.from));
  return tr('Aus');
}
// mac: 'all', one device or several comma-separated (A,B) – then the sum of the selected ones
const macsOf = (mac) => (mac === 'all' ? null : mac.split(','));
const validMac = (mac) => mac === 'all' || (!!mac && mac.split(',').every((m) => devices.has(m)));
const sumOver = (mac, all, one) => (mac === 'all' ? all() : macsOf(mac).reduce((a, m) => a + one(m), 0));
const rowsOf = (mac, from, to) => (mac === 'all' ? q.samplesAll.all(from, to)
  : macsOf(mac).flatMap((m) => q.samples.all(m, from, to).map((s) => ({ ...s, mac: m }))).sort((x, y) => x.ts - y.ts));
const sinceWh = (mac, ts) => sumOver(mac, () => q.sumWhAll.get(ts).wh, (m) => q.sumWh.get(m, ts).wh);
function deviceJson(d) {
  const r = R(d.mac), today = dayKey(Date.now());
  return {
    mac: d.mac, ip: d.ip, type: d.type, kind: kindOf(d), typeName: TYPES[d.type] || tr('Typ {0}', d.type), fw: d.fw, name: nameOf(d),
    cfg: { ...d.cfg, shutdown: { ...d.cfg.shutdown, token: d.cfg.shutdown.token ? '__set__' : '' } }, shutting: Boolean(r.shutting), // token never leaves the server
    ...(kindOf(d) === 'bulb' ? { color: r.color || null } : {}),
    ...(kindOf(d) === 'button' ? { voltage: r.voltage ?? null, charge: r.charge ?? null, battery: r.voltage == null ? null : Math.max(0, Math.min(100, Math.round((r.voltage - 3.3) / 0.9 * 100))), lastPress: r.lastPress || null, synced: r.synced === JSON.stringify(buttonUrls(d)), touch: d.type !== 104 } : {}),
    ...(kindOf(d) === 'motion' ? { motion: Boolean(r.motion), light: r.light ?? null, lastMotion: r.lastMotion || null } : {}),
    online: r.online, relay: r.relay, w: r.w, temp: r.temp == null ? null : Math.round((r.temp + d.cfg.tcorr) * 10) / 10, tempRaw: r.temp,
    status: statusText(d), todayWh: sinceWh(d.mac, dayStart(today)), lowSince: r.lowSince || null, onSince: r.onSince || null,
    vacationToday: vacationSlots(d, today).map((s) => ({ key: s.key === 'morgens' ? tr('morgens') : tr('abends'), start: min2hm(s.start), end: min2hm(s.end) })),
  };
}
function apiState() {
  const today = dayKey(Date.now()), sun = sunTimes(today);
  return {
    settings, now: Date.now(), today, sun: sun && { rise: min2hm(sun.rise), set: min2hm(sun.set) }, demo: CFG.demo,
    devices: [...devices.values()].map(deviceJson), scenes: meta('scenes', defaultScenes()), pushSubs: meta('pushSubs', []).length,
  };
}
// Daily curve in 5-minute steps (average W), plus total and peak
function apiCurve(mac, day) {
  const from = dayStart(day), to = dayStart(addDays(day, 1)), n = Math.round((to - from) / 300e3);
  const rows = rowsOf(mac, from, to);
  const per = new Map(); // per device and window: sum, count
  let wh = 0;
  for (const s of rows) {
    const i = Math.floor((s.ts - from) / 300e3), k = `${s.mac}|${i}`, a = per.get(k) || [0, 0];
    a[0] += s.w; a[1]++; per.set(k, a); wh += s.wh || 0;
  }
  const w = Array(n).fill(null);
  for (const [k, [sum, cnt]] of per) { const i = Number(k.split('|')[1]); w[i] = (w[i] || 0) + sum / cnt; }
  const max = Math.max(0, ...w.filter((x) => x != null));
  return { day, w: w.map((x) => (x == null ? null : Math.round(x * 10) / 10)), wh, max };
}
function apiTotals(mac) {
  const now = Date.now(), today = dayKey(now), d = new Date(`${today}T12:00:00Z`);
  const monthStart = dayStart(`${today.slice(0, 7)}-01`), yearStart = dayStart(`${today.slice(0, 4)}-01-01`);
  const wd = (d.getUTCDay() + 6) % 7, weekStart = dayStart(addDays(today, -wd));
  const firsts = mac === 'all' ? [] : macsOf(mac).map((m) => q.firstTs.get(m).ts).filter(Boolean), first = firsts.length ? Math.min(...firsts) : null;
  return { today: sinceWh(mac, dayStart(today)), week: sinceWh(mac, weekStart), month: sinceWh(mac, monthStart), year: sinceWh(mac, yearStart), all: sinceWh(mac, 0), since: first };
}
// Short weekday names Monday … Sunday for chart labels
const weekdayLabels = () => [tr('Mo'), tr('Di'), tr('Mi'), tr('Do'), tr('Fr'), tr('Sa'), tr('So')];
function apiBars(mac, period, ref) {
  const pad = (n) => String(n).padStart(2, '0'), now = Date.now();
  let buckets;
  if (period === 'week') {
    const wd = (new Date(`${ref}T12:00:00Z`).getUTCDay() + 6) % 7, start = addDays(ref, -wd);
    buckets = weekdayLabels().map((label, i) => { const day = addDays(start, i); return { key: day, label, from: dayStart(day), to: dayStart(addDays(day, 1)) }; });
  } else if (period === 'month') {
    const ym = ref.slice(0, 7), [y, m] = ym.split('-').map(Number), n = new Date(Date.UTC(y, m, 0)).getUTCDate();
    buckets = Array.from({ length: n }, (_, i) => { const day = `${ym}-${pad(i + 1)}`; return { key: day, label: String(i + 1), from: dayStart(day), to: dayStart(addDays(day, 1)) }; });
  } else {
    const y = Number(ref.slice(0, 4));
    buckets = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'].map((label, i) => ({ key: `${y}-${pad(i + 1)}`, label,
      from: dayStart(`${y}-${pad(i + 1)}-01`), to: dayStart(i === 11 ? `${y + 1}-01-01` : `${y}-${pad(i + 2)}-01`) }));
  }
  const bars = buckets.map((b) => ({ key: b.key, label: b.label, wh: b.from > now ? null : sumOver(mac, () => q.sumBetweenAll.get(b.from, b.to).wh, (m) => q.sumBetween.get(m, b.from, b.to).wh) }));
  return { period, ref, bars, wh: bars.reduce((a, b) => a + (b.wh || 0), 0) };
}
// Temperature (with the socket's correction): day as 5-minute averages, week/month as min, mean and max per day
function apiTemp(d, period, ref) {
  const k = d.cfg.tcorr, r1 = (x) => (x == null ? null : Math.round((x + k) * 10) / 10);
  if (period === 'day') {
    const from = dayStart(ref), to = dayStart(addDays(ref, 1)), n = Math.round((to - from) / 300e3), sum = Array(n).fill(0), cnt = Array(n).fill(0);
    for (const x of q.temps.all(d.mac, from, to)) { const i = Math.floor((x.ts - from) / 300e3); sum[i] += x.temp; cnt[i]++; }
    const st = q.tempStats.get(d.mac, from, to);
    return { period, ref, t: sum.map((v, i) => (cnt[i] ? r1(v / cnt[i]) : null)), min: r1(st.min), max: r1(st.max), avg: r1(st.avg) };
  }
  const start = period === 'week' ? addDays(ref, -((new Date(`${ref}T12:00:00Z`).getUTCDay() + 6) % 7)) : `${ref.slice(0, 7)}-01`;
  const len = period === 'week' ? 7 : new Date(Date.UTC(Number(ref.slice(0, 4)), Number(ref.slice(5, 7)), 0)).getUTCDate();
  const days = Array.from({ length: len }, (_, i) => {
    const day = addDays(start, i), st = q.tempStats.get(d.mac, dayStart(day), dayStart(addDays(day, 1)));
    return { key: day, label: period === 'week' ? weekdayLabels()[i] : String(i + 1), min: r1(st.min), max: r1(st.max), avg: r1(st.avg) };
  });
  const has = days.filter((x) => x.min != null);
  return { period, ref, days, min: has.length ? Math.min(...has.map((x) => x.min)) : null, max: has.length ? Math.max(...has.map((x) => x.max)) : null,
    avg: has.length ? Math.round(has.reduce((a, x) => a + x.avg, 0) / has.length * 10) / 10 : null };
}
// CSV: raw data (every 30 s) or aggregated per 5 minutes, hour or day (average power, total energy)
function csvExport(mac, from, to, res = 'raw') {
  const a = dayStart(from), b = dayStart(addDays(to, 1));
  const rows = rowsOf(mac, a, b);
  const names = Object.fromEntries([...devices.values()].map((d) => [d.mac, nameOf(d)]));
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: CFG.tz, timeStyle: 'medium', hourCycle: 'h23' });
  const when = (ts) => `${dayKey(ts)} ${fmt.format(ts)}`;
  if (res === 'raw') {
    const lines = [tr('Zeit;Gerät;Leistung W;Energie Wh')];
    for (const s of rows) lines.push(`${when(s.ts)};${names[s.mac] || s.mac};${s.w.toFixed(1)};${(s.wh || 0).toFixed(3)}`);
    return lines.join('\n');
  }
  const step = { '5min': 300e3, hour: 3600e3 }[res];
  const groups = new Map();
  for (const s of rows) {
    const b = step ? Math.floor(s.ts / step) * step : dayStart(dayKey(s.ts)), k = `${b}|${s.mac}`, g = groups.get(k) || { b, mac: s.mac, w: 0, n: 0, wh: 0 };
    g.w += s.w; g.n++; g.wh += s.wh || 0; groups.set(k, g);
  }
  const lines = [tr('{0};Gerät;Leistung Ø W;Energie Wh', res === 'day' ? tr('Tag') : tr('Zeit'))];
  for (const g of [...groups.values()].sort((x, y) => x.b - y.b || x.mac.localeCompare(y.mac))) {
    lines.push(`${res === 'day' ? dayKey(g.b) : when(g.b).slice(0, 16)};${names[g.mac] || g.mac};${(g.w / g.n).toFixed(1)};${g.wh.toFixed(2)}`);
  }
  return lines.join('\n');
}

// ---------- Scenes ----------
// Initial scene until the first save; its name is stored data from then on
const defaultScenes = () => [{ id: 'alles-aus', name: tr('Alles aus'), actions: {} }];
function cleanScenes(list) {
  if (!Array.isArray(list)) return meta('scenes', defaultScenes());
  return list.slice(0, 30).map((s) => ({
    id: String(s.id || crypto.randomUUID()).slice(0, 40), name: String(s.name || tr('Szene')).trim().slice(0, 30) || tr('Szene'),
    actions: Object.fromEntries(Object.entries(s.actions || {}).filter(([mac, a]) => devices.has(mac) && ['on', 'off'].includes(a))),
    time: clean({ on: false, at: '23:00', days: [1, 2, 3, 4, 5, 6, 0] }, s.time || {}),
  }));
}
async function runScene(id) {
  const s = meta('scenes', defaultScenes()).find((x) => x.id === id);
  if (!s) throw new Error(tr('Unbekannte Szene.'));
  const acts = Object.keys(s.actions).length ? s.actions : Object.fromEntries([...devices.values()].filter(switchable).map((x) => [x.mac, 'off'])); // empty = all off
  const errors = [];
  for (const [mac, a] of Object.entries(acts)) {
    const d = devices.get(mac);
    if (!d || d.cfg.lock || !switchable(d)) continue;
    try { if (R(mac).relay !== (a === 'on')) await setRelay(mac, a === 'on', `Szene ${s.name}`); } catch { errors.push(nameOf(d)); }
  }
  return { ok: !errors.length, errors };
}

// ---------- Push notifications (Web Push, no third-party services; as in the solar dashboard) ----------
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s), 'base64url');
function vapidKeys() {
  let v = meta('vapid', null);
  if (!v) {
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = privateKey.export({ format: 'jwk' });
    v = { jwk, pub: b64u(Buffer.concat([Buffer.from([4]), fromB64u(jwk.x), fromB64u(jwk.y)])) };
    setMeta('vapid', v);
  }
  return v;
}
function vapidAuth(endpoint) {
  const v = vapidKeys();
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: CFG.pushContact }));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: crypto.createPrivateKey({ key: v.jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${v.pub}`;
}
// Encrypt the payload for one device (RFC 8291, aes128gcm)
function encryptPush(keys, payload) {
  const uaPub = fromB64u(keys.p256dh), authSecret = fromB64u(keys.auth);
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const asPub = ecdh.getPublicKey(), secret = ecdh.computeSecret(uaPub);
  const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
  const ikm = hmac(hmac(authSecret, secret), Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub, Buffer.from([1])]));
  const salt = crypto.randomBytes(16), prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, ct]);
}
async function pushAll(msg) {
  const subs = meta('pushSubs', []), keep = [];
  let sent = 0, error = null;
  for (const s of subs) {
    try {
      const r = await fetch(s.endpoint, {
        method: 'POST', body: encryptPush(s.keys, JSON.stringify(msg)), signal: AbortSignal.timeout(15000),
        headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'high', Authorization: vapidAuth(s.endpoint) },
      });
      if (r.status === 404 || r.status === 410) continue;
      keep.push(s);
      if (r.ok) sent++; else error = `HTTP ${r.status}`;
    } catch (e) { keep.push(s); error = e.message; }
  }
  if (keep.length !== subs.length) setMeta('pushSubs', keep);
  if (error) console.error(new Date().toISOString(), 'Push:', error);
  return { sent, total: subs.length, error };
}
// Alarm: into the history and as a notification; tapping opens the socket.
// title and body are German (stored like that); the notification itself goes out in the UI language.
function notify(d, kind, title, body) {
  logEvent(d.mac, 'alarm', body ? `${title}. ${body}` : title);
  if (!CFG.demo) pushAll({ title: trText(title), body: trText(body), url: `./#dev/${d.mac}`, tag: `${kind}-${d.mac}` }).catch(() => {});
}

// ---------- Location: convert a place name to coordinates (Open-Meteo, Switzerland first) ----------
async function geocode(text) {
  const m = text.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (m) return { lat: Number(m[1]), lon: Number(m[2]), place: `${m[1]}, ${m[2]}` };
  for (const cc of ['CH', null]) {
    const u = new URL('https://geocoding-api.open-meteo.com/v1/search');
    u.searchParams.set('name', text); u.searchParams.set('count', '1'); u.searchParams.set('language', 'de');
    if (cc) u.searchParams.set('countryCode', cc);
    const r = await fetch(u, { signal: AbortSignal.timeout(10000) });
    const g = r.ok ? (await r.json())?.results?.[0] : null;
    if (g) return { lat: g.latitude, lon: g.longitude, place: [g.name, g.admin1?.replace(/^Kanton /, ''), g.country_code !== 'CH' ? g.country : null].filter(Boolean).join(', ') };
  }
  throw new Error(tr('Ort „{0}“ nicht gefunden. Versuche einen anderen Ortsnamen oder Koordinaten wie 47.46, 8.19.', text));
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const PUBLIC = path.join(__dirname, 'public');
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 100_000) { reject(new Error(tr('Anfrage zu gross.'))); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); } });
  });
}
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), p = url.pathname, sp = url.searchParams;
  const json = (data, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  try {
    if (p === '/api/state') return json(apiState());
    const dm = /^\/api\/devices\/([0-9A-Z]{12})(\/relay)?$/.exec(p), dev = dm && devices.get(dm[1]);
    if (dm && !dev) return json({ error: tr('Unbekanntes Gerät.') }, 404);
    if (dm?.[2] && req.method === 'POST') {
      const b = await readBody(req);
      if (dev.cfg.lock) return json({ error: tr('Tastensperre ist an.') }, 423);
      if (!R(dev.mac).online) return json({ error: tr('{0} ist nicht erreichbar.', nameOf(dev)) }, 503);
      await setRelay(dev.mac, Boolean(b.on), 'von Hand in der App', { force: true }); // by hand: no shutdown first
      return json(deviceJson(dev));
    }
    // "Test connection" for the shutdown agent: is it reachable and is the token right (does not shut down)
    const tm = /^\/api\/devices\/([0-9A-Z]{12})\/shutdown-test$/.exec(p);
    if (tm && req.method === 'POST') {
      const d = devices.get(tm[1]); if (!d) return json({ error: tr('Unbekanntes Gerät.') }, 404);
      const sd = d.cfg.shutdown;
      if (!sd.url || !sd.token) return json({ error: tr('Bitte zuerst Adresse und Token eintragen.') }, 400);
      try {
        const res = await fetch(`${sd.url}/check`, { headers: { Authorization: `Bearer ${sd.token}` }, signal: AbortSignal.timeout(4000) });
        if (res.status === 401) return json({ error: tr('Token falsch') }, 422);
        if (!res.ok) return json({ error: `HTTP ${res.status}` }, 422);
        return json({ ok: true, message: tr('Verbindung ok') });
      } catch { return json({ error: tr('Keine Antwort von {0}', sd.url) }, 422); }
    }
    // read-only diagnostics: what the device itself reports (settings, list of firmware endpoints)
    const gm = /^\/api\/devices\/([0-9A-Z]{12})\/diag$/.exec(p);
    if (gm && req.method === 'GET') {
      const d = devices.get(gm[1]); if (!d) return json({ error: tr('Unbekanntes Gerät.') }, 404);
      if (CFG.demo) return json({ settings: { rest: true, panel: true, hap_disable: false, name: '', temp_offset: 0 }, help: '(Demo)' });
      const get = async (path) => { try { const r = await fetch(`http://${d.ip}${path}`, { signal: AbortSignal.timeout(4000) }); return (await r.text()).slice(0, 8000); } catch (e) { return `! ${e.message}`; } };
      const raw = await get('/api/v1/settings'); let settings; try { settings = JSON.parse(raw); } catch { settings = raw; }
      return json({ settings, help: await get('/help') });
    }
    const lm = /^\/api\/devices\/([0-9A-Z]{12})\/light$/.exec(p);
    if (lm && req.method === 'POST') {
      const d = devices.get(lm[1]); if (!d || kindOf(d) !== 'bulb') return json({ error: tr('Keine Lampe.') }, 404);
      if (!R(d.mac).online) return json({ error: tr('{0} ist nicht erreichbar.', nameOf(d)) }, 503);
      await setLight(d.mac, await readBody(req)); return json(deviceJson(d));
    }
    // called by the button (GET) or from the app for testing (POST)
    const bm = /^\/api\/button\/([0-9A-Z]{12})\/(single|double|long|touch)$/.exec(p);
    if (bm) {
      const d = devices.get(bm[1]); if (!d || kindOf(d) !== 'button') return json({ error: tr('Kein Taster.') }, 404);
      await buttonPress(d, bm[2]); return json(deviceJson(d));
    }
    if (dm && req.method === 'PUT') {
      const b = await readBody(req);
      if (b.cfg?.shutdown?.token === '__set__') delete b.cfg.shutdown.token; // placeholder from the app: keep the saved token
      dev.cfg = clean(DEFAULT_CFG(), merge(dev.cfg, b.cfg || {}));
      saveDevice(dev);
      if (kindOf(dev) === 'button' && b.cfg?.button) { R(dev.mac).synced = null; buttonAwake(dev); } // works if it is awake right now; otherwise on the next press
      return json(deviceJson(dev));
    }
    if (dm && req.method === 'DELETE') {
      devices.delete(dev.mac); rt.delete(dev.mac); q.delDevice.run(dev.mac);
      if (sp.get('data') === '1') q.delSamples.run(dev.mac);
      return json({ ok: true });
    }
    if (p === '/api/devices' && req.method === 'POST') {
      const ip = String((await readBody(req)).ip || '').trim();
      if (!/^[\w.-]+$/.test(ip)) return json({ error: tr('Bitte eine IP-Adresse angeben, z. B. 192.168.0.42.') }, 400);
      try { const d = await addByIp(ip); await pollDevice(d); return json(deviceJson(d)); } catch (e) { return json({ error: e.name === 'TimeoutError' ? tr('Unter {0} antwortet nichts.', ip) : e.message }, 422); }
    }
    if (p === '/api/curve') {
      const mac = sp.get('mac') || 'all', day = sp.get('day') || dayKey(Date.now());
      if (!isDay(day) || !validMac(mac)) return json({ error: tr('mac und day (JJJJ-MM-TT) angeben') }, 400);
      return json(apiCurve(mac, day));
    }
    if (p === '/api/bars') {
      const mac = sp.get('mac') || 'all', period = sp.get('period'), ref = sp.get('ref') || dayKey(Date.now());
      if (!['week', 'month', 'year'].includes(period) || !isDay(ref) || !validMac(mac)) return json({ error: tr('period (week|month|year), ref (JJJJ-MM-TT) und mac angeben') }, 400);
      return json(apiBars(mac, period, ref));
    }
    if (p === '/api/temp') {
      const d = devices.get(sp.get('mac')), period = sp.get('period') || 'day', ref = sp.get('ref') || dayKey(Date.now());
      if (!d || !['day', 'week', 'month'].includes(period) || !isDay(ref)) return json({ error: tr('mac, period (day|week|month) und ref (JJJJ-MM-TT) angeben') }, 400);
      return json(apiTemp(d, period, ref));
    }
    if (p === '/api/totals') { const mac = sp.get('mac') || 'all'; if (!validMac(mac)) return json({ error: tr('unbekanntes Gerät') }, 400); return json(apiTotals(mac)); }
    if (p === '/api/events') { const mac = sp.get('mac'); return json(q.events.all(mac, mac, Math.min(200, Number(sp.get('n') || 50))).map((e) => ({ ...e, text: trText(e.text) }))); }
    if (p === '/api/export.csv') {
      const mac = sp.get('mac') || 'all', from = sp.get('from'), to = sp.get('to'), step = ['raw', '5min', 'hour', 'day'].includes(sp.get('res')) ? sp.get('res') : 'raw';
      if (!isDay(from) || !isDay(to) || !validMac(mac)) return json({ error: tr('from und to als JJJJ-MM-TT und bekannte Geräte angeben') }, 400);
      const name = mac === 'all' ? tr('alle') : macsOf(mac).map((m) => nameOf(devices.get(m))).join('+').replace(/[^\w+-]+/g, '_');
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${tr('steckdosen')}-${name}-${from}-${to}-${step === 'raw' ? '30s' : step}.csv"` });
      return res.end(`\ufeff${csvExport(mac, from, to, step)}`);
    }
    if (p === '/api/scenes' && req.method === 'PUT') { const s = cleanScenes((await readBody(req)).scenes); setMeta('scenes', s); return json(s); }
    const sm = /^\/api\/scenes\/([\w-]+)\/run$/.exec(p);
    if (sm && req.method === 'POST') return json(await runScene(sm[1]));
    if (p === '/api/settings' && req.method === 'PUT') {
      const b = (await readBody(req)).settings || {};
      let next = { ...settings, ...clean({ price: settings.price, lat: settings.lat, lon: settings.lon }, b) };
      if (b.lang === 'de' || b.lang === 'en') next.lang = b.lang;
      if (Array.isArray(b.order)) next.order = [...new Set(b.order.map(String).filter((k) => /^[\w-]{1,24}$/.test(k)))].slice(0, 60);
      if (typeof b.place === 'string' && b.place.trim()) {
        try { next = { ...next, ...(await geocode(b.place.trim().slice(0, 80))) }; } catch (e) { return json({ error: e.name === 'TimeoutError' ? tr('Die Ortssuche antwortet nicht.') : e.message }, 422); }
      } else if (b.lat != null && b.lon != null) next.place = b.place ?? `${Number(b.lat).toFixed(2)}, ${Number(b.lon).toFixed(2)}`;
      settings = next; setMeta('settings', settings);
      return json(settings);
    }
    if (p === '/api/push/key') return json({ key: vapidKeys().pub });
    if (p === '/api/push/subscribe' && req.method === 'POST') {
      const b = await readBody(req), ep = String(b.endpoint || '');
      if (!/^https:\/\//.test(ep) || !b.keys?.p256dh || !b.keys?.auth) return json({ error: tr('Ungültiges Abo.') }, 400);
      const subs = meta('pushSubs', []).filter((x) => x.endpoint !== ep);
      subs.push({ endpoint: ep, keys: { p256dh: String(b.keys.p256dh), auth: String(b.keys.auth) }, created: Date.now() });
      setMeta('pushSubs', subs.slice(-10));
      return json({ ok: true });
    }
    if (p === '/api/push/unsubscribe' && req.method === 'POST') {
      const ep = String((await readBody(req)).endpoint || '');
      setMeta('pushSubs', meta('pushSubs', []).filter((x) => x.endpoint !== ep));
      return json({ ok: true });
    }
    if (p === '/api/push/test' && req.method === 'POST') {
      const r = await pushAll({ title: tr('Test von myStrom'), body: tr('So sehen Alarme aus. Antippen öffnet die App.'), url: './', tag: 'test' });
      return json(r, r.sent ? 200 : 422);
    }
    if (p === '/healthz') return json({ ok: true, devices: devices.size });

    const rel = p === '/' ? 'index.html' : decodeURIComponent(p.slice(1));
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch (e) {
    if (e?.code === 'ENOENT' || e?.code === 'EISDIR') { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(tr('Nicht gefunden')); }
    console.error(e); json({ error: String(e.message || e) }, 500);
  }
});

// ---------- Start ----------
if (CFG.demo && !devices.size) {
  const names = [['DEMO00000001', 'Schreibtisch', 'Büro'], ['DEMO00000002', 'Magic Mirror', 'Schlafzimmer'], ['DEMO00000003', 'Lampe', 'Wohnzimmer']];
  for (const [mac, name, room] of names) {
    const cfg = { ...DEFAULT_CFG(), name, room };
    if (mac.endsWith('1')) cfg.schedule = { on: true, entries: [{ id: 's1', start: '07:00', end: '23:00', days: [1, 2, 3, 4, 5, 6, 0], idle: true, below: 25, mins: 10 }] };
    if (mac.endsWith('2')) cfg.schedule = { on: true, entries: [{ id: 's1', start: '06:30', end: '23:00', days: [1, 2, 3, 4, 5] }, { id: 's2', start: '08:30', end: '23:30', days: [6, 0] }] };
    if (mac.endsWith('3')) cfg.vacation.on = true;
    const d = { mac, ip: `demo-${mac.slice(-1)}`, type: 106, fw: '4.0.14', cfg, added: Date.now() };
    devices.set(mac, d); saveDevice(d);
  }
}
// Demo: plus a bulb, a button and a motion sensor (also in older demo databases)
if (CFG.demo) for (const [mac, type, name, room] of DEMO_EXTRA) {
  if (!devices.has(mac)) {
    const cfg = { ...DEFAULT_CFG(), name, room };
    if (type === 104) { cfg.button.single = { do: 'toggle', mac: 'DEMO00000004', scene: '' }; cfg.button.long = { do: 'scene', mac: '', scene: 'alles-aus' }; }
    if (type === 110) cfg.motion = { on: true, targets: ['DEMO00000004'], dark: true, lux: 30, mins: 2 };
    const d = { mac, ip: `demo-${mac.slice(-1)}`, type, fw: '2.74', cfg, added: Date.now() }; devices.set(mac, d); saveDevice(d);
  }
  if (type === 104) Object.assign(R(mac), { online: true, seen: Date.now(), voltage: 3.9, charge: false });
}
server.listen(CFG.port, () => console.log(`myStrom-App läuft auf http://0.0.0.0:${CFG.port}${CFG.demo ? ' (Demo)' : ''}, ${devices.size} Geräte bekannt`));
for (const ip of CFG.hosts) addByIp(ip).then(pollDevice).catch((e) => console.error('Gerät', ip, e.message));
discover();
await pollAll().catch((e) => console.error('Messen:', e.message));
setInterval(() => pollAll().catch((e) => console.error('Messen:', e.message)), CFG.pollMs);
setInterval(() => q.pruneEvents.run(Date.now() - 400 * 864e5), 24 * 3600e3);

// Daily backup from 3 am to data/backup, the last 14 days are kept
const BACKUP_DIR = path.join(path.dirname(CFG.dbPath), 'backup');
function backupDb() {
  try {
    if (CFG.demo || minOfDay(Date.now()) < 180) return;
    mkdirSync(BACKUP_DIR, { recursive: true });
    const file = path.join(BACKUP_DIR, `mystrom-${dayKey(Date.now())}.db`);
    if (existsSync(file)) return;
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    for (const f of readdirSync(BACKUP_DIR).filter((x) => /^mystrom-\d{4}-\d{2}-\d{2}\.db$/.test(x)).sort().slice(0, -14)) unlinkSync(path.join(BACKUP_DIR, f));
  } catch (e) { console.error('Backup:', e.message); }
}
setTimeout(backupDb, 2 * 60e3); setInterval(backupDb, 30 * 60e3);
