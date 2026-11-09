"""Real loopback checks for the PHP router, reflection, and private paths.

Run with Python 3 and PHP 8.1+ on PATH. No database or network service is used.
"""
import http.client
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import time
import unittest
from html.parser import HTMLParser
from xml.etree import ElementTree
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]


class LocalHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        php = shutil.which("php")
        if not php:
            raise unittest.SkipTest("PHP is not on PATH")
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            cls.port = listener.getsockname()[1]
        env = {key: value for key, value in os.environ.items() if not key.startswith("BEDMESH_DB_")}
        env['BEDMESH_SITE_URL'] = 'https://bedmesh.example'
        runtime = ROOT / ".work" / "http-tests"
        runtime.mkdir(parents=True, exist_ok=True)
        cls.server = subprocess.Popen(
            [php, "-d", f"sys_temp_dir={runtime}", "-d", f"upload_tmp_dir={runtime}",
             "-d", f"session.save_path={runtime}", "-d", "display_errors=0",
             "-S", f"127.0.0.1:{cls.port}", "router.php"],
            cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        cls.addClassCleanup(cls.stop_server)
        for _ in range(50):
            try:
                cls.request("/")
                return
            except (OSError, http.client.HTTPException):
                time.sleep(0.1)
        raise RuntimeError("The local PHP server did not become ready")

    @classmethod
    def stop_server(cls):
        cls.server.terminate()
        try:
            cls.server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            cls.server.kill()
            cls.server.wait(timeout=5)

    @classmethod
    def request(cls, path, body=None, extra_headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", cls.port, timeout=5)
        try:
            headers = {"Content-Type": "application/x-www-form-urlencoded"} if body is not None else {}
            headers.update(extra_headers or {})
            connection.request("POST" if body is not None else "GET", path, body, headers)
            response = connection.getresponse()
            return response.status, response.read().decode("utf-8", errors="replace"), dict(response.getheaders())
        finally:
            connection.close()

    def test_visualizer_and_modules_are_served(self):
        for path in ["/", "/js/mesh-data.mjs", "/js/mesh-plot.mjs", "/css/app.css", "/assets/bedmesh-logo.png"]:
            with self.subTest(path=path):
                self.assertEqual(self.request(path)[0], 200)

    def test_share_metadata_uses_configured_origin_and_excludes_private_pages(self):
        status, html, _ = self.request('/?panels=2', extra_headers={'Host': 'untrusted.example'})
        self.assertEqual(status, 200)
        self.assertIn('<link rel="canonical" href="https://bedmesh.example/">', html)
        self.assertIn('property="og:image" content="https://bedmesh.example/assets/social-card.png"', html)
        self.assertIn('name="robots" content="noindex, nofollow"', html)  # development server
        self.assertNotIn('bedmesh-analytics-page', html)
        self.assertEqual(self.read_schema(html)['@type'], 'WebApplication')
        self.assertNotIn('untrusted.example', html)
        self.assertNotIn('@import', self.request('/css/app.css')[1])
        status, html, _ = self.request('/guides/?topic=reading-a-mesh')
        self.assertEqual(status, 200)
        self.assertIn('href="https://bedmesh.example/guides/?topic=reading-a-mesh"', html)
        crumbs = self.read_schema(html)['itemListElement']
        self.assertEqual([crumb['position'] for crumb in crumbs], [1, 2, 3])
        self.assertEqual(crumbs[-1]['item'], 'https://bedmesh.example/guides/?topic=reading-a-mesh')
        status, html, _ = self.request('/guides/?topic=not-a-guide')
        self.assertEqual(status, 404)
        self.assertNotIn('rel="canonical"', html)
        self.assertNotIn('application/ld+json', html)
        for asset in ['/assets/bedmesh-brand.png', '/assets/bedmesh-icon.png', '/assets/bedmesh-touch.png', '/assets/social-card.png']:
            with self.subTest(asset=asset):
                self.assertEqual(self.request(asset)[0], 200)

    @staticmethod
    def read_schema(html):
        return json.loads(html.split('<script type="application/ld+json">', 1)[1].split('</script>', 1)[0])

    def test_public_sitemaps_are_valid_xml_and_do_not_require_a_database(self):
        namespace = {'sm': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
        status, body, headers = self.request('/sitemap.xml')
        self.assertEqual(status, 200)
        self.assertTrue(any(key.lower() == 'content-type' and 'application/xml' in value for key, value in headers.items()))
        root = ElementTree.fromstring(body)
        self.assertEqual([node.text for node in root.findall('sm:sitemap/sm:loc', namespace)], [
            'https://bedmesh.example/sitemap.xml?part=pages', 'https://bedmesh.example/blog/public/sitemap.xml'])
        status, body, _ = self.request('/sitemap.xml?part=pages')
        self.assertEqual(status, 200)
        root = ElementTree.fromstring(body)
        locations = [node.text for node in root.findall('sm:url/sm:loc', namespace)]
        self.assertEqual(len(locations), 12)
        self.assertIn('https://bedmesh.example/guides/?topic=bed-mesh-repeatability', locations)
        self.assertIn('https://bedmesh.example/guides/?topic=cold-vs-heated-bed-mesh', locations)
        self.assertIn('https://bedmesh.example/guides/?topic=uneven-first-layer-flat-mesh', locations)
        for topic in ['how-flat-should-a-3d-printer-bed-be', 'bed-mesh-flipped', 'klipper-adaptive-mesh-3x3', 'bed-mesh-spike']:
            self.assertIn('https://bedmesh.example/guides/?topic=' + topic, locations)
        self.assertTrue(all(location.startswith('https://bedmesh.example/') for location in locations))
        self.assertTrue(all('/admin' not in location and '/preview' not in location for location in locations))

    def test_browser_modules_have_executable_mime_types_and_revalidate(self):
        for path in ["/js/app.js", "/js/analytics.mjs", "/js/navigation.js", "/js/reading.js", "/js/mesh-data.mjs", "/js/mesh-plot.mjs", "/js/workspace-data.mjs", "/js/mesh-comparison.mjs"]:
            with self.subTest(path=path):
                status, _, headers = self.request(path)
                headers = {key.lower(): value for key, value in headers.items()}
                self.assertEqual(status, 200)
                self.assertIn(headers["content-type"].split(";", 1)[0], ["text/javascript", "application/javascript"])
                self.assertEqual(headers.get("x-content-type-options"), "nosniff")
                self.assertIn("no-cache", headers.get("cache-control", ""))

    def test_entry_assets_bypass_caches_from_an_earlier_release(self):
        class Assets(HTMLParser):
            def __init__(self):
                super().__init__()
                self.urls = []

            def handle_starttag(self, tag, attrs):
                attrs = dict(attrs)
                url = attrs.get('src') if tag == 'script' else attrs.get('href') if tag == 'link' and attrs.get('rel') == 'stylesheet' else None
                if url and url.startswith(('/css/', '/js/')):
                    self.urls.append(url)

        # Include the journal's safe unconfigured page, which uses its own shared head.
        for page in ['/', '/guides/?topic=reading-a-mesh', '/blog/public/']:
            with self.subTest(page=page):
                parser = Assets()
                parser.feed(self.request(page)[1])
                self.assertGreaterEqual(len(parser.urls), 6)
                for url in parser.urls:
                    path, version = url.split('?v=', 1)
                    self.assertEqual(version, hashlib.sha256((ROOT / path.lstrip('/')).read_bytes()).hexdigest()[:16])
                    status, body, _ = self.request(url)
                    self.assertEqual(status, 200)
                    self.assertEqual(body, (ROOT / path.lstrip('/')).read_bytes().decode('utf-8'))

    def test_unknown_public_files_are_real_404s(self):
        for path in ["/missing-page", "/assets/missing-image.png", "/js/missing-module.mjs", "/guides/missing-page"]:
            with self.subTest(path=path):
                status, body, _ = self.request(path)
                self.assertEqual(status, 404)
                self.assertNotIn("<main", body)

    def test_private_paths_and_windows_separator_bypasses_are_denied(self):
        for path in [
            "/.git/config", "/.env", "/AGENTS.md", "/router.php", "/php/menu.php", "/scripts/serve.php",
            "/tests/mesh-data.test.mjs", "/docs/PROJECT_NOTES.md", "/blog/app/core/connection.php",
            "/blog/database/schema.sql", "/docs%5cPROJECT_NOTES.md", "//docs/PROJECT_NOTES.md",
            "/blog%5cdatabase%5cschema.sql", "/blog//database/schema.sql", "/%5c.git%5cconfig",
            "/blog%5c..%5c.git%5cconfig", "/docs./PROJECT_NOTES.md", "/assets/../.git/config",
            "/blog/README.md", "/test.html", "/backup.sql", "/assets/debug.log", "/config.php.bak",
            "/.htaccess", "/blog/.env.example", "/scripts/check-release.php",
        ]:
            with self.subTest(path=path):
                self.assertEqual(self.request(path)[0], 403)

    def test_posted_mesh_is_preserved_and_html_escaped(self):
        payload = '</textarea><script id="injected">alert(1)</script>'
        status, html, _ = self.request("/", urlencode({"data[]": payload}))
        self.assertEqual(status, 200)
        self.assertIn("&lt;/textarea&gt;&lt;script", html)
        self.assertNotIn('<script id="injected">', html)
        self.assertIn('data-posted="true"', html)

    def test_panel_query_is_bounded_and_ids_are_unique(self):
        status, html, _ = self.request("/?panels=999999")
        self.assertEqual(status, 200)
        self.assertEqual(html.count('class="mesh-panel" data-panel'), 9)  # eight panels + one template
        self.assertEqual(html.count('id="mesh-7-input"'), 1)
        self.assertNotIn('id="mesh-8-input"', html)

    def test_demo_routes_open_sample_panels_without_taking_over_posted_data(self):
        status, html, _ = self.request("/?demo=comparison&panels=8")
        self.assertEqual(status, 200)
        self.assertIn("data-comparison-demo", html)
        self.assertIn('id="comparison-sections"', html)
        self.assertIn('id="adjustment-baseline"', html)
        self.assertNotIn('id="calibration-sessions"', html)
        self.assertNotIn('id="measurement-history"', html)
        self.assertNotIn('id="printer-presets"', html)
        self.assertEqual(html.count('class="mesh-panel" data-panel'), 5)  # four panels + template
        self.assertIn('data-demo-action="report"', html)
        status, thermal, _ = self.request("/?demo=thermal")
        self.assertEqual(status, 200)
        self.assertEqual(thermal.count('class="mesh-panel" data-panel'), 3)
        self.assertIn('data-comparison-demo="thermal"', thermal)
        self.assertNotIn('bedmesh-analytics-page', thermal)
        _, posted, _ = self.request("/?demo=comparison", urlencode({"data[]": "0.1 0.2"}))
        self.assertNotIn("data-comparison-demo", posted)
        self.assertIn("0.1 0.2", posted)
        _, guide, _ = self.request("/guides/?topic=comparing-runs")
        self.assertIn('href="/?demo=comparison" target="_blank" rel="noopener"', guide)

    def test_invalid_or_oversized_posts_are_rejected_without_silent_truncation(self):
        for body, expected in [(urlencode({"data[]": "1" * 200001}), 413),
                               ("data%5B0%5D%5Bnested%5D=1", 400),
                               (urlencode([("data[]", "1,2") for _ in range(9)]), 413)]:
            with self.subTest(status=expected):
                status, html, _ = self.request("/", body)
                self.assertEqual(status, expected)
                self.assertIn('role="alert"', html)

    def test_unconfigured_blog_fails_without_connection_details(self):
        status, body, _ = self.request("/blog/public/")
        self.assertEqual(status, 503)
        self.assertIn("temporarily unavailable", body)
        self.assertNotIn("mysql:", body.lower())
        self.assertNotIn("PDO", body)

    def test_guides_work_without_a_database_or_visualizer_controller(self):
        for topic in ["", "reading-a-mesh", "getting-mesh-data", "comparing-runs", "bed-mesh-repeatability",
                      "cold-vs-heated-bed-mesh", "uneven-first-layer-flat-mesh", "how-flat-should-a-3d-printer-bed-be",
                      "bed-mesh-flipped", "klipper-adaptive-mesh-3x3", "bed-mesh-spike"]:
            with self.subTest(topic=topic):
                path = "/guides/" + ("?topic=" + topic if topic else "")
                status, html, _ = self.request(path)
                self.assertEqual(status, 200)
                self.assertIn("/js/navigation.js", html)
                self.assertNotIn("/js/app.js", html)
        for query in ["topic=unknown", "topic%5B%5D=reading-a-mesh", "topic=%3Cscript%3E"]:
            with self.subTest(query=query):
                status, html, _ = self.request("/guides/?" + query)
                self.assertEqual(status, 404)
                self.assertNotIn("<script>", html)


if __name__ == "__main__":
    unittest.main(verbosity=2)
