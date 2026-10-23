// Smart plugs – UI in the style of the myStrom app, with all features unlocked (incl. PLUS, PRO, DATA PRO, HOME GUARD).
// Usage: swiping a tile toggles it, tapping opens the device. Changes are saved immediately.
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
let S = null; // State from the server
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pw = (w) => (w < 1000 ? `${Math.round(w)} W` : `${(w / 1000).toFixed(2)} kW`);
const pwN = (w) => (w < 1000 ? [String(Math.round(w)), 'W'] : [(w / 1000).toFixed(2), 'kW']);
const kwh = (wh) => (wh / 1000).toFixed(2);
const chf = (wh) => (wh / 1000 * (S?.settings.price || 0)).toFixed(2);
const dev = (mac) => S.devices.find((d) => d.mac === mac);
// UI language (setting on the server): German is the source text and the key, English comes from I18N_EN (i18n.js);
// {0}, {1} … are placeholders, e.g. the key 'Aus seit {0}' with the clock time as argument
const lang = () => (S?.settings?.lang === 'en' ? 'en' : 'de');
const tr = (de, ...a) => (lang() === 'en' ? I18N_EN[de] ?? de : de).replace(/\{(\d)\}/g, (_, i) => a[i] ?? '');
const LOC = () => (lang() === 'en' ? 'en-GB' : 'de-CH');
// decimal comma in German, point in English
const dec = (x) => (lang() === 'en' ? String(x) : String(x).replace('.', ','));
const dShort = (day) => { const [, m, d] = day.split('-').map(Number); return tr('{0}.{1}.', d, m); };
const addDays = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// month and weekday names are functions, so they follow the language (at module load S is not there yet)
const MONTHS = () => [tr('Jan'), tr('Feb'), tr('Mär'), tr('Apr'), tr('Mai'), tr('Jun'), tr('Jul'), tr('Aug'), tr('Sep'), tr('Okt'), tr('Nov'), tr('Dez')];
const dayLabel = (day) => (day === S.today ? tr('Heute') : day === addDays(S.today, -1) ? tr('Gestern') : tr('{0}. {1}', Number(day.slice(8)), MONTHS()[Number(day.slice(5, 7)) - 1]));
const nDev = (n) => (n === 1 ? tr('1 Gerät') : tr('{0} Geräte', n));
// switchable and with consumption: plugs and bulbs (not buttons, motion sensors)
const canSwitch = (d) => d.kind === 'switch' || d.kind === 'bulb';
const SW = () => S.devices.filter(canSwitch);
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private */ } } };

// Line icons like in the myStrom app
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

// Features per plug: key = section in the settings
const FEAT = () => [
  ['schedule', 'clock', tr('Zeitplan')], ['actions', 'pact', 'Power Actions'], ['vacation', 'beach', tr('Ferien')],
  ['sun', 'sun', tr('Sonne')], ['timer', 'timer', tr('Timer')], ['saver', 'leaf', tr('Stromsparen')],
  ['temp', 'temp', tr('Temperatur')], ['alarms', 'bell', tr('Alarme')], ['eval', 'evals', tr('Auswertung')],
];
const FTITLE = () => ({ btn: tr('Taster'), schedule: tr('Zeitplan'), vacation: tr('Ferienmodus'), sun: tr('Sonne'), timer: tr('Timer'), saver: tr('Stromsparen'),
  temp: tr('Temperatur'), alarms: tr('Alarme'), eval: tr('Auswertung'), settings: tr('Einstellungen'), tech: tr('Technische Details'), room: tr('Raum wählen'), roomnew: tr('Eigener Raum'), icon: tr('Symbol wählen'), actions: 'Power Actions' });
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
// Presets like in the myStrom app, alphabetical
const ROOMS = [['Babyzimmer', 'baby', () => tr('Babyzimmer')], ['Badezimmer', 'bath', () => tr('Badezimmer')], ['Balkon', 'balcony', () => tr('Balkon')], ['Büro', 'office', () => tr('Büro')], ['Esszimmer', 'dining', () => tr('Esszimmer')], ['Estrich', 'attic', () => tr('Estrich')], ['Flur', 'hall', () => tr('Flur')],
  ['Garage', 'garage', () => tr('Garage')], ['Garten', 'garden', () => tr('Garten')], ['Gästezimmer', 'guest', () => tr('Gästezimmer')], ['Heimkino', 'cinema', () => tr('Heimkino')], ['Keller', 'stairs', () => tr('Keller')], ['Kinderzimmer', 'kids', () => tr('Kinderzimmer')], ['Küche', 'kitchen', () => tr('Küche')],
  ['Schlafzimmer', 'bed', () => tr('Schlafzimmer')], ['Waschküche', 'laundry', () => tr('Waschküche')], ['Werkstatt', 'workshop', () => tr('Werkstatt')], ['Wohnzimmer', 'sofa', () => tr('Wohnzimmer')]];
// Device icons: what is plugged into the plug
const DI = (d) => `<svg viewBox="0 0 64 64" width="54" height="54" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">${d}</svg>`;
const DEV_ICONS = [
  ['plug', () => tr('Steckdose'), null],
  ['bulb', () => tr('Glühbirne'), DI('<path d="M22 30a12 12 0 1 1 20 0c-3 4-5 7-5 12H27c0-5-2-8-5-12zM27 48h10M28 54h8"/>')],
  ['strip', () => tr('LED-Streifen'), DI('<path d="M6 40c10-14 18-14 26 0s16 14 26 0"/><circle cx="13" cy="31" r="1.6" fill="currentColor"/><circle cx="25" cy="31" r="1.6" fill="currentColor"/><circle cx="39" cy="49" r="1.6" fill="currentColor"/><circle cx="51" cy="49" r="1.6" fill="currentColor"/>')],
  ['button', () => tr('Taster'), DI('<rect x="14" y="14" width="36" height="36" rx="10"/><circle cx="32" cy="32" r="7"/>')],
  ['motion', () => tr('Bewegungsmelder'), DI('<circle cx="32" cy="36" r="12"/><circle cx="32" cy="36" r="4"/><path d="M18 14a20 20 0 0 1 28 0M23 20a12 12 0 0 1 18 0"/>')],
  ['lamp', () => tr('Tischlampe'), DI('<path d="M22 10h20l8 22H14zM32 32v18M22 54h20"/>')],
  ['floor', () => tr('Stehlampe'), DI('<path d="M24 6h16l6 14H18zM32 20v34M24 56h16"/>')],
  ['monitor', () => tr('Bildschirm'), DI('<path d="M8 12h48v30H8zM26 52h12M32 42v10"/>')],
  ['pc', () => tr('Computer'), DI('<path d="M18 6h28v52H18zM24 14h16M24 20h16"/><circle cx="32" cy="46" r="3"/>')],
  ['desk', () => tr('Arbeitsplatz'), DI('<path d="M20 12h24v16H20zM32 28v6M26 34h12M8 40h48M12 40v16M52 40v16"/>')],
  ['tv', () => tr('Fernseher'), DI('<path d="M6 16h52v32H6zM24 54h16M26 10l6 6 6-6"/>')],
  ['mirror', () => tr('Smart Mirror'), DI('<path d="M16 6h32v52H16zM20 10h24v44H20zM24 16h8M24 21h12M24 26h6"/>')],
  ['speaker', () => tr('Lautsprecher'), DI('<rect x="18" y="6" width="28" height="52" rx="4"/><circle cx="32" cy="38" r="9"/><circle cx="32" cy="19" r="4"/>')],
  ['coffee', () => tr('Kaffeemaschine'), DI('<path d="M14 22h28v16a10 10 0 0 1-10 10h-8a10 10 0 0 1-10-10zM42 26h4a6 6 0 0 1 0 12h-4M10 54h40M22 8c0 4 4 4 4 8M30 8c0 4 4 4 4 8"/>')],
  ['kettle', () => tr('Wasserkocher'), DI('<path d="M18 20h24l4 34H14zM42 24c9 0 9 18 0 18M24 14h12M30 14v6"/>')],
  ['fan', () => tr('Ventilator'), DI('<circle cx="32" cy="26" r="17"/><path d="M32 26c0-8 6-12 10-10s-2 10-10 10zM32 26c-7 4-14 1-13-4s10-3 13 4zM32 26c7 4 6 12 2 13s-6-6-2-13zM32 43v9M22 56h20"/>')],
  ['heater', () => tr('Heizung'), DI('<path d="M10 16h44v32H10zM19 16v32M28 16v32M37 16v32M46 16v32M14 48v6M50 48v6"/>')],
  ['washer', () => tr('Waschmaschine'), DI('<path d="M14 6h36v52H14zM14 16h36"/><circle cx="32" cy="36" r="11"/><circle cx="20" cy="11" r="1.5"/>')],
  ['fridge', () => tr('Kühlschrank'), DI('<path d="M18 4h28v56H18zM18 24h28M24 12v6M24 30v10"/>')],
  ['router', () => tr('Router'), DI('<path d="M8 36h48v14H8zM16 36l-4-20M48 36l4-20M16 43h3M24 43h3M32 43h3"/>')],
  ['charger', () => tr('Ladestation'), DI('<path d="M20 6h24v52H20zM34 20l-6 11h8l-6 11"/>')],
  ['printer', () => tr('Drucker'), DI('<path d="M14 24h36v20H14zM22 24V8h20v16M22 36h20v20H22zM42 30h2"/>')],
  ['plant', () => tr('Pflanzenlicht'), DI('<path d="M20 40h24l-4 16H24zM32 40V24M32 30c-8 0-12-6-12-12 8 0 12 6 12 12M32 26c6 0 10-4 10-10-6 0-10 4-10 10"/>')],
  ['tree', () => tr('Weihnachtsbaum'), DI('<path d="M32 4l12 16h-6l10 14h-8l10 14H14l10-14h-8l10-14h-6zM32 48v10"/>')],
];
// custom icon, else guessed from the name, else the plug
const GUESS = [[/lamp|licht|leuchte|light/, 'lamp'], [/mirror|spiegel/, 'mirror'], [/\btv\b|fernseh/, 'tv'], [/bildschirm|monitor|screen/, 'monitor'], [/\bpc\b|computer|rechner/, 'pc'],
  [/schreibtisch|büro|arbeit|desk|office/, 'desk'], [/kaffee|espresso|coffee/, 'coffee'], [/wasserkocher|kettle/, 'kettle'], [/ventilator|\bfan\b/, 'fan'], [/heiz|radiator|heater/, 'heater'],
  [/wasch|washer|washing/, 'washer'], [/kühl|fridge/, 'fridge'], [/router|wlan|wifi/, 'router'], [/ladestation|ladeger|charger/, 'charger'], [/drucker|printer/, 'printer'], [/pflanz|plant/, 'plant'],
  [/weihnacht|tannenbaum|christmas/, 'tree'], [/lautsprecher|sonos|speaker/, 'speaker']];
function iconKey(d) {
  if (d.cfg.icon && DEV_ICONS.some(([k]) => k === d.cfg.icon)) return d.cfg.icon;
  if (d.kind === 'bulb') return d.type === 105 ? 'strip' : 'bulb';
  if (d.kind === 'button' || d.kind === 'motion') return d.kind;
  const n = d.name.toLowerCase();
  return GUESS.find(([re]) => re.test(n))?.[1] || 'plug';
}
const devIcon = (d) => DEV_ICONS.find(([k]) => k === iconKey(d))[2] || I.plug;
const iconName = (d) => DEV_ICONS.find(([k]) => k === iconKey(d))[1]();
const roomIcon = (r) => ROOM_ICON[ROOMS.find(([n]) => n === r)?.[1]] || ROOM_ICON.sofa;
// rooms are stored in German; predefined ones are shown translated, self-typed ones as typed
const roomLabel = (r) => ROOMS.find(([n]) => n === r)?.[2]() ?? r;
const WD = () => [[1, tr('Mo')], [2, tr('Di')], [3, tr('Mi')], [4, tr('Do')], [5, tr('Fr')], [6, tr('Sa')], [0, tr('So')]];
function daysText(days) {
  if (days.length === 7) return tr('täglich');
  if (days.length === 5 && [1, 2, 3, 4, 5].every((x) => days.includes(x))) return tr('Mo–Fr');
  if (days.length === 2 && days.includes(0) && days.includes(6)) return tr('Sa, So');
  return WD().filter(([n]) => days.includes(n)).map(([, l]) => l).join(', ') || tr('nie');
}
// vacation slots come from the server with the key 'morgens' / 'abends'
const slotName = (k) => (k === 'morgens' ? tr('morgens') : k === 'abends' ? tr('abends') : k);
// is the feature enabled, and what does it do (short form for the tile)
// which alarms exist per type: bulbs don't measure temperature, motion sensors no consumption
const alarmKeys = (d) => (d.kind === 'motion' ? ['offline', 'hot'] : d.kind === 'bulb' ? ['offline', 'unusual', 'switchedOn'] : ['offline', 'unusual', 'switchedOn', 'hot']);
function featInfo(d, k) {
  const c = d.cfg;
  switch (k) {
    case 'motion': { const n = nDev(c.motion.targets.filter((m) => dev(m)).length); return [c.motion.on, tr('{0} · aus nach {1}', c.motion.dark ? tr('{0}, wenn dunkel', n) : n, dur(c.motion.mins))]; }
    case 'schedule': {
      const e = c.schedule.entries.filter((x) => x.days.length), b = e.flatMap((x) => x.blocks);
      if (e.length === 1 && b.length === 1) return [c.schedule.on, b[0].idle ? tr('{0}–{1} oder später', b[0].start, b[0].end) : `${b[0].start}–${b[0].end} · ${daysText(e[0].days)}`];
      return [c.schedule.on, tr('{0} Zeiten · {1}', b.length, daysText(e.flatMap((x) => x.days)))];
    }
    case 'vacation': return [c.vacation.on, `${dShort(c.vacation.from)}–${dShort(c.vacation.to)}`];
    case 'sun': return [c.sun.on || c.sun.off, [c.sun.on && tr('abends an'), c.sun.off && tr('morgens aus')].filter(Boolean).join(', ')];
    case 'timer': return [c.timer.on, tr('nach {0} aus', c.timer.mins < 60 ? `${c.timer.mins} min` : `${c.timer.mins / 60} h`)];
    case 'saver': return [c.saver.on, tr('unter {0} W aus', dec(c.saver.below))];
    case 'temp': return [c.temp.on, tr('über {0} °C aus', c.temp.max)];
    case 'alarms': { const ks = alarmKeys(d), n = ks.filter((x) => c.alarms[x]).length; return [n > 0, tr('{0} von {1} an', n, ks.length)]; }
    case 'actions': { const n = c.actions.filter((a) => a.on).length; return [n > 0, n === 1 ? actText(c.actions.find((a) => a.on)) : tr('{0} aktiv', n)]; }
    default: return [false, tr('{0} kWh heute', kwh(d.todayWh))];
  }
}

// ---------- Server ----------
async function api(p, opt = {}) {
  const r = await fetch(p, { ...opt, headers: { 'Content-Type': 'application/json', ...opt.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || tr('Fehler {0}', r.status)), { code: j.code });
  return j;
}
async function load() {
  try { const first = !S; S = await api('api/state'); render(first); } catch (e) { if (!S) app.innerHTML = `<p class="empty-state">${tr('Server nicht erreichbar.')}<br>${esc(e.message)}</p>`; }
}
// Change a device's settings: show immediately, then save
async function saveCfg(mac, patch) {
  const d = dev(mac);
  const deep = (a, b) => { for (const [k, v] of Object.entries(b)) { if (v && typeof v === 'object' && !Array.isArray(v)) deep(a[k], v); else a[k] = v; } };
  deep(d.cfg, patch); render();
  try { Object.assign(d, await api(`api/devices/${mac}`, { method: 'PUT', body: JSON.stringify({ cfg: patch }) })); render(); } catch (e) { toast(e.message, true); load(); }
}
const patchOf = (path, v) => path.split('.').reduceRight((acc, k) => ({ [k]: acc }), v);

// ---------- Haptics ----------
// Android: navigator.vibrate. iPhone (iOS 18+) lacks it, but toggling an
// <input type="checkbox" switch> gives a light tap; we trigger that invisibly. Only works right after a tap/release.
function haptic(ms = 10) {
  try {
    if (navigator.vibrate) { navigator.vibrate(ms); return; }
    const l = document.createElement('label'), i = document.createElement('input');
    l.ariaHidden = 'true'; l.style.display = 'none'; i.type = 'checkbox'; i.setAttribute('switch', '');
    l.append(i); document.head.append(l); l.click(); l.remove();
  } catch { /* continue without haptics */ }
}

// ---------- Switching ----------
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
  if (d.cfg.lock) { toast(tr('{0}: Tastensperre ist an', d.name)); return false; }
  if (!d.online) { toast(tr('{0} ist nicht erreichbar', d.name), true); return false; }
  const before = { relay: d.relay, w: d.w, status: d.status };
  d.relay = on; d.status = on ? tr('Eingeschaltet') : tr('Aus · von Hand'); if (!on) d.w = 0; render();
  try {
    Object.assign(d, await api(`api/devices/${mac}/relay`, { method: 'POST', body: JSON.stringify({ on }) })); render();
    return true;
  } catch (e) { Object.assign(d, before); render(); toast(e.message, true); return false; }
}
const shake = (el) => el?.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-3px)' }, { transform: 'none' }], 260);

