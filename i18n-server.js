// English texts for everything the server writes. Key: the German source text as used in tr()/trText() in server.js.
// {0}, {1} … are placeholders. EN_PATTERNS translate composed texts, e.g. stored history entries.
// In EN_PATTERNS templates, {0} inserts capture group 1 as is, {t0} inserts it translated as well (trText).
export const EN = {
  // ----- Generated on the fly (tr) -----
  // default device names (+ last 4 characters of the MAC)
  'Steckdose': 'Plug',
  'Lampe': 'Bulb',
  'Taster': 'Button',
  'Bewegungsmelder': 'Motion sensor',
  'Typ {0}': 'Type {0}',
  // status line of a device
  'gerade eben': 'just now',
  'vor {0} min': '{0} min ago',
  'um {0}': 'at {0}',
  'am {0}': 'on {0}',
  'zuletzt {0} gedrückt': 'last pressed {0}',
  'zuletzt aktiv {0}': 'last active {0}',
  'meldet sich nach dem ersten Drücken': 'reports in after the first press',
  'Offline seit {0}': 'Offline since {0}',
  'Wird verbunden …': 'Connecting …',
  'Bewegung': 'Motion',
  'Bewegung {0}': 'Motion {0}',
  'keine Bewegung': 'no motion',
  'Unter {0} W · aus in {1} min': 'Below {0} W · off in {1} min',
  '{0} · wartet, du arbeitest noch': "{0} · waiting, you're still working",
  '{0} · Timer, aus um {1}': '{0} · timer, off at {1}',
  'Aus seit {0} · {1}': 'Off since {0} · {1}',
  'Aus · Ferien ab {0}': 'Off · holiday from {0}',
  'Aus': 'Off',
  // holiday slots of today
  'morgens': 'morning',
  'abends': 'evening',
  // chart labels Monday … Sunday
  'Mo': 'Mo', 'Di': 'Tu', 'Mi': 'We', 'Do': 'Th', 'Fr': 'Fr', 'Sa': 'Sa', 'So': 'Su',
  // CSV export
  'Zeit;Gerät;Leistung W;Energie Wh': 'Time;Device;Power W;Energy Wh',
  '{0};Gerät;Leistung Ø W;Energie Wh': '{0};Device;Avg power W;Energy Wh',
  'Zeit': 'Time',
  'Tag': 'Day',
  'alle': 'all',
  'steckdosen': 'plugs',
  // scenes
  'Alles aus': 'All off',
  'Szene': 'Scene',
  // error messages
  'Unbekanntes Gerät.': 'Unknown device.',
  'unbekanntes Gerät': 'unknown device',
  'Unbekannte Szene.': 'Unknown scene.',
  '{0} lässt sich nicht schalten.': '{0} cannot be switched.',
  '{0} ist nicht erreichbar.': '{0} is not reachable.',
  'Tastensperre ist an.': 'Key lock is on.',
  'Keine Lampe.': 'Not a bulb.',
  'Kein Taster.': 'Not a button.',
  'Bitte eine IP-Adresse angeben, z. B. 192.168.0.42.': 'Please enter an IP address, e.g. 192.168.0.42.',
  'Unter {0} antwortet nichts.': 'Nothing responds at {0}.',
  'Unter dieser Adresse antwortet kein myStrom-Gerät.': 'No myStrom device responds at this address.',
  'mac und day (JJJJ-MM-TT) angeben': 'Specify mac and day (YYYY-MM-DD)',
  'period (week|month|year), ref (JJJJ-MM-TT) und mac angeben': 'Specify period (week|month|year), ref (YYYY-MM-DD) and mac',
  'mac, period (day|week|month) und ref (JJJJ-MM-TT) angeben': 'Specify mac, period (day|week|month) and ref (YYYY-MM-DD)',
  'from und to als JJJJ-MM-TT und bekannte Geräte angeben': 'Specify from and to as YYYY-MM-DD and known devices',
  'Ort „{0}“ nicht gefunden. Versuche einen anderen Ortsnamen oder Koordinaten wie 47.46, 8.19.': 'Place “{0}” not found. Try another place name or coordinates such as 47.46, 8.19.',
  'Die Ortssuche antwortet nicht.': 'The location search is not responding.',
  'Ungültiges Abo.': 'Invalid subscription.',
  'Anfrage zu gross.': 'Request too large.',
  'Nicht gefunden': 'Not found',
  // test notification
  'Test von myStrom': 'Test from myStrom',
  'So sehen Alarme aus. Antippen öffnet die App.': 'This is what alarms look like. Tap to open the app.',

  // ----- Stored in the history (German in the DB, translated when read via trText) -----
  'von Hand in der App': 'manually in the app',
  'am Gerät oder in einer anderen App': 'on the device or in another app',
  'Zeitplan': 'schedule',
  'nicht mehr benutzt': 'no longer in use',
  'Sonnenuntergang': 'sunset',
  'Sonnenaufgang': 'sunrise',
  'Ferien morgens': 'holiday, morning',
  'Ferien abends': 'holiday, evening',
  'Standby, Strom gespart': 'standby, power saved',
  'nach Stromsparen wieder an': 'back on after power saving',
  'morgens wieder an': 'back on in the morning', // older versions
  'Tasten-Aktionen übertragen': 'Button actions transferred',
  'Die Steckdose misst eine ungewöhnlich hohe Temperatur.': 'The plug is measuring an unusually high temperature.',
};

