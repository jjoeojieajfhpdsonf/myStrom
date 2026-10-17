# myStrom, local

A self-hosted app for **myStrom** smart-home devices on your home network. It does everything the official myStrom app sells as PLUS, PRO, DATA PRO and HOME GUARD, for free, without an account and without the cloud. All data stays on your own server.

It is a small Node.js server (no dependencies) plus a web app you add to your phone's home screen. The user interface is in German.

> **Not affiliated with myStrom AG.** "myStrom" is a trademark of myStrom AG. This project only uses the local REST interfaces the devices offer.

## Supported devices

| Device | What you get |
|---|---|
| **WiFi Switch** (CH v1/v2, EU, Zero) | Switching, power and energy metering, temperature, all rules below |
| **WiFi Bulb / LED Strip** | Switching like a socket (rules, scenes, consumption) plus colour and brightness |
| **WiFi Button / Button Plus** | Choose what a single, double or long press (and touch on the Plus) does: switch a device on, off or toggle it, or run a scene. Battery level. |
| **WiFi Motion Sensor** | Motion, brightness and temperature (with history). "Light on motion": switches chosen devices on, optionally only when it is dark, and off again after a few minutes without motion |

Devices announce themselves on the network (UDP broadcast on port 7979) and are added automatically; a changed IP is picked up as well. If a device doesn't show up, you can add it by IP in the settings. Buttons sleep to save battery and appear after their first press.

## Features