// ---------- Navigation via the hash (#dev/MAC/timer), so Back and notifications work ----------
const cur = () => location.hash.slice(1) || 'home';
const route = () => cur().split('/');
const depth = (h) => (h === 'home' ? 0 : h.split('/').length);
// In-app history: Back goes to the previous page if it is the parent, otherwise straight there
const stack = [cur()], scrolls = {};
let dir = 0; // 1 = forward, -1 = back (for the animation)
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
  if (i >= 0 && i < stack.length - 1) { history.go(i - (stack.length - 1)); return; } // popstate handles the rest
  stack.pop(); if (stack[stack.length - 1] !== parent) stack.push(parent);
  dir = -1;
  history.replaceState(null, '', `#${parent}`);
  show();
}
// "Back" swipe gesture of the browser or iOS
addEventListener('popstate', () => {
  const h = cur(), i = stack.lastIndexOf(h);
  dir = i >= 0 && i < stack.length - 1 ? -1 : depth(h) < depth(stack[stack.length - 1] || 'home') ? -1 : 1;
  if (i >= 0) stack.length = i + 1; else stack.push(h);
  show();
});
// Page transition like on iOS: the new page slides in from the right over the old one, the old one shifts slightly
// left and darkens; back is the exact reverse. For this, a copy of the old page stays briefly.
const EASE = 'cubic-bezier(.32,.72,0,1)', DUR = 380;
let ghost = null;
function show() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches, oldScroll = scrollY;
  for (const a of app.getAnimations()) a.finish(); // a running transition finishes immediately
  ghost?.remove(); ghost = null;
  if (dir && !reduced && S) {
    ghost = document.createElement('div');
    ghost.className = `page-copy${oldScroll > 4 ? ' scrolled' : ''}`; // copy keeps the raised header if it was scrolled
    const inner = app.cloneNode(true); inner.removeAttribute('id'); inner.removeAttribute('aria-live');
    ghost.append(inner);
    document.body.append(ghost);
    ghost.scrollTop = oldScroll; // copy shows exactly the section that was just visible
  }
  render(true);
  scrollTo(0, dir < 0 ? scrolls[cur()] || 0 : 0);
  if (ghost) {
    const g = ghost, w = innerWidth, fwd = dir > 0;
    document.documentElement.classList.add('paging');
    g.style.zIndex = fwd ? '1' : '30';
    const top = fwd ? app : g; // the page on top that slides fully in or out
    top.style.boxShadow = '-12px 0 32px rgb(0 0 0 / .55)';
    const under = fwd ? g : app;
    const a1 = top.animate(fwd ? [{ transform: `translateX(${w}px)` }, { transform: 'none' }] : [{ transform: 'none' }, { transform: `translateX(${w}px)` }], { duration: DUR, easing: EASE });
    const a2 = under.animate(fwd ? [{ transform: 'none', filter: 'brightness(1)' }, { transform: `translateX(${-w * 0.3}px)`, filter: 'brightness(.55)' }]
      : [{ transform: `translateX(${-w * 0.3}px)`, filter: 'brightness(.55)' }, { transform: 'none', filter: 'brightness(1)' }], { duration: DUR, easing: EASE });
    a1.finished.catch(() => {}).then(() => { if (ghost === g) { g.remove(); ghost = null; } top.style.boxShadow = ''; document.documentElement.classList.remove('paging'); });
    // Safety net: if the browser pauses the animation (app in background, hidden tab), the page still ends up
    // correct after a short time at the latest; otherwise it would stay offset and every tap would miss
    setTimeout(() => { for (const a of [a1, a2]) if (a.playState !== 'finished') a.finish(); }, DUR + 150);
  }
  dir = 0;
}
// swipe right from the left edge = back (on the iPhone home screen there is no other back gesture)
let edge = null;
addEventListener('pointerdown', (e) => { if (e.clientX < 24 && cur() !== 'home' && e.pointerType !== 'mouse') edge = { x: e.clientX, y: e.clientY, id: e.pointerId }; }, true);
addEventListener('pointermove', (e) => {
  if (!edge || e.pointerId !== edge.id) return;
  if (Math.abs(e.clientY - edge.y) > 40) { edge = null; return; }
  if (e.clientX - edge.x > 70) { edge = null; $('[data-back]')?.click(); }
}, true);
addEventListener('pointerup', () => { edge = null; }, true);
const HD = (title, backTo, right = '<span></span>', sub = '') => `<header class="hd"><button type="button" class="ic" data-back="${backTo}" aria-label="${tr('Zurück')}">‹</button><b>${title}${sub ? `<small>${sub}</small>` : ''}</b>${right}</header>`;

// ---------- Building blocks ----------
const sw = (path, on, label) => `<button type="button" class="sw" data-sw="${path}" aria-pressed="${on}" aria-label="${esc(label)}"></button>`;
const row = (label, right, sub = '', attrs = '') => `<${attrs ? `button type="button" ${attrs}` : 'div'} class="row"><span class="tx"><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</span>${right}</${attrs ? 'button' : 'div'}>`;
const inp = (path, type, value, extra = '') => `<input type="${type}" data-in="${path}" value="${esc(value)}" ${extra}>`;
const lrow = (label, input, sub = '') => `<label class="row"><span class="tx"><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</span>${input}</label>`;
const master = (d, k, label = tr('Aktiv')) => `<div class="row master"><span class="tx"><b>${label}</b></span>${sw(`${k}.on`, d.cfg[k].on, label)}</div>`;

