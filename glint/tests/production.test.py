"""Real local HTTP boundary tests, using a fake upstream. No source traffic."""
import contextlib
import importlib.util
import io
import json
import pathlib
import sys
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
from email.message import Message
from http.server import ThreadingHTTPServer

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('production_proxy', ROOT / 'server.py')
pb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pb)


class Response(io.BytesIO):
    def __init__(self):
        super().__init__(b'<script>parent.localStorage.getItem("pb-auth")</script>')
        self.status = 200
        self.headers = Message()
        self.headers['Content-Type'] = 'text/html'


class QuietHandler(pb.Handler):
    def log_message(self, *args):
        pass


class QuietServer(ThreadingHTTPServer):
    def handle_error(self, request, client_address):
        # The deliberate early-close boundary test can interrupt a static file
        # write. Keep that expected BrokenPipe out of the suite's error log.
        if isinstance(sys.exc_info()[1], (BrokenPipeError, ConnectionResetError)):
            return
        super().handle_error(request, client_address)


class Boundaries(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original = pb._opener.open
        pb._opener.open = lambda *args, **kwargs: Response()
        cls.server = QuietServer(('127.0.0.1', 0), QuietHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = 'http://127.0.0.1:' + str(cls.server.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(2)
        pb._opener.open = cls.original

    def request(self, path, data=None, method='GET', headers=None):
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=headers or {})
        try:
            return urllib.request.urlopen(req, timeout=4)
        except urllib.error.HTTPError as error:
            return error

    def test_strict_script_csp_with_external_boot_runtime(self):
        with self.request('/') as r:
            html = r.read().decode()
            self.assertEqual(r.status, 200)
            self.assertIn("script-src 'self'", r.headers['Content-Security-Policy'])
            self.assertEqual(r.headers['X-Content-Type-Options'], 'nosniff')
            self.assertIn('boot.js?v=65', html)
            self.assertIn('runtime.js?v=65', html)
            self.assertNotIn('<script>', html)

    def test_static_implementation_and_directories_not_published(self):
        for path in ['/tests/', '/server.py', '/proxy-core.cjs', '/proxy-policy.json', '/api/proxy.js', '/.env', '/__pycache__/server.pyc']:
            with self.request(path) as r:
                self.assertEqual(r.status, 404, path)
        for path in ['/app.js?v=75', '/runtime.js?v=65', '/boot.js?v=65', '/icons/favicon.svg']:
            with self.request(path) as r:
                self.assertEqual(r.status, 200)

    def test_upstream_html_is_sandboxed_in_app_origin(self):
        with self.request('/api/proxy?u=https%3A%2F%2Fdanbooru.donmai.us%2F') as r:
            self.assertEqual(r.status, 200)
            self.assertIn('sandbox', r.headers['Content-Security-Policy'])
            self.assertIn("default-src 'none'", r.headers['Content-Security-Policy'])
            self.assertEqual(r.headers['Cache-Control'], 'no-store, private')

    def test_media_stream_is_private_sandboxed_and_never_follows_redirects(self):
        target = urllib.parse.quote('https://static1.e621.net/fake.mp4?token=secret', safe='')
        with self.request('/api/proxy?u=' + target) as r:
            self.assertEqual(r.status, 200)
            self.assertEqual(r.headers['Cache-Control'], 'no-store, private')
            self.assertIn('sandbox', r.headers['Content-Security-Policy'])
            self.assertIn("default-src 'none'", r.headers['Content-Security-Policy'])
        request = urllib.request.Request('https://static1.e621.net/fake.mp4')
        redirect = pb.NoRedirect().redirect_request(
            request, io.BytesIO(), 302, 'Found', Message(), 'http://127.0.0.1/private.mp4'
        )
        self.assertIsNone(redirect, 'urllib must not automatically follow media redirects')

    def test_public_mutations_and_unscoped_cookie_actions_rejected(self):
        with self.request('/api/proxy?u=https%3A%2F%2Fdanbooru.donmai.us%2Fposts%2F101.json', data=b'{}', method='POST') as r:
            self.assertEqual(r.status, 400)
        with self.request('/api/proxy?u=https%3A%2F%2Fgelbooru.com%2Fpublic%2Faddfav.php%3Fid%3D101') as r:
            self.assertEqual(r.status, 403)
        with self.assertRaises(ValueError):
            pb.validate_private_action('https://gelbooru.com/public/addfav.php?id=101', 'GET', False)

    def test_invalid_shapes_and_large_bodies_are_bounded(self):
        for url in [None, 12, {}, [], 'https://127.0.0.1/']:
            with self.assertRaises(ValueError):
                pb.validate_target(url)
        record = json.dumps({'pb_private': 1, 'url': {'invalid': 1}}).encode()
        with self.request('/api/proxy', data=record, method='POST') as r:
            self.assertEqual(r.status, 400)
        with self.request('/api/proxy', data=b'x' * (pb.POLICY['max_request_bytes'] + 1), method='POST') as r:
            self.assertEqual(r.status, 413)


if __name__ == '__main__':
    unittest.main()
