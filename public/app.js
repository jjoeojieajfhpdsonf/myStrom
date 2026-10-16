// Steckdosen – Oberfläche im Stil der myStrom-App, mit allen Funktionen (auch PLUS, PRO, DATA PRO, HOME GUARD) frei.
// Bedienung: Kachel wischen schaltet, tippen öffnet das Gerät. Änderungen speichern sofort.
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
let S = null; // Zustand vom Server
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pw = (w) => (w < 1000 ? `${Math.round(w)} W` : `${(w / 1000).toFixed(2)} kW`);
const pwN = (w) => (w < 1000 ? [String(Math.round(w)), 'W'] : [(w / 1000).toFixed(2), 'kW']);
const kwh = (wh) => (wh / 1000).toFixed(2);
const chf = (wh) => (wh / 1000 * (S?.settings.price || 0)).toFixed(2);
const dShort = (day) => { const [, m, d] = day.split('-').map(Number); return `${d}.${m}.`; };
const addDays = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const dayLabel = (day) => (day === S.today ? 'Heute' : day === addDays(S.today, -1) ? 'Gestern' : `${Number(day.slice(8))}. ${MONTHS[Number(day.slice(5, 7)) - 1]}`);
const dev = (mac) => S.devices.find((d) => d.mac === mac);
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* privat */ } } };

// Linien-Symbole wie in der myStrom-App
const I = {
  plug: '<svg viewBox="0 0 48 64" width="40" height="54" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 6h24a6 6 0 0 1 6 6v36a10 10 0 0 1-10 10H16A10 10 0 0 1 6 48V12a6 6 0 0 1 6-6z"/><ellipse cx="24" cy="18" rx="11" ry="7"/><circle cx="19.5" cy="18" r="1.4" fill="currentColor"/><circle cx="28.5" cy="18" r="1.4" fill="currentColor"/><circle cx="24" cy="21.5" r="1.4" fill="currentColor"/><circle cx="13" cy="50" r="1.4" fill="currentColor"/></svg>',
  scenes: '<svg viewBox="0 0 64 64" width="52" height="52" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="20" width="26" height="26" rx="4" transform="rotate(45 21 33)"/><rect x="16" y="20" width="26" height="26" rx="4" transform="rotate(45 29 33)"/><rect x="24" y="20" width="26" height="26" rx="4" transform="rotate(45 37 33)"/></svg>',
  guard: '<svg viewBox="0 0 64 64" width="50" height="50" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M32 6 54 14v16c0 14-9 23-22 28C19 53 10 44 10 30V14z"/><path d="M32 10 50 17v13c0 12-7.5 19.5-18 24C21.5 49.5 14 42 14 30V17z"/><path d="M23 33 32 25l9 8M26 31v10h12V31"/></svg>',
  bolt: '<svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M36 6 18 36h12l-4 22 20-32H34z"/></svg>',
  rules: '<svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="32" cy="32" r="22"/><path d="M32 18v14l9 6"/><path d="M50 12l4 4M14 12l-4 4"/></svg>',
  bell: '<svg viewBox="0 0 64 64" width="46" height="46" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 44V30a14 14 0 0 1 28 0v14l4 4H14z"/><path d="M27 52a5 5 0 0 0 10 0"/></svg>',
  clock: '<svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="32" cy="32" r="24"/><path d="M32 16v16h10"/></svg>',
  idle: '<svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M44 40A18 18 0 1 1 30 14a14 14 0 0 0 14 26z"/><path d="M44 14h8l-8 9h8"/></svg>',
  temp: '<svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="32" cy="32" r="24"/><path d="M29 18a3 3 0 0 1 6 0v18a6 6 0 1 1-6 0z"/><path d="M32 26v14"/></svg>',
  sun: '<svg viewBox="0 0 80 48" width="64" height="38" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 38a18 18 0 0 1 36 0M8 38h64M14 44h52M40 6v8M18 14l5 5M62 14l-5 5M8 26h7M65 26h7"/></svg>',
  beach: '<svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M30 14c10-6 22-2 26 6L30 14zM30 14c-4 8-2 16 2 20M30 14 44 54M14 40l14 4M12 48l8-10 12 4-6 10"/></svg>',
  leaf: '<svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 52C12 28 28 12 54 12c0 26-16 40-40 40zM14 52 36 30"/></svg>',
  timer: '<svg viewBox="0 0 64 64" width="40" height="52" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="32" cy="32" rx="18" ry="26"/><path d="M14 32h36M32 32v-8M26 42l6-4 6 4"/></svg>',
  evals: '<svg viewBox="0 0 80 48" width="64" height="38" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 26 24 14l16 24 18-26 14 10"/><circle cx="8" cy="26" r="3"/><circle cx="24" cy="14" r="3"/><circle cx="40" cy="38" r="3"/><circle cx="58" cy="12" r="3"/><circle cx="72" cy="22" r="3"/></svg>',
  pact: '<svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><circle cx="32" cy="32" r="24"/><path d="M35 16 23 35h9l-3 13 12-19h-9z"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  toggle: (on) => `<svg viewBox="0 0 64 40" width="64" height="40" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="58" height="30" rx="15"/><circle class="knob" cx="18" cy="20" r="10" fill="${on ? '#fff' : '#777'}" stroke="none" style="transform:translateX(${on ? 28 : 0}px)"/></svg>`,
};

// Funktionen pro Steckdose: Schlüssel = Block in den Einstellungen
const FEAT = [
  ['schedule', 'clock', 'Zeitplan'], ['actions', 'pact', 'Power Actions'], ['vacation', 'beach', 'Ferien'],
  ['sun', 'sun', 'Sonne'], ['timer', 'timer', 'Timer'], ['saver', 'leaf', 'Stromsparen'],
  ['temp', 'temp', 'Temperatur'], ['alarms', 'bell', 'Alarme'], ['eval', 'evals', 'Auswertung'],
];
const FTITLE = { schedule: 'Zeitplan', vacation: 'Ferienmodus', sun: 'Sonne', timer: 'Timer', saver: 'Stromsparen',
  temp: 'Temperatur', alarms: 'Alarme', eval: 'Auswertung', settings: 'Einstellungen', tech: 'Technische Details', room: 'Raum wählen', roomnew: 'Eigener Raum', icon: 'Symbol wählen', actions: 'Power Actions' };
const RI = (d) => `<svg viewBox="0 0 64 64" width="58" height="58" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${d}</svg>`;
const ROOM_ICON = {
  sofa: RI('<path d="M10 26h44v16H10zM14 26v-6h36v6M10 42v4M54 42v4M10 32h44"/><path d="M6 30h4v12H6zM54 30h4v12h-4z"/>'),
  bed: RI('<path d="M14 10h36v44H14zM14 18h36M32 18v36M18 22h10v6H18zM36 22h10v6H36z"/><path d="M28 40l-4 4M40 40l-4 4"/>'),
  attic: RI('<path d="M6 46 32 24l26 22zM44 30v-10h4v14"/><circle cx="32" cy="38" r="4"/><path d="M28 38h8M32 34v8"/>'),
  baby: RI('<path d="M16 30a16 16 0 0 1 32 0zM16 30h32v6a10 10 0 0 1-10 10H26a10 10 0 0 1-10-10zM48 30l6-8"/><circle cx="22" cy="52" r="3"/><circle cx="42" cy="52" r="3"/>'),
  balcony: RI('<path d="M22 8h20v28H22zM32 8v28M22 18h20M29 26h-2M37 26h-2"/><path d="M14 36h36v16H14zM18 36v16M23 36v16M28 36v16M33 36v16M38 36v16M43 36v16M48 36v16"/>'),
  stairs: RI('<path d="M8 12h8v8h8v8h8v8h8v8h8v8h8"/>'),
  bath: RI('<path d="M8 22h46v16a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6zM12 26h38v10H12zM54 26h4M54 32h4M58 24v10"/><circle cx="20" cy="31" r="1.5"/>'),
  office: RI('<path d="M20 12h24v18H20zM32 30v8M26 38h12M8 44h48M12 44v12M52 44v12"/>'),
  dining: RI('<circle cx="32" cy="32" r="12"/><circle cx="32" cy="32" r="7"/><path d="M12 14v8a4 4 0 0 0 4 4v24M16 14v8M20 14v8a4 4 0 0 1-4 4M52 14c-4 2-4 10 0 14v22"/>'),
  hall: RI('<path d="M18 8h28v48H18zM22 12h20v40H22z"/><circle cx="38" cy="33" r="1.5"/><path d="M10 56h44"/>'),
  garage: RI('<path d="M6 26 32 10l26 16v30H6zM14 56V32h36v24M14 38h36M14 44h36M14 50h36"/>'),
  garden: RI('<circle cx="32" cy="24" r="14"/><path d="M32 38v18M32 46l-6-6M32 44l6-6M20 56h24"/>'),
  guest: RI('<path d="M16 22h32v28H16zM26 22v-6h12v6M16 30h32M24 50v4M40 50v4"/>'),
  cinema: RI('<path d="M14 26h36v26H14zM14 26 12 18l34-6 2 8zM20 17l4 6M30 15l4 6M40 14l4 6M14 32h36"/><path d="M28 37v10l8-5z"/>'),
  kids: RI('<circle cx="32" cy="34" r="16"/><path d="M16 30c4-10 28-10 32 0M26 26h22l4 4"/><circle cx="27" cy="38" r="1.5"/><circle cx="37" cy="38" r="1.5"/><path d="M28 44c2 2 6 2 8 0"/>'),
  kitchen: RI('<path d="M14 28h36v16a8 8 0 0 1-8 8H22a8 8 0 0 1-8-8zM8 30h6M50 30h6M24 22h16M32 22v-4"/><path d="M24 12c0-3 3-3 3-6M32 12c0-3 3-3 3-6M40 12c0-3 3-3 3-6"/>'),
  laundry: RI('<path d="M14 8h36v48H14zM14 18h36"/><circle cx="32" cy="36" r="11"/><path d="M24 38c4 4 12 4 16-2"/><circle cx="20" cy="13" r="1.5"/><circle cx="26" cy="13" r="1.5"/>'),
  workshop: RI('<path d="M40 10a10 10 0 0 0-12 13L10 41a5 5 0 0 0 7 7l18-18a10 10 0 0 0 13-12l-6 6-6-1-1-6z"/>'),
  plus: RI('<circle cx="32" cy="32" r="20"/><path d="M32 22v20M22 32h20"/>'),
  none: RI('<path d="M14 14h36v36H14z" stroke-dasharray="4 4"/>'),
};
// Vorlagen wie in der myStrom-App, alphabetisch
const ROOMS = [['Babyzimmer', 'baby'], ['Badezimmer', 'bath'], ['Balkon', 'balcony'], ['Büro', 'office'], ['Esszimmer', 'dining'], ['Estrich', 'attic'], ['Flur', 'hall'],
  ['Garage', 'garage'], ['Garten', 'garden'], ['Gästezimmer', 'guest'], ['Heimkino', 'cinema'], ['Keller', 'stairs'], ['Kinderzimmer', 'kids'], ['Küche', 'kitchen'],
  ['Schlafzimmer', 'bed'], ['Waschküche', 'laundry'], ['Werkstatt', 'workshop'], ['Wohnzimmer', 'sofa']];
// Geräte-Symbole: was an der Steckdose hängt
const DI = (d) => `<svg viewBox="0 0 64 64" width="54" height="54" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">${d}</svg>`;
const DEV_ICONS = [
  ['plug', 'Steckdose', null],
  ['lamp', 'Tischlampe', DI('<path d="M22 10h20l8 22H14zM32 32v18M22 54h20"/>')],
  ['floor', 'Stehlampe', DI('<path d="M24 6h16l6 14H18zM32 20v34M24 56h16"/>')],
  ['monitor', 'Bildschirm', DI('<path d="M8 12h48v30H8zM26 52h12M32 42v10"/>')],
  ['pc', 'Computer', DI('<path d="M18 6h28v52H18zM24 14h16M24 20h16"/><circle cx="32" cy="46" r="3"/>')],
  ['desk', 'Arbeitsplatz', DI('<path d="M20 12h24v16H20zM32 28v6M26 34h12M8 40h48M12 40v16M52 40v16"/>')],
  ['tv', 'Fernseher', DI('<path d="M6 16h52v32H6zM24 54h16M26 10l6 6 6-6"/>')],
  ['mirror', 'Smart Mirror', DI('<path d="M16 6h32v52H16zM20 10h24v44H20zM24 16h8M24 21h12M24 26h6"/>')],
  ['speaker', 'Lautsprecher', DI('<rect x="18" y="6" width="28" height="52" rx="4"/><circle cx="32" cy="38" r="9"/><circle cx="32" cy="19" r="4"/>')],
  ['coffee', 'Kaffeemaschine', DI('<path d="M14 22h28v16a10 10 0 0 1-10 10h-8a10 10 0 0 1-10-10zM42 26h4a6 6 0 0 1 0 12h-4M10 54h40M22 8c0 4 4 4 4 8M30 8c0 4 4 4 4 8"/>')],
  ['kettle', 'Wasserkocher', DI('<path d="M18 20h24l4 34H14zM42 24c9 0 9 18 0 18M24 14h12M30 14v6"/>')],
  ['fan', 'Ventilator', DI('<circle cx="32" cy="26" r="17"/><path d="M32 26c0-8 6-12 10-10s-2 10-10 10zM32 26c-7 4-14 1-13-4s10-3 13 4zM32 26c7 4 6 12 2 13s-6-6-2-13zM32 43v9M22 56h20"/>')],
  ['heater', 'Heizung', DI('<path d="M10 16h44v32H10zM19 16v32M28 16v32M37 16v32M46 16v32M14 48v6M50 48v6"/>')],
  ['washer', 'Waschmaschine', DI('<path d="M14 6h36v52H14zM14 16h36"/><circle cx="32" cy="36" r="11"/><circle cx="20" cy="11" r="1.5"/>')],
  ['fridge', 'Kühlschrank', DI('<path d="M18 4h28v56H18zM18 24h28M24 12v6M24 30v10"/>')],
  ['router', 'Router', DI('<path d="M8 36h48v14H8zM16 36l-4-20M48 36l4-20M16 43h3M24 43h3M32 43h3"/>')],
  ['charger', 'Ladestation', DI('<path d="M20 6h24v52H20zM34 20l-6 11h8l-6 11"/>')],
  ['printer', 'Drucker', DI('<path d="M14 24h36v20H14zM22 24V8h20v16M22 36h20v20H22zM42 30h2"/>')],
  ['plant', 'Pflanzenlicht', DI('<path d="M20 40h24l-4 16H24zM32 40V24M32 30c-8 0-12-6-12-12 8 0 12 6 12 12M32 26c6 0 10-4 10-10-6 0-10 4-10 10"/>')],
  ['tree', 'Weihnachtsbaum', DI('<path d="M32 4l12 16h-6l10 14h-8l10 14H14l10-14h-8l10-14h-6zM32 48v10"/>')],
];
// eigenes Symbol, sonst am Namen erraten, sonst die Steckdose
const GUESS = [[/lamp|licht|leuchte/, 'lamp'], [/mirror|spiegel/, 'mirror'], [/\btv\b|fernseh/, 'tv'], [/bildschirm|monitor/, 'monitor'], [/\bpc\b|computer|rechner/, 'pc'],
  [/schreibtisch|büro|arbeit/, 'desk'], [/kaffee|espresso/, 'coffee'], [/wasserkocher/, 'kettle'], [/ventilator/, 'fan'], [/heiz|radiator/, 'heater'],
  [/wasch/, 'washer'], [/kühl/, 'fridge'], [/router|wlan|wifi/, 'router'], [/ladestation|ladeger/, 'charger'], [/drucker/, 'printer'], [/pflanz/, 'plant'],
  [/weihnacht|tannenbaum/, 'tree'], [/lautsprecher|sonos/, 'speaker']];
