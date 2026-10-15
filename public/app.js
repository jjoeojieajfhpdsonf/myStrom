// Steckdosen – Oberfläche im Stil der myStrom-App, mit allen Funktionen (auch PLUS, PRO, DATA PRO, HOME GUARD) frei.
// Bedienung: Kachel wischen schaltet, tippen öffnet das Gerät. Änderungen speichern sofort, jedes Schalten lässt sich rückgängig machen.
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
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  toggle: (on) => `<svg viewBox="0 0 64 40" width="64" height="40" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="58" height="30" rx="15"/><circle cx="${on ? 46 : 18}" cy="20" r="10" fill="${on ? '#fff' : '#777'}" stroke="none"/></svg>`,
};

// Funktionen pro Steckdose: Schlüssel = Block in den Einstellungen
const FEAT = [
  ['schedule', 'clock', 'Zeitplan'], ['idle', 'idle', 'Nachts aus'], ['vacation', 'beach', 'Ferien'],
  ['sun', 'sun', 'Sonne'], ['timer', 'timer', 'Timer'], ['saver', 'leaf', 'Stromsparen'],
  ['temp', 'temp', 'Temperatur'], ['alarms', 'bell', 'Alarme'], ['eval', 'evals', 'Auswertung'],
];
const FTITLE = { schedule: 'Zeitplan', idle: 'Nachts aus, wenn nicht benutzt', vacation: 'Ferienmodus', sun: 'Sonnenauf- und -untergang', timer: 'Timer', saver: 'Stromsparen',
  temp: 'Temperatur', alarms: 'Alarme', eval: 'Auswertung', settings: 'Einstellungen', tech: 'Technische Details' };
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
    case 'schedule': return [c.schedule.on, `${c.schedule.start}–${c.schedule.end} · ${daysText(c.schedule.days)}`];
    case 'idle': return [c.idle.on, `ab ${c.idle.from}, unter ${c.idle.below} W`];
    case 'vacation': return [c.vacation.on, `${dShort(c.vacation.from)}–${dShort(c.vacation.to)}`];
    case 'sun': return [c.sun.on || c.sun.off, [c.sun.on && 'abends an', c.sun.off && 'morgens aus'].filter(Boolean).join(', ')];
    case 'timer': return [c.timer.on, `nach ${c.timer.mins < 60 ? `${c.timer.mins} min` : `${c.timer.mins / 60} h`} aus`];
    case 'saver': return [c.saver.on, `unter ${c.saver.below} W aus`];
    case 'temp': return [c.temp.on, `über ${c.temp.max} °C aus`];
    case 'alarms': { const n = Object.values(c.alarms).filter(Boolean).length; return [n > 0, `${n} von 4 an`]; }
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

// ---------- Schalten mit "Rückgängig" ----------
let toastT;
function toast(text, err = false, undo = null) {
  const t = $('#toast');
  t.className = err ? 'err' : '';
  t.innerHTML = `<span>${esc(text)}</span>${undo ? '<button type="button" id="undo">Rückgängig</button>' : ''}`;
  t.hidden = false;
  if (undo) $('#undo').onclick = () => { t.hidden = true; undo(); };
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, undo ? 5000 : 3000);
}
async function switchDev(mac, on, quiet = false) {
  const d = dev(mac);
  if (d.cfg.lock) { toast(`${d.name}: Tastensperre ist an`); return false; }
  if (!d.online) { toast(`${d.name} ist nicht erreichbar`, true); return false; }
  const before = { relay: d.relay, w: d.w, status: d.status };
  d.relay = on; d.status = on ? 'Eingeschaltet' : 'Aus · von Hand'; if (!on) d.w = 0; render();
  try {
    Object.assign(d, await api(`api/devices/${mac}/relay`, { method: 'POST', body: JSON.stringify({ on }) })); render();
    if (!quiet) toast(`${d.name} ${on ? 'an' : 'aus'}`, false, () => switchDev(mac, !on, true));
    return true;
  } catch (e) { Object.assign(d, before); render(); toast(e.message, true); return false; }
}
const shake = (el) => el?.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-3px)' }, { transform: 'none' }], 260);

