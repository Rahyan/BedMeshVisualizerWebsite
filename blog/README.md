# Bed Mesh journal

The journal is a real PHP/MySQL application. Published articles, drafts, categories, author accounts, and login throttling live in the configured database. Public readers need no account. The mesh visualizer and guides work independently of the journal's database.

## Routes and structure

- `/blog/` redirects to `/blog/public/`, the public journal.
- `/blog/public/post/<slug>` is an article. `?preview=1` requires a current administrator session and permits draft previews.
- `/blog/public/category/<slug>` filters published articles; `/blog/public/search?find=...` searches their titles, summaries, and bodies.
- `/blog/public/sitemap.xml` contains the journal root and eligible published articles.
- `/blog/public/login` and `/blog/public/admin` provide private publishing. Public registration is disabled.
- The former `/blog/public/blog` route redirects to the journal; `/contact` redirects to the site's About section.

`public/index.php` establishes the session and CSRF boundary. `app/application.php` dispatches current routes; `app/views/` contains the shared-chrome public and admin templates. `app/core/` provides configuration, prepared database access, publication helpers, uploads, sanitization, and explicit migrations. `css/blog.css` lives in the project root. Legacy Bootstrap, Summernote, jQuery, slider assets, and unused old controllers have been removed.

## Database configuration

Use PHP 8.1 or newer, PDO MySQL, DOM, fileinfo, mbstring, and sessions. GD is recommended for resizing uploads. Use supported, patched PHP and database releases on a deployment server. The isolated preview can use an existing MariaDB binary without installing or modifying a database service.

Set these in the server/PHP environment:

| Variable | Purpose |
| --- | --- |
| `BEDMESH_DB_HOST` | Database host; no production default |
| `BEDMESH_DB_PORT` | Optional port, default `3306` |
| `BEDMESH_DB_NAME` | Existing database name |
| `BEDMESH_DB_USER` | Application database user |
| `BEDMESH_DB_PASS` | Database password; no production fallback |
| `BEDMESH_BLOG_URL` | Public URL/path; default `/blog/public` |
| `BEDMESH_SITE_URL` | Shared trusted site origin for canonical and sitemap URLs |

`.env.example` documents placeholders. PHP does not automatically load `.env` files. Keep real configuration outside the public web root and version control. For this integrated site, serve the project root with the included access rules so shared `/css`, `/js`, `/assets`, and site chrome remain available. A standalone journal deployment requires additional server aliases for those shared assets and is not the default setup.

Create a separate empty database and a restricted application user, then run the explicit migration with that environment:

```sh
php scripts/blog-db.php migrate
```

The safe `database/schema.sql` contains only table definitions. Migrations preserve existing rows, add publication fields, widen article content capacity, add a login-attempt digest table, and enforce unique article/category URLs. Existing legacy articles default to **draft** with no publication date; review and publish them intentionally.

All managed journal tables require **InnoDB** so article, revision, and recovery changes can commit together. Before creating tables or applying any migration DDL, the migration checks existing `users`, `categories`, `posts`, `blog_login_attempts`, `post_revisions`, and `post_recoveries`. It stops without schema or data changes if one uses another engine or is a view. It never converts storage engines automatically. After a verified backup and with publishing paused, an operator must review and manually convert the identified tables to InnoDB, then rerun the migration. Rehearse that conversion separately; it can rewrite and lock existing tables.

Managed table names must also match those exact lowercase names. An uppercase legacy variant stops the migration before it can create a separate empty lowercase table on a case-sensitive server. Review and explicitly rename mismatched tables after backup and while publishing is paused; the migration never renames them automatically.

If legacy records share a slug, migration stops with a safe explanation. Inspect and resolve those duplicate URLs in your database administration tool, then rerun. It never deletes or silently renames articles or categories. Concurrent new saves use unique database constraints with bounded collision retry. Editing a title/category name preserves its existing URL.

The application needs SELECT, INSERT, UPDATE, and DELETE for normal operation. The migration additionally needs CREATE, ALTER, and INDEX. Grant migration privileges only when applying the explicit setup or upgrade.

## Create or reset a publishing account

There are no default administrator credentials. Use process environment variables with the CLI account command. In PowerShell, a password can be entered without echoing it:

```powershell
$env:BEDMESH_ADMIN_EMAIL = 'you@example.com'
$env:BEDMESH_ADMIN_NAME = 'Your name'
$blogPassword = Read-Host 'Administrator password (at least 12 characters)' -AsSecureString
$env:BEDMESH_ADMIN_PASSWORD = [Net.NetworkCredential]::new('', $blogPassword).Password
php scripts/blog-db.php admin
Remove-Item Env:\BEDMESH_ADMIN_PASSWORD
```

Rerunning the command for an existing email updates that account's name/password and administrator role. No credentials are printed. Sign in through the private login page. Use a dedicated password of 12–72 bytes and clear temporary process variables after setup.

If the previously embedded production database credentials are still active, rotate them at the provider. Removing them from source does not invalidate credentials or remove external copies.

## Isolated local preview