function iconKey(d) {
  if (d.cfg.icon && DEV_ICONS.some(([k]) => k === d.cfg.icon)) return d.cfg.icon;
  const n = d.name.toLowerCase();
  return GUESS.find(([re]) => re.test(n))?.[1] || 'plug';
}
const devIcon = (d) => DEV_ICONS.find(([k]) => k === iconKey(d))[2] || I.plug;
const iconName = (d) => DEV_ICONS.find(([k]) => k === iconKey(d))[1];
const roomIcon = (r) => ROOM_ICON[ROOMS.find(([n]) => n === r)?.[1]] || ROOM_ICON.sofa;
const WD = [[1, 'Mo'], [2, 'Di'], [3, 'Mi'], [4, 'Do'], [5, 'Fr'], [6, 'Sa'], [0, 'So']];
function daysText(days) {
  if (days.length === 7) return 'täglich';
  if (days.length === 5 && [1, 2, 3, 4, 5].every((x) => days.includes(x))) return 'Mo–Fr';
  if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Sa, So';
  return WD.filter(([n]) => days.includes(n)).map(([, l]) => l).join(', ') || 'nie';
}
// ist die Funktion eingeschaltet, und was tut sie (Kurzform für die Kachel)
function featInfo(d, k) {
  const c = d.cfg;
  switch (k) {
    case 'schedule': { const e = c.schedule.entries; return [c.schedule.on, e.length === 1 ? `${e[0].start}–${e[0].end}${e[0].idle ? ' oder später' : ` · ${daysText(e[0].days)}`}` : `${e.length} Zeitpläne · ${daysText(e.flatMap((x) => x.days))}`]; }
    case 'vacation': return [c.vacation.on, `${dShort(c.vacation.from)}–${dShort(c.vacation.to)}`];
    case 'sun': return [c.sun.on || c.sun.off, [c.sun.on && 'abends an', c.sun.off && 'morgens aus'].filter(Boolean).join(', ')];
    case 'timer': return [c.timer.on, `nach ${c.timer.mins < 60 ? `${c.timer.mins} min` : `${c.timer.mins / 60} h`} aus`];
    case 'saver': return [c.saver.on, `unter ${c.saver.below} W aus`];
    case 'temp': return [c.temp.on, `über ${c.temp.max} °C aus`];
    case 'alarms': { const n = Object.values(c.alarms).filter(Boolean).length; return [n > 0, `${n} von 4 an`]; }
    case 'actions': { const n = c.actions.filter((a) => a.on).length; return [n > 0, n === 1 ? actText(c.actions.find((a) => a.on)) : `${n} aktiv`]; }
    default: return [false, `${kwh(d.todayWh)} kWh heute`];
  }
}

