# Steckdosen (myStrom, lokal)

Eigene App für die myStrom WiFi Switches im Heimnetz, im Aussehen der myStrom-App. Alle Funktionen, die myStrom in PLUS, PRO, DATA PRO und HOME GUARD verkauft, sind hier frei. Es braucht weder ein Konto noch die Cloud, und die Daten bleiben auf deinem Server.

## Was sie kann

- **Finden:** Die Steckdosen melden sich alle paar Sekunden im WLAN (UDP 7979). Die App nimmt sie von selbst auf und merkt sich eine neue IP. Wo eine Steckdose sich nicht meldet, trägst du die IP unter „Mehr“ ein.
- **Schalten:** Eine Kachel nach links oder rechts wischen schaltet sie, wie in der myStrom-App. Antippen öffnet die Funktionen.
- **Messen:** Alle 30 Sekunden Leistung, Energie (aus dem Zähler der Steckdose) und Temperatur. Der Verlauf wird unbegrenzt gespeichert und lässt sich als CSV exportieren.
- **Regeln** (laufen auf dem Server, auch wenn das Handy aus ist):

| Regel | Was sie tut |
|---|---|
| Zeitplan | An und aus zu festen Zeiten, pro Wochentag |
| Nachts aus, wenn nicht benutzt | Im Zeitfenster aus, sobald die Leistung eine Weile unter der Schwelle bleibt. Wer noch arbeitet, wird nicht abgeschaltet. Morgens geht die Steckdose wieder an. |
| Ferien / Home Guard | Morgens und abends zu täglich wechselnden Zeiten an, pro Steckdose einstellbar |
| Sonne | Bei Sonnenuntergang an und bei Sonnenaufgang aus, mit Verschiebung |
| Timer | Nach dem Einschalten X Minuten an, dann aus |
| Stromsparen | Bei Standby aus. Wieder an von Hand, um eine Uhrzeit oder nach X Stunden. |
| Temperatur | Aus, wenn die Steckdose zu warm wird |

- **Szenen:** mehrere Steckdosen mit einem Tipp schalten.
- **Alarme als Push-Mitteilung:**
  - Steckdose offline
  - ungewöhnlich hoher Verbrauch (verglichen mit den letzten 14 Tagen)
  - Steckdose eingeschaltet
  - Steckdose zu warm
- **Standort und Strompreis** stellst du unter „Mehr“ ein. Den Ort tippst du ein (Suche bei Open-Meteo) oder übernimmst ihn vom Handy. Er dient nur für Sonnenauf- und -untergang.

Die Tastensperre und die Temperatur-Korrektur wirken in der App. Die Einstellungen in der Steckdose selbst bleiben unverändert, der Knopf am Gerät schaltet also weiterhin.

## Starten

```bash
docker compose up -d --build
```

Danach läuft die App auf Port 8091 (in `.env` mit `MYSTROM_PORT` änderbar). Der Container läuft im Host-Netz, sonst kämen die Meldungen der Steckdosen nicht an.

Ausprobieren ohne Steckdosen geht so:

```bash
DEMO=1 PORT=8095 DB_PATH=/tmp/demo.db node server.js
```

## Auf dem Ubuntu-Server

```bash
git clone <repo> ~/mystrom-app && cd ~/mystrom-app
docker compose up -d --build
sudo tailscale serve --bg --https=8443 http://127.0.0.1:8091
```

Die App ist dann unter `https://<your-server>.ts.net:8443` erreichbar. Auf dem iPhone in Safari öffnen und „Zum Home-Bildschirm“ wählen. Erst danach sind Push-Mitteilungen möglich.

## Daten

`data/mystrom.db` (SQLite) enthält Geräte, Regeln, Messwerte, Verlauf und die Push-Schlüssel. Jede Nacht ab 3 Uhr kommt eine Kopie nach `data/backup/`, die letzten 14 Tage bleiben erhalten.

## Benutzte Schnittstelle der Steckdose

| Aufruf | Zweck |
|---|---|
| `GET /report` | Leistung, Relais, Temperatur, Energie seit Start |
| `GET /relay?state=1` bzw. `0` | Schalten |
| `GET /api/v1/info` | MAC, Typ, Firmware |
