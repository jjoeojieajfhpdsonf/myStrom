// myStrom-App – Backend
// Findet die myStrom WiFi Switches im Heimnetz, misst alle 30 s, speichert den Verlauf in SQLite, führt die Regeln aus
// (Zeitplan, nachts aus wenn inaktiv, Ferien, Sonne, Temperatur, Stromsparen, Timer) und meldet Alarme als Web Push.
// Alles lokal, ohne myStrom-Konto und ohne Cloud. Keine npm-Abhängigkeiten (Node >= 22.13).

import http from 'node:http';
import dgram from 'node:dgram';
import { readFile } from 'node:fs/promises';
import { mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;

const CFG = {
  port: Number(env.PORT || 8091),
  pollMs: Number(env.POLL_SECONDS || 30) * 1000,
  dbPath: env.DB_PATH || path.join(__dirname, 'data', 'mystrom.db'),
  tz: env.TZ || 'Europe/Zurich',
  demo: env.DEMO === '1',
  hosts: (env.DEVICES || '').split(',').map((s) => s.trim()).filter(Boolean), // feste IPs zusätzlich zur automatischen Suche
  pushContact: env.PUSH_CONTACT || 'mailto:mystrom-app@example.com',
};

const DEFAULT_SETTINGS = { price: Number(env.TARIFF || 0.30), lat: Number(env.LAT || 47.37), lon: Number(env.LON || 8.54), place: '' };
const TYPES = { 101: 'WiFi Switch CH v1', 106: 'WiFi Switch CH v2', 107: 'WiFi Switch EU', 120: 'WiFi Switch Zero', 125: 'WiFi Switch CH v2' };

// ---------- Datenbank ----------
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
delete settings.priceFromSolar; // stammte aus dem früheren Abgleich mit dem Solar-Dashboard

// ---------- Zeit in der Zeitzone des Hauses ----------
const fmtDay = new Intl.DateTimeFormat('sv-SE', { timeZone: CFG.tz, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHM = new Intl.DateTimeFormat('en-GB', { timeZone: CFG.tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const fmtWd = new Intl.DateTimeFormat('en-US', { timeZone: CFG.tz, weekday: 'short' });
const dayKey = (ts) => fmtDay.format(ts);
const clock = (ts) => fmtHM.format(ts);
const minOfDay = (ts) => { const [h, m] = clock(ts).split(':').map(Number); return h * 60 + m; };
const weekday = (ts) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(fmtWd.format(ts)); // 0 = Sonntag
const hm2min = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };
const min2hm = (m) => { m = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const addDays = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// Beginn eines Kalendertags in der Zeitzone (über die Abweichung zur UTC-Mittagszeit, sommerzeitfest genug für Tagesgrenzen)
function dayStart(day) {
  const noon = Date.parse(`${day}T12:00:00Z`), off = minOfDay(noon) - 720;
  return Date.parse(`${day}T00:00:00Z`) - off * 60e3;
}
const dShort = (day) => { const [, m, d] = day.split('-').map(Number); return `${d}.${m}.`; };
const inWindow = (m, from, to) => { const a = hm2min(from), b = hm2min(to); return a <= b ? m >= a && m < b : m >= a || m < b; };
const pw = (w) => (w < 1000 ? `${Math.round(w)} W` : `${(w / 1000).toFixed(2)} kW`);
const hash01 = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };

// Sonnenauf- und -untergang (NOAA-Näherung, auf ein bis zwei Minuten genau), in Minuten nach Mitternacht Ortszeit
function sunTimes(day, lat = settings.lat, lon = settings.lon) {
  const d = new Date(`${day}T12:00:00Z`), n = Math.round((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5), g = 2 * Math.PI / 365 * (n - 1);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const la = lat * Math.PI / 180, cosH = Math.cos(90.833 * Math.PI / 180) / (Math.cos(la) * Math.cos(decl)) - Math.tan(la) * Math.tan(decl);
  if (cosH > 1 || cosH < -1) return null;
  const ha = Math.acos(cosH) * 180 / Math.PI, off = minOfDay(d.getTime()) - 720;
  return { rise: Math.round(720 - 4 * (lon + ha) - eqt + off), set: Math.round(720 - 4 * (lon - ha) - eqt + off) };
}

// ---------- Einstellungen pro Steckdose ----------
// Jede Funktion der myStrom-App (auch PLUS, PRO, DATA PRO, HOME GUARD) als Block; alles ist hier frei.
const DEFAULT_CFG = () => {
  const today = dayKey(Date.now());
  return {
    name: '', room: '', icon: '', tcorr: 0, lock: false,
    actions: [], // Power Actions: wenn über/unter X W, dann …
    // mehrere Zeitpläne mit eigenen Zeiten; jeder Wochentag (0 = So … 6 = Sa) gehört höchstens zu einem
    schedule: { on: false, entries: [{ id: 's1', start: '07:00', end: '23:00', days: [1, 2, 3, 4, 5, 6, 0] }] },
    idle: { on: false, from: '23:00', to: '07:00', below: 25, mins: 10, backOn: true }, // nachts aus, wenn nicht mehr benutzt
    temp: { on: false, max: 45 },
    sun: { on: false, off: false, onOffset: 0, offOffset: 0 },
    vacation: { on: false, from: today, to: addDays(today, 7), morning: { on: true, from: '06:30', to: '07:30' }, evening: { on: true, from: '19:00', to: '22:30' } },
    alarms: { offline: true, unusual: true, switchedOn: false, hot: true },
    saver: { on: false, below: 5, mins: 30, back: 'time', at: '07:00', hours: 2 },
    timer: { on: false, mins: 120 },
  };
};
// Eingaben nach dem Muster der Standardwerte prüfen: Zeit, Datum, Zahl, Ja/Nein, Text, Wochentage
const LIMITS = { price: [0, 5], lat: [-90, 90], lon: [-180, 180], tcorr: [-10, 10], below: [0, 3000], mins: [1, 1440], max: [20, 90], onOffset: [-180, 180], offOffset: [-180, 180], hours: [1, 48] };
function clean(def, val, key = '') {
  if (val === undefined || val === null) return def;
  if (typeof def === 'boolean') return Boolean(val);
  if (typeof def === 'number') { const n = Number(val), [lo, hi] = LIMITS[key] || [-1e6, 1e6]; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; }
  if (key === 'actions') return cleanActions(val);
  if (key === 'schedule') return cleanSchedule(val);
  if (Array.isArray(def)) return Array.isArray(val) ? [...new Set(val.map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))] : def;
  if (typeof def === 'object') return Object.fromEntries(Object.entries(def).map(([k, d]) => [k, clean(d, val[k], k)]));
  const s = String(val).trim();
  if (/^\d{2}:\d{2}$/.test(def)) return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : def;
  if (/^\d{4}-\d{2}-\d{2}$/.test(def)) return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : def;
  if (key === 'back') return ['hand', 'time', 'after'].includes(s) ? s : def;
  return s.slice(0, 40);
}
// Zeitpläne prüfen; alte Form (ein start/end/days) wird zum ersten Eintrag. Ein Tag, der schon vergeben ist, fällt beim späteren weg.
function cleanSchedule(v) {
  const hm = (x, d) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(x)) ? String(x) : d), used = new Set();
  const raw = Array.isArray(v.entries) ? v.entries : v.start ? [{ id: 's1', start: v.start, end: v.end, days: v.days }] : [{ id: 's1' }];
  const entries = raw.slice(0, 7).map((e, i) => {
    const days = [...new Set((Array.isArray(e.days) ? e.days : [1, 2, 3, 4, 5, 6, 0]).map(Number))].filter((x) => Number.isInteger(x) && x >= 0 && x <= 6 && !used.has(x));
    days.forEach((x) => used.add(x));
    return { id: /^[\w-]{1,16}$/.test(e.id) ? e.id : `s${i + 1}`, start: hm(e.start, '07:00'), end: hm(e.end, '23:00'), days };
  });
  return { on: Boolean(v.on), entries };
}
// Power Actions prüfen: Bedingung (über/unter Watt, Mindestdauer) und was dann passiert
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

// ---------- Geräte ----------
const devices = new Map(); // mac -> { mac, ip, type, fw, cfg, added }
for (const r of q.devices.all()) devices.set(r.mac, { ...r, cfg: clean(DEFAULT_CFG(), JSON.parse(r.cfg || '{}')) });
const saveDevice = (d) => q.putDevice.run(d.mac, d.ip, d.type, d.fw, JSON.stringify(d.cfg), d.added);
const nameOf = (d) => d.cfg.name || `Steckdose ${d.mac.slice(-4)}`;
// Laufzustand (nicht gespeichert): Messwerte, Verbindungsfehler, Zähler der Regeln
const rt = new Map();
const R = (mac) => { if (!rt.has(mac)) rt.set(mac, { online: false, fails: 0, w: 0, relay: false, temp: null, seen: 0 }); return rt.get(mac); };

// Demo: drei simulierte Steckdosen, damit sich die App ohne echte Geräte ausprobieren lässt
const demo = { DEMO00000001: { relay: true, e: 0 }, DEMO00000002: { relay: true, e: 0 }, DEMO00000003: { relay: false, e: 0 } };
function demoReport(mac) {
  const s = demo[mac], m = minOfDay(Date.now()), j = Math.random();
  const base = mac.endsWith('1') ? (m >= 7 * 60 + 30 && m < 23 * 60 + 40 ? 95 + j * 40 : 28 + j * 3) : mac.endsWith('2') ? 26 + j * 4 : 9;
  const w = s.relay ? base : 0; s.e += w * CFG.pollMs / 1000;
  return { power: w, relay: s.relay, temperature: 22 + j, boot_id: 'DEMO', energy_since_boot: s.e };
}

async function devFetch(d, p, timeout = 4000) {
  if (CFG.demo) {
    if (p === '/report') return demoReport(d.mac);
    const m = /relay\?state=(\d)/.exec(p); if (m) demo[d.mac].relay = m[1] === '1';
    return {};
  }
  const r = await fetch(`http://${d.ip}${p}`, { signal: AbortSignal.timeout(timeout) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const t = await r.text();
  return t ? JSON.parse(t) : {};
}
// Gerät per IP aufnehmen oder aktualisieren (Name und Regeln bleiben)
async function addByIp(ip) {
  const info = await fetch(`http://${ip}/api/v1/info`, { signal: AbortSignal.timeout(4000) }).then((r) => r.json());
  const mac = String(info.mac || '').toUpperCase().replace(/[^0-9A-F]/g, '');
  if (mac.length !== 12) throw new Error('Unter dieser Adresse antwortet kein myStrom-Gerät.');
  const old = devices.get(mac);
  const d = { mac, ip, type: info.type ?? old?.type ?? null, fw: info.version ?? old?.fw ?? null, cfg: old?.cfg || DEFAULT_CFG(), added: old?.added || Date.now() };
  if (!old) logEvent(mac, 'info', `Gefunden unter ${ip}`);
  else if (old.ip !== ip) logEvent(mac, 'info', `Neue Adresse ${ip}`);
  devices.set(mac, d); saveDevice(d);
  return d;
}
// Automatische Suche: jedes myStrom-Gerät meldet sich alle paar Sekunden per UDP-Broadcast auf Port 7979
// (6 Bytes MAC, 1 Byte Gerätetyp). Bekannte Geräte bekommen so auch eine neue IP mit.
function discover() {
  if (CFG.demo) return;
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const busy = new Set();
  sock.on('message', async (msg, from) => {
    if (msg.length < 7) return;
    const mac = msg.subarray(0, 6).toString('hex').toUpperCase(), type = msg[6];
    if (![101, 106, 107, 120, 125].includes(type)) return; // nur Steckdosen (keine Taster, Lampen, Bulbs)
    const d = devices.get(mac);
    if ((d && d.ip === from.address) || busy.has(mac)) return;
    busy.add(mac);
    try { await pollDevice(await addByIp(from.address)); } catch (e) { console.error('Suche:', from.address, e.message); } finally { busy.delete(mac); }
  });
  sock.on('error', (e) => console.error('Suche (UDP 7979):', e.message));
  sock.bind(7979);
}

// ---------- Ereignisse und Schalten ----------
function logEvent(mac, kind, text) { q.addEvent.run(Date.now(), mac, kind, text); }
// Schalten mit Grund; der Grund erscheint im Verlauf und im Status ("Aus seit 23:31 · nicht mehr benutzt")
async function setRelay(mac, on, why) {
  const d = devices.get(mac), r = R(mac);
  if (!d) throw new Error('Unbekanntes Gerät.');
  await devFetch(d, `/relay?state=${on ? 1 : 0}`);
  r.expect = { relay: on, until: Date.now() + CFG.pollMs * 2 };
  if (r.relay !== on) edge(d, on, why);
  r.relay = on; if (!on) r.w = 0;
}
// Ein- oder Ausschalten erkannt (von uns, am Gerät oder von einer anderen App)
function edge(d, on, why) {
  const r = R(d.mac), now = Date.now();
  logEvent(d.mac, on ? 'on' : 'off', why);
  r.lowSince = null; r.saverSince = null;
  if (on) { r.onSince = now; r.offBy = null; if (d.cfg.alarms.switchedOn && !/App|Szene/.test(why)) notify(d, 'on', `${nameOf(d)} wurde eingeschaltet`, why); }
  else r.onSince = null;
}

// ---------- Messen ----------
let lastTick = Date.now();
async function pollDevice(d) {
  const r = R(d.mac), now = Date.now();
  try {
    const rep = await devFetch(d, '/report');
    const relay = Boolean(rep.relay), w = Math.max(0, Number(rep.power) || 0);
    // Energie aus dem Zähler des Geräts (Wattsekunden seit dem Start), sonst Leistung mal Zeit
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
  // Szenen zu festen Zeiten
  const crossed = crossedFn(prev, lastTick);
  for (const sc of meta('scenes', DEFAULT_SCENES)) {
    if (sc.time?.on && sc.time.days.includes(weekday(lastTick)) && crossed(hm2min(sc.time.at))) await runScene(sc.id).catch((e) => console.error('Szene', sc.name, e.message));
  }
}

// ---------- Regeln ----------
// Uhrzeit-Regeln schalten genau einmal, wenn die Uhr die eingestellte Minute überschreitet (wie bei myStrom);
// dazwischen kannst du jederzeit von Hand schalten. Bedingungen (Leistung, Temperatur) prüft jeder Messdurchgang.
function crossedFn(prev, now) {
  const a = minOfDay(prev), b = minOfDay(now), sameDay = dayKey(prev) === dayKey(now);
  return (m) => { m = ((m % 1440) + 1440) % 1440; if (a === b && sameDay) return false; return a < b ? m > a && m <= b : m > a || m <= b; };
}
// Ferien: jeden Tag ein anderer, aber fester Zeitpunkt im Fenster (Zufall aus Gerät + Datum), morgens kurz, abends länger
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
    p99Cache.v[mac] = ws.length > 2000 ? ws[Math.floor(ws.length * 0.99)] : null; // erst nach einigen Tagen Messung
  }
  return p99Cache.v[mac];
}
async function runRules(d, prev, now) {
  const c = d.cfg, r = R(d.mac), m = minOfDay(now), day = dayKey(now), crossed = crossedFn(prev, now);
  if (!r.online) return;
  const sw = async (on, why) => { if (r.relay !== on) await setRelay(d.mac, on, why); };
  // Zeitplan
  const t = c.schedule.on && c.schedule.entries.find((e) => e.days.includes(weekday(now)));
  if (t) {
    if (crossed(hm2min(t.start))) await sw(true, 'Zeitplan');
    if (crossed(hm2min(t.end))) await sw(false, 'Zeitplan');
  }
  // Nachts aus, wenn nicht mehr benutzt: im Zeitfenster abschalten, sobald die Leistung lange genug unter der Schwelle bleibt
  if (c.idle.on) {
    if (r.relay && inWindow(m, c.idle.from, c.idle.to)) {
      if (r.w < c.idle.below) {
        r.lowSince ||= now;
        if (now - r.lowSince >= c.idle.mins * 60e3) { await sw(false, 'nicht mehr benutzt'); r.offBy = 'idle'; }
      } else r.lowSince = null;
    } else r.lowSince = null;
    if (c.idle.backOn && crossed(hm2min(c.idle.to)) && r.offBy === 'idle') await sw(true, 'morgens wieder an');
  }
  // Temperatur
  const temp = r.temp == null ? null : r.temp + c.tcorr;
  if (c.temp.on && r.relay && temp != null && temp > c.temp.max) { await sw(false, `zu warm (${temp.toFixed(1)} °C)`); }
  if (c.alarms.hot && temp != null && temp > (c.temp.on ? c.temp.max : 45) && now - (r.hotSent || 0) > 6 * 3600e3) {
    r.hotSent = now; notify(d, 'hot', `${nameOf(d)} ist ${temp.toFixed(1)} °C warm`, 'Die Steckdose misst eine ungewöhnlich hohe Temperatur.');
  }
  // Sonnenauf- und -untergang
  const sun = sunTimes(day);
  if (sun && c.sun.on && crossed(sun.set + c.sun.onOffset)) await sw(true, 'Sonnenuntergang');
  if (sun && c.sun.off && crossed(sun.rise + c.sun.offOffset)) await sw(false, 'Sonnenaufgang');
  // Ferien (Home Guard): auch das Fenster von gestern Abend beachten, falls es über Mitternacht reicht
  for (const [dd, shift] of [[day, 0], [addDays(day, -1), -1440]]) {
    for (const s of vacationSlots(d, dd)) {
      if (crossed(s.start + shift)) await sw(true, `Ferien ${s.key}`);
      if (crossed(s.end + shift)) await sw(false, `Ferien ${s.key}`);
    }
  }
  // Stromsparen: hängt das Gerät nur im Standby, abschalten; wieder an je nach Einstellung
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
  // Timer: nach dem Einschalten eine bestimmte Zeit an
  if (c.timer.on && r.relay && r.onSince && now - r.onSince >= c.timer.mins * 60e3) await sw(false, `Timer ${c.timer.mins} min abgelaufen`);
  // Power Actions: gilt die Bedingung lange genug, einmal auslösen; erst wieder, wenn sie zwischendurch nicht mehr galt.
  // „Unter X W“ zählt erst, nachdem das Gerät darüber gelaufen ist; sonst meldete „Waschmaschine fertig“ auch ohne Waschgang.
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
  // ungewöhnlicher Verbrauch: drei Messungen hintereinander deutlich über dem, was das Gerät sonst zieht
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

// ---------- Status für die App ----------
function statusText(d) {
  const r = R(d.mac), c = d.cfg, now = Date.now(), m = minOfDay(now);
  if (!r.online) return r.seen ? `Offline seit ${clock(r.seen)}` : 'Wird verbunden …';
  if (r.relay && c.idle.on && inWindow(m, c.idle.from, c.idle.to)) {
    if (r.lowSince) return `Unter ${c.idle.below} W · aus in ${Math.max(1, Math.ceil(c.idle.mins - (now - r.lowSince) / 60e3))} min`;
    return `${pw(r.w)} · wartet, du arbeitest noch`;
  }
  if (r.relay && c.timer.on && r.onSince) return `${pw(r.w)} · Timer, aus um ${clock(r.onSince + c.timer.mins * 60e3)}`;
  if (r.relay) return pw(r.w);
  const e = q.lastSwitch.get(d.mac);
  if (e?.kind === 'off' && now - e.ts < 18 * 3600e3) return `Aus seit ${clock(e.ts)} · ${e.text}`;
  const today = dayKey(now);
  if (c.vacation.on && today < c.vacation.from) return `Aus · Ferien ab ${dShort(c.vacation.from)}`;
  return 'Aus';
}
// mac: 'all', ein Gerät oder mehrere mit Komma (A,B) – dann die Summe der gewählten
const macsOf = (mac) => (mac === 'all' ? null : mac.split(','));
const validMac = (mac) => mac === 'all' || (!!mac && mac.split(',').every((m) => devices.has(m)));
const sumOver = (mac, all, one) => (mac === 'all' ? all() : macsOf(mac).reduce((a, m) => a + one(m), 0));
const rowsOf = (mac, from, to) => (mac === 'all' ? q.samplesAll.all(from, to)
  : macsOf(mac).flatMap((m) => q.samples.all(m, from, to).map((s) => ({ ...s, mac: m }))).sort((x, y) => x.ts - y.ts));
const sinceWh = (mac, ts) => sumOver(mac, () => q.sumWhAll.get(ts).wh, (m) => q.sumWh.get(m, ts).wh);
function deviceJson(d) {
  const r = R(d.mac), today = dayKey(Date.now());
  return {
    mac: d.mac, ip: d.ip, type: d.type, typeName: TYPES[d.type] || `Typ ${d.type}`, fw: d.fw, name: nameOf(d), cfg: d.cfg,
    online: r.online, relay: r.relay, w: r.w, temp: r.temp == null ? null : Math.round((r.temp + d.cfg.tcorr) * 10) / 10, tempRaw: r.temp,
    status: statusText(d), todayWh: sinceWh(d.mac, dayStart(today)), lowSince: r.lowSince || null, onSince: r.onSince || null,
    vacationToday: vacationSlots(d, today).map((s) => ({ key: s.key, start: min2hm(s.start), end: min2hm(s.end) })),
  };
}
function apiState() {
  const today = dayKey(Date.now()), sun = sunTimes(today);
  return {
    settings, now: Date.now(), today, sun: sun && { rise: min2hm(sun.rise), set: min2hm(sun.set) }, demo: CFG.demo,
    devices: [...devices.values()].map(deviceJson), scenes: meta('scenes', DEFAULT_SCENES), pushSubs: meta('pushSubs', []).length,
  };
}
// Tagesverlauf in 5-Minuten-Schritten (Mittelwert W), dazu Summe und Spitze
function apiCurve(mac, day) {
  const from = dayStart(day), to = dayStart(addDays(day, 1)), n = Math.round((to - from) / 300e3);
  const rows = rowsOf(mac, from, to);
  const per = new Map(); // je Gerät und Fenster: Summe, Anzahl
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
function apiBars(mac, period, ref) {
  const pad = (n) => String(n).padStart(2, '0'), now = Date.now();
  let buckets;
  if (period === 'week') {
    const wd = (new Date(`${ref}T12:00:00Z`).getUTCDay() + 6) % 7, start = addDays(ref, -wd);
    buckets = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((label, i) => { const day = addDays(start, i); return { key: day, label, from: dayStart(day), to: dayStart(addDays(day, 1)) }; });
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
// CSV: Rohdaten (alle 30 s) oder zusammengefasst je 5 Minuten, Stunde oder Tag (Mittelwert Leistung, Summe Energie)
function csvExport(mac, from, to, res = 'raw') {
  const a = dayStart(from), b = dayStart(addDays(to, 1));
  const rows = rowsOf(mac, a, b);
  const names = Object.fromEntries([...devices.values()].map((d) => [d.mac, nameOf(d)]));
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: CFG.tz, timeStyle: 'medium', hourCycle: 'h23' });
  const when = (ts) => `${dayKey(ts)} ${fmt.format(ts)}`;
  if (res === 'raw') {
    const lines = ['Zeit;Gerät;Leistung W;Energie Wh'];
    for (const s of rows) lines.push(`${when(s.ts)};${names[s.mac] || s.mac};${s.w.toFixed(1)};${(s.wh || 0).toFixed(3)}`);
    return lines.join('\n');
  }
  const step = { '5min': 300e3, hour: 3600e3 }[res];
  const groups = new Map();
  for (const s of rows) {
    const b = step ? Math.floor(s.ts / step) * step : dayStart(dayKey(s.ts)), k = `${b}|${s.mac}`, g = groups.get(k) || { b, mac: s.mac, w: 0, n: 0, wh: 0 };
    g.w += s.w; g.n++; g.wh += s.wh || 0; groups.set(k, g);
  }
  const lines = [`${res === 'day' ? 'Tag' : 'Zeit'};Gerät;Leistung Ø W;Energie Wh`];
  for (const g of [...groups.values()].sort((x, y) => x.b - y.b || x.mac.localeCompare(y.mac))) {
    lines.push(`${res === 'day' ? dayKey(g.b) : when(g.b).slice(0, 16)};${names[g.mac] || g.mac};${(g.w / g.n).toFixed(1)};${g.wh.toFixed(2)}`);
  }
  return lines.join('\n');
}

// ---------- Szenen ----------
const DEFAULT_SCENES = [{ id: 'alles-aus', name: 'Alles aus', actions: {} }];
function cleanScenes(list) {
  if (!Array.isArray(list)) return meta('scenes', DEFAULT_SCENES);
  return list.slice(0, 30).map((s) => ({
    id: String(s.id || crypto.randomUUID()).slice(0, 40), name: String(s.name || 'Szene').trim().slice(0, 30) || 'Szene',
    actions: Object.fromEntries(Object.entries(s.actions || {}).filter(([mac, a]) => devices.has(mac) && ['on', 'off'].includes(a))),
    time: clean({ on: false, at: '23:00', days: [1, 2, 3, 4, 5, 6, 0] }, s.time || {}),
  }));
}
async function runScene(id) {
  const s = meta('scenes', DEFAULT_SCENES).find((x) => x.id === id);
  if (!s) throw new Error('Unbekannte Szene.');
  const acts = Object.keys(s.actions).length ? s.actions : Object.fromEntries([...devices.keys()].map((m) => [m, 'off'])); // leer = alles aus
  const errors = [];
  for (const [mac, a] of Object.entries(acts)) {
    const d = devices.get(mac);
    if (!d || d.cfg.lock) continue;
    try { if (R(mac).relay !== (a === 'on')) await setRelay(mac, a === 'on', `Szene ${s.name}`); } catch { errors.push(nameOf(d)); }
  }
  return { ok: !errors.length, errors };
}

// ---------- Push-Mitteilungen (Web Push, ohne fremde Dienste; wie im Solar-Dashboard) ----------
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
// Inhalt für ein Gerät verschlüsseln (RFC 8291, aes128gcm)
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
// Alarm: in den Verlauf und als Mitteilung; Antippen öffnet die Steckdose
function notify(d, kind, title, body) {
  logEvent(d.mac, 'alarm', body ? `${title}. ${body}` : title);
  if (!CFG.demo) pushAll({ title, body, url: `./#dev/${d.mac}`, tag: `${kind}-${d.mac}` }).catch(() => {});
}

// ---------- Standort: Ortsname in Koordinaten umwandeln (Open-Meteo, zuerst in der Schweiz) ----------
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
  throw new Error(`Ort „${text}“ nicht gefunden. Versuche einen anderen Ortsnamen oder Koordinaten wie 47.46, 8.19.`);
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const PUBLIC = path.join(__dirname, 'public');
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 100_000) { reject(new Error('zu gross')); req.destroy(); } });
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
    if (dm && !dev) return json({ error: 'Unbekanntes Gerät.' }, 404);
    if (dm?.[2] && req.method === 'POST') {
      const b = await readBody(req);
      if (dev.cfg.lock) return json({ error: 'Tastensperre ist an.' }, 423);
      if (!R(dev.mac).online) return json({ error: `${nameOf(dev)} ist nicht erreichbar.` }, 503);
      await setRelay(dev.mac, Boolean(b.on), 'von Hand in der App');
      return json(deviceJson(dev));
    }
    if (dm && req.method === 'PUT') {
      const b = await readBody(req);
      dev.cfg = clean(DEFAULT_CFG(), merge(dev.cfg, b.cfg || {}));
      saveDevice(dev);
      return json(deviceJson(dev));
    }
    if (dm && req.method === 'DELETE') {
      devices.delete(dev.mac); rt.delete(dev.mac); q.delDevice.run(dev.mac);
      if (sp.get('data') === '1') q.delSamples.run(dev.mac);
      return json({ ok: true });
    }
    if (p === '/api/devices' && req.method === 'POST') {
      const ip = String((await readBody(req)).ip || '').trim();
      if (!/^[\w.-]+$/.test(ip)) return json({ error: 'Bitte eine IP-Adresse angeben, z. B. 192.168.0.42.' }, 400);
      try { const d = await addByIp(ip); await pollDevice(d); return json(deviceJson(d)); } catch (e) { return json({ error: e.name === 'TimeoutError' ? `Unter ${ip} antwortet nichts.` : e.message }, 422); }
    }
    if (p === '/api/curve') {
      const mac = sp.get('mac') || 'all', day = sp.get('day') || dayKey(Date.now());
      if (!isDay(day) || !validMac(mac)) return json({ error: 'mac und day (JJJJ-MM-TT) angeben' }, 400);
      return json(apiCurve(mac, day));
    }
    if (p === '/api/bars') {
      const mac = sp.get('mac') || 'all', period = sp.get('period'), ref = sp.get('ref') || dayKey(Date.now());
      if (!['week', 'month', 'year'].includes(period) || !isDay(ref) || !validMac(mac)) return json({ error: 'period (week|month|year), ref (JJJJ-MM-TT) und mac angeben' }, 400);
      return json(apiBars(mac, period, ref));
    }
    if (p === '/api/totals') { const mac = sp.get('mac') || 'all'; if (!validMac(mac)) return json({ error: 'unbekanntes Gerät' }, 400); return json(apiTotals(mac)); }
    if (p === '/api/events') { const mac = sp.get('mac'); return json(q.events.all(mac, mac, Math.min(200, Number(sp.get('n') || 50)))); }
    if (p === '/api/export.csv') {
      const mac = sp.get('mac') || 'all', from = sp.get('from'), to = sp.get('to'), step = ['raw', '5min', 'hour', 'day'].includes(sp.get('res')) ? sp.get('res') : 'raw';
      if (!isDay(from) || !isDay(to) || !validMac(mac)) return json({ error: 'from und to als JJJJ-MM-TT und bekannte Geräte angeben' }, 400);
      const name = mac === 'all' ? 'alle' : macsOf(mac).map((m) => nameOf(devices.get(m))).join('+').replace(/[^\w+-]+/g, '_');
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="steckdosen-${name}-${from}-${to}-${step === 'raw' ? '30s' : step}.csv"` });
      return res.end(`\ufeff${csvExport(mac, from, to, step)}`);
    }
    if (p === '/api/scenes' && req.method === 'PUT') { const s = cleanScenes((await readBody(req)).scenes); setMeta('scenes', s); return json(s); }
    const sm = /^\/api\/scenes\/([\w-]+)\/run$/.exec(p);
    if (sm && req.method === 'POST') return json(await runScene(sm[1]));
    if (p === '/api/settings' && req.method === 'PUT') {
      const b = (await readBody(req)).settings || {};
      let next = { ...settings, ...clean({ price: settings.price, lat: settings.lat, lon: settings.lon }, b) };
      if (Array.isArray(b.order)) next.order = [...new Set(b.order.map(String).filter((k) => /^[\w-]{1,24}$/.test(k)))].slice(0, 60);
      if (typeof b.place === 'string' && b.place.trim()) {
        try { next = { ...next, ...(await geocode(b.place.trim().slice(0, 80))) }; } catch (e) { return json({ error: e.name === 'TimeoutError' ? 'Die Ortssuche antwortet nicht.' : e.message }, 422); }
      } else if (b.lat != null && b.lon != null) next.place = b.place ?? `${Number(b.lat).toFixed(2)}, ${Number(b.lon).toFixed(2)}`;
      settings = next; setMeta('settings', settings);
      return json(settings);
    }
    if (p === '/api/push/key') return json({ key: vapidKeys().pub });
    if (p === '/api/push/subscribe' && req.method === 'POST') {
      const b = await readBody(req), ep = String(b.endpoint || '');
      if (!/^https:\/\//.test(ep) || !b.keys?.p256dh || !b.keys?.auth) return json({ error: 'Ungültiges Abo.' }, 400);
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
      const r = await pushAll({ title: 'Test von myStrom', body: 'So sehen Alarme aus. Antippen öffnet die App.', url: './', tag: 'test' });
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
    if (e?.code === 'ENOENT' || e?.code === 'EISDIR') { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Nicht gefunden'); }
    console.error(e); json({ error: String(e.message || e) }, 500);
  }
});

// ---------- Start ----------
if (CFG.demo && !devices.size) {
  const names = [['DEMO00000001', 'Schreibtisch', 'Büro'], ['DEMO00000002', 'Magic Mirror', 'Schlafzimmer'], ['DEMO00000003', 'Lampe', 'Wohnzimmer']];
  for (const [mac, name, room] of names) {
    const cfg = { ...DEFAULT_CFG(), name, room };
    if (mac.endsWith('1')) cfg.idle.on = true;
    if (mac.endsWith('2')) cfg.schedule = { on: true, entries: [{ id: 's1', start: '06:30', end: '23:00', days: [1, 2, 3, 4, 5] }, { id: 's2', start: '08:30', end: '23:30', days: [6, 0] }] };
    if (mac.endsWith('3')) cfg.vacation.on = true;
    const d = { mac, ip: `demo-${mac.slice(-1)}`, type: 106, fw: '4.0.14', cfg, added: Date.now() };
    devices.set(mac, d); saveDevice(d);
  }
}
server.listen(CFG.port, () => console.log(`myStrom-App läuft auf http://0.0.0.0:${CFG.port}${CFG.demo ? ' (Demo)' : ''}, ${devices.size} Geräte bekannt`));
for (const ip of CFG.hosts) addByIp(ip).then(pollDevice).catch((e) => console.error('Gerät', ip, e.message));
discover();
await pollAll().catch((e) => console.error('Messen:', e.message));
setInterval(() => pollAll().catch((e) => console.error('Messen:', e.message)), CFG.pollMs);
setInterval(() => q.pruneEvents.run(Date.now() - 400 * 864e5), 24 * 3600e3);

// Tägliches Backup ab 3 Uhr nach data/backup, die letzten 14 Tage bleiben
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