// ---------- Server ----------
async function api(p, opt = {}) {
  const r = await fetch(p, { ...opt, headers: { 'Content-Type': 'application/json', ...opt.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Fehler ${r.status}`);
  return j;
}
async function load() {
  try { const first = !S; S = await api('api/state'); render(first); } catch (e) { if (!S) app.innerHTML = `<p class="empty-state">Server nicht erreichbar.<br>${esc(e.message)}</p>`; }
}
// Einstellungen eines Geräts ändern: sofort anzeigen, dann speichern
async function saveCfg(mac, patch) {
  const d = dev(mac);
  const deep = (a, b) => { for (const [k, v] of Object.entries(b)) { if (v && typeof v === 'object' && !Array.isArray(v)) deep(a[k], v); else a[k] = v; } };
  deep(d.cfg, patch); render();
  try { Object.assign(d, await api(`api/devices/${mac}`, { method: 'PUT', body: JSON.stringify({ cfg: patch }) })); render(); } catch (e) { toast(e.message, true); load(); }
}
const patchOf = (path, v) => path.split('.').reduceRight((acc, k) => ({ [k]: acc }), v);

// ---------- Haptik ----------
// Android: navigator.vibrate. iPhone (ab iOS 18) kennt das nicht, gibt aber beim Umschalten eines
// <input type="checkbox" switch> ein leichtes Tippen; das lösen wir unsichtbar aus. Geht nur direkt nach Tippen/Loslassen.
function haptic(ms = 10) {
  try {
    if (navigator.vibrate) { navigator.vibrate(ms); return; }
    const l = document.createElement('label'), i = document.createElement('input');
    l.ariaHidden = 'true'; l.style.display = 'none'; i.type = 'checkbox'; i.setAttribute('switch', '');
    l.append(i); document.head.append(l); l.click(); l.remove();
  } catch { /* ohne Haptik weiter */ }
}

// ---------- Schalten ----------
let toastT;
function toast(text, err = false) {
  const t = $('#toast');
  t.className = err ? 'err' : '';
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3000);
}
async function switchDev(mac, on) {
  const d = dev(mac);
  if (d.cfg.lock) { toast(`${d.name}: Tastensperre ist an`); return false; }
  if (!d.online) { toast(`${d.name} ist nicht erreichbar`, true); return false; }
  const before = { relay: d.relay, w: d.w, status: d.status };
  d.relay = on; d.status = on ? 'Eingeschaltet' : 'Aus · von Hand'; if (!on) d.w = 0; render();
  try {
    Object.assign(d, await api(`api/devices/${mac}/relay`, { method: 'POST', body: JSON.stringify({ on }) })); render();
    return true;
  } catch (e) { Object.assign(d, before); render(); toast(e.message, true); return false; }
}
const shake = (el) => el?.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-3px)' }, { transform: 'none' }], 260);

// ---------- Navigation über den Hash (#dev/MAC/timer), damit Zurück und Mitteilungen funktionieren ----------
const cur = () => location.hash.slice(1) || 'home';
const route = () => cur().split('/');
const depth = (h) => (h === 'home' ? 0 : h.split('/').length);
// Verlauf innerhalb der App: Zurück geht zur Seite davor, wenn das die übergeordnete ist, sonst direkt dorthin
const stack = [cur()], scrolls = {};
let dir = 0; // 1 = vorwärts, -1 = zurück (für die Animation)
function go(h) {
  if (h === cur()) return;
  scrolls[cur()] = scrollY;
  stack.push(h); dir = 1;
  history.pushState(null, '', `#${h}`);
  show();
}
function back(parent) {
  scrolls[cur()] = scrollY;
  const i = stack.lastIndexOf(parent);
  if (i >= 0 && i < stack.length - 1) { history.go(i - (stack.length - 1)); return; } // popstate erledigt den Rest
  stack.pop(); if (stack[stack.length - 1] !== parent) stack.push(parent);
  dir = -1;
  history.replaceState(null, '', `#${parent}`);
  show();
}
// Wischgeste "Zurück" des Browsers oder iOS
addEventListener('popstate', () => {
  const h = cur(), i = stack.lastIndexOf(h);
  dir = i >= 0 && i < stack.length - 1 ? -1 : depth(h) < depth(stack[stack.length - 1] || 'home') ? -1 : 1;
  if (i >= 0) stack.length = i + 1; else stack.push(h);
  show();
});
// Seitenwechsel wie unter iOS: die neue Seite schiebt sich von rechts über die alte, die alte weicht etwas nach
// links aus und wird dunkler; zurück genau umgekehrt. Dafür bleibt eine Kopie der alten Seite kurz stehen.
const EASE = 'cubic-bezier(.32,.72,0,1)', DUR = 380;
let ghost = null;
function show() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches, oldScroll = scrollY;
  for (const a of app.getAnimations()) a.finish(); // ein laufender Wechsel wird sofort fertig
  ghost?.remove(); ghost = null;
  if (dir && !reduced && S) {
    ghost = document.createElement('div');
    ghost.className = 'page-copy';
    const inner = app.cloneNode(true); inner.removeAttribute('id'); inner.removeAttribute('aria-live');
    ghost.append(inner);
    document.body.append(ghost);
    ghost.scrollTop = oldScroll; // Kopie zeigt genau den Ausschnitt, der eben zu sehen war
  }
  render(true);
  scrollTo(0, dir < 0 ? scrolls[cur()] || 0 : 0);
  if (ghost) {
    const g = ghost, w = innerWidth, fwd = dir > 0;
    document.documentElement.classList.add('paging');
    g.style.zIndex = fwd ? '1' : '30';
    const top = fwd ? app : g; // die Seite, die oben liegt und ganz hinein- bzw. hinausfährt
    top.style.boxShadow = '-12px 0 32px rgb(0 0 0 / .55)';
    const under = fwd ? g : app;
    const a1 = top.animate(fwd ? [{ transform: `translateX(${w}px)` }, { transform: 'none' }] : [{ transform: 'none' }, { transform: `translateX(${w}px)` }], { duration: DUR, easing: EASE });
    const a2 = under.animate(fwd ? [{ transform: 'none', filter: 'brightness(1)' }, { transform: `translateX(${-w * 0.3}px)`, filter: 'brightness(.55)' }]
      : [{ transform: `translateX(${-w * 0.3}px)`, filter: 'brightness(.55)' }, { transform: 'none', filter: 'brightness(1)' }], { duration: DUR, easing: EASE });
    a1.finished.catch(() => {}).then(() => { if (ghost === g) { g.remove(); ghost = null; } top.style.boxShadow = ''; document.documentElement.classList.remove('paging'); });
    // Sicherheitsnetz: pausiert der Browser die Animation (App im Hintergrund, verdeckter Tab), steht die Seite trotzdem
    // spätestens nach kurzer Zeit richtig; sonst bliebe sie verschoben und jedes Tippen ginge daneben
    setTimeout(() => { for (const a of [a1, a2]) if (a.playState !== 'finished') a.finish(); }, DUR + 150);
  }
  dir = 0;
}
// vom linken Rand nach rechts wischen = zurück (auf dem iPhone-Homescreen gibt es sonst keine Zurück-Geste)
let edge = null;
addEventListener('pointerdown', (e) => { if (e.clientX < 24 && cur() !== 'home' && e.pointerType !== 'mouse') edge = { x: e.clientX, y: e.clientY, id: e.pointerId }; }, true);
addEventListener('pointermove', (e) => {
  if (!edge || e.pointerId !== edge.id) return;
  if (Math.abs(e.clientY - edge.y) > 40) { edge = null; return; }
  if (e.clientX - edge.x > 70) { edge = null; $('[data-back]')?.click(); }
}, true);
addEventListener('pointerup', () => { edge = null; }, true);
const HD = (title, backTo, right = '<span></span>', sub = '') => `<header class="hd"><button type="button" class="ic" data-back="${backTo}" aria-label="Zurück">‹</button><b>${title}${sub ? `<small>${sub}</small>` : ''}</b>${right}</header>`;

// ---------- Bausteine ----------
const sw = (path, on, label) => `<button type="button" class="sw" data-sw="${path}" aria-pressed="${on}" aria-label="${esc(label)}"></button>`;
const row = (label, right, sub = '', attrs = '') => `<${attrs ? `button type="button" ${attrs}` : 'div'} class="row"><span class="tx"><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</span>${right}</${attrs ? 'button' : 'div'}>`;
const inp = (path, type, value, extra = '') => `<input type="${type}" data-in="${path}" value="${esc(value)}" ${extra}>`;
const lrow = (label, input, sub = '') => `<label class="row"><span class="tx"><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</span>${input}</label>`;
const master = (d, k, label = 'Aktiv') => `<div class="row master"><span class="tx"><b>${label}</b></span>${sw(`${k}.on`, d.cfg[k].on, label)}</div>`;

// Zahlen mit − / + statt Freitext: Schritte aus einer Liste sinnvoller Werte, Einheit gleich in der Anzeige
const dur = (m) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m / 60} h`);
// bis 1 h in 5 min, bis 6 h in 15 min, darüber in 30 min; genauer per Antippen des Werts
const DURS = [1, 2, 3, 4, ...Array.from({ length: 12 }, (_, i) => 5 + i * 5), ...Array.from({ length: 20 }, (_, i) => 75 + i * 15), ...Array.from({ length: 36 }, (_, i) => 390 + i * 30)];
const WATTS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 120, 150, 200, 250, 300, 400, 500, 600, 800, 1000, 1200, 1500, 2000, 2500, 3000];
const range = (a, b, st) => Array.from({ length: Math.round((b - a) / st) + 1 }, (_, i) => Math.round((a + i * st) * 10) / 10);
const STEPS = {
  dur: [DURS, dur], dur240: [DURS.filter((m) => m <= 240), dur], dur0: [[0, ...DURS], (m) => (m ? dur(m) : 'sofort')],
  watt: [WATTS, (w) => `${String(w).replace('.', ',')} W`], watt1: [WATTS.filter((w) => w >= 1), (w) => `${w} W`],
  offs: [range(-180, 180, 5), (m) => (m ? `${m > 0 ? '+' : '−'}${dur(Math.abs(m))}` : 'genau')],
  hours: [range(1, 48, 1), (h) => `${h} h`],
  temp: [range(20, 90, 1), (t) => `${t} °C`],
  tcorr: [range(-10, 10, 0.5), (t) => `${t > 0 ? '+' : t < 0 ? '−' : ''}${String(Math.abs(t)).replace('.', ',')} °C`],
};
// path: Einstellung (z. B. timer.mins) oder a:feld für die gerade offene Power Action
const stepper = (path, list, v, label) => {
  const [vals, fmt] = STEPS[list];
  return `<span class="stp" role="group" aria-label="${esc(label)}"><button type="button" data-step="${path}" data-list="${list}" data-dir="-1" aria-label="weniger" ${v <= vals[0] ? 'disabled' : ''}>−</button>`
    + `<button type="button" class="stpv" data-stpedit="${path}" data-list="${list}" data-v="${v}" aria-label="${esc(label)}: ${fmt(v)}, antippen zum Eintippen">${fmt(v)}</button><button type="button" data-step="${path}" data-list="${list}" data-dir="1" aria-label="mehr" ${v >= vals[vals.length - 1] ? 'disabled' : ''}>+</button></span>`;
};
const srow = (label, ctrl, sub = '') => `<div class="row"><span class="tx"><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</span>${ctrl}</div>`;
// Eintippen: Dauern als Std:Min, sonst Zahl; auf den erlaubten Bereich begrenzt, nicht auf die Schritte
const stpParse = (list, raw) => {
  const vals = STEPS[list][0], t = String(raw).trim().replace(',', '.');
  let v = /^dur/.test(list) && t.includes(':') ? t.split(':').reduce((h, m) => h * 60 + Number(m), 0) : Number(t);
  if (!Number.isFinite(v)) return null;
  v = list === 'watt' || list === 'tcorr' ? Math.round(v * 10) / 10 : Math.round(v);
  return Math.min(vals[vals.length - 1], Math.max(vals[0], v));
};
const stpSave = (path, v) => {
  const [, r1, , id] = route();
  if (path.startsWith('a:')) updAct(r1, id, { [path.slice(2)]: v });
  else if (path.startsWith('sch:')) { const [, sid, k] = path.split(':'); updSch(r1, (e) => (e.id === sid ? { ...e, [k]: v } : e)); }
  else saveCfg(r1, patchOf(path, v));
};
const nextStep = (list, v, dir) => { const vals = STEPS[list][0]; return dir > 0 ? vals.find((x) => x > v) ?? vals[vals.length - 1] : [...vals].reverse().find((x) => x < v) ?? vals[0]; };
const val = (t) => `<span class="val">${t}</span>`;
const chev = (t = '') => `<span class="val">${t} ›</span>`;

// Statuszeile unter dem Namen, ohne die Leistung, die schon gross darüber steht
const subOf = (d) => (!d.online ? d.status : d.relay ? d.status.replace(/^[\d.,]+ k?W( · )?/, '') : d.status === 'Aus' ? '' : d.status.replace(/^Aus · /, ''));

// ---------- Startseite ----------
// Reihenfolge der Kacheln: gespeicherte zuerst, neue (z. B. eine neue Steckdose) hinten an
const HOME_KEYS = [['scenes', 'Szenen', 'scenes'], ['rules', 'Regeln', 'rules'], ['guard', 'Ferien', 'beach'], ['energy', 'Verbrauch', 'bolt'], ['alarms', 'Alarme', 'bell']];
function homeOrder() {
  const all = [...HOME_KEYS.map(([k]) => k), ...S.devices.map((d) => d.mac)], o = (S.settings.order || []).filter((k) => all.includes(k));
  return [...o, ...all.filter((k) => !o.includes(k))];
}
function orderHTML() {
  const info = (k) => { const h = HOME_KEYS.find(([x]) => x === k); if (h) return [h[1], I[h[2]]]; const d = dev(k); return [d.name, devIcon(d)]; };
  return HD('Startseite anordnen', 'more') + '<p class="intro">Am Griff ≡ ziehen, um eine Kachel zu verschieben.</p>'
    + `<div class="ls order">${homeOrder().map((k) => { const [l, ic] = info(k); return `<div class="row" data-okey="${k}"><span class="oico" aria-hidden="true">${ic}</span><span class="tx"><b>${esc(l)}</b></span>
      <button type="button" class="handle" data-handle aria-label="${esc(l)} verschieben (Pfeiltasten)">≡</button></div>`; }).join('')}</div>
    <button type="button" class="btn grey" data-orderreset="1">Standard-Reihenfolge</button>`;
}
const saveOrder = async (order) => { S.settings.order = order; render(); try { S.settings = await api('api/settings', { method: 'PUT', body: JSON.stringify({ settings: { order } }) }); } catch (x) { toast(x.message, true); } };
// Ziehen am Griff: Zeile folgt dem Finger, die anderen weichen aus; beim Loslassen speichern
let drag = null;
app.addEventListener('pointerdown', (e) => {
  const h = e.target.closest('[data-handle]'); if (!h) return;
  const row0 = h.closest('[data-okey]'), rows = [...row0.parentElement.children];
  drag = { row: row0, rows, from: rows.indexOf(row0), to: rows.indexOf(row0), y: e.clientY, h: row0.offsetHeight, id: e.pointerId };
  try { h.setPointerCapture(e.pointerId); } catch { /* ohne Zeiger-Erfassung weiter */ } row0.classList.add('dragging'); haptic(); e.preventDefault();
});
app.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dy = e.clientY - drag.y, to = Math.max(0, Math.min(drag.rows.length - 1, drag.from + Math.round(dy / drag.h)));
  drag.row.style.transform = `translateY(${dy}px)`;
  if (to !== drag.to) { drag.to = to; haptic(5); }
  drag.rows.forEach((r, i) => { if (r === drag.row) return; const shift = drag.from < to ? (i > drag.from && i <= to ? -drag.h : 0) : (i >= to && i < drag.from ? drag.h : 0); r.style.transform = shift ? `translateY(${shift}px)` : ''; });
});
const endDrag = () => {
  if (!drag) return;
  const d0 = drag; drag = null;
  d0.rows.forEach((r) => { r.style.transform = ''; r.classList.remove('dragging'); });
  if (d0.to === d0.from) return;
  const keys = d0.rows.map((r) => r.dataset.okey), [k] = keys.splice(d0.from, 1); keys.splice(d0.to, 0, k);
  app.dataset.page = ''; saveOrder(keys);
};
app.addEventListener('pointerup', endDrag); app.addEventListener('pointercancel', endDrag);
app.addEventListener('keydown', (e) => {
  const h = e.target.closest?.('[data-handle]'); if (!h || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
  e.preventDefault();
  const keys = homeOrder(), k = h.closest('[data-okey]').dataset.okey, i = keys.indexOf(k), j = i + (e.key === 'ArrowUp' ? -1 : 1);
  if (j < 0 || j >= keys.length) return;
  keys.splice(i, 1); keys.splice(j, 0, k); saveOrder(keys).then(() => $(`[data-okey="${k}"] [data-handle]`)?.focus());
});
function homeHTML() {
  // Aufbau wie die Startseite der myStrom-App: zuerst Szenen, Regeln, Ferien (Home Guard), Verbrauch, Alarme, dann die Steckdosen.
  // Steckdosen-Kacheln ohne Pfeil und ohne Statuszeile; Watt mit einer Nachkommastelle wie im Original.
  const hint = '';
  const tile = (h, icon, label) => `<button type="button" class="tile" data-go="${h}" data-okey="${h}"><span class="ico">${icon}</span><span class="lb">${label}</span></button>`;
  const T = {};
  const total = S.devices.reduce((a, d) => a + d.w, 0);
  const w1 = (w) => (w < 1000 ? `${w.toFixed(1)} W` : `${(w / 1000).toFixed(2)} kW`);
  return `${editHome ? '<header class="hd"><span></span><b>Anordnen</b><button type="button" class="ic done" data-editdone="1">Fertig</button></header>'
      : `<header class="hd"><span></span><b>myStrom</b><button type="button" class="ic" data-menu="1" aria-label="Menü" aria-haspopup="dialog">${I.menu}</button></header>`}
    <div class="grid home ${editHome ? 'editing' : ''}">
      ${(T.scenes = tile('scenes', I.scenes, 'Szenen'), T.rules = tile('rules', I.rules, 'Regeln'), T.guard = tile('guard', I.beach, 'Ferien'),
        T.energy = tile('energy', I.bolt, `<span class="dim">${pw(total)}</span><br>Verbrauch`), T.alarms = tile('alarms', I.bell, 'Alarme'), '')}
      ${S.devices.map((d) => (T[d.mac] = `<div class="tile dev ${d.relay ? 'on' : ''} ${d.online ? '' : 'off-line'}" data-mac="${d.mac}" data-okey="${d.mac}">
        <div class="face">${d.temp != null ? `<span class="tmp">${d.temp.toFixed(1)}°C</span>` : ''}${d.cfg.lock ? '<span class="lock" title="Tastensperre">🔒</span>' : ''}
        <span class="ico">${devIcon(d)}</span><span class="lb">${d.relay ? `${w1(d.w)}<br>` : ''}${esc(d.name)}</span>
        ${d.online ? '' : '<span class="sub">Offline</span>'}</div>
        <button type="button" class="hit" data-swipe="${d.mac}" aria-label="${esc(d.name)}, ${d.relay ? 'an' : 'aus'}. Öffnen; Wischen oder Leertaste schaltet"></button></div>`, '')).join('')}
      ${(editHome ? editOrder : homeOrder()).map((k) => T[k]).join('')}
      ${S.devices.length ? '' : tile('more', I.plug, 'Steckdose hinzufügen')}
    </div>${hint}`;
}

// ---------- Gerät ----------
// Steckdose als Linien-Symbol wie die übrigen Symbole; die LED unten zeigt den Zustand (grün an, rot aus, grau offline)
const sockIcon = (d) => `<svg viewBox="0 0 64 64" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="18" y="5" width="28" height="54" rx="13"/><circle cx="32" cy="24" r="9"/><circle cx="28.5" cy="23" r="1.3" fill="currentColor"/><circle cx="35.5" cy="23" r="1.3" fill="currentColor"/><circle cx="32" cy="28" r="1.3" fill="currentColor"/><path class="led ${!d.online ? 'off-line' : d.relay ? 'on' : 'off'}" d="M28 48h8" stroke-width="3"/></svg>`;
function deviceHTML(d) {
  return HD(esc(d.name), 'home', `<button type="button" class="ic" data-go="dev/${d.mac}/settings" aria-label="Einstellungen">${I.gear}</button>`, esc(d.cfg.room))
    + `<div class="grid">
      <button type="button" class="tile devtgl ${d.relay ? 'on' : ''} ${d.online ? '' : 'off-line'}" data-devtoggle="${d.mac}" role="switch" aria-checked="${d.relay}" aria-label="${esc(d.name)} ${d.relay ? 'ausschalten' : 'einschalten'}">
        <span class="ico">${sockIcon(d)}</span><span class="lb">${!d.online ? 'Offline' : d.relay ? pw(d.w) : 'Aus'}</span></button>
      ${FEAT.map(([k, ic, l]) => { const [on, txt] = featInfo(d, k); return `<button type="button" class="tile feat ${on ? 'act' : ''}" data-go="dev/${d.mac}/${k}"><span class="ico">${I[ic]}</span><span class="lb">${l}</span><span class="sub">${on || k === 'eval' ? esc(txt) : 'aus'}</span></button>`; }).join('')}
    </div>`;
}
// Power Actions: „wenn über/unter X W, mindestens Y min, dann …“
const ACT_THEN = [['notify', 'Mitteilung'], ['off', 'Ausschalten'], ['other-on', 'Andere an'], ['other-off', 'Andere aus']];
function actText(a) {
  const t = dev(a.target)?.name || 'andere Steckdose';
  return `${a.when === 'below' ? 'Unter' : 'Über'} ${a.watts} W${a.mins ? `, ${a.mins} min` : ''} → ${{ notify: 'Mitteilung', off: 'aus', 'other-on': `${t} an`, 'other-off': `${t} aus` }[a.then]}`;
}
const ACT_TPL = (d) => [
  ['done', 'Fertig melden', 'z. B. Waschmaschine: unter 3 W, nachdem sie gelaufen ist', { when: 'below', watts: 3, mins: 5, then: 'notify', text: `${d.name} ist fertig` }],
  ['running', 'Melden, wenn es läuft', 'über 10 W', { when: 'above', watts: 10, mins: 1, then: 'notify', text: `${d.name} läuft` }],
  ['overload', 'Bei Überlast ausschalten', 'über 1500 W', { when: 'above', watts: 1500, mins: 1, then: 'off', text: '' }],
  ...(S.devices.length > 1 ? [['follow', 'Andere Steckdose mitschalten', 'z. B. PC an → Lampe an', { when: 'above', watts: 30, mins: 1, then: 'other-on', target: S.devices.find((x) => x.mac !== d.mac).mac, text: '' }]] : []),
  ['custom', 'Eigene Power Action', 'Bedingung und Folge selbst wählen', { when: 'above', watts: 50, mins: 5, then: 'notify', text: '' }],
];
function actionsHTML(d, id) {
  const head = (t, b) => HD(t, b, '<span></span>', esc(d.name));
  if (!id) {
    const list = d.cfg.actions;
    return head('Power Actions', `dev/${d.mac}`) + `<p class="intro">Liegt die Leistung lange genug über oder unter einem Wert, passiert etwas: eine Mitteilung, ausschalten oder eine andere Steckdose schalten. Jetzt: ${pw(d.w)}.</p>`
      + (list.length ? `<div class="ls">${list.map((a) => `<div class="row"><button type="button" class="tx" data-go="dev/${d.mac}/actions/${a.id}" style="text-align:left;flex:1"><b>${esc(a.text || actText(a))}</b><span>${esc(actText(a))}</span></button>
          <button type="button" class="sw" data-atoggle="${a.id}" aria-pressed="${a.on}" aria-label="Power Action ein/aus"></button></div>`).join('')}</div>` : '')
      + `<p class="sec">Neu</p><div class="ls">${ACT_TPL(d).map(([k, l, sub]) => row(l, chev(), sub, `data-actnew="${k}"`)).join('')}</div>`;
  }
  const a = d.cfg.actions.find((x) => x.id === id);
  if (!a) return head('Power Action', `dev/${d.mac}/actions`) + '<p class="empty-state">Diese Power Action gibt es nicht mehr.</p>';
  const chips = (field, opts) => `<div class="chips">${opts.map(([v, l]) => `<button type="button" class="chip" data-aset="${field}|${v}" aria-pressed="${String(a[field]) === String(v)}">${esc(l)}</button>`).join('')}</div>`;
  const others = S.devices.filter((x) => x.mac !== d.mac);
  return head('Power Action', `dev/${d.mac}/actions`) + `<div class="${a.on ? 'ls' : 'ls dim'}"><div class="row master"><span class="tx"><b>Aktiv</b></span><button type="button" class="sw" data-atoggle="${a.id}" aria-pressed="${a.on}" aria-label="Aktiv"></button></div></div>
    <p class="sec">Wenn die Leistung</p>${chips('when', [['above', 'über'], ['below', 'unter']])}
    <div class="ls">${srow('Schwelle', stepper('a:watts', 'watt', a.watts, 'Schwelle'), `jetzt ${pw(d.w)}`)}
      ${srow('Mindestens', stepper('a:mins', 'dur0', a.mins, 'Mindestens'), 'am Stück')}</div>
    <p class="sec">Dann</p>${chips('then', others.length ? ACT_THEN : ACT_THEN.slice(0, 2))}
    ${a.then.startsWith('other') ? `<p class="sec">Welche Steckdose</p>${chips('target', others.map((x) => [x.mac, x.name]))}` : ''}
    ${a.then === 'notify' ? `<div class="ls">${lrow('Text', `<input type="text" data-ain="text" value="${esc(a.text)}" placeholder="${esc(d.name)} ist fertig" maxlength="60" style="max-width:200px">`)}</div>` : ''}
    <p class="note">${a.when === 'below' ? `Löst aus, wenn ${esc(d.name)} ${a.mins} Minuten lang unter ${a.watts} W zieht, aber erst nachdem es darüber gelaufen ist. Danach erst wieder nach dem nächsten Lauf.` : `Löst aus, wenn ${esc(d.name)} ${a.mins} Minuten lang über ${a.watts} W zieht. Erst wieder, nachdem es zwischendurch darunter war.`}</p>
    <button type="button" class="btn danger" data-adel="${a.id}">Power Action löschen</button>`;
}
const updSch = (mac, fn) => saveCfg(mac, { schedule: { entries: dev(mac).cfg.schedule.entries.map(fn).filter(Boolean) } });
const updAct = (mac, id, patch) => saveCfg(mac, { actions: dev(mac).cfg.actions.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
function featureHTML(d, k, sub) {
  const c = d.cfg, back = k === 'tech' || k === 'room' || k === 'icon' ? `dev/${d.mac}/settings` : `dev/${d.mac}`; // roomnew hat eigenes Zurück
  const head = HD(FTITLE[k], back, '<span></span>', esc(d.name));
  const dim = (on) => (on ? 'ls' : 'ls dim');
  switch (k) {
    case 'schedule': {
      // je Zeitplan: Ein, Aus, Tage. Tage eines anderen Zeitplans sind hier nicht wählbar (jeder Tag nur einmal)
      const s = c.schedule, taken = (id) => s.entries.filter((e) => e.id !== id).flatMap((e) => e.days), free = WD.filter(([n]) => !s.entries.some((e) => e.days.includes(n)));
      return head + `<p class="intro">Schaltet zu festen Zeiten ein und aus. Für andere Tage mit anderen Zeiten fügst du einen weiteren Zeitplan hinzu.</p>
      ${s.on && /wartet|aus in/.test(d.status) ? `<p class="note"><b>Jetzt:</b> ${esc(d.status)}</p>` : ''}
      <div class="${dim(s.on)}">${master(d, 'schedule')}</div>
      ${s.entries.map((e, i) => `<div class="schd-hd"><p class="sec">${s.entries.length > 1 ? `Zeitplan ${i + 1} · ` : ''}${daysText(e.days)}</p>${s.entries.length > 1 ? `<button type="button" class="tlink" data-schdel="${e.id}">Entfernen</button>` : ''}</div>
        <div class="${dim(s.on)}">${lrow('Ein um', `<input type="time" data-schin="${e.id}|start" value="${e.start}">`)}${lrow(e.idle ? 'Aus ab' : 'Aus um', `<input type="time" data-schin="${e.id}|end" value="${e.end}">`)}
          <div class="row"><span class="tx"><b>Erst aus, wenn nicht mehr benutzt</b><span>wartet, solange du noch dran arbeitest</span></span><button type="button" class="sw" data-schsw="${e.id}" aria-pressed="${e.idle}" aria-label="Erst aus, wenn nicht mehr benutzt"></button></div>
          ${e.idle ? `${srow('Unter', stepper(`sch:${e.id}:below`, 'watt1', e.below, 'Unter'), 'jetzt ' + pw(d.w))}${srow('So lange', stepper(`sch:${e.id}:mins`, 'dur240', e.mins, 'So lange'), 'am Stück')}` : ''}</div>
        <div class="chips days">${WD.filter(([n]) => !taken(e.id).includes(n)).map(([n, l]) => `<button type="button" class="chip" data-schday="${e.id}|${n}" aria-pressed="${e.days.includes(n)}">${l}</button>`).join('')}</div>`).join('')}
      ${free.length ? `<button type="button" class="btn ghost" data-schadd="1">＋ Zeitplan hinzufügen</button>` : ''}`;
    }
    case 'vacation': {
      const v = c.vacation, todayTxt = d.vacationToday.map((s) => `${s.key} ${s.start}–${s.end}`).join(', ');
      return head + `<p class="intro">Damit das Haus bewohnt wirkt, geht ${esc(d.name)} in den Ferien morgens und abends an und wieder aus, jeden Tag zu einer anderen Zeit.</p>
      <div class="${dim(v.on)}">${master(d, 'vacation', 'Ferienmodus')}${lrow('Von', inp('vacation.from', 'date', v.from))}${lrow('Bis', inp('vacation.to', 'date', v.to))}</div>
      <p class="sec">Morgens</p><div class="${dim(v.on && v.morning.on)}"><div class="row master"><span class="tx"><b>Morgens an</b><span>20–60 Minuten</span></span>${sw('vacation.morning.on', v.morning.on, 'Morgens an')}</div>
        ${lrow('Frühestens', inp('vacation.morning.from', 'time', v.morning.from))}${lrow('Spätestens', inp('vacation.morning.to', 'time', v.morning.to))}</div>
      <p class="sec">Abends</p><div class="${dim(v.on && v.evening.on)}"><div class="row master"><span class="tx"><b>Abends an</b><span>1–3 Stunden</span></span>${sw('vacation.evening.on', v.evening.on, 'Abends an')}</div>
        ${lrow('Frühestens', inp('vacation.evening.from', 'time', v.evening.from))}${lrow('Spätestens', inp('vacation.evening.to', 'time', v.evening.to))}</div>
      ${v.on ? `<p class="note">${todayTxt ? `<b>Heute:</b> ${esc(todayTxt)}` : `Beginnt am ${dShort(v.from)}.`}</p>` : ''}`;
    }
    case 'sun': return head + `<p class="intro">Heute bei dir: Sonnenaufgang ${S.sun?.rise || '–'}, Sonnenuntergang ${S.sun?.set || '–'}${S.settings.place ? ` (${esc(S.settings.place)})` : ''}.</p>
      <div class="${dim(c.sun.on)}"><div class="row master"><span class="tx"><b>Bei Sonnenuntergang an</b></span>${sw('sun.on', c.sun.on, 'Bei Sonnenuntergang an')}</div>
        ${srow('Verschieben', stepper('sun.onOffset', 'offs', c.sun.onOffset, 'Einschalten verschieben'), '− früher, + später')}</div>
      <div class="${dim(c.sun.off)}"><div class="row master"><span class="tx"><b>Bei Sonnenaufgang aus</b></span>${sw('sun.off', c.sun.off, 'Bei Sonnenaufgang aus')}</div>
        ${srow('Verschieben', stepper('sun.offOffset', 'offs', c.sun.offOffset, 'Ausschalten verschieben'), '− früher, + später')}</div>`;
    case 'timer': return head + `<p class="intro">Nach jedem Einschalten bleibt ${esc(d.name)} so lange an und geht dann von selbst aus, egal ob in der App oder am Gerät eingeschaltet.</p>
      <div class="${dim(c.timer.on)}">${master(d, 'timer')}</div>
      <div class="chips">${[15, 30, 60, 120, 240].map((m) => `<button type="button" class="chip" data-set="timer.mins" data-v="${m}" aria-pressed="${c.timer.mins === m}">${m < 60 ? `${m} min` : `${m / 60} h`}</button>`).join('')}</div>
      <div class="ls">${srow('Eigene Dauer', stepper('timer.mins', 'dur', c.timer.mins, 'Eigene Dauer'))}</div>`;
    case 'saver': {
      const s = c.saver;
      return head + `<p class="intro">Hängt das Gerät nur im Standby, schaltet die Steckdose es ab. Ist sie aus, fliesst kein Strom mehr, darum kann sie nicht selbst merken, wann du das Gerät wieder brauchst. Lege fest, wann es wieder angeht.</p>
      <div class="${dim(s.on)}">${master(d, 'saver')}${srow('Standby unter', stepper('saver.below', 'watt', s.below, 'Standby unter'), 'jetzt ' + pw(d.w))}
        ${srow('Länger als', stepper('saver.mins', 'dur', s.mins, 'Länger als'))}</div>
      <p class="sec">Wieder an</p>
      <div class="chips">${[['hand', 'Von Hand'], ['time', 'Um eine Uhrzeit'], ['after', 'Nach Stunden']].map(([v, l]) => `<button type="button" class="chip" data-set="saver.back" data-v="${v}" aria-pressed="${s.back === v}">${l}</button>`).join('')}</div>
      ${s.back === 'time' ? `<div class="ls">${lrow('Um', inp('saver.at', 'time', s.at))}</div>` : s.back === 'after' ? `<div class="ls">${srow('Nach', stepper('saver.hours', 'hours', s.hours, 'Nach'))}</div>` : '<p class="note">Erst wieder an, wenn du sie in der App, mit einer Szene oder am Knopf der Steckdose einschaltest.</p>'}`;
    }
    case 'temp': return head + `<p class="intro">Die Steckdose misst ihre eigene Temperatur, jetzt ${d.temp != null ? `${d.temp.toFixed(1)} °C` : '–'}. Wird sie zu warm, schaltet sie ab.</p>
      <div class="${dim(c.temp.on)}">${master(d, 'temp', 'Bei Hitze ausschalten')}${srow('Aus über', stepper('temp.max', 'temp', c.temp.max, 'Aus über'))}</div>`;
    case 'alarms': return head + `<p class="intro">Mitteilung aufs Handy, wenn bei ${esc(d.name)} etwas passiert. ${S.pushSubs ? '' : '<a href="#alarms">Mitteilungen zuerst erlauben ›</a>'}</p>
      <div class="ls">${[['offline', 'Offline', 'keine Antwort seit 3 Minuten'], ['unusual', 'Ungewöhnlicher Verbrauch', 'deutlich mehr als sonst'], ['switchedOn', 'Eingeschaltet', 'am Gerät oder von einer Regel'], ['hot', 'Zu warm', `über ${c.temp.on ? c.temp.max : 45} °C`]]
        .map(([key, l, sub]) => `<div class="row"><span class="tx"><b>${l}</b><span>${sub}</span></span>${sw(`alarms.${key}`, c.alarms[key], l)}</div>`).join('')}</div>`;
    case 'eval': return head + chartHTML(d.mac, false) + totalsHTML(d.mac);
    case 'actions': return actionsHTML(d, sub);
    case 'settings': return HD('Einstellungen', `dev/${d.mac}`) + `<div class="hero">${devIcon(d)}<b>${esc(d.name)}</b></div>
      <div class="ls">${lrow('Name', `<input type="text" data-in="name" value="${esc(d.cfg.name)}" placeholder="${esc(d.name)}" maxlength="40">`)}
        ${row('Raum', chev(esc(d.cfg.room || 'keiner')), '', `data-go="dev/${d.mac}/room"`)}
        ${row('Symbol', chev(esc(iconName(d))), '', `data-go="dev/${d.mac}/icon"`)}
        ${srow('Temperatur-Korrektur', stepper('tcorr', 'tcorr', c.tcorr, 'Temperatur-Korrektur'), 'wird zur Messung addiert')}
        ${row('Technische Details', chev(), '', `data-go="dev/${d.mac}/tech"`)}</div>
      <div class="ls"><div class="row"><span class="tx"><b>Tastensperre</b><span>in der App nicht mehr schaltbar</span></span>${sw('lock', c.lock, 'Tastensperre')}</div></div>
      <button type="button" class="btn danger" data-remove="${d.mac}">Steckdose entfernen</button>`;
    case 'room': {
      // wie „Select Room“ in myStrom: benutzte Räume zuerst, dann Vorlagen mit „Neu“; der gewählte abgedunkelt mit Häkchen
      const used = [...new Set(S.devices.map((x) => x.cfg.room).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
      const tileR = (r, icon, label, isNew) => `<button type="button" class="tile room ${c.room === r ? 'sel' : ''}" data-room="${esc(r)}" aria-pressed="${c.room === r}">
        <span class="ico">${icon}${c.room === r ? '<span class="chk" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 12 4 4 8-8"/></svg></span>' : ''}</span>
        <span class="lb">${esc(label)}</span>${isNew ? '<span class="new" aria-hidden="true"><i>Neu</i></span>' : ''}</button>`;
      return HD('Raum wählen', back) + `<div class="grid">
        ${used.map((r) => tileR(r, roomIcon(r), r, false)).join('')}
        ${ROOMS.filter(([r]) => !used.includes(r)).map(([r, ic]) => tileR(r, ROOM_ICON[ic], r, true)).join('')}
        <button type="button" class="tile room" data-go="dev/${d.mac}/roomnew"><span class="ico">${ROOM_ICON.plus}</span><span class="lb">Eigener Raum</span></button>
        ${tileR('', ROOM_ICON.none, 'Kein Raum', false)}
      </div>`;
    }
    case 'icon': {
      // wie die Raum-Auswahl: Kacheln, gewähltes abgedunkelt mit Häkchen; Antippen wählt und geht zurück
      const curKey = iconKey(d);
      return HD('Symbol wählen', back) + `<div class="grid">${DEV_ICONS.map(([k, l, svg]) => `<button type="button" class="tile room ${curKey === k ? 'sel' : ''}" data-icon="${k}" aria-pressed="${curKey === k}">
        <span class="ico">${svg || I.plug}${curKey === k ? '<span class="chk" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 12 4 4 8-8"/></svg></span>' : ''}</span>
        <span class="lb">${l}</span></button>`).join('')}</div>`;
    }
    case 'roomnew': return HD('Eigener Raum', `dev/${d.mac}/room`) + `<p class="intro">Wie soll der Raum heissen?</p>
      <div class="ls">${lrow('Name', '<input type="text" data-roomnew="1" placeholder="z. B. Werkstatt" maxlength="40" enterkeyhint="done" autocomplete="off" style="background:#2a2a2a;color:var(--fg);padding:7px 9px;text-align:left;max-width:200px">')}</div>
      <button type="button" class="btn" data-roomadd="1">Hinzufügen</button>`;
    case 'tech': return head + `<div class="ls">${[['Typ', d.typeName], ['Firmware', d.fw || '–'], ['IP-Adresse', d.ip], ['MAC', d.mac.match(/../g).join(':')], ['Verbindung', d.online ? 'erreichbar' : 'offline'],
      ['Temperatur gemessen', d.tempRaw != null ? `${d.tempRaw.toFixed(1)} °C` : '–']].map(([l, v]) => row(l, val(esc(v)))).join('')}</div>`;
    default: return '';
  }
}

// ---------- Verbrauch: Diagramm wie in myStrom (Watt, Max-Linie, Uhrzeiten), Gerät und Tag wählbar ----------
const view = { mac: 'all', day: null, period: 'day' };
// view.mac: 'all', ein Gerät oder mehrere mit Komma
const pickedMacs = (m) => (m === 'all' ? S.devices.map((d) => d.mac) : m.split(',').filter((x) => dev(x)));
const pickedName = (m) => { if (m === 'all') return 'Alle Geräte'; const n = pickedMacs(m).map((x) => dev(x).name); return n.length > 2 ? `${n.length} Geräte` : n.join(' + '); };
const PERIODS = [['day', 'Tag'], ['week', 'Woche'], ['month', 'Monat'], ['year', 'Jahr']];
const MONTHS_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
function periodStart(p, day) {
  if (p === 'week') return addDays(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));
  if (p === 'month') return `${day.slice(0, 7)}-01`;
  if (p === 'year') return `${day.slice(0, 4)}-01-01`;
  return day;
}
function shiftPeriod(p, day, n) {
  if (p === 'day') return addDays(day, n);
  if (p === 'week') return addDays(periodStart('week', day), 7 * n);
  if (p === 'month') { const [y, m] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10); }
  return `${Number(day.slice(0, 4)) + n}-01-01`;
}
function periodLabel(p, day) {
  if (p === 'day') return dayLabel(day);
  if (p === 'week') { const a = periodStart('week', day), b = addDays(a, 6), mon = (x) => MONTHS[Number(x.slice(5, 7)) - 1]; return `${Number(a.slice(8))}.${a.slice(5, 7) !== b.slice(5, 7) ? ` ${mon(a)}` : ''} – ${Number(b.slice(8))}. ${mon(b)}`; }
  if (p === 'month') return `${MONTHS_LONG[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;
  return day.slice(0, 4);
}
const bars = new Map();
async function barData(mac, period, ref) {
  const k = `${mac}|${period}|${ref}`, c = bars.get(k);
  if (c && Date.now() - c.at < 60e3) return c.data;
  const data = await api(`api/bars?mac=${mac}&period=${period}&ref=${ref}`);
  bars.set(k, { at: Date.now(), data });
  return data;
}
// Balken wie das Flächendiagramm: kWh links, Beschriftung unten, aktueller Abschnitt grün
function barSVG(b) {
  const n = b.bars.length, W0 = 38, W1 = 316, H0 = 14, H1 = 190, vals = b.bars.map((x) => (x.wh || 0) / 1000), max = Math.max(0.01, ...vals);
  const step = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500].find((s) => max / s <= 5) || 1000, top = Math.ceil(max * 1.08 / step) * step;
  const slot = (W1 - W0) / n, bw = Math.max(2, slot * 0.68), y = (v) => H1 - (H1 - H0) * v / top;
  const curKey = b.period === 'year' ? S.today.slice(0, 7) : S.today;
  const show = (i) => b.period !== 'month' || i === 0 || (i + 1) % 5 === 0;
  const fmt = (g) => (g < 1 ? g.toFixed(step < 0.1 ? 2 : 1) : String(Math.round(g * 10) / 10));
  return `<svg viewBox="0 0 320 214" role="img" aria-label="Verbrauch je ${b.period === 'year' ? 'Monat' : 'Tag'}">
    ${Array.from({ length: Math.round(top / step) + 1 }, (_, k) => k * step).map((g) => `<line x1="${W0}" x2="${W1}" y1="${y(g)}" y2="${y(g)}" stroke="#3a3a3a" stroke-width=".6"/><text x="${W0 - 4}" y="${y(g) + 3}" text-anchor="end" font-size="9" fill="#bdbdbd">${fmt(g)}</text>`).join('')}
    <text x="${W0 - 4}" y="7" text-anchor="end" font-size="8" fill="#888">kWh</text>
    ${b.bars.map((x, i) => (x.wh == null ? '' : `<rect x="${(W0 + slot * i + (slot - bw) / 2).toFixed(1)}" y="${y(vals[i]).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, H1 - y(vals[i])).toFixed(1)}" rx="${Math.min(2, bw / 3).toFixed(1)}" fill="${x.key === curKey ? '#5ab400' : '#bdbdbd'}"/>`)).join('')}
    <line x1="${W0}" x2="${W1}" y1="${H1}" y2="${H1}" stroke="#bdbdbd" stroke-width=".8"/>
    ${b.bars.map((x, i) => (show(i) ? `<text x="${(W0 + slot * (i + 0.5)).toFixed(1)}" y="${H1 + 14}" text-anchor="middle" font-size="9" fill="#bdbdbd">${x.label}</text>` : '')).join('')}
  </svg>`;
}
function barTip(el, b) {
  const svg = $('svg', el); let tip = $('.tip', el);
  const show = (e) => {
    const r = svg.getBoundingClientRect(), vx = (e.clientX - r.left) / r.width * 320, i = Math.floor((vx - 38) / ((316 - 38) / b.bars.length)), x = b.bars[i];
    if (!x || x.wh == null) { hide(); return; }
    if (!tip) { tip = document.createElement('span'); tip.className = 'tip'; el.append(tip); }
    const label = b.period === 'year' ? `${MONTHS_LONG[i]}` : `${['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][new Date(`${x.key}T12:00:00Z`).getUTCDay()]} ${Number(x.key.slice(8))}.${Number(x.key.slice(5, 7))}.`;
    tip.textContent = `${label} · ${kwh(x.wh)} kWh · CHF ${chf(x.wh)}`;
    tip.style.left = `${(38 + (316 - 38) / b.bars.length * (i + 0.5)) / 320 * r.width}px`;
  };
  const hide = () => { tip?.remove(); tip = null; };
  svg.addEventListener('pointermove', show); svg.addEventListener('pointerdown', show); svg.addEventListener('pointerleave', hide);
}
const curves = new Map();
async function curve(mac, day) {
  const k = `${mac}|${day}`, c = curves.get(k);
  if (c && (day !== S.today || Date.now() - c.at < 60e3)) return c.data;
  const data = await api(`api/curve?mac=${mac}&day=${day}`);
  curves.set(k, { at: Date.now(), data });
  return data;
}
function areaSVG(c) {
  const n = c.w.length, W0 = 38, W1 = 316, H0 = 14, H1 = 190, vals = c.w.filter((w) => w != null), max = Math.max(1, ...vals);
  const step = [5, 10, 20, 30, 50, 100, 200, 500, 1000, 2000].find((s) => max / s <= 5) || 2000, top = Math.ceil(max * 1.08 / step) * step;
  const x = (i) => W0 + (W1 - W0) * i / (n - 1), y = (w) => H1 - (H1 - H0) * w / top;
  // Lücken (keine Messung) unterbrechen die Fläche
  const segs = []; let cur = [];
  c.w.forEach((w, i) => { if (w == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([x(i), y(w)]); });
  if (cur.length) segs.push(cur);
  for (const s of segs) if (s.length === 1) s.push([s[0][0] + (W1 - W0) / (n - 1), s[0][1]]);
  const grid = Array.from({ length: Math.round(top / step) + 1 }, (_, k) => k * step);
  return `<svg viewBox="0 0 320 214" role="img" aria-label="Verlauf ${dayLabel(c.day)}, höchstens ${Math.round(max)} W">
    ${grid.map((g) => `<line x1="${W0}" x2="${W1}" y1="${y(g)}" y2="${y(g)}" stroke="#3a3a3a" stroke-width=".6"/><text x="${W0 - 4}" y="${y(g) + 3}" text-anchor="end" font-size="9" fill="#bdbdbd">${g}W</text>`).join('')}
    ${vals.length ? `<line x1="${W0}" x2="${W1}" y1="${y(max)}" y2="${y(max)}" stroke="#bdbdbd" stroke-dasharray="3 2" stroke-width=".8"/><text x="${W0 + 6}" y="${y(max) - 4}" font-size="9" fill="#bdbdbd">Max. ${Math.round(max)} W</text>` : ''}
    ${segs.map((s) => `<path d="M${s[0][0]},${H1} L${s.map((p) => p.join(',')).join(' L')} L${s[s.length - 1][0]},${H1}Z" fill="#bdbdbd"/><path d="M${s.map((p) => p.join(',')).join(' L')}" fill="none" stroke="#efefef" stroke-width="1"/>`).join('')}
    <line x1="${W0}" x2="${W0}" y1="${H0 - 8}" y2="${H1}" stroke="#bdbdbd" stroke-width=".8"/>
    ${['00:00', '06:00', '12:00', '18:00', '24:00'].map((l, k) => `<text x="${W0 + (W1 - W0) * k / 4}" y="${H1 + 16}" text-anchor="${k === 0 ? 'start' : k === 4 ? 'end' : 'middle'}" font-size="9" fill="#bdbdbd">${l}</text>`).join('')}
    <line class="cur" x1="0" x2="0" y1="${H0}" y2="${H1}" stroke="#5ab400" stroke-width="1" visibility="hidden"/>
  </svg>`;
}
function chartHTML(mac, pick) {
  view.day ||= S.today;
  if (!pick) view.mac = mac;
  if (pick && view.mac !== 'all' && !pickedMacs(view.mac).length) view.mac = 'all'; // gewähltes Gerät entfernt
  const m = pick ? view.mac : mac;
  const now = pickedMacs(m).reduce((a, x) => a + dev(x).w, 0), [v, u] = pwN(now);
  const p = view.period, ps = periodStart(p, view.day), current = periodStart(p, S.today) === ps, key = `${m}|${p}|${ps}`, live = current ? `|${Math.floor(S.now / 60e3)}` : '';
  return `<div class="big"><b>${v}<small> ${u}</small></b><span>Verbrauch jetzt</span></div>
    <div class="periods" role="group" aria-label="Zeitraum">${PERIODS.map(([k, l]) => `<button type="button" data-period="${k}" aria-pressed="${p === k}">${l}</button>`).join('')}</div>
    <div class="nav"><button type="button" class="devsel" ${pick ? 'data-devsel="1"' : 'disabled'}>${esc(pickedName(m))}${pick ? ' ▾' : ''}</button>
      <span class="date">${periodLabel(p, view.day)}</span><button type="button" class="arr" data-dayshift="-1" aria-label="zurück">‹</button><button type="button" class="arr" data-dayshift="1" aria-label="vor" ${shiftPeriod(p, view.day, 1) > S.today ? 'disabled' : ''}>›</button></div>
    <div class="chart" data-chart="${key}" data-keep="${key}${live}"><div class="empty">Lädt …</div></div>
    <div class="foot" data-foot data-keep="${key}${live}"><div><b>–<small> kWh</small></b><span>Verbrauch</span></div><i></i><div><b>–<small> CHF</small></b><span>Kosten</span></div></div>`;
}
function totalsHTML(mac) { return `<div class="ls" data-totals="${mac}" data-keep="${mac}|${Math.floor(S.now / 60e3)}"></div>`; }
// Diagramm und Summen nachladen, nachdem die Seite steht
async function fillCharts() {
  for (const el of document.querySelectorAll('[data-chart]:not([data-filled])')) {
    const [m, period, day] = el.dataset.chart.split('|'), key = el.dataset.keep;
    el.dataset.filled = key;
    try {
      if (period !== 'day') {
        const b = await barData(m, period, day);
        if (!el.isConnected) return;
        el.innerHTML = barSVG(b) + (b.wh ? '' : '<div class="empty">Keine Daten für diesen Zeitraum</div>');
        const foot = $('[data-foot]');
        if (foot) { foot.dataset.filled = foot.dataset.keep; foot.innerHTML = `<div><b>${kwh(b.wh)}<small> kWh</small></b><span>Verbrauch</span></div><i></i><div><b>${chf(b.wh)}<small> CHF</small></b><span>Kosten</span></div>`; }
        barTip(el, b);
        continue;
      }
      const c = await curve(m, day);
      if (!el.isConnected) return;
      el.innerHTML = areaSVG(c) + (c.w.some((x) => x != null) ? '' : '<div class="empty">Keine Daten für diesen Tag</div>');
      const foot = $('[data-foot]');
      if (foot) { foot.dataset.filled = foot.dataset.keep; foot.innerHTML = `<div><b>${kwh(c.wh)}<small> kWh</small></b><span>Verbrauch</span></div><i></i><div><b>${chf(c.wh)}<small> CHF</small></b><span>Kosten</span></div>`; }
      chartTip(el, c);
    } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  }
  for (const el of document.querySelectorAll('[data-totals]:not([data-filled])')) {
    el.dataset.filled = el.dataset.keep;
    try {
      const t = await api(`api/totals?mac=${el.dataset.totals}`);
      if (!el.isConnected) return;
      el.innerHTML = [['Diese Woche', t.week], ['Dieser Monat', t.month], ['Dieses Jahr', t.year], [t.since ? `Seit ${new Date(t.since).toLocaleDateString('de-CH')}` : 'Gesamt', t.all]]
        .map(([l, wh]) => row(l, val(`${kwh(wh)} kWh · CHF ${chf(wh)}`))).join('');
    } catch { /* bleibt leer */ }
  }
}
// Finger oder Maus übers Diagramm: Uhrzeit und Leistung an dieser Stelle
function chartTip(el, c) {
  const svg = $('svg', el), cur = $('.cur', svg); let tip = $('.tip', el);
  const show = (e) => {
    const r = svg.getBoundingClientRect(), vx = (e.clientX - r.left) / r.width * 320, i = Math.round((vx - 38) / (316 - 38) * (c.w.length - 1));
    if (i < 0 || i >= c.w.length || c.w[i] == null) { hide(); return; }
    if (!tip) { tip = document.createElement('span'); tip.className = 'tip'; el.append(tip); }
    const x = 38 + (316 - 38) * i / (c.w.length - 1), min = i * 5;
    cur.setAttribute('x1', x); cur.setAttribute('x2', x); cur.setAttribute('visibility', 'visible');
    tip.textContent = `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')} · ${pw(c.w[i])}`;
    tip.style.left = `${x / 320 * r.width + 2}px`;
  };
  const hide = () => { cur?.setAttribute('visibility', 'hidden'); tip?.remove(); tip = null; };
  svg.addEventListener('pointermove', show); svg.addEventListener('pointerdown', show); svg.addEventListener('pointerleave', hide);
}
// Geräte für den Verbrauch wählen: Overlay von unten mit Kacheln wie auf der Startseite; mehrere wählbar (Summe), gewählte mit Häkchen
function devPickTiles() {
  const chk = '<span class="chk" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 12 4 4 8-8"/></svg></span>';
  const picked = view.mac === 'all' ? ['all', ...S.devices.map((d) => d.mac)] : view.mac.split(',');
  const t = (v, on, icon, label, sub, tmp = '') => { const sel = picked.includes(v); return `<button type="button" class="tile room ${on ? 'on' : ''} ${sel ? 'sel' : ''}" data-pickdev="${v}" aria-pressed="${sel}">
    ${tmp}<span class="ico">${icon}${sel ? chk : ''}</span><span class="lb">${label}</span><span class="sub">${sub}</span></button>`; };
  const total = S.devices.reduce((a, d) => a + d.w, 0), totalWh = S.devices.reduce((a, d) => a + d.todayWh, 0);
  return `<div class="grid">
    ${t('all', false, I.bolt, `${pw(total)}<br>Alle Geräte`, `${kwh(totalWh)} kWh heute`)}
    ${S.devices.map((d) => t(d.mac, d.relay, devIcon(d), `${d.relay ? `${pw(d.w)}<br>` : ''}${esc(d.name)}`, `${kwh(d.todayWh)} kWh heute`, d.temp != null ? `<span class="tmp">${d.temp.toFixed(1)}°C</span>` : '')).join('')}
  </div>`;
}
function energyHTML() {
  const m = view.mac, month = (view.day || S.today).slice(0, 7);
  return HD('Verbrauch', 'home') + chartHTML(m, true) + totalsHTML(m)
    + (pickedMacs(m).length > 1 ? `<p class="sec">Heute je Gerät</p><div class="ls">${pickedMacs(m).map(dev).map((d) => row(esc(d.name), chev(`${kwh(d.todayWh)} kWh`), '', `data-go="dev/${d.mac}/eval"`)).join('')}</div>` : '')
    + `<button type="button" class="btn grey" data-go="export">Exportieren (CSV)</button>`;
}
// Export: Gerät, Zeitraum und Auflösung wählen, dann als CSV herunterladen (öffnet sich in Excel oder Numbers)
const exp = { mac: null, from: null, to: null, res: 'hour' };
function exportHTML() {
  exp.mac ??= view.mac; exp.from ||= `${S.today.slice(0, 7)}-01`; exp.to ||= S.today;
  const prev = shiftPeriod('month', S.today, -1), y = S.today.slice(0, 4);
  const ranges = [['Dieser Monat', `${S.today.slice(0, 7)}-01`, S.today], ['Letzter Monat', prev, lastOfMonth(prev.slice(0, 7))], ['Dieses Jahr', `${y}-01-01`, S.today], ['Alles', '2020-01-01', S.today]];
  const chip = (attr, v, l, on) => `<button type="button" class="chip" ${attr}="${esc(v)}" aria-pressed="${on}">${esc(l)}</button>`;
  const href = `api/export.csv?mac=${exp.mac}&from=${exp.from}&to=${exp.to}&res=${exp.res}`;
  const days = Math.max(1, Math.round((Date.parse(exp.to) - Date.parse(exp.from)) / 864e5) + 1), n = pickedMacs(exp.mac).length;
  const rows = Math.round(days * n * { raw: 2880, '5min': 288, hour: 24, day: 1 }[exp.res]);
  return HD('Exportieren', 'energy') + `<p class="intro">Messwerte als CSV-Datei, z. B. für Excel oder Numbers.</p>
    <p class="sec">Gerät</p><div class="chips">${chip('data-exp-mac', 'all', 'Alle Geräte', exp.mac === 'all')}${exp.mac.includes(',') ? chip('data-exp-mac', exp.mac, pickedName(exp.mac), true) : ''}${S.devices.map((d) => chip('data-exp-mac', d.mac, d.name, exp.mac === d.mac)).join('')}</div>
    <p class="sec">Zeitraum</p><div class="chips">${ranges.map(([l, a, b]) => chip('data-exp-range', `${a}|${b}`, l, exp.from === a && exp.to === b)).join('')}</div>
    <div class="ls">${lrow('Von', `<input type="date" data-exp-in="from" value="${exp.from}" max="${S.today}">`)}${lrow('Bis', `<input type="date" data-exp-in="to" value="${exp.to}" max="${S.today}">`)}</div>
    <p class="sec">Auflösung</p><div class="chips">${[['raw', 'alle 30 s'], ['5min', '5 Minuten'], ['hour', 'Stunde'], ['day', 'Tag']].map(([v, l]) => chip('data-exp-res', v, l, exp.res === v)).join('')}</div>
    <p class="note">Etwa ${rows.toLocaleString('de-CH')} Zeilen${exp.res === 'raw' ? ', jede Messung einzeln' : ', je Abschnitt Ø Leistung und Energie'}.</p>
    <a class="btn" href="${href}" download>CSV herunterladen</a>`;
}
const lastOfMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; };

// ---------- Szenen ----------
function scenesHTML() {
  return HD('Szenen', 'home') + '<p class="intro">Mehrere Steckdosen mit einem Tipp schalten.</p>'
    + `<div class="ls">${S.scenes.map((s) => { const n = Object.keys(s.actions).length; return `<div class="row"><button type="button" class="tx" data-go="scene/${s.id}" style="text-align:left;flex:1"><b>${esc(s.name)}</b><span>${n ? Object.entries(s.actions).map(([mac, a]) => `${esc(dev(mac)?.name || '?')} ${a === 'on' ? 'an' : 'aus'}`).join(', ') : 'alle Steckdosen aus'}${s.time?.on ? ` · ${daysText(s.time.days)} ${s.time.at}` : ''}</span></button>
      <button type="button" class="chip" data-run="${s.id}" aria-label="${esc(s.name)} ausführen">Ausführen</button></div>`; }).join('')}</div>
    <button type="button" class="btn ghost" data-newscene="1">Neue Szene</button>`;
}
function sceneHTML(id) {
  const s = S.scenes.find((x) => x.id === id);
  if (!s) return HD('Szene', 'scenes') + '<p class="empty-state">Diese Szene gibt es nicht mehr.</p>';
  const t = (s.time ||= { on: false, at: '23:00', days: [1, 2, 3, 4, 5, 6, 0] });
  return HD('Szene bearbeiten', 'scenes') + `<div class="ls">${lrow('Name', `<input type="text" data-scene-name="${s.id}" value="${esc(s.name)}" maxlength="30">`)}</div>
    <p class="sec">Was passiert</p><div class="ls">${S.devices.map((d) => `<div class="row"><span class="tx"><b>${esc(d.name)}</b></span><span class="chips" style="padding:0;margin:0">
      ${[['', 'Nichts'], ['on', 'An'], ['off', 'Aus']].map(([a, l]) => `<button type="button" class="chip" data-sact="${s.id}|${d.mac}|${a}" aria-pressed="${(s.actions[d.mac] || '') === a}">${l}</button>`).join('')}</span></div>`).join('')}</div>
    <p class="note">Ohne Auswahl schaltet die Szene alle Steckdosen aus.</p>
    <p class="sec">Zu fester Zeit</p><div class="${t.on ? 'ls' : 'ls dim'}"><div class="row master"><span class="tx"><b>Automatisch ausführen</b></span><button type="button" class="sw" data-stime="${s.id}" aria-pressed="${t.on}" aria-label="Automatisch ausführen"></button></div>
      ${lrow('Um', `<input type="time" data-sat="${s.id}" value="${t.at}">`)}</div>
    <div class="chips days">${WD.map(([n, l]) => `<button type="button" class="chip" data-sday="${s.id}|${n}" aria-pressed="${t.days.includes(n)}">${l}</button>`).join('')}</div>
    <button type="button" class="btn" data-run="${s.id}">Jetzt ausführen</button>
    <button type="button" class="btn danger" data-delscene="${s.id}">Szene löschen</button>`;
}
const saveScenes = async () => { try { S.scenes = await api('api/scenes', { method: 'PUT', body: JSON.stringify({ scenes: S.scenes }) }); render(); } catch (e) { toast(e.message, true); } };

// ---------- Ferien (alle Steckdosen), Regeln, Alarme, Mehr ----------
function guardHTML() {
  return HD('Ferien', 'home') + '<p class="intro">Ferienmodus aller Steckdosen auf einen Blick. Eingeschaltet geht eine Steckdose in den Ferien morgens und abends zu wechselnden Zeiten an, damit das Haus bewohnt wirkt.</p>'
    + `<div class="ls">${S.devices.map((d) => { const v = d.cfg.vacation, today = d.vacationToday.map((s) => `${s.key} ${s.start}`).join(', ');
      return `<div class="row"><button type="button" class="tx" data-go="dev/${d.mac}/vacation" style="text-align:left;flex:1"><b>${esc(d.name)} ›</b><span>${v.on ? `${dShort(v.from)}–${dShort(v.to)}${today ? ` · heute ${today}` : ''}` : 'aus'}</span></button>${sw(`${d.mac}:vacation.on`, v.on, `Ferien ${d.name}`)}</div>`; }).join('')}</div>`;
}
function rulesHTML() {
  const items = S.devices.flatMap((d) => FEAT.filter(([k]) => k !== 'eval' && k !== 'alarms').map(([k, ic, l]) => [d, k, l, ...featInfo(d, k)]).filter((x) => x[3]));
  return HD('Regeln', 'home') + (items.length ? `<div class="ls">${items.map(([d, k, l, , txt]) => row(`${esc(d.name)} · ${l}`, chev(), esc(txt), `data-go="dev/${d.mac}/${k}"`)).join('')}</div>`
    : '<p class="empty-state">Noch keine Regel aktiv.<br>Öffne eine Steckdose und schalte z. B. „Nachts aus“ ein.</p>');
}
let events = null;
function alarmsHTML() {
  const pushOk = 'PushManager' in window && 'serviceWorker' in navigator;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const perm = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  return HD('Alarme', 'home') + `<p class="sec">Mitteilungen auf diesem Gerät</p><div class="ls">
      ${!pushOk ? row('Nicht möglich', '', standalone ? 'Dieser Browser kann keine Mitteilungen.' : 'Auf dem iPhone zuerst „Zum Home-Bildschirm“ hinzufügen und von dort öffnen.')
        : perm === 'granted' && S.pushSubs ? row('Erlaubt', val('✓'), `${S.pushSubs} Gerät${S.pushSubs > 1 ? 'e' : ''} angemeldet`) + row('Test senden', chev(), '', 'data-pushtest="1"')
          : row('Mitteilungen erlauben', chev(), 'für Offline, ungewöhnlichen Verbrauch, Hitze', 'data-push="1"')}</div>
    <p class="sec">Pro Steckdose</p><div class="ls">${S.devices.map((d) => row(esc(d.name), chev(`${featInfo(d, 'alarms')[1]}`), '', `data-go="dev/${d.mac}/alarms"`)).join('')}</div>
    <p class="sec">Verlauf</p><div class="ls" data-events>${events ? eventsHTML() : row('Lädt …', '')}</div>`;
}
function eventsHTML() {
  if (!events.length) return row('Noch nichts passiert', '');
  return events.map((e) => { const d = dev(e.mac), t = new Date(e.ts);
    const when = t.toDateString() === new Date().toDateString() ? t.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) : t.toLocaleDateString('de-CH', { day: 'numeric', month: 'numeric' });
    return `<div class="row ev"><time>${when}</time><span class="tx"><b>${esc(d?.name || e.mac)} ${e.kind === 'on' ? 'an' : e.kind === 'off' ? 'aus' : ''}</b><span>${e.kind === 'alarm' ? '⚠︎ ' : ''}${esc(e.text)}</span></span></div>`; }).join('');
}
// Design: "Modern" (Standard) oder "myStrom" wie die Original-App; gilt pro Gerät
const design = () => (store.get('design') === 'mystrom' ? 'mystrom' : 'modern');
function setDesign(v) {
  store.set('design', v);
  const l = document.getElementById('theme-modern'); if (l) l.disabled = v === 'mystrom';
  app.dataset.page = ''; render();
}
function moreHTML() {
  const s = S.settings;
  return HD('Einstellungen', 'home') + `<p class="sec">Strom</p><div class="ls">${lrow('Preis pro kWh', `<input type="number" data-setting="price" value="${s.price}" step="0.01" min="0" max="2" inputmode="decimal">`, 'CHF')}</div>
    <p class="sec">Standort</p><div class="ls">
      ${lrow('Ort', `<input type="text" data-place="1" value="${esc(s.place || '')}" placeholder="z. B. Zürich" maxlength="80" enterkeyhint="search" autocomplete="off" style="max-width:200px">`, `${Number(s.lat).toFixed(2)}, ${Number(s.lon).toFixed(2)}${S.sun ? ` · Sonne ${S.sun.rise}–${S.sun.set}` : ''}`)}
      ${'geolocation' in navigator ? row('Standort vom Handy übernehmen', chev(), 'einmalig, nach deiner Freigabe', 'data-geo="1"') : ''}</div>
    <p class="note">Nur für Sonnenauf- und -untergang. Ein eingetippter Ort wird einmal bei Open-Meteo nachgeschlagen; vom Handy kommen die Koordinaten direkt.</p>
    <p class="sec">Design</p><div class="chips">${[['modern', 'Modern'], ['mystrom', 'myStrom']].map(([v, l]) => `<button type="button" class="chip" data-design="${v}" aria-pressed="${design() === v}">${l}</button>`).join('')}</div>
    <p class="sec">Steckdosen</p><div class="ls">${S.devices.map((d) => row(esc(d.name), chev(esc(d.ip)), `${esc(d.typeName)} · ${d.online ? 'erreichbar' : 'offline'}`, `data-go="dev/${d.mac}/settings"`)).join('')}
      ${lrow('Per IP hinzufügen', '<input type="text" id="addip" placeholder="192.168.0.42" inputmode="decimal" style="background:#2a2a2a;color:#e8e8e8;padding:7px 9px;text-align:left;max-width:160px">')}</div>
    <p class="note">Neue Steckdosen im WLAN findet die App von selbst. Eine IP brauchst du nur, wenn sie sich nicht meldet.</p>
    <p class="sec">Über</p><div class="ls">${row('Läuft lokal', val('ohne Konto'), 'Alle Funktionen von myStrom PLUS, PRO, DATA PRO und HOME GUARD, gratis. Daten bleiben bei dir.')}</div>`;
}

