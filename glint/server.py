"""Local Pinboard preview and bounded, allow-listed source proxy.
Private account requests are POST envelopes: no key-bearing access-log URLs,
no shared cache, no automatic mutation retry, no credentialed redirects.
"""
import http.server
import json
import mimetypes
import os
import re
import socket
import pathlib
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent
POLICY = json.loads((ROOT / "proxy-policy.json").read_text())
ALLOW = set(POLICY["hosts"])
WEB_SECURITY = json.loads((ROOT / "web-security.json").read_text())
PROXY_CSP = "default-src 'none'; sandbox; frame-ancestors 'none'"
TEST_MODE = os.environ.get("PINBOARD_TEST_MODE") == "1"
MAX_BODY = POLICY["max_response_bytes"]
UA = "Mozilla/5.0 (compatible; Pinboard/65; +https://github.com/khoadng/Boorusama)"
mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("text/javascript", ".js")
_cache, _cache_lock = {}, threading.Lock()


def validate_target(url):
    if not isinstance(url, str) or len(url) > 16384:
        raise ValueError("Invalid source URL.")
    try:
        u = urllib.parse.urlsplit(url)
        valid = (u.scheme == "https" and u.hostname in ALLOW and
                 u.port in (None, 443) and not u.username and not u.password and not u.fragment)
    except (ValueError, TypeError):
        valid = False
    if not valid:
        raise ValueError("Only allow-listed HTTPS source URLs are permitted.")
    return u


def safe_headers(headers, host):
    result = {"Accept": "application/json,text/html,*/*"}
    if not isinstance(headers, dict):
        raise ValueError("Invalid upstream headers.")
    for key, value in headers.items():
        lower = key.lower()
        if lower not in {"accept", "content-type", "authorization", "cookie"}:
            continue
        if not isinstance(value, str) or len(value) > 8192 or "\r" in value or "\n" in value:
            raise ValueError("Invalid upstream header value.")
        if lower == "cookie" and host != "gelbooru.com":
            raise ValueError("Website-session forwarding is implemented only for Gelbooru.")
        if lower == "authorization" and (host not in {"danbooru.donmai.us", "e621.net"} or not re.fullmatch(r"Basic \S+", value)):
            raise ValueError("Unsupported account authentication.")
        result[{"accept": "Accept", "content-type": "Content-Type", "authorization": "Authorization", "cookie": "Cookie"}[lower]] = value
    return result


def validate_private_action(url, method, mutation):
    u = validate_target(url)
    if method not in {"GET", "POST", "DELETE"}:
        raise ValueError("Unsupported source method.")
    import re
    if method == "GET" and not mutation and not is_gel_write(u):
        return
    family = u.hostname
    path = u.path
    allowed = False
    if family in {"danbooru.donmai.us", "e621.net"}:
        allowed = (method == "POST" and path == "/favorites.json") or (method == "DELETE" and re.fullmatch(r"/favorites/\d+\.json", path))
    elif family in {"yande.re", "konachan.net", "konachan.com", "www.sakugabooru.com", "sakugabooru.com"}:
        allowed = method == "POST" and path in {"/post/vote.json", "/user/authenticate.json"}
    elif family == "gelbooru.com" and method == "GET" and mutation:
        q = urllib.parse.parse_qs(u.query)
        allowed = (path == "/public/addfav.php" and q.get("id", [""])[0].isdigit()) or (path == "/index.php" and q.get("page") == ["favorites"] and q.get("s") == ["delete"] and q.get("id", [""])[0].isdigit())
    if not allowed:
        raise ValueError("This account action is not supported by the proxy.")


def is_gel_write(u):
    q = urllib.parse.parse_qs(u.query)
    return u.hostname == "gelbooru.com" and (u.path == "/public/addfav.php" or u.path == "/index.php" and q.get("page") == ["favorites"] and q.get("s") == ["delete"])


def validate_public(url, method, body=None):
    u = validate_target(url)
    if is_gel_write(u):
        raise ValueError("Account writes require a private envelope.")
    if method == "GET":
        return
    if method != "POST" or u.hostname != "rule34.paheal.net" or u.path != "/graphql":
        raise ValueError("Unsupported public action.")
    try:
        record = json.loads(body)
        query = record.get("query", "")
        valid = isinstance(query, str) and re.match(r"^\s*(?:query\b|\{)", query) and not re.search(r"\b(?:mutation|subscription)\b", query)
    except (ValueError, TypeError, AttributeError):
        valid = False
    if not valid:
        raise ValueError("Read-only GraphQL queries only.")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_opener = urllib.request.build_opener(NoRedirect)


