"""No real network. Equivalent local Python proxy contract and privacy tests."""
import contextlib
import importlib.util
import io
import json
import pathlib
import unittest
from email.message import Message

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("pinboard_proxy64", ROOT / "server.py")
pb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pb)


class FakeResponse(io.BytesIO):
    def __init__(self, body=b'{}', status=200, headers=None):
        super().__init__(body)
        self.status = status
        self.headers = Message()
        for key, value in (headers or {"Content-Type": "application/json"}).items():
            self.headers[key] = value


class PrivateProxyTests(unittest.TestCase):
    def setUp(self):
        self.original = pb._opener
        self.calls = []
        self.reply = lambda: FakeResponse(b'{"post_id":101}')
        outer = self
        class Opener:
            def open(self, request, timeout):
                outer.calls.append(request)
                return outer.reply()
        pb._opener = Opener()

    def tearDown(self):
        pb._opener = self.original

    def record(self, **kw):
        value = {"pb_private": 1, "url": "https://danbooru.donmai.us/favorites.json", "method": "POST", "body": '{"post_id":101}', "headers": {"Authorization": "Basic DUMMY_SECRET", "Content-Type": "application/json"}, "mutation": True}
        value.update(kw)
        return value

    def test_native_verbs_auth_and_body(self):
        result = json.loads(pb.private_proxy(self.record()))
        self.assertEqual(result["status"], 200)
        req = self.calls[-1]
        self.assertEqual(req.method, "POST")
        self.assertEqual(req.data, b'{"post_id":101}')
        self.assertEqual(req.get_header("Authorization"), "Basic DUMMY_SECRET")
        self.assertEqual(req.get_header("Cache-control"), "no-cache, no-store")
        self.reply = lambda: FakeResponse(b'', 204)
        value = pb.private_proxy(self.record(url="https://e621.net/favorites/101.json", method="DELETE", body=None))
        self.assertEqual(json.loads(value)["status"], 204)
        self.assertEqual(self.calls[-1].method, "DELETE")
        self.assertTrue(self.calls[-1].full_url.endswith("/favorites/101.json"))

    def test_redirect_never_follows_private_credentials(self):
        self.reply = lambda: FakeResponse(b'', 302, {"Location": "https://evil.example/", "Set-Cookie": "DO_NOT_FORWARD"})
        response = pb.private_proxy(self.record())
        self.assertEqual(json.loads(response)["status"], 302)
        self.assertEqual(len(self.calls), 1)
        self.assertNotIn(b"evil.example", response)
        self.assertNotIn(b"DO_NOT_FORWARD", response)

    def test_legacy_url_credentials_never_redirect_or_cache(self):
        self.reply = lambda: FakeResponse(b'', 302, {"Location": "https://e621.net/"})
        status, _, _ = pb.proxy("https://danbooru.donmai.us/posts.json?api_key=DUMMY_SECRET")
        self.assertEqual(status, 302)
        self.assertEqual(len(self.calls), 1)

    def test_cookie_get_stays_private_mutation(self):
        self.reply = lambda: FakeResponse(b'3')
        value = pb.private_proxy(self.record(url="https://gelbooru.com/public/addfav.php?id=101", method="GET", body=None, headers={"Cookie": "user_id=27; pass_hash=DUMMY_COOKIE"}))
        self.assertEqual(json.loads(value)["body"], "3")
        self.assertEqual(self.calls[-1].method, "GET")
        self.assertEqual(self.calls[-1].get_header("Cookie"), "user_id=27; pass_hash=DUMMY_COOKIE")

    def test_allowlist_and_headers_before_network(self):
        for change in [{"url": "https://evil.example/"}, {"url": "http://e621.net/favorites.json"}, {"url": "https://e621.net:444/favorites.json"}, {"url": "https://u:p@e621.net/favorites.json"}, {"url": "https://e621.net/users/1.json", "method": "DELETE"}, {"method": "PATCH"}, {"headers": {"Cookie": "secret"}}, {"headers": {"Authorization": "x\r\nBad: yes"}}]:
            with self.assertRaises(ValueError):
                pb.private_proxy(self.record(**change))
        self.assertEqual(self.calls, [])

    def test_no_cache_no_retry_and_rate_limit(self):
        rec = self.record(url="https://danbooru.donmai.us/counts/posts.json?tags=fav:alice", method="GET", body=None, mutation=False)
        pb.private_proxy(rec)
        pb.private_proxy(rec)
        self.assertEqual(len(self.calls), 2)
        self.reply = lambda: FakeResponse(b'{"error":"Slow down"}', 429, {"Retry-After": "60"})
        self.assertEqual(json.loads(pb.private_proxy(self.record()))["retry_after"], "60")
        def error():
            raise OSError("Secret in exception DUMMY_SECRET")
        self.reply = error
        response = pb.private_proxy(self.record())
        self.assertEqual(len(self.calls), 4)
        self.assertEqual(json.loads(response)["status"], 502)
        self.assertNotIn(b"DUMMY_SECRET", response)

    def test_size_limit(self):
        self.reply = lambda: FakeResponse(b'x' * (pb.POLICY["max_private_bytes"] + 1))
        self.assertEqual(json.loads(pb.private_proxy(self.record()))["status"], 413)

    def test_access_logs_strip_entire_query(self):
        handler = object.__new__(pb.Handler)
        handler.client_address = ("127.0.0.1", 1)
        buffer = io.StringIO()
        with contextlib.redirect_stderr(buffer):
            handler.log_message('"%s" %s %s', "POST /api/proxy?u=https%3A%2F%2Fe621.net%2F%3Fapi_key%3DDUMMY_SECRET HTTP/1.1", "200", "50")
        self.assertNotIn("DUMMY_SECRET", buffer.getvalue())
        self.assertIn("/api/proxy HTTP", buffer.getvalue())

    def test_public_credential_and_favourite_urls_cannot_use_cache(self):
        for url in ["https://e621.net/users/me.json", "https://danbooru.donmai.us/posts.json?tags=fav:alice", "https://yande.re/post.json?tags=vote:3:alice", "https://gelbooru.com/index.php?api_key=secret", "https://e-shuushuu.net/api/v1/images?access_token=secret", "https://e-shuushuu.net/api/v1/images?refresh_token=secret"]:
            self.assertFalse(pb.is_public_cacheable(url, "GET"))
        self.assertFalse(pb.is_public_cacheable("https://yande.re/post/vote.json", "POST"))


if __name__ == "__main__":
    unittest.main()
