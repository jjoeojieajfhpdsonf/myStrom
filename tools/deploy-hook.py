#!/usr/bin/env python3
"""Deploy hook: update docker-compose projects on this server with one HTTP call.

POST /deploy/<service>   fetch origin, reset the checkout to origin/<branch>, rebuild and restart the
                         containers, wait until the app answers again; the output is streamed back
GET  /deploy             all configured services and their last run
GET  /deploy/<service>   last run of one service
All requests need "Authorization: Bearer <token>".

Services are listed in a JSON file (DEPLOY_SERVICES, default ~/.config/mystrom-deploy/services.json),
re-read on every request; only those can be deployed:

  {
    "mystrom-app":     { "path": "~/mystrom-app", "health": "http://127.0.0.1:8091/api/state" },
    "solar-dashboard": { "path": "~/solar-dashboard", "branch": "main", "compose": ["web"] }
  }

  path     checkout with a docker-compose file (required)
  branch   branch to deploy (default main)
  compose  only rebuild these compose services (default: all)
  health   URL that must answer with 200 after the restart (optional)

Runs on the host, not in a container (containers are replaced during the rebuild). Listens on
127.0.0.1 only; expose it e.g. with `tailscale serve`. Only tracked files are reset; untracked data
such as data/ or .env stays as it is. No dependencies besides Python 3, git and docker.
"""
import hmac
import http.server
import json
import os
import re
import subprocess
import threading
import time
import urllib.request

PORT = int(os.environ.get('DEPLOY_PORT', '8099'))
TOKEN_FILE = os.path.expanduser(os.environ.get('DEPLOY_TOKEN_FILE', '~/.config/mystrom-deploy/token'))
SERVICES_FILE = os.path.expanduser(os.environ.get('DEPLOY_SERVICES', '~/.config/mystrom-deploy/services.json'))
DRY_RUN = os.environ.get('DEPLOY_DRY_RUN') == '1'  # for testing: print the commands instead of running them

with open(TOKEN_FILE) as f:
    TOKEN = f.read().strip()
if len(TOKEN) < 24:
    raise SystemExit(f'Token in {TOKEN_FILE} is too short (at least 24 characters).')

locks = {}            # service -> lock, one deploy per service at a time
last = {}             # service -> last run
guard = threading.Lock()


def services():
    """Configured services; a broken file means no services rather than a crash."""
    try:
        with open(SERVICES_FILE) as f:
            raw = json.load(f)
    except (OSError, ValueError) as e:
        print(f'cannot read {SERVICES_FILE}: {e}', flush=True)
        return {}
    out = {}
    for name, s in raw.items():
        if not re.fullmatch(r'[\w.-]{1,64}', name) or not isinstance(s, dict) or not s.get('path'):
            continue
        compose = [c for c in s.get('compose', []) if re.fullmatch(r'[\w.-]{1,64}', str(c))]
        branch = str(s.get('branch', 'main'))
        if not re.fullmatch(r'[\w./-]{1,100}', branch):
            continue
        out[name] = {'path': os.path.expanduser(s['path']), 'branch': branch, 'compose': compose, 'health': s.get('health')}
    return out


def run(name, svc, write):
    """One deploy; write(line) sends a line to the caller (and ignores a closed connection)."""
    started = time.time()
    log = []

    def out(line):
        log.append(line)
        write(line)

    steps = [
        ['git', 'fetch', '--prune', 'origin'],
        ['git', 'reset', '--hard', f'origin/{svc["branch"]}'],
        ['docker', 'compose', 'up', '-d', '--build', '--remove-orphans', *svc['compose']],
    ]
    ok = os.path.isdir(svc['path'])
    if not ok:
        out(f'! {svc["path"]} does not exist')
    out(f'# {name} in {svc["path"]}')
    for cmd in steps if ok else []:
        out(f'$ {" ".join(cmd)}')
        if DRY_RUN:
            continue
        p = subprocess.Popen(cmd, cwd=svc['path'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        for line in p.stdout:
            out(line.rstrip())
        if p.wait() != 0:
            out(f'! failed with exit code {p.returncode}')
            ok = False
            break
    if ok and not DRY_RUN:
        head = subprocess.run(['git', 'log', '-1', '--format=%h %s'], cwd=svc['path'], capture_output=True, text=True).stdout.strip()
        out(f'= now at {head}')
        if svc['health']:
            # wait until the rebuilt app answers again
            for _ in range(60):
                try:
                    with urllib.request.urlopen(svc['health'], timeout=3) as r:
                        if r.status == 200:
                            out(f'= app is up ({svc["health"]})')
                            break
                except Exception:
                    time.sleep(2)
            else:
                out('! app did not answer within 2 minutes')
                ok = False
    out('OK' if ok else 'FAILED')
    last[name] = {'status': 'ok' if ok else 'failed', 'started': started, 'seconds': round(time.time() - started), 'log': log[-200:]}


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.0'  # no length known in advance: the response ends when the connection closes

    def authorized(self):
        return hmac.compare_digest(self.headers.get('Authorization', ''), f'Bearer {TOKEN}')

    def reply(self, code, body):
        data = (json.dumps(body, indent=1) + '\n').encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def target(self):
        """(name, service) from /deploy/<name>; a single configured service also answers to /deploy."""
        m = re.fullmatch(r'/deploy(?:/([\w.-]+))?/?', self.path.split('?')[0])
        if not m:
            return None, None, (404, {'error': 'not found'})
        all_ = services()
        name = m.group(1)
        if name is None:
            return None, all_, None
        if name not in all_:
            return name, None, (404, {'error': f'unknown service {name}', 'services': sorted(all_)})
        return name, all_[name], None

    def do_GET(self):
        if not self.authorized():
            return self.reply(401, {'error': 'unauthorized'})
        name, svc, err = self.target()
        if err:
            return self.reply(*err)
        if name is None:
            return self.reply(200, {n: {'path': s['path'], 'branch': s['branch'], 'running': locks.get(n, threading.Lock()).locked(),
                                        'last': {k: v for k, v in last.get(n, {'status': 'never run'}).items() if k != 'log'}} for n, s in svc.items()})
        self.reply(200, {**last.get(name, {'status': 'never run'}), 'running': locks.get(name, threading.Lock()).locked()})

    def do_POST(self):
        if not self.authorized():
            return self.reply(401, {'error': 'unauthorized'})
        name, svc, err = self.target()
        if err:
            return self.reply(*err)
        if name is None:
            if len(svc) != 1:
                return self.reply(400, {'error': 'which service? POST /deploy/<service>', 'services': sorted(svc)})
            name, svc = next(iter(svc.items()))
        with guard:
            lock = locks.setdefault(name, threading.Lock())
        if not lock.acquire(blocking=False):
            return self.reply(409, {'error': f'{name} is already being deployed'})
        try:
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            closed = False

            def write(line):
                nonlocal closed
                if closed:
                    return
                try:
                    self.wfile.write((line + '\n').encode())
                    self.wfile.flush()
                except OSError:
                    closed = True  # caller went away; the deploy still finishes

            run(name, svc, write)
        finally:
            lock.release()

    def log_message(self, fmt, *args):
        print(f'{self.address_string()} {fmt % args}', flush=True)


if __name__ == '__main__':
    print(f'deploy hook on 127.0.0.1:{PORT}, services from {SERVICES_FILE}: {", ".join(services()) or "none"}{" (dry run)" if DRY_RUN else ""}', flush=True)
    http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