// Numbers with − / + instead of free text: steps from a list of sensible values, unit right in the display
const dur = (m) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m / 60} h`);
// up to 1 h in 5 min, up to 6 h in 15 min, beyond in 30 min; finer by tapping the value
const DURS = [1, 2, 3, 4, ...Array.from({ length: 12 }, (_, i) => 5 + i * 5), ...Array.from({ length: 20 }, (_, i) => 75 + i * 15), ...Array.from({ length: 36 }, (_, i) => 390 + i * 30)];
const WATTS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 120, 150, 200, 250, 300, 400, 500, 600, 800, 1000, 1200, 1500, 2000, 2500, 3000];
const range = (a, b, st) => Array.from({ length: Math.round((b - a) / st) + 1 }, (_, i) => Math.round((a + i * st) * 10) / 10);
const STEPS = {
  dur: [DURS, dur], dur240: [DURS.filter((m) => m <= 240), dur], dur0: [[0, ...DURS], (m) => (m ? dur(m) : tr('sofort'))],
  watt: [WATTS, (w) => `${dec(w)} W`], watt1: [WATTS.filter((w) => w >= 1), (w) => `${dec(w)} W`],
  offs: [range(-180, 180, 5), (m) => (m ? `${m > 0 ? '+' : '−'}${dur(Math.abs(m))}` : tr('genau'))],
  hours: [range(1, 48, 1), (h) => `${h} h`],
  temp: [range(20, 90, 1), (t) => `${t} °C`],
  secs: [[20, 30, 45, 60, 90, 120, 180, 240, 300, 450, 600], (x) => (x < 60 ? `${x} s` : x % 60 ? `${Math.floor(x / 60)} min ${x % 60} s` : `${x / 60} min`)],
  lux: [[0, 1, 2, 3, 5, 8, 10, 15, 20, 30, 40, 50, 75, 100, 150, 200, 300, 500], (x) => `${x} lx`],
  tcorr: [range(-10, 10, 0.5), (t) => `${t > 0 ? '+' : t < 0 ? '−' : ''}${dec(Math.abs(t))} °C`],
};
// path: setting (e.g. timer.mins) or a:field for the currently open Power Action
const stepper = (path, list, v, label) => {
  const [vals, fmt] = STEPS[list];
  return `<span class="stp" role="group" aria-label="${esc(label)}"><button type="button" data-step="${path}" data-list="${list}" data-dir="-1" aria-label="${tr('weniger')}" ${v <= vals[0] ? 'disabled' : ''}>−</button>`
    + `<button type="button" class="stpv" data-stpedit="${path}" data-list="${list}" data-v="${v}" aria-label="${tr('{0}: {1}, antippen zum Eintippen', esc(label), fmt(v))}">${fmt(v)}</button><button type="button" data-step="${path}" data-list="${list}" data-dir="1" aria-label="${tr('mehr')}" ${v >= vals[vals.length - 1] ? 'disabled' : ''}>+</button></span>`;
};
const srow = (label, ctrl, sub = '') => `<div class="row"><span class="tx"><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</span>${ctrl}</div>`;
// Typing: durations as h:min, else a number; clamped to the allowed range, not to the steps
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

// Status line below the name, without the power already shown large above it
// (the server writes the status in the UI language: accept German and English wording)
const subOf = (d) => (!d.online ? d.status : d.relay ? d.status.replace(/^[\d.,]+ k?W( · )?/, '') : d.status.replace(/^(Aus|Off)( · |$)/, ''));
// "5 min ago", "at 14:05", "on 3.10." for a timestamp (ms), formatted here so it follows the language
const agoText = (ts) => {
  const m = Math.round((Date.now() - ts) / 60e3), t = new Date(ts);
  if (m < 1) return tr('gerade eben');
  if (m < 60) return tr('vor {0} min', m);
  if (m < 1440) return tr('um {0}', t.toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit' }));
  return tr('am {0}', tr('{0}.{1}.', t.getDate(), t.getMonth() + 1));
};

// ---------- Home page ----------
// Tile order: saved ones first, new ones (e.g. a new plug) appended at the end
const HOME_KEYS = () => [['scenes', tr('Szenen'), 'scenes'], ['rules', tr('Regeln'), 'rules'], ['guard', tr('Ferien'), 'beach'], ['energy', tr('Verbrauch'), 'bolt'], ['alarms', tr('Alarme'), 'bell']];
function homeOrder() {
  const all = [...HOME_KEYS().map(([k]) => k), ...S.devices.map((d) => d.mac)], o = (S.settings.order || []).filter((k) => all.includes(k));
  return [...o, ...all.filter((k) => !o.includes(k))];
}
function orderHTML() {
  const info = (k) => { const h = HOME_KEYS().find(([x]) => x === k); if (h) return [h[1], I[h[2]]]; const d = dev(k); return [d.name, devIcon(d)]; };
  return HD(tr('Startseite anordnen'), 'more') + `<p class="intro">${tr('Am Griff ≡ ziehen, um eine Kachel zu verschieben.')}</p>`
    + `<div class="ls order">${homeOrder().map((k) => { const [l, ic] = info(k); return `<div class="row" data-okey="${k}"><span class="oico" aria-hidden="true">${ic}</span><span class="tx"><b>${esc(l)}</b></span>
      <button type="button" class="handle" data-handle aria-label="${tr('{0} verschieben (Pfeiltasten)', esc(l))}">≡</button></div>`; }).join('')}</div>
    <button type="button" class="btn grey" data-orderreset="1">${tr('Standard-Reihenfolge')}</button>`;
}
const saveOrder = async (order) => { S.settings.order = order; render(); try { S.settings = await api('api/settings', { method: 'PUT', body: JSON.stringify({ settings: { order } }) }); } catch (x) { toast(x.message, true); } };
// Dragging the handle: row follows the finger, the others make room; save on release
let drag = null;
app.addEventListener('pointerdown', (e) => {
  const h = e.target.closest('[data-handle]'); if (!h) return;
  const row0 = h.closest('[data-okey]'), rows = [...row0.parentElement.children];
  drag = { row: row0, rows, from: rows.indexOf(row0), to: rows.indexOf(row0), y: e.clientY, h: row0.offsetHeight, id: e.pointerId };
  try { h.setPointerCapture(e.pointerId); } catch { /* continue without pointer capture */ } row0.classList.add('dragging'); haptic(); e.preventDefault();
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
  // Layout like the myStrom app home page: first scenes, rules, vacation (Home Guard), consumption, alarms, then the plugs.
  // Plug tiles without arrow and without status line; watts with one decimal like in the original.
  const hint = '';
  const tile = (h, icon, label) => `<button type="button" class="tile" data-go="${h}" data-okey="${h}"><span class="ico">${icon}</span><span class="lb">${label}</span></button>`;
  const T = {};
  const total = SW().reduce((a, d) => a + d.w, 0);
  const w1 = (w) => (w < 1000 ? `${w.toFixed(1)} W` : `${(w / 1000).toFixed(2)} kW`);
  return `${editHome ? `<header class="hd"><span></span><b>${tr('Anordnen')}</b><button type="button" class="ic done" data-editdone="1">${tr('Fertig')}</button></header>`
      : `<header class="hd"><span></span><b>myStrom</b><button type="button" class="ic" data-menu="1" aria-label="${tr('Menü')}" aria-haspopup="dialog">${I.menu}</button></header>`}
    <div class="grid home ${editHome ? 'editing' : ''}">
      ${(T.scenes = tile('scenes', I.scenes, tr('Szenen')), T.rules = tile('rules', I.rules, tr('Regeln')), T.guard = tile('guard', I.beach, tr('Ferien')),
        T.energy = tile('energy', I.bolt, `<span class="dim">${pw(total)}</span><br>${tr('Verbrauch')}`), T.alarms = tile('alarms', I.bell, tr('Alarme')), '')}
      ${S.devices.filter((d) => !canSwitch(d)).map((d) => (T[d.mac] = infoTile(d), '')).join('')}
      ${SW().map((d) => (T[d.mac] = `<div class="tile dev ${d.relay ? 'on' : ''} ${d.online ? '' : 'off-line'}" data-mac="${d.mac}" data-okey="${d.mac}">
        <div class="face">${d.temp != null ? `<span class="tmp">${d.temp.toFixed(1)}°C</span>` : ''}${d.cfg.lock ? `<span class="lock" title="${tr('Tastensperre')}">🔒</span>` : ''}
        <span class="ico"${bulbTint(d)}>${devIcon(d)}</span><span class="lb">${d.relay ? `${w1(d.w)}<br>` : ''}${esc(d.name)}</span>
        ${!d.online ? `<span class="sub">${tr('Offline')}</span>` : d.shutting ? `<span class="sub">${tr('Fährt herunter …')}</span>` : ''}</div>
        <button type="button" class="hit" data-swipe="${d.mac}" aria-label="${d.relay ? tr('{0}, an. Öffnen; Wischen oder Leertaste schaltet', esc(d.name)) : tr('{0}, aus. Öffnen; Wischen oder Leertaste schaltet', esc(d.name))}"></button></div>`, '')).join('')}
      ${(editHome ? editOrder : homeOrder()).map((k) => T[k]).join('')}
      ${S.devices.length ? '' : tile('more', I.plug, tr('Gerät hinzufügen'))}
    </div>${hint}`;
}

// ---------- Device ----------
// Plug as a line icon like the other icons; the LED at the bottom shows the state (green on, red off, grey offline)
const sockIcon = (d) => `<svg viewBox="0 0 64 64" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="18" y="5" width="28" height="54" rx="13"/><circle cx="32" cy="24" r="9"/><circle cx="28.5" cy="23" r="1.3" fill="currentColor"/><circle cx="35.5" cy="23" r="1.3" fill="currentColor"/><circle cx="32" cy="28" r="1.3" fill="currentColor"/><path class="led ${!d.online ? 'off-line' : d.relay ? 'on' : 'off'}" d="M28 48h8" stroke-width="3"/></svg>`;
// Bulb: icon in the set color while it is on
const hsvCss = (h, sat, v) => `hsl(${h} ${Math.round(sat * 0.85)}% ${Math.round(45 + (100 - sat) * 0.3 + v * 0.1)}%)`;
const bulbTint = (d) => { if (d.kind !== 'bulb' || !d.relay || !d.color) return ''; const [h, sat, v] = d.color.split(';').map(Number); return Number.isFinite(h) ? ` style="color:${hsvCss(h, sat, v)}"` : ''; };
// Short line per type (menu, lists)
const kindSub = (d) => (d.kind === 'button' ? (d.battery != null ? tr('Batterie {0} %', d.battery) : d.status) : d.kind === 'motion' ? (d.online ? d.status : tr('offline')) : !d.online ? tr('offline') : d.relay ? pw(d.w) : tr('aus'));
// Buttons and motion sensors on the home page: tile with state instead of a switch
function infoTile(d) {
  const live = d.kind === 'motion' && d.motion;
  const sub = d.kind === 'button' ? (d.battery != null ? tr('Batterie {0} %', d.battery) : tr('noch nie gedrückt')) : !d.online ? tr('Offline') : d.motion ? tr('Bewegung') : d.light != null ? `${d.light} lx` : '–';
  return `<button type="button" class="tile feat info ${live ? 'act' : ''}" data-go="dev/${d.mac}" data-okey="${d.mac}">${d.temp != null ? `<span class="tmp">${d.temp.toFixed(1)}°C</span>` : ''}
    <span class="ico">${devIcon(d)}</span><span class="lb">${esc(d.name)}</span><span class="sub">${esc(sub)}</span></button>`;
}
const BTN = () => [['single', tr('Einmal drücken')], ['double', tr('Zweimal drücken')], ['long', tr('Lang drücken')], ['touch', tr('Berühren')]];
const btnText = (a) => { const n = dev(a.mac)?.name || '?';
  return a.do === 'none' ? tr('nichts') : a.do === 'scene' ? tr('Szene {0}', S.scenes.find((x) => x.id === a.scene)?.name || '?')
    : a.do === 'toggle' ? tr('{0} umschalten', n) : a.do === 'on' ? tr('{0} ein', n) : tr('{0} aus', n); };
// Bulb: tappable colors (hue, saturation) and brightness
const SWATCHES = () => [[tr('Warmweiss'), 30, 35], [tr('Weiss'), 40, 8], [tr('Kaltweiss'), 210, 10], [tr('Rot'), 0, 100], [tr('Orange'), 25, 100], [tr('Gelb'), 50, 100], [tr('Grün'), 120, 90], [tr('Türkis'), 180, 90], [tr('Blau'), 225, 95], [tr('Violett'), 275, 85], [tr('Pink'), 320, 80]];
function lightHTML(d) {
  const l = d.cfg.light;
  return `<p class="sec">${tr('Farbe')}</p><div class="swatches">${SWATCHES().map(([n, h, sat]) => `<button type="button" class="swatch ${l.h === h && l.s === sat ? 'sel' : ''}" data-swatch="${h}|${sat}" style="--c:${hsvCss(h, sat, 100)}" aria-label="${n}" aria-pressed="${l.h === h && l.s === sat}" title="${n}"></button>`).join('')}</div>
    <div class="ls"><label class="row bright"><span class="tx"><b>${tr('Helligkeit')}</b><span>${l.v} %</span></span><input type="range" min="1" max="100" step="1" value="${l.v}" data-bright="1" aria-label="${tr('Helligkeit')}"></label></div>`;
}
function buttonHTML(d) {
  const c = d.cfg.button, acts = BTN().filter(([k]) => k !== 'touch' || d.touch);
  return HD(esc(d.name), 'home', `<button type="button" class="ic" data-go="dev/${d.mac}/settings" aria-label="${tr('Einstellungen')}">${I.gear}</button>`, esc(roomLabel(d.cfg.room)))
    + `<div class="hero">${devIcon(d)}<b>${d.battery != null ? (d.charge ? tr('Batterie {0} % · lädt', d.battery) : tr('Batterie {0} %', d.battery)) : tr('Batterie –')}</b><span class="dim">${esc(d.status)}</span></div>
    <p class="sec">${tr('Was der Taster macht')}</p><div class="ls">${acts.map(([k, l]) => row(l, chev(esc(btnText(c[k]))), '', `data-go="dev/${d.mac}/btn/${k}"`)).join('')}</div>
    ${d.synced ? '' : `<p class="note">${tr('Änderungen kommen beim nächsten Drücken auf den Taster (er schläft, um Batterie zu sparen). Am USB-Kabel klappt es sofort.')}</p>`}`;
}
function motionHTML(d) {
  const m = d.cfg.motion, dim = m.on ? 'ls' : 'ls dim';
  return HD(esc(d.name), 'home', `<button type="button" class="ic" data-go="dev/${d.mac}/settings" aria-label="${tr('Einstellungen')}">${I.gear}</button>`, esc(roomLabel(d.cfg.room)))
    + `<div class="hero ${d.motion ? 'live' : ''}">${devIcon(d)}<b>${!d.online ? tr('Offline') : d.motion ? tr('Bewegung') : tr('Keine Bewegung')}</b><span class="dim">${d.lastMotion && !d.motion ? tr('zuletzt {0}', agoText(d.lastMotion)) : ''}</span></div>
    <div class="ls">${row(tr('Helligkeit'), val(d.light != null ? `${d.light} lx` : '–'))}${row(tr('Temperatur'), chev(d.temp != null ? `${d.temp.toFixed(1)} °C` : '–'), '', `data-go="dev/${d.mac}/temp"`)}</div>
    <p class="sec">${tr('Licht bei Bewegung')}</p><div class="${dim}">${master(d, 'motion', tr('Einschalten bei Bewegung'))}
      <div class="row"><span class="tx"><b>${tr('Nur wenn es dunkel ist')}</b><span>${tr('jetzt {0}', d.light != null ? `${d.light} lx` : '–')}</span></span>${sw('motion.dark', m.dark, tr('Nur wenn es dunkel ist'))}</div>
      ${m.dark ? srow(tr('Dunkel unter'), stepper('motion.lux', 'lux', m.lux, tr('Dunkel unter'))) : ''}
      ${srow(tr('Aus nach'), stepper('motion.mins', 'dur240', m.mins, tr('Aus nach')), tr('ohne Bewegung'))}</div>
    <p class="sec">${tr('Diese Geräte')}</p><div class="chips">${SW().map((t) => `<button type="button" class="chip" data-mtarget="${t.mac}" aria-pressed="${m.targets.includes(t.mac)}">${esc(t.name)}</button>`).join('')}</div>
    <p class="note">${tr('Aus geht nur, was der Melder selbst eingeschaltet hat; von Hand Eingeschaltetes bleibt an.')}</p>`;
}
// plug settings: shut the computer behind it down before switching off (shutdown agent, see README)
function shutdownHTML(d) {
  const sd = d.cfg.shutdown;
  return `<p class="sec">${tr('Vor dem Ausschalten herunterfahren')}</p><div class="${sd.on ? 'ls' : 'ls dim'}">
    <div class="row master"><span class="tx"><b>${tr('Aktiv')}</b><span>${tr('für Raspberry Pi oder PC an dieser Steckdose')}</span></span>${sw('shutdown.on', sd.on, tr('Vor dem Ausschalten herunterfahren'))}</div>
    ${sd.on ? `${lrow(tr('Adresse'), `<input type="url" data-in="shutdown.url" value="${esc(sd.url)}" placeholder="http://192.168.0.209:8098" inputmode="url" autocomplete="off" style="max-width:220px">`)}
      ${lrow(tr('Token'), `<input type="password" data-in="shutdown.token" value="" placeholder="${sd.token ? tr('gespeichert') : tr('Token')}" autocomplete="off" style="max-width:220px">`)}
      ${srow(tr('Warten höchstens'), stepper('shutdown.wait', 'secs', sd.wait, tr('Warten höchstens')))}
      ${row(tr('Verbindung testen'), chev(), '', 'data-sdtest="1"')}` : ''}</div>
    ${sd.on ? `<p class="note">${tr('Schaltet die App automatisch aus (Zeitplan, Timer, Szene, Regel), fährt sie das Gerät zuerst herunter und schaltet den Strom erst ab, wenn es aus ist. Von Hand in der App und am Knopf der Steckdose geht der Strom sofort weg. Auf dem Gerät läuft dafür ein kleiner Dienst (siehe README).')}</p>` : ''}`;
}
function deviceHTML(d) {
  if (d.kind === 'button') return buttonHTML(d);
  if (d.kind === 'motion') return motionHTML(d);
  return HD(esc(d.name), 'home', `<button type="button" class="ic" data-go="dev/${d.mac}/settings" aria-label="${tr('Einstellungen')}">${I.gear}</button>`, esc(roomLabel(d.cfg.room)))
    + `<div class="grid">
      <button type="button" class="tile devtgl ${d.relay ? 'on' : ''} ${d.online ? '' : 'off-line'}" data-devtoggle="${d.mac}" role="switch" aria-checked="${d.relay}" aria-label="${d.relay ? tr('{0} ausschalten', esc(d.name)) : tr('{0} einschalten', esc(d.name))}">
        <span class="ico"${bulbTint(d)}>${d.kind === 'bulb' ? devIcon(d) : sockIcon(d)}</span><span class="lb">${!d.online ? tr('Offline') : d.shutting ? tr('Fährt herunter …') : d.relay ? pw(d.w) : tr('Aus')}</span></button>
      ${FEAT().filter(([k]) => d.kind === 'switch' || k !== 'temp').map(([k, ic, l], i) => (d.kind === 'bulb' && i === 1 ? `</div>${lightHTML(d)}<div class="grid">` : '') + (() => { const [on, txt] = featInfo(d, k); return `<button type="button" class="tile feat ${on ? 'act' : ''}" data-go="dev/${d.mac}/${k}"><span class="ico">${I[ic]}</span><span class="lb">${l}</span><span class="sub">${on || k === 'eval' ? esc(txt) : tr('aus')}</span></button>`; })()).join('')}
    </div>`;
}
// Power Actions: "if above/below X W for at least Y min, then …"
const ACT_THEN = () => [['notify', tr('Mitteilung')], ['off', tr('Ausschalten')], ['other-on', tr('Andere an')], ['other-off', tr('Andere aus')]];
function actText(a) {
  const t = dev(a.target)?.name || tr('andere Steckdose');
  return `${a.when === 'below' ? tr('Unter {0} W', dec(a.watts)) : tr('Über {0} W', dec(a.watts))}${a.mins ? `, ${a.mins} min` : ''} → ${{ notify: tr('Mitteilung'), off: tr('aus'), 'other-on': tr('{0} an', t), 'other-off': tr('{0} aus', t) }[a.then]}`;
}
const ACT_TPL = (d) => [
  ['done', tr('Fertig melden'), tr('z. B. Waschmaschine: unter 3 W, nachdem sie gelaufen ist'), { when: 'below', watts: 3, mins: 5, then: 'notify', text: tr('{0} ist fertig', d.name) }],
  ['running', tr('Melden, wenn es läuft'), tr('über {0} W', 10), { when: 'above', watts: 10, mins: 1, then: 'notify', text: tr('{0} läuft', d.name) }],
  ['overload', tr('Bei Überlast ausschalten'), tr('über {0} W', 1500), { when: 'above', watts: 1500, mins: 1, then: 'off', text: '' }],
  ...(SW().length > 1 ? [['follow', tr('Andere Steckdose mitschalten'), tr('z. B. PC an → Lampe an'), { when: 'above', watts: 30, mins: 1, then: 'other-on', target: S.devices.find((x) => x.mac !== d.mac).mac, text: '' }]] : []),
  ['custom', tr('Eigene Power Action'), tr('Bedingung und Folge selbst wählen'), { when: 'above', watts: 50, mins: 5, then: 'notify', text: '' }],
];
function actionsHTML(d, id) {
  const head = (t, b) => HD(t, b, '<span></span>', esc(d.name));
  if (!id) {
    const list = d.cfg.actions;
    return head('Power Actions', `dev/${d.mac}`) + `<p class="intro">${tr('Liegt die Leistung lange genug über oder unter einem Wert, passiert etwas: eine Mitteilung, ausschalten oder eine andere Steckdose schalten. Jetzt: {0}.', pw(d.w))}</p>`
      + (list.length ? `<div class="ls">${list.map((a) => `<div class="row"><button type="button" class="tx" data-go="dev/${d.mac}/actions/${a.id}" style="text-align:left;flex:1"><b>${esc(a.text || actText(a))}</b><span>${esc(actText(a))}</span></button>
          <button type="button" class="sw" data-atoggle="${a.id}" aria-pressed="${a.on}" aria-label="${tr('Power Action ein/aus')}"></button></div>`).join('')}</div>` : '')
      + `<p class="sec">${tr('Neu')}</p><div class="ls">${ACT_TPL(d).map(([k, l, sub]) => row(l, chev(), sub, `data-actnew="${k}"`)).join('')}</div>`;
  }
  const a = d.cfg.actions.find((x) => x.id === id);
  if (!a) return head('Power Action', `dev/${d.mac}/actions`) + `<p class="empty-state">${tr('Diese Power Action gibt es nicht mehr.')}</p>`;
  const chips = (field, opts) => `<div class="chips">${opts.map(([v, l]) => `<button type="button" class="chip" data-aset="${field}|${v}" aria-pressed="${String(a[field]) === String(v)}">${esc(l)}</button>`).join('')}</div>`;
  const others = SW().filter((x) => x.mac !== d.mac);
  return head('Power Action', `dev/${d.mac}/actions`) + `<div class="${a.on ? 'ls' : 'ls dim'}"><div class="row master"><span class="tx"><b>${tr('Aktiv')}</b></span><button type="button" class="sw" data-atoggle="${a.id}" aria-pressed="${a.on}" aria-label="${tr('Aktiv')}"></button></div></div>
    <p class="sec">${tr('Wenn die Leistung')}</p>${chips('when', [['above', tr('über')], ['below', tr('unter')]])}
    <div class="ls">${srow(tr('Schwelle'), stepper('a:watts', 'watt', a.watts, tr('Schwelle')), tr('jetzt {0}', pw(d.w)))}
      ${srow(tr('Mindestens'), stepper('a:mins', 'dur0', a.mins, tr('Mindestens')), tr('am Stück'))}</div>
    <p class="sec">${tr('Dann')}</p>${chips('then', others.length ? ACT_THEN() : ACT_THEN().slice(0, 2))}
    ${a.then.startsWith('other') ? `<p class="sec">${tr('Welche Steckdose')}</p>${chips('target', others.map((x) => [x.mac, x.name]))}` : ''}
    ${a.then === 'notify' ? `<div class="ls">${lrow(tr('Text'), `<input type="text" data-ain="text" value="${esc(a.text)}" placeholder="${tr('{0} ist fertig', esc(d.name))}" maxlength="60" style="max-width:200px">`)}</div>` : ''}
    <p class="note">${a.when === 'below' ? tr('Löst aus, wenn {0} {1} Minuten lang unter {2} W zieht, aber erst nachdem es darüber gelaufen ist. Danach erst wieder nach dem nächsten Lauf.', esc(d.name), a.mins, dec(a.watts)) : tr('Löst aus, wenn {0} {1} Minuten lang über {2} W zieht. Erst wieder, nachdem es zwischendurch darunter war.', esc(d.name), a.mins, dec(a.watts))}</p>
    <button type="button" class="btn danger" data-adel="${a.id}">${tr('Power Action löschen')}</button>`;
}
// Bulb: show color/brightness immediately, then send (turns it on)
async function setLight(mac, l) {
  const d = dev(mac); d.cfg.light = { ...d.cfg.light, ...l }; d.relay = true; d.color = `${d.cfg.light.h};${d.cfg.light.s};${d.cfg.light.v}`; render();
  try { Object.assign(d, await api(`api/devices/${mac}/light`, { method: 'POST', body: JSON.stringify(d.cfg.light) })); render(); } catch (e) { toast(e.message, true); load(); }
}
// schedule helpers: work on a copy of the groups, keep each group's blocks sorted by start
const updEntries = (mac, fn) => saveCfg(mac, { schedule: { entries: fn(dev(mac).cfg.schedule.entries.map((e) => ({ ...e, days: [...e.days], blocks: e.blocks.map((b) => ({ ...b })) }))) } });
const updGroup = (mac, gid, fn) => updEntries(mac, (es) => es.map((e) => { if (e.id !== gid) return e; fn(e); e.blocks.sort((a, b) => a.start.localeCompare(b.start)); return e; }));
const hmH = (t) => { const [h, m] = t.split(':').map(Number); return h + m / 60; };
// thin 24 h line under a group: on-times, a fading end for "or later", a dot for now when today belongs to the group
function schTimeline(e) {
  const now = new Date(), nowH = now.getHours() + now.getMinutes() / 60, pc = (h) => `${(h / 24) * 100}%`;
  const seg = (b) => { const s0 = hmH(b.start), e0 = hmH(b.end) <= s0 ? 24 : hmH(b.end); return `<i class="${b.idle ? 'soft' : ''}" style="left:${pc(s0)};width:${pc(e0 - s0)}"></i>`; };
  return `<span class="schtl">${e.blocks.map(seg).join('')}${e.days.includes(now.getDay()) ? `<b style="left:${pc(nowH)}"></b>` : ''}</span><span class="schax"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></span>`;
}
// one group: its days and on-times
function scheduleGroupHTML(d, gid) {
  const s = d.cfg.schedule, g = s.entries.find((e) => e.id === gid), back = `dev/${d.mac}/schedule`;
  if (!g) return HD(tr('Zeitplan'), back) + `<p class="empty-state">${tr('Diese Zeiten gibt es nicht mehr.')}</p>`;
  const taken = (n) => s.entries.some((e) => e.id !== gid && e.days.includes(n));
  return HD(esc(g.days.length ? daysText(g.days) : tr('Keine Tage')), back, '<span></span>', esc(d.name))
    + `<p class="sec">${tr('Tage')}</p><div class="chips days">${WD().map(([n, l]) => `<button type="button" class="chip ${taken(n) ? 'taken' : ''}" data-sgday="${gid}|${n}" aria-pressed="${g.days.includes(n)}">${l}</button>`).join('')}</div>
    ${WD().some(([n]) => taken(n)) ? `<p class="note">${tr('Blasse Tage haben andere Zeiten; antippen holt sie hierher.')}</p>` : ''}
    <p class="sec">${tr('Ein – Aus')}</p><div class="ls">${g.blocks.length ? g.blocks.map((b, i) => `<div class="row sblk">
        <input type="time" data-sbt="${gid}|${i}|start" value="${b.start}" aria-label="${tr('Ein um')}"><span class="dash">–</span><input type="time" data-sbt="${gid}|${i}|end" value="${b.end}" aria-label="${tr('Aus um')}">
        <button type="button" class="chip" data-sbi="${gid}|${i}" aria-pressed="${b.idle}" title="${tr('Erst aus, wenn nicht mehr benutzt')}">${tr('oder später')}</button>
        <button type="button" class="x" data-sbx="${gid}|${i}" aria-label="${tr('Zeit entfernen')}">×</button></div>`).join('') : `<div class="row"><span class="tx"><span>${tr('ganzer Tag aus')}</span></span></div>`}</div>
    <button type="button" class="btn ghost" data-sbadd="${gid}">＋ ${tr('Zeit hinzufügen')}</button>
    ${g.blocks.some((b) => b.idle) ? `<p class="sec">${tr('Oder später')}</p><div class="ls">${srow(tr('Aus, sobald unter'), stepper(`sch:${gid}:below`, 'watt1', g.below, tr('Aus, sobald unter')), tr('jetzt {0}', pw(d.w)))}${srow(tr('So lange'), stepper(`sch:${gid}:mins`, 'dur240', g.mins, tr('So lange')), tr('am Stück'))}</div>
      <p class="note">${tr('Mit «oder später» geht die Steckdose ab der Aus-Zeit erst aus, wenn niemand mehr dran arbeitet.')}</p>` : ''}
    ${s.entries.length > 1 ? `<button type="button" class="btn danger" data-sgdel="${gid}">${tr('Diese Zeiten entfernen')}</button>` : ''}`;
}
const updSch = (mac, fn) => saveCfg(mac, { schedule: { entries: dev(mac).cfg.schedule.entries.map(fn).filter(Boolean) } });
const updAct = (mac, id, patch) => saveCfg(mac, { actions: dev(mac).cfg.actions.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
function featureHTML(d, k, sub) {
  const c = d.cfg, back = k === 'tech' || k === 'room' || k === 'icon' ? `dev/${d.mac}/settings` : `dev/${d.mac}`; // roomnew has its own Back
  const head = HD(FTITLE()[k], back, '<span></span>', esc(d.name));
  const dim = (on) => (on ? 'ls' : 'ls dim');
  switch (k) {
    case 'btn': {
      // a button action: what happens, which device or scene; try it out without pressing
      const a = c.button[sub] || c.button.single, l = BTN().find(([x]) => x === sub)?.[1] || '';
      const chip = (v, t) => `<button type="button" class="chip" data-btndo="${sub}|${v}" aria-pressed="${a.do === v}">${t}</button>`;
      return HD(l, `dev/${d.mac}`, '<span></span>', esc(d.name)) + `<p class="sec">${tr('Was passiert')}</p>
        <div class="chips">${chip('none', tr('Nichts'))}${chip('toggle', tr('Umschalten'))}${chip('on', tr('Einschalten'))}${chip('off', tr('Ausschalten'))}${chip('scene', tr('Szene'))}</div>
        ${['toggle', 'on', 'off'].includes(a.do) ? `<p class="sec">${tr('Gerät')}</p><div class="chips">${SW().map((t) => `<button type="button" class="chip" data-btnmac="${sub}|${t.mac}" aria-pressed="${a.mac === t.mac}">${esc(t.name)}</button>`).join('')}</div>` : ''}
        ${a.do === 'scene' ? `<p class="sec">${tr('Szene')}</p><div class="chips">${S.scenes.map((x) => `<button type="button" class="chip" data-btnscene="${sub}|${x.id}" aria-pressed="${a.scene === x.id}">${esc(x.name)}</button>`).join('')}</div>` : ''}
        ${a.do !== 'none' ? `<button type="button" class="btn grey" data-btntest="${sub}">${tr('Jetzt ausprobieren')}</button>` : ''}`;
    }
    case 'schedule': {
      // groups of days with the same on-times (any number per day); each day belongs to at most one group
      if (sub) return scheduleGroupHTML(d, sub);
      const s = c.schedule, free = WD().map(([n]) => n).filter((n) => !s.entries.some((e) => e.days.includes(n)));
      return head + `<p class="intro">${tr('Schaltet zu festen Zeiten ein und aus, beliebig oft am Tag. Tage mit gleichen Zeiten stehen zusammen.')}</p>
      ${s.on && /wartet|aus in|waiting|off in/i.test(d.status) ? `<p class="note"><b>${tr('Jetzt:')}</b> ${esc(d.status)}</p>` : ''}
      <div class="${dim(s.on)}">${master(d, 'schedule')}</div>
      <p class="sec">${tr('Wann an')}</p><div class="schgrps ${s.on ? '' : 'dim'}">${s.entries.filter((e) => e.days.length).map((e) => `<button type="button" class="schgrp" data-go="dev/${d.mac}/schedule/${e.id}">
        <span class="schd"><span>${esc(daysText(e.days))}</span><span aria-hidden="true">›</span></span>
        <span class="scht">${e.blocks.length ? e.blocks.map((b) => `<span>${b.start} – ${b.end}${b.idle ? ` <i>${tr('oder später')}</i>` : ''}</span>`).join('') : `<span class="mut">${tr('ganzer Tag aus')}</span>`}</span>
        ${schTimeline(e)}</button>`).join('')}</div>
      ${free.length ? `<button type="button" class="btn ghost" data-sgadd="1">＋ ${tr('Zeiten für {0}', daysText(free))}</button>` : ''}`;
    }
    case 'vacation': {
      const v = c.vacation, todayTxt = d.vacationToday.map((s) => `${slotName(s.key)} ${s.start}–${s.end}`).join(', ');
      return head + `<p class="intro">${tr('Damit das Haus bewohnt wirkt, geht {0} in den Ferien morgens und abends an und wieder aus, jeden Tag zu einer anderen Zeit.', esc(d.name))}</p>
      <div class="${dim(v.on)}">${master(d, 'vacation', tr('Ferienmodus'))}${lrow(tr('Von'), inp('vacation.from', 'date', v.from))}${lrow(tr('Bis'), inp('vacation.to', 'date', v.to))}</div>
      <p class="sec">${tr('Morgens')}</p><div class="${dim(v.on && v.morning.on)}"><div class="row master"><span class="tx"><b>${tr('Morgens an')}</b><span>${tr('20–60 Minuten')}</span></span>${sw('vacation.morning.on', v.morning.on, tr('Morgens an'))}</div>
        ${lrow(tr('Frühestens'), inp('vacation.morning.from', 'time', v.morning.from))}${lrow(tr('Spätestens'), inp('vacation.morning.to', 'time', v.morning.to))}</div>
      <p class="sec">${tr('Abends')}</p><div class="${dim(v.on && v.evening.on)}"><div class="row master"><span class="tx"><b>${tr('Abends an')}</b><span>${tr('1–3 Stunden')}</span></span>${sw('vacation.evening.on', v.evening.on, tr('Abends an'))}</div>
        ${lrow(tr('Frühestens'), inp('vacation.evening.from', 'time', v.evening.from))}${lrow(tr('Spätestens'), inp('vacation.evening.to', 'time', v.evening.to))}</div>
      ${v.on ? `<p class="note">${todayTxt ? `<b>${tr('Heute:')}</b> ${esc(todayTxt)}` : tr('Beginnt am {0}.', dShort(v.from))}</p>` : ''}`;
    }
    case 'sun': return head + `<p class="intro">${tr('Heute bei dir: Sonnenaufgang {0}, Sonnenuntergang {1}{2}.', S.sun?.rise || '–', S.sun?.set || '–', S.settings.place ? ` (${esc(S.settings.place)})` : '')}</p>
      <div class="${dim(c.sun.on)}"><div class="row master"><span class="tx"><b>${tr('Bei Sonnenuntergang an')}</b></span>${sw('sun.on', c.sun.on, tr('Bei Sonnenuntergang an'))}</div>
        ${srow(tr('Verschieben'), stepper('sun.onOffset', 'offs', c.sun.onOffset, tr('Einschalten verschieben')), tr('− früher, + später'))}</div>
      <div class="${dim(c.sun.off)}"><div class="row master"><span class="tx"><b>${tr('Bei Sonnenaufgang aus')}</b></span>${sw('sun.off', c.sun.off, tr('Bei Sonnenaufgang aus'))}</div>
        ${srow(tr('Verschieben'), stepper('sun.offOffset', 'offs', c.sun.offOffset, tr('Ausschalten verschieben')), tr('− früher, + später'))}</div>`;
    case 'timer': return head + `<p class="intro">${tr('Nach jedem Einschalten bleibt {0} so lange an und geht dann von selbst aus, egal ob in der App oder am Gerät eingeschaltet.', esc(d.name))}</p>
      <div class="${dim(c.timer.on)}">${master(d, 'timer')}</div>
      <div class="chips">${[15, 30, 60, 120, 240].map((m) => `<button type="button" class="chip" data-set="timer.mins" data-v="${m}" aria-pressed="${c.timer.mins === m}">${m < 60 ? `${m} min` : `${m / 60} h`}</button>`).join('')}</div>
      <div class="ls">${srow(tr('Eigene Dauer'), stepper('timer.mins', 'dur', c.timer.mins, tr('Eigene Dauer')))}</div>`;
    case 'saver': {
      const s = c.saver;
      return head + `<p class="intro">${tr('Hängt das Gerät nur im Standby, schaltet die Steckdose es ab. Ist sie aus, fliesst kein Strom mehr, darum kann sie nicht selbst merken, wann du das Gerät wieder brauchst. Lege fest, wann es wieder angeht.')}</p>
      <div class="${dim(s.on)}">${master(d, 'saver')}${srow(tr('Standby unter'), stepper('saver.below', 'watt', s.below, tr('Standby unter')), tr('jetzt {0}', pw(d.w)))}
        ${srow(tr('Länger als'), stepper('saver.mins', 'dur', s.mins, tr('Länger als')))}</div>
      <p class="sec">${tr('Wieder an')}</p>
      <div class="chips">${[['hand', tr('Von Hand')], ['time', tr('Um eine Uhrzeit')], ['after', tr('Nach Stunden')]].map(([v, l]) => `<button type="button" class="chip" data-set="saver.back" data-v="${v}" aria-pressed="${s.back === v}">${l}</button>`).join('')}</div>
      ${s.back === 'time' ? `<div class="ls">${lrow(tr('Um'), inp('saver.at', 'time', s.at))}</div>` : s.back === 'after' ? `<div class="ls">${srow(tr('Nach'), stepper('saver.hours', 'hours', s.hours, tr('Nach')))}</div>` : `<p class="note">${tr('Erst wieder an, wenn du sie in der App, mit einer Szene oder am Knopf der Steckdose einschaltest.')}</p>`}`;
    }
    case 'temp': if (d.kind !== 'switch') return head + tempChartHTML(d);
      return head + tempChartHTML(d)
      + `<p class="sec">${tr('Schutz')}</p><div class="${dim(c.temp.on)}">${master(d, 'temp', tr('Bei Hitze ausschalten'))}${srow(tr('Aus über'), stepper('temp.max', 'temp', c.temp.max, tr('Aus über')))}</div>
      <p class="note">${tr('Die Steckdose misst ihre eigene Temperatur, also etwas wärmer als der Raum, wenn viel Strom fliesst. Abgleichen kannst du das unter Einstellungen › Temperatur-Korrektur.')}</p>`;
    case 'alarms': return head + `<p class="intro">${tr('Mitteilung aufs Handy, wenn bei {0} etwas passiert.', esc(d.name))} ${S.pushSubs ? '' : `<a href="#alarms">${tr('Mitteilungen zuerst erlauben ›')}</a>`}</p>
      <div class="ls">${alarmKeys(d).map((key) => [key, ...{ offline: [tr('Offline'), tr('keine Antwort seit 3 Minuten')], unusual: [tr('Ungewöhnlicher Verbrauch'), tr('deutlich mehr als sonst')], switchedOn: [tr('Eingeschaltet'), tr('am Gerät oder von einer Regel')], hot: [tr('Zu warm'), tr('über {0} °C', c.temp.on ? c.temp.max : 45)] }[key]])
        .map(([key, l, sub]) => `<div class="row"><span class="tx"><b>${l}</b><span>${sub}</span></span>${sw(`alarms.${key}`, c.alarms[key], l)}</div>`).join('')}</div>`;
    case 'eval': return head + chartHTML(d.mac, false) + totalsHTML(d.mac);
    case 'actions': return actionsHTML(d, sub);
    case 'settings': return HD(tr('Einstellungen'), `dev/${d.mac}`) + `<div class="hero">${devIcon(d)}<b>${esc(d.name)}</b></div>
      <div class="ls">${lrow(tr('Name'), `<input type="text" data-in="name" value="${esc(d.cfg.name)}" placeholder="${esc(d.name)}" maxlength="40">`)}
        ${row(tr('Raum'), chev(esc(d.cfg.room ? roomLabel(d.cfg.room) : tr('keiner'))), '', `data-go="dev/${d.mac}/room"`)}
        ${row(tr('Symbol'), chev(esc(iconName(d))), '', `data-go="dev/${d.mac}/icon"`)}
        ${d.kind === 'switch' || d.kind === 'motion' ? srow(tr('Temperatur-Korrektur'), stepper('tcorr', 'tcorr', c.tcorr, tr('Temperatur-Korrektur')), tr('wird zur Messung addiert')) : ''}
        ${row(tr('Technische Details'), chev(), '', `data-go="dev/${d.mac}/tech"`)}</div>
      ${d.kind === 'switch' ? shutdownHTML(d) : ''}
      ${canSwitch(d) ? `<div class="ls"><div class="row"><span class="tx"><b>${tr('Tastensperre')}</b><span>${tr('in der App nicht mehr schaltbar')}</span></span>${sw('lock', c.lock, tr('Tastensperre'))}</div></div>` : ''}
      <button type="button" class="btn danger" data-remove="${d.mac}">${d.kind === 'switch' ? tr('Steckdose entfernen') : tr('Gerät entfernen')}</button>`;
    case 'room': {
      // like "Select Room" in myStrom: used rooms first, then presets with "New"; the selected one dimmed with a checkmark
      const byLabel = (a, b) => roomLabel(a).localeCompare(roomLabel(b), LOC());
      const used = [...new Set(S.devices.map((x) => x.cfg.room).filter(Boolean))].sort(byLabel);
      const tileR = (r, icon, label, isNew) => `<button type="button" class="tile room ${c.room === r ? 'sel' : ''}" data-room="${esc(r)}" aria-pressed="${c.room === r}">
        <span class="ico">${icon}${c.room === r ? '<span class="chk" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 12 4 4 8-8"/></svg></span>' : ''}</span>
        <span class="lb">${esc(label)}</span>${isNew ? `<span class="new" aria-hidden="true"><i>${tr('Neu')}</i></span>` : ''}</button>`;
      return HD(tr('Raum wählen'), back) + `<div class="grid">
        ${used.map((r) => tileR(r, roomIcon(r), roomLabel(r), false)).join('')}
        ${ROOMS.filter(([r]) => !used.includes(r)).sort(([a], [b]) => byLabel(a, b)).map(([r, ic]) => tileR(r, ROOM_ICON[ic], roomLabel(r), true)).join('')}
        <button type="button" class="tile room" data-go="dev/${d.mac}/roomnew"><span class="ico">${ROOM_ICON.plus}</span><span class="lb">${tr('Eigener Raum')}</span></button>
        ${tileR('', ROOM_ICON.none, tr('Kein Raum'), false)}
      </div>`;
    }
    case 'icon': {
      // like the room picker: tiles, selected one dimmed with a checkmark; tapping selects and goes back
      const curKey = iconKey(d);
      return HD(tr('Symbol wählen'), back) + `<div class="grid">${DEV_ICONS.map(([k, l, svg]) => `<button type="button" class="tile room ${curKey === k ? 'sel' : ''}" data-icon="${k}" aria-pressed="${curKey === k}">
        <span class="ico">${svg || I.plug}${curKey === k ? '<span class="chk" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 12 4 4 8-8"/></svg></span>' : ''}</span>
        <span class="lb">${l()}</span></button>`).join('')}</div>`;
    }
    case 'roomnew': return HD(tr('Eigener Raum'), `dev/${d.mac}/room`) + `<p class="intro">${tr('Wie soll der Raum heissen?')}</p>
      <div class="ls">${lrow(tr('Name'), `<input type="text" data-roomnew="1" placeholder="${tr('z. B. Werkstatt')}" maxlength="40" enterkeyhint="done" autocomplete="off" style="background:#2a2a2a;color:var(--fg);padding:7px 9px;text-align:left;max-width:200px">`)}</div>
      <button type="button" class="btn" data-roomadd="1">${tr('Hinzufügen')}</button>`;
    case 'tech': return head + `<div class="ls">${[[tr('Typ'), d.typeName], [tr('Firmware'), d.fw || '–'], [tr('IP-Adresse'), d.ip], ['MAC', d.mac.match(/../g).join(':')], [tr('Verbindung'), d.online ? tr('erreichbar') : tr('offline')],
      [tr('Temperatur gemessen'), d.tempRaw != null ? `${d.tempRaw.toFixed(1)} °C` : '–']].map(([l, v]) => row(l, val(esc(v)))).join('')}</div>
      <p class="sec">${tr('Im Gerät gespeichert')}</p><div class="ls" data-diag="${d.mac}" data-keep="${d.mac}">${row(tr('Lädt …'), '')}</div>
      <p class="sec">${tr('Schnittstellen der Firmware')}</p><pre class="diag" data-diaghelp="${d.mac}" data-keep="${d.mac}"></pre>`;
    default: return '';
  }
}

// ---------- Consumption: chart like in myStrom (watts, max line, times), device and day selectable ----------
const view = { mac: 'all', day: null, period: 'day' };
// view.mac: 'all', one device or several comma-separated
const pickedMacs = (m) => (m === 'all' ? SW().map((d) => d.mac) : m.split(',').filter((x) => dev(x)));
const pickedName = (m) => { if (m === 'all') return tr('Alle Geräte'); const n = pickedMacs(m).map((x) => dev(x).name); return n.length > 2 ? nDev(n.length) : n.join(' + '); };
const PERIODS = () => [['day', tr('Tag')], ['week', tr('Woche')], ['month', tr('Monat')], ['year', tr('Jahr')]];
const MONTHS_LONG = () => [tr('Januar'), tr('Februar'), tr('März'), tr('April'), tr('Mai'), tr('Juni'), tr('Juli'), tr('August'), tr('September'), tr('Oktober'), tr('November'), tr('Dezember')];
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
  if (p === 'week') {
    const a = periodStart('week', day), b = addDays(a, 6), mon = (x) => MONTHS()[Number(x.slice(5, 7)) - 1];
    return a.slice(5, 7) !== b.slice(5, 7) ? tr('{0}. {1} – {2}. {3}', Number(a.slice(8)), mon(a), Number(b.slice(8)), mon(b)) : tr('{0}. – {1}. {2}', Number(a.slice(8)), Number(b.slice(8)), mon(b));
  }
  if (p === 'month') return `${MONTHS_LONG()[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;
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
// Bars like the area chart: kWh on the left, labels at the bottom, current segment green
function barSVG(b) {
  const n = b.bars.length, W0 = 38, W1 = 316, H0 = 14, H1 = 190, vals = b.bars.map((x) => (x.wh || 0) / 1000), max = Math.max(0.01, ...vals);
  const step = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500].find((s) => max / s <= 5) || 1000, top = Math.ceil(max * 1.08 / step) * step;
  const slot = (W1 - W0) / n, bw = Math.max(2, slot * 0.68), y = (v) => H1 - (H1 - H0) * v / top;
  const curKey = b.period === 'year' ? S.today.slice(0, 7) : S.today;
  const show = (i) => b.period !== 'month' || i === 0 || (i + 1) % 5 === 0;
  const fmt = (g) => (g < 1 ? g.toFixed(step < 0.1 ? 2 : 1) : String(Math.round(g * 10) / 10));
  return `<svg viewBox="0 0 320 214" role="img" aria-label="${b.period === 'year' ? tr('Verbrauch je Monat') : tr('Verbrauch je Tag')}">
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
    const label = b.period === 'year' ? MONTHS_LONG()[i] : tr('{0} {1}.{2}.', [tr('So'), tr('Mo'), tr('Di'), tr('Mi'), tr('Do'), tr('Fr'), tr('Sa')][new Date(`${x.key}T12:00:00Z`).getUTCDay()], Number(x.key.slice(8)), Number(x.key.slice(5, 7)));
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
  // Gaps (no measurement) break the area
  const segs = []; let cur = [];
  c.w.forEach((w, i) => { if (w == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([x(i), y(w)]); });
  if (cur.length) segs.push(cur);
  for (const s of segs) if (s.length === 1) s.push([s[0][0] + (W1 - W0) / (n - 1), s[0][1]]);
  const grid = Array.from({ length: Math.round(top / step) + 1 }, (_, k) => k * step);
  return `<svg viewBox="0 0 320 214" role="img" aria-label="${tr('Verlauf {0}, höchstens {1} W', dayLabel(c.day), Math.round(max))}">
    ${grid.map((g) => `<line x1="${W0}" x2="${W1}" y1="${y(g)}" y2="${y(g)}" stroke="#3a3a3a" stroke-width=".6"/><text x="${W0 - 4}" y="${y(g) + 3}" text-anchor="end" font-size="9" fill="#bdbdbd">${g}W</text>`).join('')}
    ${vals.length ? `<line x1="${W0}" x2="${W1}" y1="${y(max)}" y2="${y(max)}" stroke="#bdbdbd" stroke-dasharray="3 2" stroke-width=".8"/><text x="${W0 + 6}" y="${y(max) - 4}" font-size="9" fill="#bdbdbd">${tr('Max. {0} W', Math.round(max))}</text>` : ''}
    ${segs.map((s) => `<path d="M${s[0][0]},${H1} L${s.map((p) => p.join(',')).join(' L')} L${s[s.length - 1][0]},${H1}Z" fill="#bdbdbd"/><path d="M${s.map((p) => p.join(',')).join(' L')}" fill="none" stroke="#efefef" stroke-width="1"/>`).join('')}
    <line x1="${W0}" x2="${W0}" y1="${H0 - 8}" y2="${H1}" stroke="#bdbdbd" stroke-width=".8"/>
    ${['00:00', '06:00', '12:00', '18:00', '24:00'].map((l, k) => `<text x="${W0 + (W1 - W0) * k / 4}" y="${H1 + 16}" text-anchor="${k === 0 ? 'start' : k === 4 ? 'end' : 'middle'}" font-size="9" fill="#bdbdbd">${l}</text>`).join('')}
    <line class="cur" x1="0" x2="0" y1="${H0}" y2="${H1}" stroke="#5ab400" stroke-width="1" visibility="hidden"/>
  </svg>`;
}
function chartHTML(mac, pick) {
  view.day ||= S.today;
  if (!pick) view.mac = mac;
  if (pick && view.mac !== 'all' && !pickedMacs(view.mac).length) view.mac = 'all'; // selected device removed
  const m = pick ? view.mac : mac;
  const now = pickedMacs(m).reduce((a, x) => a + dev(x).w, 0), [v, u] = pwN(now);
  const p = view.period, ps = periodStart(p, view.day), current = periodStart(p, S.today) === ps, key = `${m}|${p}|${ps}`, live = current ? `|${Math.floor(S.now / 60e3)}` : '';
  return `<div class="big"><b>${v}<small> ${u}</small></b><span>${tr('Verbrauch jetzt')}</span></div>
    <div class="periods" role="group" aria-label="${tr('Zeitraum')}">${PERIODS().map(([k, l]) => `<button type="button" data-period="${k}" aria-pressed="${p === k}">${l}</button>`).join('')}</div>
    <div class="nav"><button type="button" class="devsel" ${pick ? 'data-devsel="1"' : 'disabled'}>${esc(pickedName(m))}${pick ? ' ▾' : ''}</button>
      <span class="date">${periodLabel(p, view.day)}</span><button type="button" class="arr" data-dayshift="-1" aria-label="${tr('zurück')}">‹</button><button type="button" class="arr" data-dayshift="1" aria-label="${tr('vor')}" ${shiftPeriod(p, view.day, 1) > S.today ? 'disabled' : ''}>›</button></div>
    <div class="chart" data-chart="${key}" data-keep="${key}${live}"><div class="empty">${tr('Lädt …')}</div></div>
    <div class="foot" data-foot data-keep="${key}${live}"><div><b>–<small> kWh</small></b><span>${tr('Verbrauch')}</span></div><i></i><div><b>–<small> CHF</small></b><span>${tr('Kosten')}</span></div></div>`;
}
// ---------- Temperature history ----------
const tview = { period: 'day', day: null };
const TPERIODS = () => [['day', tr('Tag')], ['week', tr('Woche')], ['month', tr('Monat')]];
const deg = (v) => (v == null ? '–' : v.toFixed(1));
function tempChartHTML(d) {
  tview.day ||= S.today;
  const p = tview.period, ref = periodStart(p, tview.day), live = periodStart(p, S.today) === ref ? `|${Math.floor(S.now / 300e3)}` : '', key = `${d.mac}|${p}|${ref}`;
  return `<div class="big"><b>${deg(d.temp)}<small> °C</small></b><span>${tr('Temperatur jetzt')}</span></div>
    <div class="periods" role="group" aria-label="${tr('Zeitraum')}">${TPERIODS().map(([k, l]) => `<button type="button" data-tperiod="${k}" aria-pressed="${p === k}">${l}</button>`).join('')}</div>
    <div class="nav"><span class="sp"></span><span class="date">${periodLabel(p, tview.day)}</span><button type="button" class="arr" data-tshift="-1" aria-label="${tr('zurück')}">‹</button><button type="button" class="arr" data-tshift="1" aria-label="${tr('vor')}" ${shiftPeriod(p, tview.day, 1) > S.today ? 'disabled' : ''}>›</button></div>
    <div class="chart temp" data-tchart="${key}" data-keep="${key}${live}"><div class="empty">${tr('Lädt …')}</div></div>
    <div class="foot three" data-tfoot data-keep="${key}${live}"><div><b>–</b><span>${tr('Tiefst')}</span></div><i></i><div><b>–</b><span>${tr('Mittel')}</span></div><i></i><div><b>–</b><span>${tr('Höchst')}</span></div></div>`;
}
const temps = new Map();
async function tempData(mac, period, ref) {
  const k = `${mac}|${period}|${ref}`, c = temps.get(k);
  if (c && Date.now() - c.at < 60e3) return c.data;
  const data = await api(`api/temp?mac=${mac}&period=${period}&ref=${ref}`);
  temps.set(k, { at: Date.now(), data });
  return data;
}
// shared axis: whole degrees with some margin, "off above" threshold only if it is close by
function tempAxis(lo, hi, limit) {
  if (limit != null && limit <= hi + 6) hi = Math.max(hi, limit);
  lo = Math.floor(lo - 1); hi = Math.ceil(hi + 1);
  const step = [1, 2, 5, 10].find((x) => (hi - lo) / x <= 5) || 10;
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  return { lo, hi, step };
}
function tempSVG(t, limit) {
  const W0 = 38, W1 = 316, H0 = 14, H1 = 190, ax = tempAxis(t.min, t.max, limit), y = (v) => H1 - (H1 - H0) * (v - ax.lo) / (ax.hi - ax.lo);
  const grid = Array.from({ length: Math.round((ax.hi - ax.lo) / ax.step) + 1 }, (_, k) => ax.lo + k * ax.step);
  const gridSVG = grid.map((g) => `<line x1="${W0}" x2="${W1}" y1="${y(g)}" y2="${y(g)}" stroke="#3a3a3a" stroke-width=".6"/><text x="${W0 - 4}" y="${y(g) + 3}" text-anchor="end" font-size="9" fill="#bdbdbd">${g}°</text>`).join('');
  const lim = limit != null && limit <= ax.hi ? `<line class="tlim" x1="${W0}" x2="${W1}" y1="${y(limit)}" y2="${y(limit)}" stroke="#ff5a4e" stroke-dasharray="4 3" stroke-width=".9"/><text x="${W1}" y="${y(limit) - 4}" text-anchor="end" font-size="9" fill="#ff5a4e">${tr('aus über {0}°', limit)}</text>` : '';
  if (t.period === 'day') {
    const n = t.t.length, x = (i) => W0 + (W1 - W0) * i / (n - 1), segs = []; let cur = [];
    t.t.forEach((v, i) => { if (v == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([x(i), y(v)]); });
    if (cur.length) segs.push(cur);
    for (const sg of segs) if (sg.length === 1) sg.push([sg[0][0] + (W1 - W0) / (n - 1), sg[0][1]]);
    return `<svg viewBox="0 0 320 214" role="img" aria-label="${tr('Temperatur {0}, {1} bis {2} °C', dayLabel(t.ref), deg(t.min), deg(t.max))}">${gridSVG}${lim}
      ${segs.map((sg) => `<path class="tline" d="M${sg.map((q) => q.join(',')).join(' L')}" fill="none" stroke="#efefef" stroke-width="1.4" stroke-linejoin="round"/>`).join('')}
      <line x1="${W0}" x2="${W0}" y1="${H0 - 8}" y2="${H1}" stroke="#bdbdbd" stroke-width=".8"/>
      ${['00:00', '06:00', '12:00', '18:00', '24:00'].map((l, k) => `<text x="${W0 + (W1 - W0) * k / 4}" y="${H1 + 16}" text-anchor="${k === 0 ? 'start' : k === 4 ? 'end' : 'middle'}" font-size="9" fill="#bdbdbd">${l}</text>`).join('')}
      <line class="cur" x1="0" x2="0" y1="${H0}" y2="${H1}" stroke="#5ab400" stroke-width="1" visibility="hidden"/></svg>`;
  }
  // Week/month: range from min to max per day, tick at the mean
  const n = t.days.length, slot = (W1 - W0) / n, bw = Math.max(3, Math.min(14, slot * 0.5));
  return `<svg viewBox="0 0 320 214" role="img" aria-label="${tr('Temperatur je Tag, {0} bis {1} °C', deg(t.min), deg(t.max))}">${gridSVG}${lim}
    ${t.days.map((dd, i) => { if (dd.min == null) return ''; const cx = W0 + slot * (i + 0.5), top = y(dd.max), h = Math.max(bw, y(dd.min) - top);
      return `<rect class="tbar${dd.key === S.today ? ' now' : ''}" x="${(cx - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${(bw / 2).toFixed(1)}" fill="#bdbdbd"/>
        <line class="tavg" x1="${(cx - bw / 2 - 1).toFixed(1)}" x2="${(cx + bw / 2 + 1).toFixed(1)}" y1="${y(dd.avg).toFixed(1)}" y2="${y(dd.avg).toFixed(1)}" stroke="#111" stroke-width="1.4"/>`; }).join('')}
    <line x1="${W0}" x2="${W1}" y1="${H1}" y2="${H1}" stroke="#bdbdbd" stroke-width=".8"/>
    ${t.days.map((dd, i) => (t.period === 'week' || i === 0 || (i + 1) % 5 === 0 ? `<text x="${(W0 + slot * (i + 0.5)).toFixed(1)}" y="${H1 + 14}" text-anchor="middle" font-size="9" fill="#bdbdbd">${dd.label}</text>` : '')).join('')}
  </svg>`;
}
// Finger or mouse over the chart: time or day with temperature
function tempTip(el, t) {
  const svg = $('svg', el), cur = $('.cur', svg); let tip = $('.tip', el);
  const show = (e) => {
    const r = svg.getBoundingClientRect(), vx = (e.clientX - r.left) / r.width * 320;
    let text, x;
    if (t.period === 'day') {
      const i = Math.round((vx - 38) / (316 - 38) * (t.t.length - 1));
      if (i < 0 || i >= t.t.length || t.t[i] == null) { hide(); return; }
      x = 38 + (316 - 38) * i / (t.t.length - 1); const min = i * 5;
      text = `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')} · ${deg(t.t[i])} °C`;
      cur.setAttribute('x1', x); cur.setAttribute('x2', x); cur.setAttribute('visibility', 'visible');
    } else {
      const slot = (316 - 38) / t.days.length, i = Math.floor((vx - 38) / slot), dd = t.days[i];
      if (!dd || dd.min == null) { hide(); return; }
      x = 38 + slot * (i + 0.5); text = `${t.period === 'week' ? dd.label : tr('{0}.', dd.label)} · ${deg(dd.min)}–${deg(dd.max)} °C`;
    }
    if (!tip) { tip = document.createElement('span'); tip.className = 'tip'; el.append(tip); }
    tip.textContent = text; tip.style.left = `${x / 320 * r.width + 2}px`;
  };
  const hide = () => { cur?.setAttribute('visibility', 'hidden'); tip?.remove(); tip = null; };
  svg.addEventListener('pointermove', show); svg.addEventListener('pointerdown', show); svg.addEventListener('pointerleave', hide);
}
function totalsHTML(mac) { return `<div class="ls" data-totals="${mac}" data-keep="${mac}|${Math.floor(S.now / 60e3)}"></div>`; }
// Load chart and totals once the page is in place
async function fillCharts() {
  for (const el of document.querySelectorAll('[data-chart]:not([data-filled])')) {
    const [m, period, day] = el.dataset.chart.split('|'), key = el.dataset.keep;
    el.dataset.filled = key;
    try {
      if (period !== 'day') {
        const b = await barData(m, period, day);
        if (!el.isConnected) return;
        el.innerHTML = barSVG(b) + (b.wh ? '' : `<div class="empty">${tr('Keine Daten für diesen Zeitraum')}</div>`);
        const foot = $('[data-foot]');
        if (foot) { foot.dataset.filled = foot.dataset.keep; foot.innerHTML = `<div><b>${kwh(b.wh)}<small> kWh</small></b><span>${tr('Verbrauch')}</span></div><i></i><div><b>${chf(b.wh)}<small> CHF</small></b><span>${tr('Kosten')}</span></div>`; }
        barTip(el, b);
        continue;
      }
      const c = await curve(m, day);
      if (!el.isConnected) return;
      el.innerHTML = areaSVG(c) + (c.w.some((x) => x != null) ? '' : `<div class="empty">${tr('Keine Daten für diesen Tag')}</div>`);
      const foot = $('[data-foot]');
      if (foot) { foot.dataset.filled = foot.dataset.keep; foot.innerHTML = `<div><b>${kwh(c.wh)}<small> kWh</small></b><span>${tr('Verbrauch')}</span></div><i></i><div><b>${chf(c.wh)}<small> CHF</small></b><span>${tr('Kosten')}</span></div>`; }
      chartTip(el, c);
    } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  }
  for (const el of document.querySelectorAll('[data-tchart]:not([data-filled])')) {
    const [mac, period, ref] = el.dataset.tchart.split('|'); el.dataset.filled = el.dataset.keep;
    try {
      const t = await tempData(mac, period, ref), d = dev(mac);
      if (!el.isConnected) return;
      el.innerHTML = t.min == null ? `<div class="empty">${tr('Keine Messungen für diesen Zeitraum')}</div>` : tempSVG(t, d?.cfg.temp.on ? d.cfg.temp.max : null);
      if (t.min != null) tempTip(el, t);
      const foot = $('[data-tfoot]');
      if (foot) { foot.dataset.filled = foot.dataset.keep; foot.innerHTML = [[tr('Tiefst'), t.min], [tr('Mittel'), t.avg], [tr('Höchst'), t.max]].map(([l, v]) => `<div><b>${deg(v)}<small> °C</small></b><span>${l}</span></div>`).join('<i></i>'); }
    } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  }
  for (const el of document.querySelectorAll('[data-diag]:not([data-filled])')) {
    el.dataset.filled = el.dataset.keep;
    try {
      const g = await api(`api/devices/${el.dataset.diag}/diag`);
      if (!el.isConnected) return;
      el.innerHTML = typeof g.settings === 'object' ? Object.entries(g.settings).map(([k, v]) => row(esc(k), val(esc(JSON.stringify(v))))).join('') : row(esc(String(g.settings)), '');
      const h = $(`[data-diaghelp="${el.dataset.diag}"]`); if (h) { h.dataset.filled = h.dataset.keep; h.textContent = g.help; }
    } catch (e) { el.innerHTML = row(esc(e.message), ''); }
  }
  for (const el of document.querySelectorAll('[data-totals]:not([data-filled])')) {
    el.dataset.filled = el.dataset.keep;
    try {
      const t = await api(`api/totals?mac=${el.dataset.totals}`);
      if (!el.isConnected) return;
      el.innerHTML = [[tr('Diese Woche'), t.week], [tr('Dieser Monat'), t.month], [tr('Dieses Jahr'), t.year], [t.since ? tr('Seit {0}', new Date(t.since).toLocaleDateString(LOC())) : tr('Gesamt'), t.all]]
        .map(([l, wh]) => row(l, val(`${kwh(wh)} kWh · CHF ${chf(wh)}`))).join('');
    } catch { /* stays empty */ }
  }
}
// Finger or mouse over the chart: time and power at that point
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
// Choose devices for consumption: bottom sheet with tiles like the home page; multiple selectable (sum), selected with checkmark
function devPickTiles() {
  const chk = '<span class="chk" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 12 4 4 8-8"/></svg></span>';
  const picked = view.mac === 'all' ? ['all', ...SW().map((d) => d.mac)] : view.mac.split(',');
  const t = (v, on, icon, label, sub, tmp = '') => { const sel = picked.includes(v); return `<button type="button" class="tile room ${on ? 'on' : ''} ${sel ? 'sel' : ''}" data-pickdev="${v}" aria-pressed="${sel}">
    ${tmp}<span class="ico">${icon}${sel ? chk : ''}</span><span class="lb">${label}</span><span class="sub">${sub}</span></button>`; };
  const total = SW().reduce((a, d) => a + d.w, 0), totalWh = SW().reduce((a, d) => a + d.todayWh, 0);
  return `<div class="grid">
    ${t('all', false, I.bolt, `${pw(total)}<br>${tr('Alle Geräte')}`, tr('{0} kWh heute', kwh(totalWh)))}
    ${SW().map((d) => t(d.mac, d.relay, devIcon(d), `${d.relay ? `${pw(d.w)}<br>` : ''}${esc(d.name)}`, tr('{0} kWh heute', kwh(d.todayWh)), d.temp != null ? `<span class="tmp">${d.temp.toFixed(1)}°C</span>` : '')).join('')}
  </div>`;
}
function energyHTML() {
  const m = view.mac, month = (view.day || S.today).slice(0, 7);
  return HD(tr('Verbrauch'), 'home') + chartHTML(m, true) + totalsHTML(m)
    + (pickedMacs(m).length > 1 ? `<p class="sec">${tr('Heute je Gerät')}</p><div class="ls">${pickedMacs(m).map(dev).map((d) => row(esc(d.name), chev(`${kwh(d.todayWh)} kWh`), '', `data-go="dev/${d.mac}/eval"`)).join('')}</div>` : '')
    + `<button type="button" class="btn grey" data-go="export">${tr('Exportieren (CSV)')}</button>`;
}
// Export: choose device, period and resolution, then download as CSV (opens in Excel or Numbers)
const exp = { mac: null, from: null, to: null, res: 'hour' };
function exportHTML() {
  exp.mac ??= view.mac; exp.from ||= `${S.today.slice(0, 7)}-01`; exp.to ||= S.today;
  const prev = shiftPeriod('month', S.today, -1), y = S.today.slice(0, 4);
  const ranges = [[tr('Dieser Monat'), `${S.today.slice(0, 7)}-01`, S.today], [tr('Letzter Monat'), prev, lastOfMonth(prev.slice(0, 7))], [tr('Dieses Jahr'), `${y}-01-01`, S.today], [tr('Alles'), '2020-01-01', S.today]];
  const chip = (attr, v, l, on) => `<button type="button" class="chip" ${attr}="${esc(v)}" aria-pressed="${on}">${esc(l)}</button>`;
  const href = `api/export.csv?mac=${exp.mac}&from=${exp.from}&to=${exp.to}&res=${exp.res}`;
  const days = Math.max(1, Math.round((Date.parse(exp.to) - Date.parse(exp.from)) / 864e5) + 1), n = pickedMacs(exp.mac).length;
  const rows = Math.round(days * n * { raw: 2880, '5min': 288, hour: 24, day: 1 }[exp.res]);
  return HD(tr('Exportieren'), 'energy') + `<p class="intro">${tr('Messwerte als CSV-Datei, z. B. für Excel oder Numbers.')}</p>
    <p class="sec">${tr('Gerät')}</p><div class="chips">${chip('data-exp-mac', 'all', tr('Alle Geräte'), exp.mac === 'all')}${exp.mac.includes(',') ? chip('data-exp-mac', exp.mac, pickedName(exp.mac), true) : ''}${SW().map((d) => chip('data-exp-mac', d.mac, d.name, exp.mac === d.mac)).join('')}</div>
    <p class="sec">${tr('Zeitraum')}</p><div class="chips">${ranges.map(([l, a, b]) => chip('data-exp-range', `${a}|${b}`, l, exp.from === a && exp.to === b)).join('')}</div>
    <div class="ls">${lrow(tr('Von'), `<input type="date" data-exp-in="from" value="${exp.from}" max="${S.today}">`)}${lrow(tr('Bis'), `<input type="date" data-exp-in="to" value="${exp.to}" max="${S.today}">`)}</div>
    <p class="sec">${tr('Auflösung')}</p><div class="chips">${[['raw', tr('alle 30 s')], ['5min', tr('5 Minuten')], ['hour', tr('Stunde')], ['day', tr('Tag')]].map(([v, l]) => chip('data-exp-res', v, l, exp.res === v)).join('')}</div>
    <p class="note">${exp.res === 'raw' ? tr('Etwa {0} Zeilen, jede Messung einzeln.', rows.toLocaleString(LOC())) : tr('Etwa {0} Zeilen, je Abschnitt Ø Leistung und Energie.', rows.toLocaleString(LOC()))}</p>
    <a class="btn" href="${href}" download>${tr('CSV herunterladen')}</a>`;
}
const lastOfMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; };

