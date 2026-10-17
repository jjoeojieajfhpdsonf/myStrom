#!/usr/bin/env python3
"""Deploy hook for mystrom-app.

POST /deploy (with "Authorization: Bearer <token>") fetches origin, resets this checkout to origin/main,
rebuilds and restarts the container and waits until the app answers again. The output is streamed back.
GET /deploy (same token) shows the last run.

Runs on the host, not in the container (the container is replaced during the rebuild). Listens on
127.0.0.1 only; expose it e.g. with `tailscale serve`. No dependencies besides Python 3 and git/docker.
Only tracked files are reset; data/ and .env are untracked and stay as they are.
"""
import hmac
import http.server
import json
import os
import subprocess
import threading
import time
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(os.environ.get('DEPLOY_PORT', '8099'))
BRANCH = os.environ.get('DEPLOY_BRANCH', 'main')
HEALTH_URL = os.environ.get('DEPLOY_HEALTH_URL', 'http://127.0.0.1:8091/api/state')
TOKEN_FILE = os.path.expanduser(os.environ.get('DEPLOY_TOKEN_FILE', '~/.config/mystrom-deploy/token'))
DRY_RUN = os.environ.get('DEPLOY_DRY_RUN') == '1'  # for testing: print the commands instead of running them

STEPS = [
    ['git', 'fetch', '--prune', 'origin'],
    ['git', 'reset', '--hard', f'origin/{BRANCH}'],
    ['docker', 'compose', 'up', '-d', '--build', '--remove-orphans'],
]

with open(TOKEN_FILE) as f:
    TOKEN = f.read().strip()
if len(TOKEN) < 24:
    raise SystemExit(f'Token in {TOKEN_FILE} is too short (at least 24 characters).')

lock = threading.Lock()
last = {'status': 'never run'}


def run(write):
    """One deploy; write(line) sends a line to the caller (and ignores a closed connection)."""
    started = time.time()
    log = []

    def out(line):
        log.append(line)
        write(line)

    ok = True
    for cmd in STEPS:
        out(f'$ {" ".join(cmd)}')
        if DRY_RUN:
            continue
        p = subprocess.Popen(cmd, cwd=REPO, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        for line in p.stdout:
            out(line.rstrip())
        if p.wait() != 0:
            out(f'! failed with exit code {p.returncode}')
            ok = False
            break
    if ok and not DRY_RUN:
        head = subprocess.run(['git', 'log', '-1', '--format=%h %s'], cwd=REPO, capture_output=True, text=True).stdout.strip()
        out(f'= now at {head}')
        # wait until the rebuilt app answers again
        for _ in range(60):
            try:
                with urllib.request.urlopen(HEALTH_URL, timeout=3) as r:
                    if r.status == 200:
                        out(f'= app is up ({HEALTH_URL})')
                        break
            except Exception:
                time.sleep(2)
        else:
            out('! app did not answer within 2 minutes')
            ok = False
    out('OK' if ok else 'FAILED')
    last.update(status='ok' if ok else 'failed', started=started, seconds=round(time.time() - started), log=log[-200:])


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.0'  # no length known in advance: the response ends when the connection closes

    def authorized(self):
        return hmac.compare_digest(self.headers.get('Authorization', ''), f'Bearer {TOKEN}')

    def reply(self, code, body, ctype='application/json'):
        data = body.encode()
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path != '/deploy':
            return self.reply(404, '{"error":"not found"}')
        if not self.authorized():
            return self.reply(401, '{"error":"unauthorized"}')
        self.reply(200, json.dumps({**last, 'running': lock.locked()}, indent=1))

    def do_POST(self):
        if self.path != '/deploy':
            return self.reply(404, '{"error":"not found"}')
        if not self.authorized():
            return self.reply(401, '{"error":"unauthorized"}')
        if not lock.acquire(blocking=False):
            return self.reply(409, '{"error":"a deploy is already running"}')
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

            run(write)
        finally:
            lock.release()

    def log_message(self, fmt, *args):
        print(f'{self.address_string()} {fmt % args}', flush=True)


if __name__ == '__main__':
    print(f'mystrom deploy hook on 127.0.0.1:{PORT} for {REPO} (branch {BRANCH}{", dry run" if DRY_RUN else ""})', flush=True)
    http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