def forward(url, method="GET", body=None, headers=None, private=False):
    validate_target(url)
    headers = safe_headers(headers or {}, urllib.parse.urlsplit(url).hostname)
    limit = POLICY["max_private_bytes"] if private else MAX_BODY
    data = body.encode("utf-8") if isinstance(body, str) else body
    deadline = time.monotonic() + 18
    for hop in range(6):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return 504, b'{"error":"Source request timed out. No request was retried."}', "application/json", None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("User-Agent", UA)
        req.add_header("Accept-Language", "en-US,en;q=0.9")
        req.add_header("Referer", "https://" + urllib.parse.urlsplit(url).hostname + "/")
        for key, value in headers.items():
            req.add_header(key, value)
        if private:
            req.add_header("Cache-Control", "no-cache, no-store")
            req.add_header("Pragma", "no-cache")
        try:
            response = _opener.open(req, timeout=min(18, remaining))
        except urllib.error.HTTPError as error:
            response = error
        except Exception:
            return 502, b'{"error":"Could not reach the source. No request was retried."}', "application/json", None
        with response as r:
            status = getattr(r, "status", None) or r.code
            target = r.headers.get("Location")
            # Never forward a key/cookie to a redirect or replay a write.
            if 300 <= status < 400 and target and not private and method == "GET":
                url = urllib.parse.urljoin(url, target)
                validate_public(url, "GET")
                continue
            payload = r.read(limit + 1)
            if len(payload) > limit:
                return 413, b'{"error":"Source response exceeds the download/API size limit."}', "application/json", None
            return status, payload, r.headers.get("Content-Type", "application/octet-stream"), r.headers.get("Retry-After")
    return 502, b'{"error":"Too many source redirects."}', "application/json", None


def has_legacy_credentials(url):
    import re
    return any(re.fullmatch(r"login|api_key|key|user_api_key|password_hash|pass_hash|password|token|access_token|refresh_token", key, re.I) for key in urllib.parse.parse_qs(urllib.parse.urlsplit(url).query))


def is_public_cacheable(url, method):
    import re
    if method != "GET" or has_legacy_credentials(url):
        return False
    u = urllib.parse.urlsplit(url)
    q = urllib.parse.parse_qs(u.query)
    if any(re.fullmatch(r"login|api_key|key|user_api_key|password_hash|pass_hash|token|password", key, re.I) for key in q):
        return False
    if any(word in u.path for word in ("favorite", "profile", "/user")):
        return False
    return not any(re.search(r"(?:ordfav:|fav:|vote:3:)", value, re.I) for values in q.values() for value in values)


def proxy(url, method="GET", body=None, headers=None):
    validate_public(url, method, body)
    cacheable = is_public_cacheable(url, method) and not headers
    if cacheable:
        with _cache_lock:
            hit = _cache.get(url)
            if hit and time.monotonic() - hit[0] < 120:
                return hit[1:]
    legacy_private = has_legacy_credentials(url) or any(k.lower() in {"authorization", "cookie"} for k in (headers or {}))
    status, data, ctype, _ = forward(url, method, body, headers, private=legacy_private)
    if cacheable and status == 200 and "json" in ctype and len(data) <= 1024 * 1024:
        with _cache_lock:
            while _cache and (len(_cache) >= 400 or sum(len(value[2]) for value in _cache.values()) + len(data) > 16 * 1024 * 1024):
                _cache.pop(next(iter(_cache)))
            _cache[url] = (time.monotonic(), status, data, ctype)
    return status, data, ctype


def private_proxy(record):
    url = record.get("url", "")
    method = str(record.get("method", "GET")).upper()
    validate_private_action(url, method, bool(record.get("mutation")))
    body = record.get("body")
    if body is not None and not isinstance(body, str):
        raise ValueError("Upstream body must be a string.")
    status, data, ctype, retry = forward(url, method, body, record.get("headers") or {}, private=True)
    # No Set-Cookie, Location, auth headers, request URL or request body echo.
    return json.dumps({"pb_private_response": 1, "status": status,
                       "body": data.decode("utf-8", "replace"), "content_type": ctype,
                       "retry_after": retry}).encode()


MEDIA_EXT = re.compile(r"\.(?:jpe?g|png|webp|gif|avif|bmp|svg|mp4|webm|m4v|mov|mkv|m3u8|ts)(?:$|[?#])", re.I)


def is_media_url(url):
    return bool(MEDIA_EXT.search(urllib.parse.urlsplit(url).path))