// ---------- Scenes ----------
function scenesHTML() {
  return HD(tr('Szenen'), 'home') + `<p class="intro">${tr('Mehrere Steckdosen mit einem Tipp schalten.')}</p>`
    + `<div class="ls">${S.scenes.map((s) => { const n = Object.keys(s.actions).length; return `<div class="row"><button type="button" class="tx" data-go="scene/${s.id}" style="text-align:left;flex:1"><b>${esc(s.name)}</b><span>${n ? Object.entries(s.actions).map(([mac, a]) => (a === 'on' ? tr('{0} an', esc(dev(mac)?.name || '?')) : tr('{0} aus', esc(dev(mac)?.name || '?')))).join(', ') : tr('alle Steckdosen aus')}${s.time?.on ? ` · ${daysText(s.time.days)} ${s.time.at}` : ''}</span></button>
      <button type="button" class="chip" data-run="${s.id}" aria-label="${tr('{0} ausführen', esc(s.name))}">${tr('Ausführen')}</button></div>`; }).join('')}</div>
    <button type="button" class="btn ghost" data-newscene="1">${tr('Neue Szene')}</button>`;
}
function sceneHTML(id) {
  const s = S.scenes.find((x) => x.id === id);
  if (!s) return HD(tr('Szene'), 'scenes') + `<p class="empty-state">${tr('Diese Szene gibt es nicht mehr.')}</p>`;
  const t = (s.time ||= { on: false, at: '23:00', days: [1, 2, 3, 4, 5, 6, 0] });
  return HD(tr('Szene bearbeiten'), 'scenes') + `<div class="ls">${lrow(tr('Name'), `<input type="text" data-scene-name="${s.id}" value="${esc(s.name)}" maxlength="30">`)}</div>
    <p class="sec">${tr('Was passiert')}</p><div class="ls">${SW().map((d) => `<div class="row"><span class="tx"><b>${esc(d.name)}</b></span><span class="chips" style="padding:0;margin:0">
      ${[['', tr('Nichts')], ['on', tr('An')], ['off', tr('Aus')]].map(([a, l]) => `<button type="button" class="chip" data-sact="${s.id}|${d.mac}|${a}" aria-pressed="${(s.actions[d.mac] || '') === a}">${l}</button>`).join('')}</span></div>`).join('')}</div>
    <p class="note">${tr('Ohne Auswahl schaltet die Szene alle Steckdosen aus.')}</p>
    <p class="sec">${tr('Zu fester Zeit')}</p><div class="${t.on ? 'ls' : 'ls dim'}"><div class="row master"><span class="tx"><b>${tr('Automatisch ausführen')}</b></span><button type="button" class="sw" data-stime="${s.id}" aria-pressed="${t.on}" aria-label="${tr('Automatisch ausführen')}"></button></div>
      ${lrow(tr('Um'), `<input type="time" data-sat="${s.id}" value="${t.at}">`)}</div>
    <div class="chips days">${WD().map(([n, l]) => `<button type="button" class="chip" data-sday="${s.id}|${n}" aria-pressed="${t.days.includes(n)}">${l}</button>`).join('')}</div>
    <button type="button" class="btn" data-run="${s.id}">${tr('Jetzt ausführen')}</button>
    <button type="button" class="btn danger" data-delscene="${s.id}">${tr('Szene löschen')}</button>`;
}
const saveScenes = async () => { try { S.scenes = await api('api/scenes', { method: 'PUT', body: JSON.stringify({ scenes: S.scenes }) }); render(); } catch (e) { toast(e.message, true); } };

