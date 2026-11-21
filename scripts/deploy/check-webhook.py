"""Read-only live check; run with the webhook service's EnvironmentFile."""
import hashlib
import hmac
import json
import os
from urllib.request import Request, urlopen
from urllib.error import HTTPError

body = json.dumps({"repository": {"full_name": os.environ.get("GITHUB_REPOSITORY", "Ninjonik/jop")}}).encode()
signature = "sha256=" + hmac.new(os.environ["WEBHOOK_SECRET"].encode(), body, hashlib.sha256).hexdigest()
url = f'http://127.0.0.1:{os.environ.get("WEBHOOK_PORT", "3040")}/webhook'
with urlopen(Request(url, body, {"X-GitHub-Event": "ping", "X-Hub-Signature-256": signature}), timeout=10) as response:
    assert response.status == 200
try:
    urlopen(Request(url, body, {"X-GitHub-Event": "ping", "X-Hub-Signature-256": "invalid"}), timeout=10)
    raise AssertionError("Invalid signature was accepted")
except HTTPError as error:
    assert error.code == 401
print("Live webhook authentication passed; no deployment triggered.")
