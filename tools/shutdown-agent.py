#!/usr/bin/env python3
"""Shutdown agent for a computer (e.g. a Raspberry Pi) that is powered through a myStrom plug.

mystrom-app calls it before cutting the power, so the computer can shut down cleanly first:
  POST /shutdown   powers the computer off (answers 202 first)      needs "Authorization: Bearer <token>"
  GET  /check      tells whether the token is right (for "Test")    needs the token
  GET  /health     answers while the computer is running            no token

Runs as root under systemd (see install-shutdown-agent.sh). No dependencies besides Python 3.
SHUTDOWN_DRY_RUN=1 only prints and then exits, for testing on another machine.
"""
import hmac
import http.server
import json
import os
import subprocess
import threading
import time

PORT = int(os.environ.get('SHUTDOWN_PORT', '8098'))
TOKEN_FILE = os.environ.get('SHUTDOWN_TOKEN_FILE', '/etc/mystrom-shutdown/token')
DRY_RUN = os.environ.get('SHUTDOWN_DRY_RUN') == '1'
COMMAND = os.environ.get('SHUTDOWN_COMMAND', 'systemctl poweroff').split()

with open(TOKEN_FILE) as f:
    TOKEN = f.read().strip()
if len(TOKEN) < 24:
    raise SystemExit(f'Token in {TOKEN_FILE} is too short (at least 24 characters).')


def power_off():
    time.sleep(1)  # let the answer reach the caller first
    print('shutting down', flush=True)
    if DRY_RUN:
        os._exit(0)  # behaves like a computer that is gone
    subprocess.run(COMMAND)


class Handler(http.server.BaseHTTPRequestHandler):
    def reply(self, code, body):
        data = (json.dumps(body) + '\n').encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def authorized(self):
        return hmac.compare_digest(self.headers.get('Authorization', ''), f'Bearer {TOKEN}')

    def do_GET(self):
        if self.path == '/health':
            return self.reply(200, {'ok': True})
        if self.path == '/check':
            return self.reply(200, {'ok': True}) if self.authorized() else self.reply(401, {'error': 'unauthorized'})
        self.reply(404, {'error': 'not found'})

    def do_POST(self):
        if self.path != '/shutdown':
            return self.reply(404, {'error': 'not found'})
        if not self.authorized():
            return self.reply(401, {'error': 'unauthorized'})
        self.reply(202, {'ok': True, 'shutting_down': True})
        threading.Thread(target=power_off, daemon=True).start()

    def log_message(self, fmt, *args):
        print(f'{self.address_string()} {fmt % args}', flush=True)


if __name__ == '__main__':
    print(f'shutdown agent on port {PORT}{" (dry run)" if DRY_RUN else ""}', flush=True)
    http.server.ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