// ---------- Vacation (all plugs), rules, alarms, more ----------
function guardHTML() {
  return HD(tr('Ferien'), 'home') + `<p class="intro">${tr('Ferienmodus aller Steckdosen auf einen Blick. Eingeschaltet geht eine Steckdose in den Ferien morgens und abends zu wechselnden Zeiten an, damit das Haus bewohnt wirkt.')}</p>`
    + `<div class="ls">${SW().map((d) => { const v = d.cfg.vacation, today = d.vacationToday.map((s) => `${slotName(s.key)} ${s.start}`).join(', ');
      return `<div class="row"><button type="button" class="tx" data-go="dev/${d.mac}/vacation" style="text-align:left;flex:1"><b>${esc(d.name)} ›</b><span>${v.on ? `${dShort(v.from)}–${dShort(v.to)}${today ? ` · ${tr('heute {0}', today)}` : ''}` : tr('aus')}</span></button>${sw(`${d.mac}:vacation.on`, v.on, tr('Ferien {0}', d.name))}</div>`; }).join('')}</div>`;
}
function rulesHTML() {
  const items = [...SW().flatMap((d) => FEAT().filter(([k]) => k !== 'eval' && k !== 'alarms').map(([k, ic, l]) => [d, k, l, ...featInfo(d, k)]).filter((x) => x[3])),
    ...S.devices.filter((d) => d.kind === 'motion' && d.cfg.motion.on).map((d) => [d, '', tr('Licht bei Bewegung'), true, featInfo(d, 'motion')[1]])];
  return HD(tr('Regeln'), 'home') + (items.length ? `<div class="ls">${items.map(([d, k, l, , txt]) => row(`${esc(d.name)} · ${l}`, chev(), esc(txt), `data-go="dev/${d.mac}/${k}"`)).join('')}</div>`
    : `<p class="empty-state">${tr('Noch keine Regel aktiv.')}<br>${tr('Öffne eine Steckdose und schalte z. B. den Zeitplan ein.')}</p>`);
}
let events = null;
function alarmsHTML() {
  const pushOk = 'PushManager' in window && 'serviceWorker' in navigator;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const perm = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  return HD(tr('Alarme'), 'home') + `<p class="sec">${tr('Mitteilungen auf diesem Gerät')}</p><div class="ls">
      ${!pushOk ? row(tr('Nicht möglich'), '', standalone ? tr('Dieser Browser kann keine Mitteilungen.') : tr('Auf dem iPhone zuerst „Zum Home-Bildschirm“ hinzufügen und von dort öffnen.'))
        : perm === 'granted' && S.pushSubs ? row(tr('Erlaubt'), val('✓'), tr('{0} angemeldet', nDev(S.pushSubs))) + row(tr('Test senden'), chev(), '', 'data-pushtest="1"')
          : row(tr('Mitteilungen erlauben'), chev(), tr('für Offline, ungewöhnlichen Verbrauch, Hitze'), 'data-push="1"')}</div>
    <p class="sec">${tr('Pro Gerät')}</p><div class="ls">${S.devices.filter((d) => d.kind !== 'button').map((d) => row(esc(d.name), chev(`${featInfo(d, 'alarms')[1]}`), '', `data-go="dev/${d.mac}/alarms"`)).join('')}</div>
    <p class="sec">${tr('Verlauf')}</p><div class="ls" data-events>${events ? eventsHTML() : row(tr('Lädt …'), '')}</div>`;
}
function eventsHTML() {
  if (!events.length) return row(tr('Noch nichts passiert'), '');
  return events.map((e) => { const d = dev(e.mac), t = new Date(e.ts);
    const when = t.toDateString() === new Date().toDateString() ? t.toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit' }) : t.toLocaleDateString(LOC(), { day: 'numeric', month: 'numeric' });
    return `<div class="row ev"><time>${when}</time><span class="tx"><b>${e.kind === 'on' ? tr('{0} an', esc(d?.name || e.mac)) : e.kind === 'off' ? tr('{0} aus', esc(d?.name || e.mac)) : esc(d?.name || e.mac)}</b><span>${e.kind === 'alarm' ? '⚠︎ ' : ''}${esc(e.text)}</span></span></div>`; }).join('');
}
// Design: "Modern" (default) or "myStrom" like the original app; applies per device
const design = () => (store.get('design') === 'mystrom' ? 'mystrom' : 'modern');
function setDesign(v) {
  store.set('design', v);
  const l = document.getElementById('theme-modern'); if (l) l.disabled = v === 'mystrom';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', v === 'mystrom' ? '#000000' : '#131920'); // Status bar like the header
  app.dataset.page = ''; render();
}
function moreHTML() {
  const s = S.settings;
  return HD(tr('Einstellungen'), 'home') + `<p class="sec">${tr('Strom')}</p><div class="ls">${lrow(tr('Preis pro kWh'), `<input type="number" data-setting="price" value="${s.price}" step="0.01" min="0" max="2" inputmode="decimal">`, 'CHF')}</div>
    <p class="sec">${tr('Standort')}</p><div class="ls">
      ${lrow(tr('Ort'), `<input type="text" data-place="1" value="${esc(s.place || '')}" placeholder="${tr('z. B. Zürich')}" maxlength="80" enterkeyhint="search" autocomplete="off" style="max-width:200px">`, `${Number(s.lat).toFixed(2)}, ${Number(s.lon).toFixed(2)}${S.sun ? ` · ${tr('Sonne {0}–{1}', S.sun.rise, S.sun.set)}` : ''}`)}
      ${'geolocation' in navigator ? row(tr('Standort vom Handy übernehmen'), chev(), tr('einmalig, nach deiner Freigabe'), 'data-geo="1"') : ''}</div>
    <p class="note">${tr('Nur für Sonnenauf- und -untergang. Ein eingetippter Ort wird einmal bei Open-Meteo nachgeschlagen; vom Handy kommen die Koordinaten direkt.')}</p>
    <p class="sec">${tr('Design')}</p><div class="chips">${[['modern', tr('Modern')], ['mystrom', 'myStrom']].map(([v, l]) => `<button type="button" class="chip" data-design="${v}" aria-pressed="${design() === v}">${l}</button>`).join('')}</div>
    <p class="sec">Sprache · Language</p><div class="chips">${[['de', 'Deutsch'], ['en', 'English']].map(([v, l]) => `<button type="button" class="chip" data-lang="${v}" aria-pressed="${lang() === v}">${l}</button>`).join('')}</div>
    <p class="sec">${tr('Geräte')}</p><div class="ls">${S.devices.map((d) => row(esc(d.name), chev(esc(d.ip)), `${esc(d.typeName)} · ${d.online ? tr('erreichbar') : tr('offline')}`, `data-go="dev/${d.mac}/settings"`)).join('')}
      ${lrow(tr('Per IP hinzufügen'), '<input type="text" id="addip" placeholder="192.168.0.42" inputmode="decimal" style="background:#2a2a2a;color:#e8e8e8;padding:7px 9px;text-align:left;max-width:160px">')}</div>
    <p class="note">${tr('Neue myStrom-Geräte im WLAN (Steckdosen, Lampen, Taster, Bewegungsmelder) findet die App von selbst. Eine IP brauchst du nur, wenn sich eines nicht meldet; Taster melden sich nach dem ersten Drücken.')}</p>
    <p class="sec">${tr('Über')}</p><div class="ls">${row(tr('Läuft lokal'), val(tr('ohne Konto')), tr('Alle Funktionen von myStrom PLUS, PRO, DATA PRO und HOME GUARD, gratis. Daten bleiben bei dir.'))}</div>`;
}

