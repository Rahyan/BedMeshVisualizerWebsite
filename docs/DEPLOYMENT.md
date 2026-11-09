# Deployment notes

Bed Mesh runs as PHP pages and browser-native JavaScript modules. There is no package installation or build step. No deployment is performed by the verification scripts.

## Prepare a release

From the repository checkout, with PHP 8.1+, Node 18+, Python 3, and Git available:

```sh
php scripts/check-release.php
```

The command checks candidate filenames for private/runtime data, validates the empty SQL schema, syntax-checks PHP and browser modules, checks local page asset references, and runs the JavaScript, blog-helper, and loopback HTTP tests. Database environment variables are removed from its child processes. It does not contact a database, download packages, or contact a deployment host.

It includes tracked and non-ignored new files so work under review can be checked before committing. It does not certify arbitrary file contents as secret-free. Review the final Git diff before preparing an archive; do not copy the entire working folder. Real environment files, `.git/`, `.work/`, uploads, sessions, dumps, and credentials must stay out of the release. Only `blog/database/schema.sql` is an allowed SQL file. Include the `.htaccess` files; some transfer tools omit dotfiles.

GitHub Actions runs the release checks on pull requests, pushes to `main`, and version tags. To publish a GitHub source release, push an annotated version tag on a reviewed commit. The workflow uses the tag annotation as release notes once the checks pass. Use public release notes in the annotation and set your Git author and tagger email to your GitHub noreply address if you keep your email private.

```sh
git tag -a v2.0.1 -F release-notes.md
git push origin v2.0.1
```

The application minimum is PHP 8.1, but the production host needs a currently supported, patched branch. PHP 8.1 is no longer upstream-supported. Consult the current [PHP support table](https://www.php.net/supported-versions.php) when choosing the host runtime. Node, Python, and Git are verification tools; the served visualizer needs only PHP and a browser.

Set `BEDMESH_SITE_URL` to the trusted public origin, normally `https://bedmesh.com`. Canonical and share URLs deliberately ignore the incoming Host header. Use `BEDMESH_NOINDEX=1` for a staging host; the local PHP preview automatically emits noindex metadata. Update the absolute sitemap line in `robots.txt` if hosting on a different domain. `/sitemap.xml` lists tool/guide pages and the database journal's published-only sitemap.

Optional analytics on the canonical Bed Mesh site requires `BEDMESH_GA_MEASUREMENT_ID` in the host's PHP environment. Supply it before upgrading that site to this version. Analytics stays off when the setting is missing, in local previews, and on staging pages. Keep site verification files and real configuration outside the source checkout. Manage them on the host.

## Apache hosting

Serve the project root with PHP enabled and directory listings disabled. The checked-in access rules require Apache 2.4 `mod_rewrite`, authorization support, and an appropriate `AllowOverride` setting. `mod_mime` supplies JavaScript MIME types; enable `mod_headers` for the response headers and asset revalidation rules. A virtual host's directory block must permit the directives used here, for example:

```apache
<Directory "/srv/bedmesh">
    Options -Indexes
    AllowOverride FileInfo AuthConfig Options
    Require all granted
</Directory>
```

The root rules deny private PHP includes, docs, tests, scripts, dotfiles, backups, database files, and key files. Blog rules additionally protect its application/database directories. They set `.mjs` and `.js` to `text/javascript`, prevent MIME sniffing, and require CSS/JavaScript revalidation, including stable native module imports. PHP adds a content digest to stylesheet and entry-module URLs so caches from earlier releases cannot mix old entry assets with new markup. No build step is required. `no-cache` permits caching with validation; it does not mean the resources cannot be cached. See the [Apache MIME documentation](https://httpd.apache.org/docs/2.4/mod/mod_mime.html#addtype) and [header documentation](https://httpd.apache.org/docs/2.4/mod/mod_headers.html).

Check the actual Apache configuration before release. The PHP preview server does not interpret `.htaccess`, so passing local router tests cannot establish Apache protection. Other servers need equivalent path restrictions, native-module MIME types, PHP execution, and error behavior. Do not expose the checkout through an ordinary static-file server.

Keep HTTPS/proxy configuration at the hosting layer. If the optional blog uses sessions behind a trusted TLS proxy, configure the server to report HTTPS correctly to PHP. Do not trust arbitrary client-forwarded headers. Keep PHP error display disabled and application logs private.

On managed hosting, check which PHP configuration and access directives the web handler actually reads. Keep host-specific overrides separate from the source archive. Verify environment configuration, JavaScript MIME types, and cache headers through the HTTPS handler.

## Local preview and optional blog

```sh
php scripts/serve.php
```

This starts the guarded preview on `127.0.0.1:8765`, with ignored temporary/session files under `.work/`. The PHP built-in server is for local development and [must not be used on a public network](https://www.php.net/manual/en/features.commandline.webserver.php).

The visualizer and public guides need no database. The blog remains separate; follow [its configuration instructions](../blog/README.md) and use an empty local database to verify publishing. Without blog database configuration, database-backed requests return a safe 503.

For the complete local site, start `php scripts/blog-local.php start`, apply `php scripts/blog-db.php migrate --local`, create a local publishing account, and run `php scripts/serve.php --blog`. These commands use ignored development-only configuration and a separate datadir. `php blog/tests/integration.php` verifies that datadir before creating a disposable database/user; it checks real publishing, uploads, migration and concurrent saves separately from the database-free release checker. Production requires its own restricted database user and explicit `php scripts/blog-db.php migrate` using the intended environment.

Existing journal tables must use InnoDB for transactional publishing. The migration checks storage metadata before any DDL and stops if a managed table uses another engine or is a view. It does not automatically convert engines. Take and verify a backup, pause publishing, and have an operator review and manually convert incompatible tables before rerunning the migration. Rehearse the engine conversion independently of the application upgrade.

Managed table names must match the documented lowercase spelling. The same pre-DDL check blocks uppercase variants rather than creating a separate empty journal on a case-sensitive host. Renaming legacy tables is an explicit operator action after backup and with publishing paused; it never happens automatically.

Coordinate code and database backups before cutover; schema DDL does not roll back with an application transaction. Keep a record of files deliberately removed for security. A full-tree restore must exclude those paths rather than republish an old database export or credential file from a pre-cleanup backup.

## Check the configured host before publishing

Use synthetic measurements. Confirm the visualizer and guides load; inspect the network panel for failed local assets and JavaScript MIME errors. A `.mjs` request must return JavaScript, not HTML or a generic download. Confirm changes to a stable module URL revalidate instead of serving an old cached module indefinitely.

Confirm private paths such as `/.env`, `/.git/config`, `/php/menu.php`, `/docs/DEPLOYMENT.md`, `/blog/app/core/connection.php`, `/blog/database/schema.sql`, and backup files return 403/404 with no file contents. An unknown public asset must return 404. Check this on the configured host because a proxy or ignored `.htaccess` can change routing behavior.

In the in-app browser, check keyboard navigation, visible focus, the mobile menu, repeated chart updates, surface/heatmap and fitted-plane views, before/after comparison, CSV/PNG downloads, local workspace persistence, and workspace file round trips. Block the chart CDN once and confirm the input, statistics, and CSV remain usable and Visualize can retry. Plotly's 3D mode needs WebGL; a measured-values table and heatmap provide alternate ways to inspect data.

The automated checks cover synthetic/local behavior. They do not connect to a printer, validate production credentials, exercise a real hosting configuration, or deploy anything.
