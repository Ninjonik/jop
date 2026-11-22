#!/usr/bin/python3
"""Authenticate GitHub pushes and serialize deployments through deploy-jop's lock."""
import hashlib
import hmac
import json
import os
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SECRET = os.environ["WEBHOOK_SECRET"].encode()
REPOSITORY = os.environ.get("GITHUB_REPOSITORY", "Ninjonik/jop")
deployment_lock = threading.Lock()
pending_branch = None
deployment_worker_running = False


def deploy_pending_revisions():
    """Build at most one queued follow-up revision after an active deployment."""
    global pending_branch, deployment_worker_running
    while True:
        with deployment_lock:
            branch = pending_branch
            pending_branch = None
        result = subprocess.run(["/usr/local/sbin/deploy-jop", branch], check=False)
        print(f"Deployment finished: {result.returncode}", flush=True)
        with deployment_lock:
            if pending_branch is None:
                deployment_worker_running = False
                return


def request_deployment(branch):
    """Coalesce pushes received during a build into one deployment of the latest head."""
    global pending_branch, deployment_worker_running
    with deployment_lock:
        pending_branch = branch
        if deployment_worker_running:
            return
        deployment_worker_running = True
    threading.Thread(target=deploy_pending_revisions, daemon=True).start()

class WebhookHandler(BaseHTTPRequestHandler):
    def respond(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.respond(200 if self.path == "/health" else 404, {"ok": self.path == "/health"})

    def do_POST(self):
        if self.path != "/webhook":
            return self.respond(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self.respond(400, {"error": "invalid length"})
        if not 0 < length <= 1024 * 1024:
            return self.respond(413, {"error": "invalid payload size"})
        body = self.rfile.read(length)
        expected = "sha256=" + hmac.new(SECRET, body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(self.headers.get("X-Hub-Signature-256", ""), expected):
            return self.respond(401, {"error": "invalid signature"})
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            return self.respond(400, {"error": "invalid json"})
        if payload.get("repository", {}).get("full_name") != REPOSITORY:
            return self.respond(403, {"error": "unexpected repository"})
        event = self.headers.get("X-GitHub-Event", "")
        if event == "ping":
            return self.respond(200, {"ok": True})
        ref = payload.get("ref")
        if event != "push" or ref not in ("refs/heads/main", "refs/heads/master") or payload.get("deleted"):
            return self.respond(202, {"ok": True, "deployed": False})
        branch = ref.rsplit("/", 1)[-1]
        request_deployment(branch)
        self.respond(202, {"ok": True, "deployed": True})

if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("WEBHOOK_PORT", "3040"))), WebhookHandler).serve_forever()