// ---------- Rendering ----------
let swipe = null;
// Patch existing nodes to match the new HTML instead of replacing everything: no flicker, focus and charts persist.
// Elements with data-keep keep their content as long as the key is unchanged (chart, totals, history).
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
  if (!S || swipe || drag || hdrag || stpHold || document.activeElement?.classList.contains('stpin') || pickerField(document.activeElement)) return;
  document.documentElement.lang = lang();
  const [r0, r1, r2, r3] = route(), d = r0 === 'dev' ? dev(r1) : null;
  let html;
  if (r0 === 'dev') html = !d ? `${HD(tr('Steckdose'), 'home')}<p class="empty-state">${tr('Diese Steckdose gibt es nicht mehr.')}</p>` : r2 ? featureHTML(d, r2, r3) : deviceHTML(d);
  else if (r0 === 'export') html = exportHTML();
  else if (r0 === 'order') html = orderHTML();
  else html = { energy: energyHTML, scenes: scenesHTML, guard: guardHTML, rules: rulesHTML, alarms: alarmsHTML, more: moreHTML }[r0]?.() ?? (r0 === 'scene' ? sceneHTML(r1) : homeHTML());
  if (fresh || app.dataset.page !== cur()) { app.innerHTML = html; app.dataset.page = cur(); }
  else { const t = app.cloneNode(false); t.innerHTML = html; morph(app, t); }
  fillCharts();
  if (r0 === 'alarms' && !events) api('api/events?n=40').then((e) => { events = e; const el = $('[data-events]'); if (el) el.innerHTML = eventsHTML(); });
}