// ---------- Zeichnen ----------
let swipe = null;
// Bestehende Knoten an das neue HTML angleichen statt alles zu ersetzen: kein Flackern, Fokus und Diagramme bleiben.
// Elemente mit data-keep behalten ihren Inhalt, solange der Schlüssel gleich ist (Diagramm, Summen, Verlauf).
function morph(a, b) {
  for (const at of [...a.attributes]) if (!b.hasAttribute(at.name) && at.name !== 'data-filled' && at.name !== 'style') a.removeAttribute(at.name);
  for (const at of b.attributes) if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
  if (a.tagName === 'INPUT') { if (a !== document.activeElement && a.value !== (b.getAttribute('value') ?? '')) a.value = b.getAttribute('value') ?? ''; return; }
  if (b.dataset.keep && a.dataset.filled) { if (a.dataset.filled !== b.dataset.keep) delete a.dataset.filled; return; }
  const ac = [...a.childNodes], bc = [...b.childNodes];
  bc.forEach((n, i) => {
    const o = ac[i];
    if (!o) a.append(n);
    else if (o.nodeType !== n.nodeType || o.nodeName !== n.nodeName) o.replaceWith(n);
    else if (n.nodeType === 1) morph(o, n);
    else if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue;
  });
  for (let i = bc.length; i < ac.length; i++) if (!ac[i].dataset?.transient) ac[i].remove();
}
function render(fresh = false) {
  if (!S || swipe || drag || hdrag || stpHold || document.activeElement?.classList.contains('stpin')) return;
  const [r0, r1, r2, r3] = route(), d = r0 === 'dev' ? dev(r1) : null;
  let html;
  if (r0 === 'dev') html = !d ? `${HD('Steckdose', 'home')}<p class="empty-state">Diese Steckdose gibt es nicht mehr.</p>` : r2 ? featureHTML(d, r2, r3) : deviceHTML(d);
  else if (r0 === 'export') html = exportHTML();
  else if (r0 === 'order') html = orderHTML();
  else html = { energy: energyHTML, scenes: scenesHTML, guard: guardHTML, rules: rulesHTML, alarms: alarmsHTML, more: moreHTML }[r0]?.() ?? (r0 === 'scene' ? sceneHTML(r1) : homeHTML());
  if (fresh || app.dataset.page !== cur()) { app.innerHTML = html; app.dataset.page = cur(); }
  else { const t = app.cloneNode(false); t.innerHTML = html; morph(app, t); }
  fillCharts();
  if (r0 === 'alarms' && !events) api('api/events?n=40').then((e) => { events = e; const el = $('[data-events]'); if (el) el.innerHTML = eventsHTML(); });
}