// Button press labels as they appear in stored texts ("einmal gedrückt: Stehlampe an")
const PRESS = [['einmal gedrückt', 'pressed once'], ['zweimal gedrückt', 'pressed twice'], ['lang gedrückt', 'long press'], ['berührt', 'touched']];
const NUM = '-?\\d+(?:\\.\\d+)?';
const POWER = `${NUM} k?W`; // as written by pw(): "95 W" or "1.25 kW"
const COND = `(?:unter|über) ${NUM} W(?: seit ${NUM} min)?`; // Power Action condition
const P = (src, en) => [new RegExp(`^${src}$`), en];

// Composed stored texts. Specific patterns first, generic ones (e.g. "über …", "Szene …") last.
export const EN_PATTERNS = [
  // alarms: stored as "title. body"
  P('(.+) wurde eingeschaltet\\. (.+)', '{0} was switched on ({t1})'),
  P('(.+) wurde eingeschaltet', '{0} was switched on'),
  P('(.+) ist wieder erreichbar', '{0} is reachable again'),
  P('(.+) ist offline\\. Seit (\\d{1,2}:\\d{2}) keine Antwort von (.+)\\.', '{0} is offline. No response from {2} since {1}.'),
  P('(.+) ist offline', '{0} is offline'),
  P('Seit (\\d{1,2}:\\d{2}) keine Antwort von (.+)\\.', 'No response from {1} since {0}.'),
  P(`(.+) ist (${NUM}) °C warm\\. Die Steckdose misst eine ungewöhnlich hohe Temperatur\\.`, '{0} is at {1} °C. The plug is measuring an unusually high temperature.'),
  P(`(.+) ist (${NUM}) °C warm`, '{0} is at {1} °C'),
  P(`(.+) zieht (${POWER})\\. Sonst höchstens etwa (${POWER})\\.`, '{0} is drawing {1}. Usually at most about {2}.'),
  P(`(.+) zieht (${POWER})`, '{0} is drawing {1}'),
  P(`Sonst höchstens etwa (${POWER})\\.`, 'Usually at most about {0}.'),
  // Power Actions (notification "title. Leistung …." and switching reasons)
  P(`(.+)\\. Leistung (${COND})\\.`, '{t0}. Power {t1}.'),
  P(`Leistung (${COND})\\.`, 'Power {t0}.'),
  P(`Power Action: (${COND})`, 'Power Action: {t0}'),
  P(`Power Action von (.+) \\((${COND})\\)`, 'Power Action from {0} ({t1})'),
  P(`unter (${NUM}) W seit (${NUM}) min`, 'below {0} W for {1} min'),
  P(`unter (${NUM}) W`, 'below {0} W'),
  P(`über (${NUM}) W seit (${NUM}) min`, 'above {0} W for {1} min'),
  P(`über (${NUM}) W`, 'above {0} W'),
  P('(.+): fertig', '{0}: done'),
  P(`(.+): über (${NUM}) W`, '{0}: above {1} W'),
  // buttons
  ...PRESS.flatMap(([de, en]) => [P(`${de}: Szene`, `${en}: scene`), P(`${de}: (.+) an`, `${en}: {0} on`), P(`${de}: (.+) aus`, `${en}: {0} off`)]),
  // rules
  P('keine Bewegung mehr \\((.+)\\)', 'no more motion ({0})'),
  P('Bewegung \\((.+)\\)', 'motion ({0})'),
  P(`zu warm \\((${NUM}) °C\\)`, 'too warm ({0} °C)'),
  P(`Timer (${NUM}) min abgelaufen`, 'timer of {0} min expired'),
  // discovery
  P('Gefunden unter (.+)', 'Found at {0}'),
  P('Neue Adresse (.+)', 'New address {0}'),
  // generic, keep last
  P('Szene (.+)', 'scene {0}'),
  P('über (.+)', 'via {0}'),
];