- **Switching:** swipe a tile left or right on the home screen, as in the myStrom app; tap opens the device.
- **Metering:** power, energy (from the socket's own counter) and temperature every 30 seconds, stored without limit. Day curve and week/month/year bars, several devices combined, CSV export.
- **Rules** run on the server, so they work while your phone is off:

| Rule | What it does |
|---|---|
| Schedule | On and off at fixed times; several schedules for different weekdays. Option "only switch off once it's no longer in use": from the off time, the socket waits until the power stays below a threshold for a while (so your PC isn't cut off while you're still working) |
| Holiday (Home Guard) | Morning and evening on/off at times that change daily, so the house looks lived in |
| Sun | On at sunset, off at sunrise, with an offset |
| Timer | Off again X minutes after every switch-on |
| Power saving | Off when in standby; back on manually, at a time or after X hours |
| Power Actions | When above/below X watts for Y minutes: notification (e.g. "washing machine done"), switch off, or switch another device |
| Temperature | Off when the socket gets too hot; temperature history per device |

- **Scenes:** switch several devices with one tap, or automatically at a fixed time.
- **Push notifications:** device offline, unusually high consumption (compared with the last 14 days), switched on, too hot.
- **Location and electricity price** are set in the app. The location is only used for sunrise and sunset (typed in and looked up once via Open-Meteo, or taken from the phone).
- Two designs: "Modern" (default) and one close to the original myStrom app.

The key lock and the temperature correction act inside the app; the device itself is not reconfigured, so its physical button keeps working.

## Run it

With Docker:

```bash
git clone https://github.com/jjoeojieajfhpdsonf/myStrom mystrom-app && cd mystrom-app
docker compose up -d --build
```

The app then runs on port 8091. The container uses the host network, otherwise the devices' UDP announcements wouldn't arrive.

Without Docker you need Node.js 22.5 or newer (built-in `node:sqlite`):

```bash
node server.js
```

Try it without any devices (three sockets, a bulb, a button and a motion sensor are simulated):

```bash
DEMO=1 PORT=8095 DB_PATH=/tmp/demo.db node server.js
```

Open the app on your phone and choose "Add to Home Screen". On the iPhone, push notifications only work from the home-screen app, and they need HTTPS, for example via `tailscale serve` or a reverse proxy.

### Deploy hook (optional)

`tools/deploy-hook.py` lets you update the server with one HTTP call: `POST /deploy` fetches `origin/main`, resets the checkout to it (also after a rewritten history), rebuilds the container and waits until the app answers again, streaming the output. It runs on the host as a systemd service, listens on `127.0.0.1` only and needs a secret token. Set it up once on the server:

```bash
sh tools/install-deploy-hook.sh
```

The script creates the token, installs the service and, if Tailscale is installed, makes the hook reachable in your tailnet (`tailscale serve`, port 8444). It prints the URL and the token. Then, after every push:

```bash
curl -N -X POST -H "Authorization: Bearer <token>" https://<your-server>.ts.net:8444/deploy
```

`GET /deploy` with the same token shows the last run. Only tracked files are reset; `data/` and `.env` stay untouched.

### Configuration

All settings are optional environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8091` | HTTP port |
| `POLL_SECONDS` | `30` | How often devices are read |
| `DB_PATH` | `data/mystrom.db` | SQLite database |
| `TZ` | `Europe/Zurich` | Time zone for schedules and charts |
| `DEVICES` | – | Comma-separated IPs to add in addition to automatic discovery |
| `LAN_URL` | first IPv4 address + port | Address under which buttons can reach this server, e.g. `192.168.1.10:8091` |
| `TARIFF` | `0.30` | Initial electricity price per kWh (changeable in the app) |
| `LAT`, `LON` | Zurich | Initial location for sunrise/sunset (changeable in the app) |
| `PUSH_CONTACT` | `mailto:mystrom-app@example.com` | Contact sent to push services (VAPID) |
| `DEMO` | – | `1` simulates devices instead of talking to real ones |

## Security

The app has **no login**. Anyone who can reach the port can switch your devices. Run it only on a trusted network, or expose it only through something like Tailscale or a reverse proxy with authentication. The myStrom devices' own REST interfaces are unauthenticated as well, so the same applies to your Wi-Fi.

## Data

`data/mystrom.db` (SQLite) contains devices, rules, measurements, history and the push keys. Every night after 3 am a copy is written to `data/backup/`; the last 14 days are kept.

## Device interfaces used

| Device | Call | Purpose |
|---|---|---|
| all | `GET /api/v1/info` | MAC, type, firmware |
| Switch | `GET /report` | Power, relay, temperature, energy since boot |
| Switch | `GET /relay?state=1` / `0` | Switch |
| Bulb, LED Strip | `GET/POST /api/v1/device/<MAC>` | State, power; `action=on/off`, `color=H;S;V`, `ramp` |
| Button | `GET/POST /api/v1/device/<MAC>` | Battery; set the URLs for `single`, `double`, `long`, `touch` |
| Motion Sensor | `GET /api/v1/sensors` | Motion, light, temperature |

Bulb, Button and Motion Sensor support follows myStrom's published REST documentation and has been tested against simulated devices; reports from real hardware are welcome.

## App API

The web app talks to the server over a small JSON API, which you can also use for your own scripts:

| Endpoint | Purpose |
|---|---|
| `GET /api/state` | All devices with live values, settings, scenes |
| `PUT /api/devices/<MAC>` | Change a device's settings (`{ "cfg": { … } }`) |
| `POST /api/devices/<MAC>/relay` | Switch (`{ "on": true }`) |
| `POST /api/devices/<MAC>/light` | Bulb colour (`{ "h": 30, "s": 20, "v": 80 }`) |
| `GET /api/curve?mac=<MAC>[,<MAC>…]&day=YYYY-MM-DD` | Day curve in 5-minute steps (`all` for every device) |
| `GET /api/bars?mac=…&period=week\|month\|year&ref=YYYY-MM-DD` | Energy per day or month |
| `GET /api/temp?mac=<MAC>&period=day\|week\|month&ref=YYYY-MM-DD` | Temperature history |
| `GET /api/totals?mac=…` | Energy this week, month, year, total |
| `GET /api/export.csv?mac=…&from=…&to=…&res=raw\|5min\|hour\|day` | CSV export |
| `GET /api/events?mac=<MAC>` | Switching history |
| `PUT /api/scenes`, `POST /api/scenes/<id>/run` | Scenes |
| `GET /api/button/<MAC>/<single\|double\|long\|touch>` | Called by a button; runs its action |

## License

[MIT](LICENSE)