def open_media(url, range_header=None):
    """Open a media URL for streaming, passing the client's Range through so the
    player can start and seek instead of downloading the whole file first."""
    validate_target(url)
    req = urllib.request.Request(url, method="GET")
    req.add_header("User-Agent", UA)
    req.add_header("Referer", "https://" + urllib.parse.urlsplit(url).hostname + "/")
    req.add_header("Accept", "*/*")
    if range_header:
        req.add_header("Range", range_header)
    try:
        return _opener.open(req, timeout=25)
    except urllib.error.HTTPError as error:
        return error
    except Exception:
        return None


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def setup(self):
        super().setup()
        self.connection.settimeout(25)

    def static_allowed(self):
        path = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)
        allowed = {"/", "/index.html", "/styles.css", "/app.js", "/sources.js", "/runtime.js", "/drive.js", "/boot.js", "/pwa.js", "/sw.js", "/manifest.webmanifest", "/offline.html", "/README.md", "/SOURCE-ACCOUNTS.md", "/QA-v65.md"}
        if path in allowed:
            return True
        if path.startswith("/icons/") and re.fullmatch(r"/icons/[A-Za-z0-9_-]+\.(?:png|svg)", path):
            return True
        return TEST_MODE and bool(re.fullmatch(r"/_[A-Za-z0-9_-]+\.js", path))

    def do_HEAD(self):
        if not self.static_allowed():
            return self._reply(404, b'{"error":"Not found."}')
        return super().do_HEAD()

    def end_headers(self):
        path = urllib.parse.urlsplit(self.path).path
        if path == "/" or path.endswith((".html", ".js", ".css", ".webmanifest")):
            self.send_header("Cache-Control", "no-cache, max-age=0, must-revalidate")
        self.send_header("Service-Worker-Allowed", "/")
        for name, value in WEB_SECURITY.items():
            if path == "/api/proxy" and name == "Content-Security-Policy":
                continue
            # Test-mode harness only: Playwright polls predicates with eval(),
            # which a strict script-src blocks. The shipped policy in
            # web-security.json / _headers / vercel.json stays strict, and the
            # production test asserts that strict header on its own server.
            if TEST_MODE and name == "Content-Security-Policy":
                value = value.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'")
            self.send_header(name, value)
        super().end_headers()

    def _reply(self, status, data, ctype="application/json"):
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Cache-Control", "no-store, private")
        self.send_header("Content-Security-Policy", PROXY_CSP)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if data and self.command != "HEAD":
            try:
                self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def _stream(self, response):
        try:
            status = getattr(response, "status", None) or response.code
            headers = response.headers
            self.send_response(status)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept, Range")
            self.send_header("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS")
            self.send_header("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges")
            self.send_header("Content-Security-Policy", PROXY_CSP)
            self.send_header("Accept-Ranges", headers.get("Accept-Ranges", "bytes"))
            self.send_header("Content-Type", headers.get("Content-Type", "application/octet-stream"))
            for name in ("Content-Length", "Content-Range"):
                value = headers.get(name)
                if value:
                    self.send_header(name, value)
            # The target may contain a signed/media credential query. Never
            # retain streamed account/media responses in a shared cache.
            self.send_header("Cache-Control", "no-store, private")
            self.end_headers()
            if self.command == "HEAD":
                return
            try:
                while True:
                    chunk = response.read(64 * 1024)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
            except (BrokenPipeError, ConnectionResetError):
                pass
        finally:
            try:
                response.close()
            except Exception:
                pass

    def do_OPTIONS(self):
        self._reply(204, b"")

    def do_GET(self):
        u = urllib.parse.urlsplit(self.path)
        if u.path != "/api/proxy":
            if not self.static_allowed():
                return self._reply(404, b'{"error":"Not found."}')
            return super().do_GET()
        try:
            target = urllib.parse.parse_qs(u.query).get("u", [""])[0]
            validate_target(target)
            # Proxied images/videos and anything the player asks to range stream
            # through instead of being buffered in the local proxy.
            range_header = self.headers.get("Range")
            if is_media_url(target) or range_header:
                response = open_media(target, range_header)
                if response is None:
                    return self._reply(502, b'{"error":"Could not reach the source. No request was retried."}')
                return self._stream(response)
            self._reply(*proxy(target))
        except ValueError:
            self._reply(403, b'{"error":"Only allow-listed HTTPS source URLs are permitted."}')

    def do_POST(self):
        u = urllib.parse.urlsplit(self.path)
        if u.path != "/api/proxy":
            return self._reply(404, b'{"error":"Not found."}')
        try:
            if self.headers.get("Transfer-Encoding"):
                self.close_connection = True
                return self._reply(400, b'{"error":"Chunked request bodies are not supported."}')
            size = int(self.headers.get("Content-Length", "0"))
            if size < 0 or size > POLICY["max_request_bytes"]:
                self.close_connection = True
                return self._reply(413, b'{"error":"Request is too large."}')
            raw = self.rfile.read(size)
            if len(raw) != size:
                self.close_connection = True
                return self._reply(400, b'{"error":"Incomplete request body."}')
            try:
                record = json.loads(raw)
            except (ValueError, UnicodeDecodeError):
                record = None
            if isinstance(record, dict) and record.get("pb_private") == 1:
                return self._reply(200, private_proxy(record))
            # Legacy public GraphQL requests, not account actions.
            target = urllib.parse.parse_qs(u.query).get("u", [""])[0]
            validate_target(target)
            self._reply(*proxy(target, "POST", raw.decode("utf-8"), {"Content-Type": "application/json"}))
        except (TimeoutError, socket.timeout):
            self.close_connection = True
            self._reply(408, b'{"error":"Request body timed out."}')
        except (ValueError, TypeError, UnicodeDecodeError):
            self._reply(400, b'{"error":"Invalid or unsupported proxy request."}')

    def log_message(self, fmt, *args):
        # Log no URL query, POST data, credential, header or raw upstream error.
        if args and isinstance(args[0], str):
            line = args[0].split(" ")
            if len(line) >= 2:
                line[1] = urllib.parse.urlsplit(line[1]).path
            args = (" ".join(line), *args[1:])
        super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    with http.server.ThreadingHTTPServer(("0.0.0.0", port), Handler) as server:
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