// ---------- Wischen auf den Kacheln: wie zur nächsten Seite blättern ----------
// Die aktuelle Kachel schiebt sich mit dem Finger hinaus, von der anderen Seite kommt die nächste:
// grün „AN“ oder rot „AUS“. Über die halbe Breite rastet sie ein und schaltet, sonst federt sie zurück.
const POWER = '<svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v9M6.3 6.8a8 8 0 1 0 11.4 0"/></svg>';
let swiped = 0;
function nextPanel(tile, on, name) {
  let n = tile.querySelector('.next');
  if (!n) { n = document.createElement('div'); n.className = 'next'; n.dataset.transient = '1'; tile.append(n); }
  n.classList.toggle('to-on', on); n.classList.toggle('to-off', !on);
  n.innerHTML = `${POWER}<b>${on ? 'AN' : 'AUS'}</b><span>${esc(name)}</span>`;
  return n;
}
// Seite und Gegenstück an die Fingerposition setzen (x in px, positiv = nach rechts)
function place(tile, x, animate) {
  const face = tile.querySelector('.face'), n = tile.querySelector('.next'), w = tile.offsetWidth, t = animate ? 'transform .22s cubic-bezier(.2,.8,.2,1)' : 'none';
  face.style.transition = t; face.style.transform = x ? `translateX(${x}px)` : '';
  if (n) { n.style.transition = t; n.style.transform = `translateX(${x - Math.sign(x || 1) * w}px)`; }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// fertig blättern, die neue Seite kurz zeigen, dann schalten und in die normale Kachel übergehen
async function flip(tile, d, sign) {
  const w = tile.offsetWidth;
  nextPanel(tile, !d.relay, d.name);
  if (!tile.querySelector('.next').style.transform) place(tile, 0.001 * sign, false); // Start ausserhalb, falls per Tippen
  await wait(20);
  place(tile, sign * w, true);
  await wait(420);
  const n = tile.querySelector('.next'), face = tile.querySelector('.face');
  face.style.transition = 'none'; face.style.transform = '';
  swipe = null;
  const ok = await switchDev(d.mac, !d.relay);
  if (n) { n.style.transition = 'opacity .25s'; n.style.opacity = ok ? '0' : '0'; await wait(260); n.remove(); }
  if (!ok) shake(tile);
}
app.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('[data-swipe]'); if (!b || swipe || editHome) return;
  swipe = { b, tile: b.closest('.tile'), x: e.clientX, y: e.clientY, dx: 0, id: e.pointerId, live: false };
});
// Sicherheitsnetz: bleibt ein Wischen hängen (z. B. Finger verlässt das Fenster), nach 3 s freigeben
setInterval(() => { if (swipe && !swipe.busy && !document.querySelector(':active')) { place(swipe.tile, 0, false); swipe.tile.querySelector('.next')?.remove(); swipe = null; } }, 3000);
app.addEventListener('pointermove', (e) => {
  if (!swipe || swipe.busy || e.pointerId !== swipe.id) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  if (!swipe.live) {
    if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { swipe = null; return; } // senkrecht = scrollen
    if (Math.abs(dx) < 8) return;
    swipe.live = true;
    const d = dev(swipe.b.dataset.swipe);
    swipe.blocked = d.cfg.lock || !d.online;
    if (!swipe.blocked) nextPanel(swipe.tile, !d.relay, d.name);
  }
  // gesperrt oder offline: nur ein kurzes, gebremstes Mitgehen; sonst höchstens eine Kachelbreite, kurz vor dem Ende gebremst
  const w = swipe.tile.offsetWidth, a = Math.abs(dx), soft = w * 0.85;
  const x = swipe.blocked ? Math.sign(dx) * Math.min(24, a / 4) : Math.sign(dx) * Math.min(w, a < soft ? a : soft + (a - soft) * 0.3);
  // Geschwindigkeit (px/ms, geglättet) für schnelles Wischen
  if (swipe.lt) swipe.v = 0.6 * (swipe.v || 0) + 0.4 * ((x - swipe.dx) / Math.max(1, e.timeStamp - swipe.lt));
  swipe.lt = e.timeStamp; swipe.dx = x;
  place(swipe.tile, x, false);
  const past = !swipe.blocked && Math.abs(swipe.dx) >= swipe.tile.offsetWidth * 0.4;
  if (past !== !!swipe.past) { swipe.past = past; if (navigator.vibrate) navigator.vibrate(past ? 12 : 6); }
});
const snapBack = (s) => { s.busy = true; place(s.tile, 0, true); setTimeout(() => { s.tile.querySelector('.next')?.remove(); swipe = null; render(); }, 230); };
const endSwipe = (e) => {
  if (!swipe || swipe.busy) return;
  const s = swipe;
  if (!s.live) { swipe = null; return; } // war ein Tippen
  swiped = Date.now();
  // übernimmt der Browser die Geste (z. B. zum Scrollen), nie schalten, sondern zurückfedern
  if (e?.type === 'pointercancel') { snapBack(s); return; }
  const d = dev(s.b.dataset.swipe), w = s.tile.offsetWidth;
  if (s.blocked) { place(s.tile, 0, true); swipe = null; shake(s.tile); haptic([8, 60, 8]); toast(d.cfg.lock ? `${d.name}: Tastensperre ist an` : `${d.name} ist nicht erreichbar`, !d.cfg.lock); return; }
  // weit genug gezogen, oder kurz und schnell in dieselbe Richtung geschnippt (Finger zuletzt noch in Bewegung)
  const moving = e && s.lt && e.timeStamp - s.lt < 90, v = moving ? s.v || 0 : 0;
  const flick = Math.abs(v) > 0.45 && Math.sign(v) === Math.sign(s.dx) && Math.abs(s.dx) > w * 0.12;
  if (Math.abs(s.dx) >= w * 0.4 || flick) { s.busy = true; store.set('swiped', '1'); haptic(); flip(s.tile, d, Math.sign(s.dx)); }
  else snapBack(s);
};
app.addEventListener('pointerup', endSwipe);
app.addEventListener('pointercancel', endSwipe);
addEventListener('pointerup', endSwipe); // auch ausserhalb der App losgelassen