// ---------- Navigation über den Hash (#dev/MAC/idle), damit Zurück und Mitteilungen funktionieren ----------
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
  if (stack.length > 1 && stack[stack.length - 2] === parent) { history.back(); return; } // popstate erledigt den Rest
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
// Seitenwechsel: neu aufbauen, Scrollposition merken, kurze Schiebe-Animation wie unter iOS
function show() {
  render(true);
  scrollTo(0, dir < 0 ? scrolls[cur()] || 0 : 0);
  if (dir && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    app.animate([{ transform: `translateX(${dir * 16}px)`, opacity: 0.5 }, { transform: 'none', opacity: 1 }], { duration: 200, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  dir = 0;
}
const HD = (title, backTo, right = '<span></span>', sub = '') => `<header class="hd"><button type="button" class="ic" data-back="${backTo}" aria-label="Zurück">‹</button><b>${title}${sub ? `<small>${sub}</small>` : ''}</b>${right}</header>`;

// ---------- Bausteine ----------
const sw = (path, on, label) => `<button type="button" class="sw" data-sw="${path}" aria-pressed="${on}" aria-label="${esc(label)}"></button>`;
const row = (label, right, sub = '', attrs = '') => `<${attrs ? `button type="button" ${attrs}` : 'div'} class="row"><span class="tx"><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</span>${right}</${attrs ? 'button' : 'div'}>`;
const inp = (path, type, value, extra = '') => `<input type="${type}" data-in="${path}" value="${esc(value)}" ${extra}>`;
const lrow = (label, input, sub = '') => `<label class="row"><span class="tx"><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</span>${input}</label>`;
const master = (d, k, label = 'Aktiv') => `<div class="row master"><span class="tx"><b>${label}</b></span>${sw(`${k}.on`, d.cfg[k].on, label)}</div>`;
const val = (t) => `<span class="val">${t}</span>`;
const chev = (t = '') => `<span class="val">${t} ›</span>`;

// Statuszeile unter dem Namen, ohne die Leistung, die schon gross darüber steht
const subOf = (d) => (!d.online ? d.status : d.relay ? d.status.replace(/^[\d.,]+ k?W( · )?/, '') : d.status === 'Aus' ? '' : d.status.replace(/^Aus · /, ''));

// ---------- Startseite ----------
function homeHTML() {
  const hint = !store.get('swiped') && S.devices.length ? '<p class="hint">Kachel nach links oder rechts wischen schaltet · antippen öffnet die Funktionen</p>' : '';
  const tile = (h, icon, label, sub = '') => `<button type="button" class="tile" data-go="${h}"><span class="ico">${icon}</span><span class="lb">${label}</span>${sub ? `<span class="sub">${sub}</span>` : ''}</button>`;
  const guardOn = S.devices.filter((d) => d.cfg.vacation.on).length;
  const rulesOn = S.devices.reduce((a, d) => a + FEAT.filter(([k]) => k !== 'eval' && k !== 'alarms' && featInfo(d, k)[0]).length, 0);
  const total = S.devices.reduce((a, d) => a + d.w, 0);
  return `<header class="hd"><span></span><b>myStrom</b><button type="button" class="ic" data-go="more" aria-label="Mehr">${I.menu}</button></header>
    <div class="grid">
      ${S.devices.map((d) => `<div class="tile dev ${d.relay ? 'on' : ''} ${d.online ? '' : 'off-line'}" data-mac="${d.mac}">
        <button type="button" class="hit" data-swipe="${d.mac}" aria-label="${esc(d.name)}, ${d.relay ? 'an' : 'aus'}. Öffnen; Wischen oder Leertaste schaltet"></button>
        ${d.temp != null ? `<span class="tmp">${d.temp.toFixed(1)}°C</span>` : ''}${d.cfg.lock ? '<span class="lock" title="Tastensperre">🔒</span>' : ''}
        <span class="ico">${I.plug}</span><span class="lb">${d.relay ? `${pw(d.w)}<br>` : ''}${esc(d.name)}</span>
        ${subOf(d) ? `<span class="sub">${esc(subOf(d))}</span>` : ''}
        <span class="more" aria-hidden="true">›</span></div>`).join('')}
      ${tile('energy', I.bolt, `${pw(total)}<br>Verbrauch`)}
      ${tile('scenes', I.scenes, 'Szenen')}
      ${tile('guard', I.guard, 'Home Guard', guardOn ? `${guardOn} in Ferien` : '')}
      ${tile('rules', I.rules, 'Regeln', rulesOn ? `${rulesOn} aktiv` : '')}
      ${tile('alarms', I.bell, 'Alarme')}
      ${S.devices.length ? '' : tile('more', I.plug, 'Steckdose hinzufügen')}
    </div>${hint}`;
}

// ---------- Gerät ----------
function deviceHTML(d) {
  return HD(esc(d.name), 'home', `<button type="button" class="ic" data-go="dev/${d.mac}/settings" aria-label="Einstellungen">${I.gear}</button>`, esc(d.cfg.room))
    + `<div class="grid">
      <div class="tile dev ${d.relay ? 'on' : ''} ${d.online ? '' : 'off-line'}"><button type="button" class="hit" data-swipe="${d.mac}" data-inpage="1" aria-label="${esc(d.name)} ${d.relay ? 'ausschalten' : 'einschalten'}"></button>
        <span class="ico">${I.toggle(d.relay)}</span><span class="lb">${d.relay ? `${pw(d.w)} · An` : 'Aus'}</span>${subOf(d) ? `<span class="sub">${esc(subOf(d))}</span>` : ''}</div>
      ${FEAT.map(([k, ic, l]) => { const [on, txt] = featInfo(d, k); return `<button type="button" class="tile feat ${on ? 'act' : ''}" data-go="dev/${d.mac}/${k}"><span class="ico">${I[ic]}</span><span class="lb">${l}</span><span class="sub">${on || k === 'eval' ? esc(txt) : 'aus'}</span></button>`; }).join('')}
    </div>`;
}
function featureHTML(d, k) {
  const c = d.cfg, back = k === 'tech' ? `dev/${d.mac}/settings` : `dev/${d.mac}`;
  const head = HD(FTITLE[k], back, '<span></span>', esc(d.name));
  const dim = (on) => (on ? 'ls' : 'ls dim');
  switch (k) {
    case 'schedule': return head + `<p class="intro">Schaltet jeden gewählten Tag zur selben Zeit ein und aus. Dazwischen kannst du jederzeit von Hand schalten.</p>
      <div class="${dim(c.schedule.on)}">${master(d, 'schedule')}${lrow('Ein um', inp('schedule.start', 'time', c.schedule.start))}${lrow('Aus um', inp('schedule.end', 'time', c.schedule.end))}</div>
      <p class="sec">Tage</p><div class="chips days">${WD.map(([n, l]) => `<button type="button" class="chip" data-day="${n}" aria-pressed="${c.schedule.days.includes(n)}">${l}</button>`).join('')}</div>`;
    case 'idle': return head + `<p class="intro">Im Zeitfenster schaltet die Steckdose ab, sobald so wenig Strom fliesst, dass niemand mehr dran arbeitet. Arbeitest du noch (PC und Bildschirm ziehen mehr), wartet sie.</p>
      <div class="${dim(c.idle.on)}">${master(d, 'idle')}${lrow('Ab', inp('idle.from', 'time', c.idle.from))}${lrow('Bis', inp('idle.to', 'time', c.idle.to))}
        ${lrow('Aus unter', inp('idle.below', 'number', c.idle.below, 'min="1" max="3000" inputmode="numeric"'), 'Watt; jetzt ' + pw(d.w))}
        ${lrow('Wenn so lange', inp('idle.mins', 'number', c.idle.mins, 'min="1" max="240" inputmode="numeric"'), 'Minuten am Stück')}
        <div class="row"><span class="tx"><b>Um ${c.idle.to} wieder an</b><span>nur wenn diese Regel ausgeschaltet hat</span></span>${sw('idle.backOn', c.idle.backOn, 'Morgens wieder an')}</div></div>
      ${c.idle.on ? `<p class="note"><b>Jetzt:</b> ${esc(d.status)}</p>` : ''}
      <p class="note">Tipp: Schau abends unter Auswertung, wie viel der Schreibtisch im Standby zieht, und setze die Schwelle etwas darüber.</p>`;
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
        ${lrow('Verschieben', inp('sun.onOffset', 'number', c.sun.onOffset, 'min="-180" max="180" step="5"'), 'Minuten, minus = früher')}</div>
      <div class="${dim(c.sun.off)}"><div class="row master"><span class="tx"><b>Bei Sonnenaufgang aus</b></span>${sw('sun.off', c.sun.off, 'Bei Sonnenaufgang aus')}</div>
        ${lrow('Verschieben', inp('sun.offOffset', 'number', c.sun.offOffset, 'min="-180" max="180" step="5"'), 'Minuten, minus = früher')}</div>`;
    case 'timer': return head + `<p class="intro">Nach jedem Einschalten bleibt ${esc(d.name)} so lange an und geht dann von selbst aus, egal ob in der App oder am Gerät eingeschaltet.</p>
      <div class="${dim(c.timer.on)}">${master(d, 'timer')}</div>
      <div class="chips">${[15, 30, 60, 120, 240].map((m) => `<button type="button" class="chip" data-set="timer.mins" data-v="${m}" aria-pressed="${c.timer.mins === m}">${m < 60 ? `${m} min` : `${m / 60} h`}</button>`).join('')}</div>
      <div class="ls">${lrow('Eigene Dauer', inp('timer.mins', 'number', c.timer.mins, 'min="1" max="1440" inputmode="numeric"'), 'Minuten')}</div>`;
    case 'saver': {
      const s = c.saver;
      return head + `<p class="intro">Hängt das Gerät nur im Standby, schaltet die Steckdose es ab. Ist sie aus, fliesst kein Strom mehr, darum kann sie nicht selbst merken, wann du das Gerät wieder brauchst. Lege fest, wann es wieder angeht.</p>
      <div class="${dim(s.on)}">${master(d, 'saver')}${lrow('Standby unter', inp('saver.below', 'number', s.below, 'min="0" max="3000" step="0.5"'), 'Watt; jetzt ' + pw(d.w))}
        ${lrow('Länger als', inp('saver.mins', 'number', s.mins, 'min="1" max="1440"'), 'Minuten')}</div>
      <p class="sec">Wieder an</p>
      <div class="chips">${[['hand', 'Von Hand'], ['time', 'Um eine Uhrzeit'], ['after', 'Nach Stunden']].map(([v, l]) => `<button type="button" class="chip" data-set="saver.back" data-v="${v}" aria-pressed="${s.back === v}">${l}</button>`).join('')}</div>
      ${s.back === 'time' ? `<div class="ls">${lrow('Um', inp('saver.at', 'time', s.at))}</div>` : s.back === 'after' ? `<div class="ls">${lrow('Nach', inp('saver.hours', 'number', s.hours, 'min="1" max="48"'), 'Stunden')}</div>` : '<p class="note">Erst wieder an, wenn du sie in der App, mit einer Szene oder am Knopf der Steckdose einschaltest.</p>'}`;
    }
    case 'temp': return head + `<p class="intro">Die Steckdose misst ihre eigene Temperatur, jetzt ${d.temp != null ? `${d.temp.toFixed(1)} °C` : '–'}. Wird sie zu warm, schaltet sie ab.</p>
      <div class="${dim(c.temp.on)}">${master(d, 'temp', 'Bei Hitze ausschalten')}${lrow('Aus über', inp('temp.max', 'number', c.temp.max, 'min="20" max="90"'), '°C')}</div>`;
    case 'alarms': return head + `<p class="intro">Mitteilung aufs Handy, wenn bei ${esc(d.name)} etwas passiert. ${S.pushSubs ? '' : '<a href="#alarms">Mitteilungen zuerst erlauben ›</a>'}</p>
      <div class="ls">${[['offline', 'Offline', 'keine Antwort seit 3 Minuten'], ['unusual', 'Ungewöhnlicher Verbrauch', 'deutlich mehr als sonst'], ['switchedOn', 'Eingeschaltet', 'am Gerät oder von einer Regel'], ['hot', 'Zu warm', `über ${c.temp.on ? c.temp.max : 45} °C`]]
        .map(([key, l, sub]) => `<div class="row"><span class="tx"><b>${l}</b><span>${sub}</span></span>${sw(`alarms.${key}`, c.alarms[key], l)}</div>`).join('')}</div>`;
    case 'eval': return head + chartHTML(d.mac, false) + totalsHTML(d.mac);
    case 'settings': return HD('Einstellungen', `dev/${d.mac}`) + `<div class="hero">${I.plug}<b>${esc(d.name)}</b></div>
      <div class="ls">${lrow('Name', `<input type="text" data-in="name" value="${esc(d.cfg.name)}" placeholder="${esc(d.name)}" maxlength="40">`)}
        ${lrow('Raum', `<input type="text" data-in="room" value="${esc(d.cfg.room)}" placeholder="z. B. Büro" maxlength="40">`)}
        ${lrow('Temperatur-Korrektur', inp('tcorr', 'number', c.tcorr, 'step="0.5" min="-10" max="10"'), '°C, wird zur Messung addiert')}
        ${row('Technische Details', chev(), '', `data-go="dev/${d.mac}/tech"`)}</div>
      <div class="ls"><div class="row"><span class="tx"><b>Solar / Stromproduktion</b><span>misst Produktion statt Verbrauch</span></span>${sw('solar', c.solar, 'Solar')}</div>
        <div class="row"><span class="tx"><b>Tastensperre</b><span>in der App nicht mehr schaltbar</span></span>${sw('lock', c.lock, 'Tastensperre')}</div></div>
      <button type="button" class="btn danger" data-remove="${d.mac}">Steckdose entfernen</button>`;
    case 'tech': return head + `<div class="ls">${[['Typ', d.typeName], ['Firmware', d.fw || '–'], ['IP-Adresse', d.ip], ['MAC', d.mac.match(/../g).join(':')], ['Verbindung', d.online ? 'erreichbar' : 'offline'],
      ['Temperatur gemessen', d.tempRaw != null ? `${d.tempRaw.toFixed(1)} °C` : '–'], ['Cloud', 'nicht nötig, alles lokal']].map(([l, v]) => row(l, val(esc(v)))).join('')}</div>`;
    default: return '';
  }
}

// ---------- Verbrauch: Diagramm wie in myStrom (Watt, Max-Linie, Uhrzeiten), Gerät und Tag wählbar ----------
const view = { mac: 'all', day: null };
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
  const m = pick ? view.mac : mac, d = m === 'all' ? null : dev(m);
  const now = m === 'all' ? S.devices.reduce((a, x) => a + x.w, 0) : d.w, [v, u] = pwN(now);
  return `<div class="big"><b>${v}<small> ${u}</small></b><span>Verbrauch jetzt</span></div>
    <div class="nav"><button type="button" class="devsel" ${pick ? 'data-devsel="1"' : 'disabled'}>${esc(m === 'all' ? 'Alle Geräte' : d.name)}${pick ? ' ▾' : ''}</button>
      <span class="date">${dayLabel(view.day)}</span><button type="button" class="arr" data-dayshift="-1" aria-label="Tag zurück">‹</button><button type="button" class="arr" data-dayshift="1" aria-label="Tag vor" ${view.day >= S.today ? 'disabled' : ''}>›</button></div>
    <div class="chart" data-chart="${m}|${view.day}" data-keep="${m}|${view.day}|${view.day === S.today ? Math.floor(S.now / 60e3) : ''}"><div class="empty">Lädt …</div></div>
    <div class="foot" data-foot data-keep="${m}|${view.day}|${view.day === S.today ? Math.floor(S.now / 60e3) : ''}"><div><b>–<small> kWh</small></b><span>Verbrauch</span></div><i></i><div><b>–<small> CHF</small></b><span>Kosten</span></div></div>`;
}
function totalsHTML(mac) { return `<div class="ls" data-totals="${mac}" data-keep="${mac}|${Math.floor(S.now / 60e3)}"></div>`; }
// Diagramm und Summen nachladen, nachdem die Seite steht
async function fillCharts() {
  for (const el of document.querySelectorAll('[data-chart]:not([data-filled])')) {
    const [m, day] = el.dataset.chart.split('|'), key = el.dataset.keep;
    el.dataset.filled = key;
    try {
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
function energyHTML() {
  const m = view.mac, month = (view.day || S.today).slice(0, 7);
  return HD('Verbrauch', 'home') + chartHTML(m, true) + totalsHTML(m)
    + (m === 'all' && S.devices.length > 1 ? `<p class="sec">Heute je Gerät</p><div class="ls">${S.devices.map((d) => row(esc(d.name), chev(`${kwh(d.todayWh)} kWh`), '', `data-go="dev/${d.mac}/eval"`)).join('')}</div>` : '')
    + `<a class="btn grey" href="api/export.csv?mac=${m}&from=${month}-01&to=${lastOfMonth(month)}" download>${MONTHS[Number(month.slice(5)) - 1]} als CSV exportieren</a>`
    + '<p class="note" style="margin-top:4px">Alle 30 Sekunden gemessen und unbegrenzt bei dir gespeichert.</p>';
}
const lastOfMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; };

// ---------- Szenen ----------
function scenesHTML() {
  return HD('Szenen', 'home') + '<p class="intro">Mehrere Steckdosen mit einem Tipp schalten.</p>'
    + `<div class="ls">${S.scenes.map((s) => { const n = Object.keys(s.actions).length; return `<div class="row"><button type="button" class="tx" data-go="scene/${s.id}" style="text-align:left;flex:1"><b>${esc(s.name)}</b><span>${n ? Object.entries(s.actions).map(([mac, a]) => `${esc(dev(mac)?.name || '?')} ${a === 'on' ? 'an' : 'aus'}`).join(', ') : 'alle Steckdosen aus'}</span></button>
      <button type="button" class="chip" data-run="${s.id}" aria-label="${esc(s.name)} ausführen">Ausführen</button></div>`; }).join('')}</div>
    <button type="button" class="btn ghost" data-newscene="1">Neue Szene</button>`;
}
function sceneHTML(id) {
  const s = S.scenes.find((x) => x.id === id);
  if (!s) return HD('Szene', 'scenes') + '<p class="empty-state">Diese Szene gibt es nicht mehr.</p>';
  return HD('Szene bearbeiten', 'scenes') + `<div class="ls">${lrow('Name', `<input type="text" data-scene-name="${s.id}" value="${esc(s.name)}" maxlength="30">`)}</div>
    <p class="sec">Was passiert</p><div class="ls">${S.devices.map((d) => `<div class="row"><span class="tx"><b>${esc(d.name)}</b></span><span class="chips" style="padding:0;margin:0">
      ${[['', 'Nichts'], ['on', 'An'], ['off', 'Aus']].map(([a, l]) => `<button type="button" class="chip" data-sact="${s.id}|${d.mac}|${a}" aria-pressed="${(s.actions[d.mac] || '') === a}">${l}</button>`).join('')}</span></div>`).join('')}</div>
    <p class="note">Ohne Auswahl schaltet die Szene alle Steckdosen aus.</p>
    <button type="button" class="btn" data-run="${s.id}">Jetzt ausführen</button>
    <button type="button" class="btn danger" data-delscene="${s.id}">Szene löschen</button>`;
}
const saveScenes = async () => { try { S.scenes = await api('api/scenes', { method: 'PUT', body: JSON.stringify({ scenes: S.scenes }) }); render(); } catch (e) { toast(e.message, true); } };

// ---------- Home Guard, Regeln, Alarme, Mehr ----------
function guardHTML() {
  return HD('Home Guard', 'home') + '<p class="intro">Während deiner Ferien schalten die gewählten Steckdosen morgens und abends zu wechselnden Zeiten, damit das Haus bewohnt wirkt.</p>'
    + `<div class="ls">${S.devices.map((d) => { const v = d.cfg.vacation, today = d.vacationToday.map((s) => `${s.key} ${s.start}`).join(', ');
      return `<div class="row"><button type="button" class="tx" data-go="dev/${d.mac}/vacation" style="text-align:left;flex:1"><b>${esc(d.name)} ›</b><span>${v.on ? `${dShort(v.from)}–${dShort(v.to)}${today ? ` · heute ${today}` : ''}` : 'aus'}</span></button>${sw(`${d.mac}:vacation.on`, v.on, `Ferien ${d.name}`)}</div>`; }).join('')}</div>`;
}
function rulesHTML() {
  const items = S.devices.flatMap((d) => FEAT.filter(([k]) => k !== 'eval' && k !== 'alarms').map(([k, ic, l]) => [d, k, l, ...featInfo(d, k)]).filter((x) => x[3]));
  return HD('Regeln', 'home') + (items.length ? `<div class="ls">${items.map(([d, k, l, , txt]) => row(`${esc(d.name)} · ${l}`, chev(), esc(txt), `data-go="dev/${d.mac}/${k}"`)).join('')}</div>`
    : '<p class="empty-state">Noch keine Regel aktiv.<br>Öffne eine Steckdose und schalte z. B. „Nachts aus“ ein.</p>')
    + '<p class="note">Regeln laufen auf deinem Server, auch wenn das Handy aus ist. Uhrzeit-Regeln schalten einmal zur eingestellten Zeit; dazwischen kannst du jederzeit von Hand schalten.</p>';
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
function moreHTML() {
  const s = S.settings;
  return HD('Mehr', 'home') + `<p class="sec">Strom</p><div class="ls">${lrow('Preis pro kWh', `<input type="number" data-setting="price" value="${s.price}" step="0.01" min="0" max="2" inputmode="decimal">`, s.priceFromSolar ? 'CHF, vom Solar-Dashboard' : 'CHF')}</div>
    <p class="sec">Standort</p><div class="ls">${row(esc(s.place || 'Für Sonnenauf- und -untergang'), val(`${Number(s.lat).toFixed(2)}, ${Number(s.lon).toFixed(2)}`), S.sun ? `heute ${S.sun.rise} – ${S.sun.set}` : '')}</div>
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
  for (let i = bc.length; i < ac.length; i++) ac[i].remove();
}
function render(fresh = false) {
  if (!S || swipe) return;
  const [r0, r1, r2] = route(), d = r0 === 'dev' ? dev(r1) : null;
  let html;
  if (r0 === 'dev') html = !d ? `${HD('Steckdose', 'home')}<p class="empty-state">Diese Steckdose gibt es nicht mehr.</p>` : r2 ? featureHTML(d, r2) : deviceHTML(d);
  else html = { energy: energyHTML, scenes: scenesHTML, guard: guardHTML, rules: rulesHTML, alarms: alarmsHTML, more: moreHTML }[r0]?.() ?? (r0 === 'scene' ? sceneHTML(r1) : homeHTML());
  if (fresh || app.dataset.page !== cur()) { app.innerHTML = html; app.dataset.page = cur(); }
  else { const t = app.cloneNode(false); t.innerHTML = html; morph(app, t); }
  fillCharts();
  if (r0 === 'alarms' && !events) api('api/events?n=40').then((e) => { events = e; const el = $('[data-events]'); if (el) el.innerHTML = eventsHTML(); });
}

// ---------- Wischen auf den Kacheln (wie in der myStrom-App) ----------
let swiped = 0;
app.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('[data-swipe]'); if (!b) return;
  swipe = { b, tile: b.closest('.tile'), x: e.clientX, y: e.clientY, dx: 0, id: e.pointerId };
});
// Sicherheitsnetz: bleibt ein Wischen hängen (z. B. Finger verlässt das Fenster), nach 3 s freigeben
setInterval(() => { if (swipe && !document.querySelector(':active')) { swipe.tile.style.transform = ''; swipe = null; } }, 3000);
app.addEventListener('pointermove', (e) => {
  if (!swipe || e.pointerId !== swipe.id) return;
  swipe.dx = e.clientX - swipe.x;
  if (Math.abs(e.clientY - swipe.y) > 24 && Math.abs(swipe.dx) < 16) { swipe.tile.style.transform = ''; swipe = null; return; } // senkrecht = scrollen
  if (Math.abs(swipe.dx) > 8) { swipe.tile.style.transition = 'none'; swipe.tile.style.transform = `translateX(${Math.max(-40, Math.min(40, swipe.dx / 2))}px)`; }
});
const endSwipe = () => {
  if (!swipe) return;
  const s = swipe; swipe = null;
  s.tile.style.transition = ''; s.tile.style.transform = '';
  if (Math.abs(s.dx) >= 44) {
    swiped = Date.now();
    const d = dev(s.b.dataset.swipe);
    if (d.cfg.lock) shake(s.tile); else { store.set('swiped', '1'); switchDev(d.mac, !d.relay); }
  } else if (Math.abs(s.dx) > 8) render();
};
app.addEventListener('pointerup', endSwipe);
app.addEventListener('pointercancel', endSwipe);
addEventListener('pointerup', endSwipe); // auch ausserhalb der App losgelassen

// ---------- Klicks ----------
app.addEventListener('click', async (e) => {
  const at = (s) => e.target.closest(s), [r0, r1] = route();
  let el;
  if ((el = at('[data-swipe]'))) {
    if (Date.now() - swiped < 450) return;
    const d = dev(el.dataset.swipe);
    // Startseite: Tippen öffnet das Gerät. Geräteseite: die grosse Schalter-Kachel schaltet beim Tippen.
    if (el.dataset.inpage) { if (d.cfg.lock) shake(el.closest('.tile')); else switchDev(d.mac, !d.relay); }
    else go(`dev/${d.mac}`);
  } else if ((el = at('[data-back]'))) back(el.dataset.back);
  else if ((el = at('[data-go]'))) go(el.dataset.go);
  else if ((el = at('[data-sw]'))) {
    const on = el.getAttribute('aria-pressed') !== 'true', [mac, p] = el.dataset.sw.includes(':') ? el.dataset.sw.split(':') : [r1, el.dataset.sw];
    el.setAttribute('aria-pressed', on);
    saveCfg(mac, patchOf(p, on));
  } else if ((el = at('[data-set]'))) saveCfg(r1, patchOf(el.dataset.set, /^\d+$/.test(el.dataset.v) ? Number(el.dataset.v) : el.dataset.v));
  else if ((el = at('[data-day]'))) {
    const n = Number(el.dataset.day), days = dev(r1).cfg.schedule.days;
    saveCfg(r1, { schedule: { days: days.includes(n) ? days.filter((x) => x !== n) : [...days, n] } });
  } else if ((el = at('[data-dayshift]'))) { view.day = addDays(view.day, Number(el.dataset.dayshift)); if (view.day > S.today) view.day = S.today; render(); }
  else if (at('[data-devsel]')) { const ids = ['all', ...S.devices.map((d) => d.mac)]; view.mac = ids[(ids.indexOf(view.mac) + 1) % ids.length]; render(); }
  else if ((el = at('[data-run]'))) {
    el.disabled = true;
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
    S.scenes = S.scenes.filter((x) => x.id !== el.dataset.delscene); await saveScenes(); go('scenes');
  } else if ((el = at('[data-remove]'))) {
    const d = dev(el.dataset.remove);
    if (!confirm(`${d.name} aus der App entfernen? Der Verlauf bleibt gespeichert; meldet sich die Steckdose wieder, erscheint sie neu.`)) return;
    try { await api(`api/devices/${d.mac}`, { method: 'DELETE' }); await load(); go('home'); } catch (x) { toast(x.message, true); }
  } else if (at('[data-push]')) { try { await pushEnable(); toast('Mitteilungen sind an'); await load(); } catch (x) { toast(x.message, true); } }
  else if (at('[data-pushtest]')) { try { await api('api/push/test', { method: 'POST' }); toast('Test gesendet'); } catch (x) { toast(x.message, true); } }
});
// Eingaben: speichern, sobald ein Feld fertig ist
app.addEventListener('change', async (e) => {
  const t = e.target, [, r1] = route();
  if (t.dataset.in) {
    const v = t.type === 'number' ? Number(t.value) : t.value.trim();
    t.blur(); saveCfg(r1, patchOf(t.dataset.in, v));
  } else if (t.dataset.setting) {
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
  if (sw && e.key === ' ' && !sw.dataset.inpage) { e.preventDefault(); const d = dev(sw.dataset.swipe); if (d.cfg.lock) shake(sw.closest('.tile')); else switchDev(d.mac, !d.relay); }
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
document.addEventListener('visibilitychange', () => { if (!document.hidden) { events = null; load(); } });