These commands use only the project's ignored `.work/blog-local/` data directory, a random loopback port, and generated development-only credentials in ignored `.work/blog-local.json`. No installed Wamp/MySQL/MariaDB service, existing data directory, or configuration file is changed.

```sh
php scripts/blog-local.php start
```

Keep that process running. It discovers an installed `C:/wamp64/bin/mariadb/*/bin`; alternatively set `BEDMESH_MARIADB_BIN` to the installed MariaDB `bin` directory. The tool refuses a different configured data directory. In another terminal:

```sh
php scripts/blog-db.php migrate --local
```

Create an administrator as above, using `php scripts/blog-db.php admin --local`. To insert the three original editorial articles supplied for the local preview, run:

```sh
php scripts/blog-db.php seed --local
php scripts/serve.php --blog
```

The seed command is allowed only on the verified isolated local database, requires an administrator, is repeatable, and leaves existing articles untouched. It is not a populated SQL export and does not create a default account. Preview content and credentials remain local; publishing a production journal requires its own configured database and explicit editorial decisions.

Open `http://127.0.0.1:8765/blog/public/`. The ordinary visualizer preview starts without database configuration unless `--blog` is explicitly supplied. Use `php scripts/blog-local.php status` and `php scripts/blog-local.php stop` to inspect or stop only the isolated instance. Preserve `.work/` privately if you want to keep local drafts; it is runtime data, not a backup to commit.

## Publishing and security

Save an article as a private draft or publish it immediately. The editor accepts semantic HTML, an optional short summary, a category, and a featured image with alt text, caption, and credit. Drafts may omit an image; publishing requires a relevant image and description. Choose a verified upload or an image shipped in `assets/articles/`. Screenshots have a full-size link so readers can inspect their labels. Save, then open the private preview to check layout. Article/category deletion requires a separate confirmation form; occupied categories must have their articles moved before deletion. Hiding a category hides its articles in public lists, searches, related articles, direct URLs, and the sitemap.

Formatting controls insert paragraph/heading/list/code markup around selected source text; Bold/Italic also support Ctrl/⌘ + B/I. Link insertion checks its address, and Undo insert restores the last formatting action until another body edit. The server validates and sanitizes saved content independently of these browser controls.

The browser saves unfinished text and image metadata to a separate **database recovery** record after an editing pause. This never changes or publishes the canonical article. Recovery is private to the administrator and article (including a new-article slot), expires after 14 days, and needs an explicit Recover or Discard choice when reopening. File bytes are not recovered: reselect a new upload. An unsaved-change indicator and navigation warning remain. Network/authentication failures pause recovery with a retry control; Save article remains available. Version checks prevent another tab from silently replacing a newer recovery or article. Unacknowledged recovery is preserved when a different form is saved.

Each manual save records a snapshot of content and image metadata. The latest 50 revisions per article are kept in the database. Review saved revision history before restoring; restoration creates a new **private draft**, preserves the current URL, and never automatically republishes. A stale editor or restore request returns 409 with work retained. Apply the explicit migration before using these controls; web requests do not change the schema.

Public queries require published status, a non-future publication date, an enabled category, and featured image metadata. Draft previews require a signed-in administrator. The administrator role is rechecked in the database on private requests, so revocation applies to existing sessions too. Every mutation, including login/logout, requires a session CSRF token. Session IDs rotate after authentication, cookies use HttpOnly and SameSite=Lax, and Secure is enabled when PHP receives HTTPS. Configure trusted TLS proxies to report HTTPS correctly.

Failed login attempts are counted in the database using a digest of the request IP and normalized email. Eight failures trigger a fifteen-minute cooldown even if a client replaces its session cookies. Raw IP addresses and email values are not stored in this counter; expired entries are cleaned during login requests.

Rich article HTML is sanitized on save and again on display. Scripts, styles, event handlers, arbitrary embeds, unsafe link protocols, and external image tracking are removed. Uploaded and embedded images must be verified JPEG, PNG, or WebP, at most 5 MB and 20 megapixels. Filenames/extensions are generated from verified image bytes, never supplied names. Removing an article does not delete potentially shared upload files. Runtime uploads are never committed.

Apache requires `mod_rewrite` and `AllowOverride` for the included private-path guards. Equivalent restrictions are required for other web servers. Private source, schema, tests, runtime files, and real configuration must never be exposed. Without a configured or migrated database, public requests return a themed safe 503 and preserve links to the independent visualizer and guides. Driver errors and connection secrets are not printed.

## Verify

```sh
php blog/tests/security.php
php blog/tests/integration.php
```

The first command uses no database. The second requires the running isolated local MariaDB and verifies its data directory before creating a disposable database and restricted temporary user. It checks migration preservation/duplicate guards, concurrent URL creation, publication visibility, search/pagination, login/session/CSRF, actual uploads, sanitization, category/article CRUD, draft preview, role revocation, sitemap filtering, and fresh-cookie login throttling. It drops only the database/user generated for that run. All temporary logs and session cookies stay in ignored `.work/`.

Run PHP syntax checks for changed files and the project's regular JavaScript/HTTP checks. No production database or live accounts are needed for validation. No push or deployment is part of local development.