function tapFlip(el, d) {
  const tile = el.closest('.tile');
  if (d.cfg.lock || !d.online) { shake(tile); haptic([8, 60, 8]); toast(d.cfg.lock ? `${d.name}: Tastensperre ist an` : `${d.name} ist nicht erreichbar`, !d.cfg.lock); return; }
  if (swipe) return;
  swipe = { b: el, tile, busy: true, live: true, dx: 0 };
  haptic();
  flip(tile, d, d.relay ? -1 : 1); // aus: nach links weg, an: nach rechts
}
// Menü von links: Bereiche, Steckdosen mit Zustand, Startseite anordnen, Einstellungen. Schliesst mit Tippen daneben, Esc oder nach links wischen.
function openMenu() {
  if (document.querySelector('.drawer')) return;
  const el = document.createElement('div'), total = S.devices.reduce((a, d) => a + d.w, 0);
  const item = (attr, icon, label, sub = '') => `<button type="button" class="ni" ${attr}><span class="nic">${icon}</span><span class="ntx">${label}${sub ? `<small>${sub}</small>` : ''}</span></button>`;
  el.className = 'drawer';
  el.innerHTML = `<div class="drawer-bg" data-close></div><nav class="drawer-panel" role="dialog" aria-modal="true" aria-label="Menü">
    <div class="drawer-hd"><b>myStrom</b><span>${S.devices.length} Steckdose${S.devices.length === 1 ? '' : 'n'} · ${pw(total)}</span></div>
    <div class="ngrp">${[['scenes', I.scenes, 'Szenen'], ['rules', I.rules, 'Regeln'], ['guard', I.beach, 'Ferien'], ['energy', I.bolt, 'Verbrauch'], ['alarms', I.bell, 'Alarme']]
      .map(([h, ic, l]) => item(`data-ngo="${h}"`, ic, l)).join('')}</div>
    <p class="nsec">Steckdosen</p><div class="ngrp">${S.devices.map((d) => item(`data-ngo="dev/${d.mac}"`, `<i class="dot ${!d.online ? 'off-line' : d.relay ? 'on' : ''}"></i>`, esc(d.name),
      !d.online ? 'offline' : d.relay ? pw(d.w) : 'aus')).join('')}</div>
    <div class="ngrp nfoot">${item('data-nedit="1"', I.menu, 'Startseite anordnen')}${item('data-ngo="more"', I.gear, 'Einstellungen')}</div>
  </nav>`;
  const close = () => { el.classList.remove('open'); removeEventListener('keydown', onKey); setTimeout(() => el.remove(), 260); document.querySelector('[data-menu]')?.focus(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  el.addEventListener('click', (e) => {
    const g = e.target.closest('[data-ngo]');
    if (g) { haptic(); close(); if (cur() !== g.dataset.ngo) go(g.dataset.ngo); }
    else if (e.target.closest('[data-nedit]')) { close(); if (cur() !== 'home' && cur() !== '') back('home'); setTimeout(enterEdit, 280); }
    else if (e.target.closest('[data-close]')) close();
  });
  // nach links wischen schliesst; das Menü folgt dem Finger
  const panel = el.querySelector('.drawer-panel'); let x0 = null, dx = 0;
  panel.addEventListener('pointerdown', (e) => { x0 = e.clientX; dx = 0; });
  panel.addEventListener('pointermove', (e) => { if (x0 == null) return; dx = Math.min(0, e.clientX - x0); if (dx < -6) { panel.style.transition = 'none'; panel.style.transform = `translateX(${dx}px)`; } });
  const up = () => { if (x0 == null) return; x0 = null; panel.style.transition = ''; panel.style.transform = ''; if (dx < -70) close(); };
  panel.addEventListener('pointerup', up); panel.addEventListener('pointercancel', up);
  addEventListener('keydown', onKey);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('open'));
  setTimeout(() => { el.classList.add('open'); panel.querySelector('.ni')?.focus({ preventScroll: true }); }, 60);
}
function openDevPick() {
  document.querySelector('.pick')?.remove();
  const el = document.createElement('div');
  el.className = 'pick';
  el.innerHTML = `<div class="pick-bg" data-close></div><div class="pick-sheet" role="dialog" aria-label="Geräte wählen">
    <div class="pick-hd"><b>Geräte wählen</b><button type="button" data-close>Fertig</button></div>${devPickTiles()}</div>`;
  const close = () => { el.classList.remove('open'); setTimeout(() => el.remove(), 300); };
  el.addEventListener('click', (e) => {
    const o = e.target.closest('[data-pickdev]');
    if (o) {
      haptic();
      const v = o.dataset.pickdev, cur = pickedMacs(view.mac); // bei „Alle“ sind alle gewählt, Antippen nimmt eines weg
      const next = v === 'all' ? [] : cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
      const ordered = S.devices.map((d) => d.mac).filter((x) => next.includes(x));
      view.mac = !ordered.length || ordered.length === S.devices.length ? 'all' : ordered.join(',');
      el.querySelector('.grid').outerHTML = devPickTiles(); render();
    }
    else if (e.target.closest('[data-close]')) close();
  });
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('open'));
  setTimeout(() => el.classList.add('open'), 60); // falls gerade kein Bild gezeichnet wird
}
// ---------- − / + gedrückt halten: wiederholt, immer schneller; gespeichert wird beim Loslassen ----------
let stpHold = null, stpRepeated = false;
app.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('[data-step]'); if (!b || b.disabled) return;
  const path = b.dataset.step, list = b.dataset.list, dir = Number(b.dataset.dir), out = b.parentElement.querySelector('.stpv'), fmt = STEPS[list][1];
  const h = (stpHold = { path, v: Number(out.dataset.v), n: 0 });
  const tick = () => {
    if (stpHold !== h) return;
    h.v = nextStep(list, h.v, dir); h.n++; out.textContent = fmt(h.v); out.dataset.v = h.v; haptic(5);
    h.t = setTimeout(tick, h.n < 4 ? 260 : h.n < 12 ? 140 : 70);
  };
  h.t = setTimeout(tick, 420);
});
const stpEnd = () => {
  const h = stpHold; if (!h) return; clearTimeout(h.t); stpHold = null;
  if (h.n) { stpRepeated = true; setTimeout(() => { stpRepeated = false; }, 400); stpSave(h.path, h.v); }
};
addEventListener('pointerup', stpEnd); addEventListener('pointercancel', stpEnd);
app.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList?.contains('stpin')) e.target.blur(); });
// Kopfzeile: oben ohne Kante, erst beim Scrollen als Glas abgesetzt
const onScroll = () => document.documentElement.classList.toggle('scrolled', scrollY > 4);
addEventListener('scroll', onScroll, { passive: true }); onScroll();
// ---------- Klicks ----------
// ---------- Startseite anordnen: lange drücken, dann Kacheln ziehen (wie auf dem iPhone) ----------
let editHome = false, editOrder = null, hdrag = null, lp = null, lpFired = 0;
function enterEdit() {
  swipe = null; haptic(15);
  editHome = true; editOrder = homeOrder(); app.dataset.page = ''; render(true);
}
function exitEdit() {
  const o = editOrder; editHome = false; editOrder = null; hdrag = null; app.dataset.page = '';
  haptic(); saveOrder(o);
}
app.addEventListener('pointerdown', (e) => {
  if (cur() !== 'home') return;
  const t = e.target.closest('.grid.home > [data-okey]'); if (!t) return;
  if (editHome) { startHomeDrag(t, e); return; }
  clearTimeout(lp?.t);
  lp = { x: e.clientX, y: e.clientY, t: setTimeout(() => { lp = null; lpFired = Date.now(); enterEdit(); }, 520) };
}, true);
app.addEventListener('pointermove', (e) => {
  if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 8) { clearTimeout(lp.t); lp = null; } // bewegt = wischen oder scrollen
  moveHomeDrag(e);
}, true);
const lpEnd = () => { if (lp) { clearTimeout(lp.t); lp = null; } endHomeDrag(); };
app.addEventListener('pointerup', lpEnd, true);
app.addEventListener('pointercancel', lpEnd, true);
app.addEventListener('contextmenu', (e) => { if (e.target.closest('.grid.home')) e.preventDefault(); });
// die gezogene Kachel folgt dem Finger; liegt sie über einer anderen, tauschen sie den Platz und die übrigen gleiten nach
const followFinger = (t, e) => { t.style.transform = 'none'; const b = t.getBoundingClientRect(); t.style.transform = `translate(${e.clientX - hdrag.ox - b.left}px, ${e.clientY - hdrag.oy - b.top}px) scale(1.05)`; };
function startHomeDrag(t, e) {
  const r = t.getBoundingClientRect();
  hdrag = { t, id: e.pointerId, ox: e.clientX - r.left, oy: e.clientY - r.top };
  try { t.setPointerCapture(e.pointerId); } catch { /* ohne Zeiger-Erfassung weiter */ }
  t.classList.add('lift'); haptic(8); e.preventDefault();
}
function moveHomeDrag(e) {
  if (!hdrag || e.pointerId !== hdrag.id) return;
  const t = hdrag.t;
  followFinger(t, e);
  t.style.pointerEvents = 'none';
  const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('.grid.home > [data-okey]');
  t.style.pointerEvents = '';
  if (!under || under === t) return;
  const kids = [...t.parentElement.querySelectorAll(':scope > [data-okey]')], before = new Map(kids.map((k) => [k, k.getBoundingClientRect()]));
  if (kids.indexOf(under) > kids.indexOf(t)) under.after(t); else under.before(t);
  haptic(5);
  for (const k of kids) {
    if (k === t) continue;
    const a = before.get(k), b = k.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
    if (dx || dy) k.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  followFinger(t, e);
}
function endHomeDrag() {
  if (!hdrag) return;
  const t = hdrag.t; hdrag = null;
  t.classList.remove('lift'); t.style.transform = '';
  editOrder = [...t.parentElement.querySelectorAll(':scope > [data-okey]')].map((k) => k.dataset.okey);
}
app.addEventListener('click', async (e) => {
  if (Date.now() - lpFired < 700) return; // das Loslassen nach dem langen Drücken öffnet nichts
  if (editHome) { if (e.target.closest('[data-editdone]')) exitEdit(); return; } // im Bearbeiten-Modus wird nichts geschaltet oder geöffnet
  const at = (s) => e.target.closest(s), [r0, r1] = route();
  let el;
  if ((el = at('[data-swipe]'))) {
    if (Date.now() - swiped < 450) return;
    const d = dev(el.dataset.swipe);
    // Startseite: Tippen öffnet das Gerät. Geräteseite: die grosse Schalter-Kachel schaltet beim Tippen.
    go(`dev/${d.mac}`);
  } else if ((el = at('[data-devtoggle]'))) {
    const d = dev(el.dataset.devtoggle);
    if (d.cfg.lock || !d.online) { shake(el); haptic([8, 60, 8]); toast(d.cfg.lock ? `${d.name}: Tastensperre ist an` : `${d.name} ist nicht erreichbar`, !d.cfg.lock); }
    else { haptic(); switchDev(d.mac, !d.relay); }
  } else if ((el = at('[data-back]'))) { if (stack.length > 1) { scrolls[cur()] = scrollY; history.back(); } else back(el.dataset.back); }
  else if ((el = at('[data-actnew]'))) {
    const d = dev(r1), tpl = ACT_TPL(d).find(([k]) => k === el.dataset.actnew)[3], id = `a${Date.now().toString(36)}`;
    haptic(); await saveCfg(r1, { actions: [...d.cfg.actions, { id, on: true, ...tpl }] }); go(`dev/${r1}/actions/${id}`);
  } else if ((el = at('[data-atoggle]'))) { haptic(); const a = dev(r1).cfg.actions.find((x) => x.id === el.dataset.atoggle); updAct(r1, a.id, { on: !a.on }); }
  else if ((el = at('[data-aset]'))) { haptic(); const [f, v] = el.dataset.aset.split('|'), a = route()[3], patch = { [f]: v }; if (f === 'then' && v.startsWith('other') && !dev(r1).cfg.actions.find((x) => x.id === a).target) patch.target = S.devices.find((x) => x.mac !== r1)?.mac || ''; updAct(r1, a, patch); }
  else if ((el = at('[data-adel]'))) { if (!confirm('Power Action löschen?')) return; await saveCfg(r1, { actions: dev(r1).cfg.actions.filter((x) => x.id !== el.dataset.adel) }); back(`dev/${r1}/actions`); }
  else if ((el = at('[data-period]'))) { haptic(); view.period = el.dataset.period; render(); }
  else if ((el = at('[data-exp-mac]'))) { exp.mac = el.dataset.expMac; render(); }
  else if ((el = at('[data-exp-range]'))) { [exp.from, exp.to] = el.dataset.expRange.split('|'); render(); }
  else if ((el = at('[data-exp-res]'))) { exp.res = el.dataset.expRes; render(); }
  else if ((el = at('[data-design]'))) { haptic(); setDesign(el.dataset.design); }
  else if (at('[data-orderreset]')) { haptic(); saveOrder([]); }
  else if ((el = at('[data-stime]'))) { haptic(); const s = S.scenes.find((x) => x.id === el.dataset.stime); s.time.on = !s.time.on; saveScenes(); }
  else if ((el = at('[data-sday]'))) { const [id, n] = el.dataset.sday.split('|'), s = S.scenes.find((x) => x.id === id), k = Number(n); s.time.days = s.time.days.includes(k) ? s.time.days.filter((x) => x !== k) : [...s.time.days, k]; saveScenes(); }
  else if (at('[data-roomadd]')) { const i = $('[data-roomnew]'); if (i.value.trim()) { i.blur(); saveCfg(r1, { room: i.value.trim().slice(0, 40) }); setTimeout(() => back(`dev/${r1}/settings`), 180); } else i.focus(); }
  else if ((el = at('[data-icon]'))) { haptic(); saveCfg(r1, { icon: el.dataset.icon }); setTimeout(() => back(`dev/${r1}/settings`), 180); }
  else if ((el = at('[data-room]'))) { haptic(); saveCfg(r1, { room: el.dataset.room }); setTimeout(() => back(`dev/${r1}/settings`), 180); }
  else if ((el = at('[data-go]'))) go(el.dataset.go);
  else if ((el = at('[data-sw]'))) {
    const on = el.getAttribute('aria-pressed') !== 'true', [mac, p] = el.dataset.sw.includes(':') ? el.dataset.sw.split(':') : [r1, el.dataset.sw];
    el.setAttribute('aria-pressed', on); haptic();
    saveCfg(mac, patchOf(p, on));
  } else if ((el = at('[data-set]'))) haptic(), saveCfg(r1, patchOf(el.dataset.set, /^\d+$/.test(el.dataset.v) ? Number(el.dataset.v) : el.dataset.v));
  else if ((el = at('[data-stpedit]'))) {
    const list = el.dataset.list, v = Number(el.dataset.v), isDur = /^dur/.test(list), inp = document.createElement('input');
    inp.className = 'stpin'; inp.dataset.stpin = el.dataset.stpedit; inp.dataset.list = list;
    if (isDur) { inp.type = 'text'; inp.inputMode = 'numeric'; inp.value = `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; inp.placeholder = 'Std:Min'; }
    else { inp.type = 'text'; inp.inputMode = list === 'offs' || list === 'tcorr' ? 'text' : 'decimal'; inp.value = String(v); }
    inp.setAttribute('aria-label', el.getAttribute('aria-label').split(':')[0]);
    inp.enterKeyHint = 'done'; el.replaceWith(inp); inp.focus(); inp.select();
    inp.addEventListener('blur', () => setTimeout(() => render(), 0));
  } else if (stpRepeated) stpRepeated = false; // Klick nach gedrückt Halten: Wert ist schon gespeichert
  else if ((el = at('[data-step]'))) {
    haptic(); const p = el.dataset.step, dir = Number(el.dataset.dir);
    stpSave(p, nextStep(el.dataset.list, Number(el.parentElement.querySelector('.stpv').dataset.v), dir));
  } else if ((el = at('[data-schsw]'))) {
    haptic(); const id = el.dataset.schsw; el.setAttribute('aria-pressed', el.getAttribute('aria-pressed') !== 'true');
    updSch(r1, (e) => (e.id === id ? { ...e, idle: !e.idle } : e));
  } else if ((el = at('[data-schday]'))) {
    haptic(); const [id, n] = el.dataset.schday.split('|'), k = Number(n);
    updSch(r1, (e) => (e.id === id ? { ...e, days: e.days.includes(k) ? e.days.filter((x) => x !== k) : [...e.days, k] } : e));
  } else if (at('[data-schadd]')) {
    // neuer Zeitplan bekommt alle noch freien Tage
    haptic(); const sc = dev(r1).cfg.schedule, used = sc.entries.flatMap((e) => e.days), last = sc.entries[sc.entries.length - 1];
    saveCfg(r1, { schedule: { entries: [...sc.entries, { id: `s${Date.now().toString(36)}`, start: last?.start || '07:00', end: last?.end || '23:00', days: WD.map(([n]) => n).filter((n) => !used.includes(n)) }] } });
  } else if ((el = at('[data-schdel]'))) { haptic(); updSch(r1, (e) => (e.id === el.dataset.schdel ? null : e)); }
  else if ((el = at('[data-dayshift]'))) { view.day = shiftPeriod(view.period, view.day, Number(el.dataset.dayshift)); if (view.day > S.today) view.day = S.today; render(); }
  else if (at('[data-devsel]')) { haptic(); openDevPick(); }
  else if (at('[data-menu]')) { haptic(); openMenu(); }
  else if ((el = at('[data-run]'))) {
    el.disabled = true; haptic();
    try { const r = await api(`api/scenes/${el.dataset.run}/run`, { method: 'POST' }); await load(); toast(r.ok ? 'Szene ausgeführt' : `Nicht erreicht: ${r.errors.join(', ')}`, !r.ok); } catch (x) { toast(x.message, true); }
    el.disabled = false;
  } else if (at('[data-newscene]')) {
    const s = { id: `s${Date.now().toString(36)}`, name: `Szene ${S.scenes.length + 1}`, actions: {} };
    S.scenes.push(s); await saveScenes(); go(`scene/${s.id}`);
  } else if ((el = at('[data-sact]'))) {
    const [id, mac, a] = el.dataset.sact.split('|'), s = S.scenes.find((x) => x.id === id);
    if (a) s.actions[mac] = a; else delete s.actions[mac];
    saveScenes();
  } else if ((el = at('[data-delscene]'))) {
    if (!confirm('Szene löschen?')) return;
    S.scenes = S.scenes.filter((x) => x.id !== el.dataset.delscene); await saveScenes(); back('scenes');
  } else if ((el = at('[data-remove]'))) {
    const d = dev(el.dataset.remove);
    if (!confirm(`${d.name} aus der App entfernen? Der Verlauf bleibt gespeichert; meldet sich die Steckdose wieder, erscheint sie neu.`)) return;
    try { await api(`api/devices/${d.mac}`, { method: 'DELETE' }); await load(); back('home'); } catch (x) { toast(x.message, true); }
  } else if (at('[data-push]')) { try { await pushEnable(); toast('Mitteilungen sind an'); await load(); } catch (x) { toast(x.message, true); } }
  else if (at('[data-geo]')) {
    haptic();
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = Math.round(pos.coords.latitude * 1e4) / 1e4, lon = Math.round(pos.coords.longitude * 1e4) / 1e4;
      try { S.settings = await api('api/settings', { method: 'PUT', body: JSON.stringify({ settings: { lat, lon } }) }); toast('Standort übernommen'); load(); } catch (x) { toast(x.message, true); }
    }, (err) => toast(err.code === 1 ? 'Standort nicht freigegeben (in den Einstellungen des Handys änderbar)' : 'Standort nicht verfügbar', true), { timeout: 15000, maximumAge: 600000 });
  }
  else if (at('[data-pushtest]')) { try { await api('api/push/test', { method: 'POST' }); toast('Test gesendet'); } catch (x) { toast(x.message, true); } }
});
// Eingaben: speichern, sobald ein Feld fertig ist
app.addEventListener('change', async (e) => {
  const t = e.target, [, r1] = route();
  if (t.dataset.in) {
    const v = t.type === 'number' ? Number(t.value) : t.value.trim();
    t.blur(); saveCfg(r1, patchOf(t.dataset.in, v));
  } else if (t.dataset.roomnew && t.value.trim()) {
    t.blur(); saveCfg(r1, { room: t.value.trim().slice(0, 40) }); setTimeout(() => back(`dev/${r1}/settings`), 180);
  } else if (t.dataset.place && t.value.trim() && t.value.trim() !== S.settings.place) {
    t.blur();
    try { S.settings = await api('api/settings', { method: 'PUT', body: JSON.stringify({ settings: { place: t.value.trim() } }) }); render(); toast(`Gefunden: ${S.settings.place}`); load(); }
    catch (x) { toast(x.message, true); render(); }
  } else if (t.dataset.stpin) {
    const v = stpParse(t.dataset.list, t.value); t.blur(); if (v == null) toast('Bitte eine Zahl eingeben', true); else stpSave(t.dataset.stpin, v);
  } else if (t.dataset.schin) {
    const [id, k] = t.dataset.schin.split('|'); t.blur(); updSch(r1, (e) => (e.id === id ? { ...e, [k]: t.value } : e));
  } else if (t.dataset.ain) {
    const v = t.type === 'number' ? Number(t.value) : t.value.trim(); t.blur(); updAct(r1, route()[3], { [t.dataset.ain]: v });
  } else if (t.dataset.expIn) { exp[t.dataset.expIn] = t.value; if (exp.from > exp.to) [exp.from, exp.to] = [exp.to, exp.from]; t.blur(); render(); }
  else if (t.dataset.sat) { const s = S.scenes.find((x) => x.id === t.dataset.sat); s.time.at = t.value; t.blur(); saveScenes(); }
  else if (t.dataset.setting) {
    try { S.settings = await api('api/settings', { method: 'PUT', body: JSON.stringify({ settings: { [t.dataset.setting]: Number(t.value) } }) }); t.blur(); render(); toast('Gespeichert'); } catch (x) { toast(x.message, true); }
  } else if (t.dataset.sceneName) {
    S.scenes.find((x) => x.id === t.dataset.sceneName).name = t.value.trim() || 'Szene'; t.blur(); saveScenes();
  } else if (t.id === 'addip' && t.value.trim()) {
    t.disabled = true;
    try { const d = await api('api/devices', { method: 'POST', body: JSON.stringify({ ip: t.value.trim() }) }); await load(); toast(`${d.name} hinzugefügt`); } catch (x) { toast(x.message, true); }
    t.disabled = false;
  }
});
app.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('input')) e.target.blur();
  // Tastatur: Leertaste schaltet die Steckdose, Enter öffnet sie (wie Tippen)
  const sw = e.target.closest?.('[data-swipe]');
  if (sw && e.key === ' ' && !sw.dataset.inpage) { e.preventDefault(); tapFlip(sw, dev(sw.dataset.swipe)); }
});

// ---------- Push ----------
const u8 = (b64) => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4)), (c) => c.charCodeAt(0));
async function pushEnable() {
  const reg = await navigator.serviceWorker.ready;
  if (await Notification.requestPermission() !== 'granted') throw new Error('Mitteilungen wurden nicht erlaubt (in den Einstellungen des Handys änderbar).');
  const { key } = await api('api/push/key');
  let sub = await reg.pushManager.getSubscription();
  if (sub) await sub.unsubscribe();
  sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(key) });
  await api('api/push/subscribe', { method: 'POST', body: JSON.stringify(sub) });
}

// ---------- Start ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'open') { const h = new URL(e.data.url).hash; go(h.slice(1) || 'home'); } });
}
load();
setInterval(() => { if (!document.hidden) load(); }, 5000);
document.addEventListener('visibilitychange', () => { for (const a of document.getAnimations()) if (a.playState === 'running') a.finish(); if (!document.hidden) { events = null; load(); } });
