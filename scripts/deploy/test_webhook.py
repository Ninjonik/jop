import hashlib
import hmac
import importlib.util
import json
import os
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


class WebhookTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("webhook_fixture", Path(__file__).with_name("webhook_server.py"))
        cls.module = importlib.util.module_from_spec(spec)
        with patch.dict(os.environ, {"WEBHOOK_SECRET": "test-only", "GITHUB_REPOSITORY": "Ninjonik/jop"}):
            spec.loader.exec_module(cls.module)
        cls.commands = []
        cls.runner = patch.object(cls.module.subprocess, "run", side_effect=lambda command, **_: (cls.commands.append(command) or SimpleNamespace(returncode=0)))
        cls.runner.start()
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), cls.module.WebhookHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.runner.stop()

    def send(self, ref, event="push", signature=True, **extra):
        body = json.dumps({"repository": {"full_name": "Ninjonik/jop"}, "ref": ref, **extra}).encode()
        digest = "sha256=" + hmac.new(b"test-only", body, hashlib.sha256).hexdigest()
        connection = HTTPConnection("127.0.0.1", self.server.server_port)
        connection.request("POST", "/webhook", body, {"X-GitHub-Event": event, "X-Hub-Signature-256": digest if signature else "invalid"})
        response = connection.getresponse()
        result = response.status, json.loads(response.read())
        connection.close()
        return result

    def test_signature_is_required(self):
        self.assertEqual(self.send("refs/heads/main", signature=False)[0], 401)

    def test_main_and_existing_master_are_accepted(self):
        for branch in ("main", "master"):
            status, payload = self.send(f"refs/heads/{branch}")
            self.assertEqual(status, 202)
            self.assertTrue(payload["deployed"])

    def test_feature_branches_deletions_and_other_events_do_not_deploy(self):
        self.assertFalse(self.send("refs/heads/feature")[1]["deployed"])
        self.assertFalse(self.send("refs/heads/main", deleted=True)[1]["deployed"])
        self.assertFalse(self.send("refs/heads/main", event="issues")[1]["deployed"])

    def test_another_repository_is_rejected(self):
        self.assertEqual(self.send("refs/heads/main", repository={"full_name": "other/repo"})[0], 403)


if __name__ == "__main__":
    unittest.main()