// ---------- Swiping on tiles: like flipping to the next page ----------
// The current tile slides out with the finger, the next one comes in from the other side:
// green "AN" (on) or red "AUS" (off). Past half the width it snaps and toggles, otherwise it springs back.
const POWER = '<svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v9M6.3 6.8a8 8 0 1 0 11.4 0"/></svg>';
let swiped = 0;
function nextPanel(tile, on, name) {
  let n = tile.querySelector('.next');
  if (!n) { n = document.createElement('div'); n.className = 'next'; n.dataset.transient = '1'; tile.append(n); }
  n.classList.toggle('to-on', on); n.classList.toggle('to-off', !on);
  n.innerHTML = `${POWER}<b>${on ? tr('AN') : tr('AUS')}</b><span>${esc(name)}</span>`;
  return n;
}
// Set page and counterpart to the finger position (x in px, positive = to the right)
function place(tile, x, animate) {
  const face = tile.querySelector('.face'), n = tile.querySelector('.next'), w = tile.offsetWidth, t = animate ? 'transform .22s cubic-bezier(.2,.8,.2,1)' : 'none';
  face.style.transition = t; face.style.transform = x ? `translateX(${x}px)` : '';
  if (n) { n.style.transition = t; n.style.transform = `translateX(${x - Math.sign(x || 1) * w}px)`; }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// finish flipping, briefly show the new page, then toggle and turn back into the normal tile
async function flip(tile, d, sign) {
  const w = tile.offsetWidth;
  nextPanel(tile, !d.relay, d.name);
  if (!tile.querySelector('.next').style.transform) place(tile, 0.001 * sign, false); // start outside, in case of a tap
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
// Safety net: if a swipe gets stuck (e.g. finger leaves the window), release after 3 s
setInterval(() => { if (swipe && !swipe.busy && !document.querySelector(':active')) { place(swipe.tile, 0, false); swipe.tile.querySelector('.next')?.remove(); swipe = null; } }, 3000);
app.addEventListener('pointermove', (e) => {
  if (!swipe || swipe.busy || e.pointerId !== swipe.id) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  if (!swipe.live) {
    if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { swipe = null; return; } // vertical = scrolling
    if (Math.abs(dx) < 8) return;
    swipe.live = true;
    const d = dev(swipe.b.dataset.swipe);
    swipe.blocked = d.cfg.lock || !d.online;
    if (!swipe.blocked) nextPanel(swipe.tile, !d.relay, d.name);
  }
  // locked or offline: only a short, damped follow; otherwise at most one tile width, damped near the end
  const w = swipe.tile.offsetWidth, a = Math.abs(dx), soft = w * 0.85;
  const x = swipe.blocked ? Math.sign(dx) * Math.min(24, a / 4) : Math.sign(dx) * Math.min(w, a < soft ? a : soft + (a - soft) * 0.3);
  // velocity (px/ms, smoothed) for fast swipes
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
  if (!s.live) { swipe = null; return; } // was a tap
  swiped = Date.now();
  // if the browser takes over the gesture (e.g. for scrolling), never toggle, spring back instead
  if (e?.type === 'pointercancel') { snapBack(s); return; }
  const d = dev(s.b.dataset.swipe), w = s.tile.offsetWidth;
  if (s.blocked) { place(s.tile, 0, true); swipe = null; shake(s.tile); haptic([8, 60, 8]); toast(d.cfg.lock ? tr('{0}: Tastensperre ist an', d.name) : tr('{0} ist nicht erreichbar', d.name), !d.cfg.lock); return; }
  // dragged far enough, or flicked short and fast in the same direction (finger still moving at the end)
  const moving = e && s.lt && e.timeStamp - s.lt < 90, v = moving ? s.v || 0 : 0;
  const flick = Math.abs(v) > 0.45 && Math.sign(v) === Math.sign(s.dx) && Math.abs(s.dx) > w * 0.12;
  if (Math.abs(s.dx) >= w * 0.4 || flick) { s.busy = true; store.set('swiped', '1'); haptic(); flip(s.tile, d, Math.sign(s.dx)); }
  else snapBack(s);
};
app.addEventListener('pointerup', endSwipe);
app.addEventListener('pointercancel', endSwipe);
addEventListener('pointerup', endSwipe); // also released outside the app

function tapFlip(el, d) {
  const tile = el.closest('.tile');
  if (d.cfg.lock || !d.online) { shake(tile); haptic([8, 60, 8]); toast(d.cfg.lock ? tr('{0}: Tastensperre ist an', d.name) : tr('{0} ist nicht erreichbar', d.name), !d.cfg.lock); return; }
  if (swipe) return;
  swipe = { b: el, tile, busy: true, live: true, dx: 0 };
  haptic();
  flip(tile, d, d.relay ? -1 : 1); // off: away to the left, on: to the right
}
// Menu from the left: sections, plugs with state, arrange home page, settings. Closes by tapping outside, Esc or swiping left.
function openMenu() {
  if (document.querySelector('.drawer')) return;
  const el = document.createElement('div'), total = SW().reduce((a, d) => a + d.w, 0);
  const item = (attr, icon, label, sub = '') => `<button type="button" class="ni" ${attr}><span class="nic">${icon}</span><span class="ntx">${label}${sub ? `<small>${sub}</small>` : ''}</span></button>`;
  el.className = 'drawer';
  el.innerHTML = `<div class="drawer-bg" data-close></div><nav class="drawer-panel" role="dialog" aria-modal="true" aria-label="${tr('Menü')}">
    <div class="drawer-hd"><b>myStrom</b><span>${nDev(S.devices.length)} · ${pw(total)}</span></div>
    <div class="ngrp">${[['scenes', I.scenes, tr('Szenen')], ['rules', I.rules, tr('Regeln')], ['guard', I.beach, tr('Ferien')], ['energy', I.bolt, tr('Verbrauch')], ['alarms', I.bell, tr('Alarme')]]
      .map(([h, ic, l]) => item(`data-ngo="${h}"`, ic, l)).join('')}</div>
    <p class="nsec">${tr('Geräte')}</p><div class="ngrp">${S.devices.map((d) => item(`data-ngo="dev/${d.mac}"`, `<i class="dot ${!d.online ? 'off-line' : d.relay || d.motion ? 'on' : ''}"></i>`, esc(d.name),
      kindSub(d))).join('')}</div>
    <div class="ngrp nfoot">${item('data-nedit="1"', I.menu, tr('Startseite anordnen'))}${item('data-ngo="more"', I.gear, tr('Einstellungen'))}</div>
  </nav>`;
  const close = () => { el.classList.remove('open'); removeEventListener('keydown', onKey); setTimeout(() => el.remove(), 260); document.querySelector('[data-menu]')?.focus(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  el.addEventListener('click', (e) => {
    const g = e.target.closest('[data-ngo]');
    if (g) { haptic(); close(); if (cur() !== g.dataset.ngo) go(g.dataset.ngo); }
    else if (e.target.closest('[data-nedit]')) { close(); if (cur() !== 'home' && cur() !== '') back('home'); setTimeout(enterEdit, 280); }
    else if (e.target.closest('[data-close]')) close();
  });
  // swiping left closes; the menu follows the finger
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
  el.innerHTML = `<div class="pick-bg" data-close></div><div class="pick-sheet" role="dialog" aria-label="${tr('Geräte wählen')}">
    <div class="pick-hd"><b>${tr('Geräte wählen')}</b><button type="button" data-close>${tr('Fertig')}</button></div>${devPickTiles()}</div>`;
  const close = () => { el.classList.remove('open'); setTimeout(() => el.remove(), 300); };
  el.addEventListener('click', (e) => {
    const o = e.target.closest('[data-pickdev]');
    if (o) {
      haptic();
      const v = o.dataset.pickdev, cur = pickedMacs(view.mac); // with "All" everything is selected, tapping removes one
      const next = v === 'all' ? [] : cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
      const ordered = SW().map((d) => d.mac).filter((x) => next.includes(x));
      view.mac = !ordered.length || ordered.length === SW().length ? 'all' : ordered.join(',');
      el.querySelector('.grid').outerHTML = devPickTiles(); render();
    }
    else if (e.target.closest('[data-close]')) close();
  });
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('open'));
  setTimeout(() => el.classList.add('open'), 60); // in case no frame is currently being drawn
}
// ---------- Hold − / +: repeats, faster and faster; saved on release ----------
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
// Header: no edge at the top, raised as glass only once scrolled
const onScroll = () => document.documentElement.classList.toggle('scrolled', scrollY > 4);
addEventListener('scroll', onScroll, { passive: true }); onScroll();
// ---------- Clicks ----------
// ---------- Arrange home page: long-press, then drag tiles (like on the iPhone) ----------
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
  if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 8) { clearTimeout(lp.t); lp = null; } // moved = swiping or scrolling
  moveHomeDrag(e);
}, true);
const lpEnd = () => { if (lp) { clearTimeout(lp.t); lp = null; } endHomeDrag(); };
app.addEventListener('pointerup', lpEnd, true);
app.addEventListener('pointercancel', lpEnd, true);
app.addEventListener('contextmenu', (e) => { if (e.target.closest('.grid.home')) e.preventDefault(); });
// the dragged tile follows the finger; when it's over another, they swap places and the rest slide along
const followFinger = (t, e) => { t.style.transform = 'none'; const b = t.getBoundingClientRect(); t.style.transform = `translate(${e.clientX - hdrag.ox - b.left}px, ${e.clientY - hdrag.oy - b.top}px) scale(1.05)`; };
function startHomeDrag(t, e) {
  const r = t.getBoundingClientRect();
  hdrag = { t, id: e.pointerId, ox: e.clientX - r.left, oy: e.clientY - r.top };
  try { t.setPointerCapture(e.pointerId); } catch { /* continue without pointer capture */ }
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
  if (Date.now() - lpFired < 700) return; // the release after the long-press opens nothing
  if (editHome) { if (e.target.closest('[data-editdone]')) exitEdit(); return; } // in edit mode nothing is toggled or opened
  const at = (s) => e.target.closest(s), [r0, r1] = route();
  let el;
  if ((el = at('[data-swipe]'))) {
    if (Date.now() - swiped < 450) return;
    const d = dev(el.dataset.swipe);
    // Home page: tapping opens the device. Device page: the large switch tile toggles on tap.
    go(`dev/${d.mac}`);
  } else if ((el = at('[data-devtoggle]'))) {
    const d = dev(el.dataset.devtoggle);
    if (d.cfg.lock || !d.online) { shake(el); haptic([8, 60, 8]); toast(d.cfg.lock ? tr('{0}: Tastensperre ist an', d.name) : tr('{0} ist nicht erreichbar', d.name), !d.cfg.lock); }
    else { haptic(); switchDev(d.mac, !d.relay); }
  } else if ((el = at('[data-back]'))) { if (stack.length > 1) { scrolls[cur()] = scrollY; history.back(); } else back(el.dataset.back); }
  else if ((el = at('[data-actnew]'))) {
    const d = dev(r1), tpl = ACT_TPL(d).find(([k]) => k === el.dataset.actnew)[3], id = `a${Date.now().toString(36)}`;
    haptic(); await saveCfg(r1, { actions: [...d.cfg.actions, { id, on: true, ...tpl }] }); go(`dev/${r1}/actions/${id}`);
  } else if ((el = at('[data-atoggle]'))) { haptic(); const a = dev(r1).cfg.actions.find((x) => x.id === el.dataset.atoggle); updAct(r1, a.id, { on: !a.on }); }
  else if ((el = at('[data-aset]'))) { haptic(); const [f, v] = el.dataset.aset.split('|'), a = route()[3], patch = { [f]: v }; if (f === 'then' && v.startsWith('other') && !dev(r1).cfg.actions.find((x) => x.id === a).target) patch.target = S.devices.find((x) => x.mac !== r1)?.mac || ''; updAct(r1, a, patch); }
  else if ((el = at('[data-adel]'))) { if (!confirm(tr('Power Action löschen?'))) return; await saveCfg(r1, { actions: dev(r1).cfg.actions.filter((x) => x.id !== el.dataset.adel) }); back(`dev/${r1}/actions`); }
  else if ((el = at('[data-period]'))) { haptic(); view.period = el.dataset.period; render(); }
  else if ((el = at('[data-tperiod]'))) { haptic(); tview.period = el.dataset.tperiod; render(); }
  else if ((el = at('[data-tshift]'))) { tview.day = shiftPeriod(tview.period, tview.day, Number(el.dataset.tshift)); if (tview.day > S.today) tview.day = S.today; render(); }
  else if ((el = at('[data-exp-mac]'))) { exp.mac = el.dataset.expMac; render(); }
  else if ((el = at('[data-exp-range]'))) { [exp.from, exp.to] = el.dataset.expRange.split('|'); render(); }
  else if ((el = at('[data-exp-res]'))) { exp.res = el.dataset.expRes; render(); }
  else if ((el = at('[data-design]'))) { haptic(); setDesign(el.dataset.design); }
  else if ((el = at('[data-lang]'))) {
    haptic(); S.settings.lang = el.dataset.lang; render();
    try { S.settings = await api('api/settings', { method: 'PUT', body: JSON.stringify({ settings: { lang: el.dataset.lang } }) }); await load(); } catch (x) { toast(x.message, true); }
  }
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
    if (isDur) { inp.type = 'text'; inp.inputMode = 'numeric'; inp.value = `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; inp.placeholder = tr('Std:Min'); }
    else { inp.type = 'text'; inp.inputMode = list === 'offs' || list === 'tcorr' ? 'text' : 'decimal'; inp.value = String(v); }
    inp.setAttribute('aria-label', el.getAttribute('aria-label').split(':')[0]);
    inp.enterKeyHint = 'done'; el.replaceWith(inp); inp.focus(); inp.select();
    inp.addEventListener('blur', () => setTimeout(() => render(), 0));
  } else if (stpRepeated) stpRepeated = false; // Click after press-and-hold: value is already saved
  else if ((el = at('[data-step]'))) {
    haptic(); const p = el.dataset.step, dir = Number(el.dataset.dir);
    stpSave(p, nextStep(el.dataset.list, Number(el.parentElement.querySelector('.stpv').dataset.v), dir));
  } else if (at('[data-sdtest]')) {
    haptic(); try { const t = await api(`api/devices/${r1}/shutdown-test`, { method: 'POST' }); toast(t.message); } catch (x) { toast(x.message, true); }
  } else if ((el = at('[data-btndo]'))) {
    haptic(); const [k, v] = el.dataset.btndo.split('|'), a = dev(r1).cfg.button[k];
    saveCfg(r1, { button: { [k]: { do: v, mac: a.mac || (['toggle', 'on', 'off'].includes(v) ? SW()[0]?.mac || '' : ''), scene: a.scene || (v === 'scene' ? S.scenes[0]?.id || '' : '') } } });
  } else if ((el = at('[data-btnmac]'))) { haptic(); const [k, m] = el.dataset.btnmac.split('|'); saveCfg(r1, { button: { [k]: { mac: m } } }); }
  else if ((el = at('[data-btnscene]'))) { haptic(); const [k, id] = el.dataset.btnscene.split('|'); saveCfg(r1, { button: { [k]: { scene: id } } }); }
  else if ((el = at('[data-btntest]'))) {
    haptic(); try { Object.assign(dev(r1), await api(`api/button/${r1}/${el.dataset.btntest}`, { method: 'POST' })); toast(tr('Ausgeführt')); load(); } catch (x) { toast(x.message, true); }
  } else if ((el = at('[data-mtarget]'))) {
    haptic(); const m = el.dataset.mtarget, t = dev(r1).cfg.motion.targets;
    saveCfg(r1, { motion: { targets: t.includes(m) ? t.filter((x) => x !== m) : [...t, m] } });
  } else if ((el = at('[data-swatch]'))) {
    haptic(); const [h, sat] = el.dataset.swatch.split('|').map(Number); setLight(r1, { h, s: sat, v: dev(r1).cfg.light.v });
  } else if ((el = at('[data-sgday]'))) {
    // a day added here leaves its old group; removed, it has no times until another group takes it
    haptic(); const [gid, n] = el.dataset.sgday.split('|'), k = Number(n);
    updEntries(r1, (es) => { const g = es.find((e) => e.id === gid), add = !g.days.includes(k); es.forEach((e) => { e.days = e.days.filter((x) => x !== k); }); if (add) g.days.push(k); return es; });
  } else if ((el = at('[data-sbi]'))) {
    haptic(); const [gid, i] = el.dataset.sbi.split('|'); updGroup(r1, gid, (g) => { g.blocks[i].idle = !g.blocks[i].idle; });
  } else if ((el = at('[data-sbx]'))) {
    haptic(); const [gid, i] = el.dataset.sbx.split('|'); updGroup(r1, gid, (g) => { g.blocks.splice(Number(i), 1); });
  } else if ((el = at('[data-sbadd]'))) {
    // the next on-time starts an hour after the last one ends
    haptic(); const gid = el.dataset.sbadd;
    updGroup(r1, gid, (g) => { const last = g.blocks[g.blocks.length - 1], h = last ? Math.min(21, Math.floor(hmH(last.end)) + 1) : 7, t = (x) => `${String(x).padStart(2, '0')}:00`; g.blocks.push({ start: t(h), end: t(h + 2), idle: false }); });
  } else if (at('[data-sgadd]')) {
    // new group for the days that have no times yet
    haptic(); const used = dev(r1).cfg.schedule.entries.flatMap((e) => e.days), id = `s${Date.now().toString(36)}`;
    updEntries(r1, (es) => [...es.filter((e) => e.days.length), { id, days: WD().map(([n]) => n).filter((n) => !used.includes(n)), blocks: [{ start: '07:00', end: '22:00', idle: false }], below: 25, mins: 10 }]);
    go(`dev/${r1}/schedule/${id}`);
  } else if ((el = at('[data-sgdel]'))) {
    haptic(); const gid = el.dataset.sgdel; updEntries(r1, (es) => es.filter((e) => e.id !== gid)); back(`dev/${r1}/schedule`);
  }
  else if ((el = at('[data-dayshift]'))) { view.day = shiftPeriod(view.period, view.day, Number(el.dataset.dayshift)); if (view.day > S.today) view.day = S.today; render(); }
  else if (at('[data-devsel]')) { haptic(); openDevPick(); }
  else if (at('[data-menu]')) { haptic(); openMenu(); }
  else if ((el = at('[data-run]'))) {
    el.disabled = true; haptic();
    try { const r = await api(`api/scenes/${el.dataset.run}/run`, { method: 'POST' }); await load(); toast(r.ok ? tr('Szene ausgeführt') : tr('Nicht erreicht: {0}', r.errors.join(', ')), !r.ok); } catch (x) { toast(x.message, true); }
    el.disabled = false;
  } else if (at('[data-newscene]')) {
    const s = { id: `s${Date.now().toString(36)}`, name: tr('Szene {0}', S.scenes.length + 1), actions: {} };
    S.scenes.push(s); await saveScenes(); go(`scene/${s.id}`);
  } else if ((el = at('[data-sact]'))) {
    const [id, mac, a] = el.dataset.sact.split('|'), s = S.scenes.find((x) => x.id === id);
    if (a) s.actions[mac] = a; else delete s.actions[mac];
    saveScenes();
  } else if ((el = at('[data-delscene]'))) {
    if (!confirm(tr('Szene löschen?'))) return;
    S.scenes = S.scenes.filter((x) => x.id !== el.dataset.delscene); await saveScenes(); back('scenes');
  } else if ((el = at('[data-remove]'))) {
    const d = dev(el.dataset.remove);
    if (!confirm(tr('{0} aus der App entfernen? Der Verlauf bleibt gespeichert; meldet sich die Steckdose wieder, erscheint sie neu.', d.name))) return;
    try { await api(`api/devices/${d.mac}`, { method: 'DELETE' }); await load(); back('home'); } catch (x) { toast(x.message, true); }
  } else if (at('[data-push]')) { try { await pushEnable(); toast(tr('Mitteilungen sind an')); await load(); } catch (x) { toast(x.message, true); } }
  else if (at('[data-geo]')) {
    haptic();
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = Math.round(pos.coords.latitude * 1e4) / 1e4, lon = Math.round(pos.coords.longitude * 1e4) / 1e4;
      try { S.settings = await api('api/settings', { method: 'PUT', body: JSON.stringify({ settings: { lat, lon } }) }); toast(tr('Standort übernommen')); load(); } catch (x) { toast(x.message, true); }
    }, (err) => toast(err.code === 1 ? tr('Standort nicht freigegeben (in den Einstellungen des Handys änderbar)') : tr('Standort nicht verfügbar'), true), { timeout: 15000, maximumAge: 600000 });
  }
  else if (at('[data-pushtest]')) { try { await api('api/push/test', { method: 'POST' }); toast(tr('Test gesendet')); } catch (x) { toast(x.message, true); } }
});
// Inputs: save as soon as a field is done
// Time and date fields: iOS reports a change while the wheel is still turning; saving then (and blurring) closed the
// picker. So they only count once the field loses focus; while one is open the page doesn't redraw either.
const pickerField = (t) => t?.matches?.('input[type="time"], input[type="date"]');
app.addEventListener('change', (e) => { if (pickerField(e.target) && document.activeElement === e.target) { e.target.dataset.pending = '1'; return; } onChange(e); });
app.addEventListener('focusout', (e) => { const t = e.target; if (pickerField(t) && t.dataset.pending) { delete t.dataset.pending; onChange({ target: t }); } });
async function onChange(e) {
  const t = e.target, [, r1] = route();
  if (t.dataset.in) {
    const v = t.type === 'number' ? Number(t.value) : t.value.trim();
    t.blur(); saveCfg(r1, patchOf(t.dataset.in, v));
  } else if (t.dataset.roomnew && t.value.trim()) {
    t.blur(); saveCfg(r1, { room: t.value.trim().slice(0, 40) }); setTimeout(() => back(`dev/${r1}/settings`), 180);
  } else if (t.dataset.place && t.value.trim() && t.value.trim() !== S.settings.place) {
    t.blur();
    try { S.settings = await api('api/settings', { method: 'PUT', body: JSON.stringify({ settings: { place: t.value.trim() } }) }); render(); toast(tr('Gefunden: {0}', S.settings.place)); load(); }
    catch (x) { toast(x.message, true); render(); }
  } else if (t.dataset.bright) {
    const d = dev(r1); setLight(r1, { ...d.cfg.light, v: Number(t.value) });
  } else if (t.dataset.stpin) {
    const v = stpParse(t.dataset.list, t.value); t.blur(); if (v == null) toast(tr('Bitte eine Zahl eingeben'), true); else stpSave(t.dataset.stpin, v);
  } else if (t.dataset.sbt) {
    const [gid, i, k] = t.dataset.sbt.split('|'); t.blur(); if (/^\d{2}:\d{2}$/.test(t.value)) updGroup(r1, gid, (g) => { g.blocks[i][k] = t.value; });
  } else if (t.dataset.ain) {
    const v = t.type === 'number' ? Number(t.value) : t.value.trim(); t.blur(); updAct(r1, route()[3], { [t.dataset.ain]: v });
  } else if (t.dataset.expIn) { exp[t.dataset.expIn] = t.value; if (exp.from > exp.to) [exp.from, exp.to] = [exp.to, exp.from]; t.blur(); render(); }
  else if (t.dataset.sat) { const s = S.scenes.find((x) => x.id === t.dataset.sat); s.time.at = t.value; t.blur(); saveScenes(); }
  else if (t.dataset.setting) {
    try { S.settings = await api('api/settings', { method: 'PUT', body: JSON.stringify({ settings: { [t.dataset.setting]: Number(t.value) } }) }); t.blur(); render(); toast(tr('Gespeichert')); } catch (x) { toast(x.message, true); }
  } else if (t.dataset.sceneName) {
    S.scenes.find((x) => x.id === t.dataset.sceneName).name = t.value.trim() || tr('Szene'); t.blur(); saveScenes();
  } else if (t.id === 'addip' && t.value.trim()) {
    t.disabled = true;
    try { const d = await api('api/devices', { method: 'POST', body: JSON.stringify({ ip: t.value.trim() }) }); await load(); toast(tr('{0} hinzugefügt', d.name)); } catch (x) { toast(x.message, true); }
    t.disabled = false;
  }
}
app.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('input')) e.target.blur();
  // Keyboard: Space toggles the plug, Enter opens it (like tapping)
  const sw = e.target.closest?.('[data-swipe]');
  if (sw && e.key === ' ' && !sw.dataset.inpage) { e.preventDefault(); tapFlip(sw, dev(sw.dataset.swipe)); }
});

// ---------- Push ----------
const u8 = (b64) => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4)), (c) => c.charCodeAt(0));
async function pushEnable() {
  const reg = await navigator.serviceWorker.ready;
  if (await Notification.requestPermission() !== 'granted') throw new Error(tr('Mitteilungen wurden nicht erlaubt (in den Einstellungen des Handys änderbar).'));
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
