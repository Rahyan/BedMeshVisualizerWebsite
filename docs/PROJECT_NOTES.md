# Project notes
## Design and scope
Preserve the original white-and-blue tool identity, uppercase navigation/section labels, existing font families, and direct input/output layout. The selected logo source is `assets/bedmesh-logo.png`; smaller brand/favicon/touch variants preserve it. No Sites integration, visualizer account requirement, or printer connection was introduced. The journal intentionally uses a database.

## Architecture
- PHP renders the page and panel template. Browser modules handle data, Plotly, workspace state, and navigation separately.
- Original measurements remain the source for statistics and CSV. Reference/orientation are display transforms.
- Shared comparison scales cover transformed heights consistently. Physical X/Y coordinates are used only with both sampled-area dimensions.
- Browser storage is versioned and bounded. It must not replace explicitly posted data. Save only dirty state, check the exact stored baseline before writing, and pause autosave when another tab has changed it.
- Workspace files are portable JSON, with strict whole-file validation before replacement. Stored legacy workspaces use tolerant recovery separately. Both paths live in the pure `workspace-data.mjs` module.
- Fitted-plane analysis uses the original regular grid. Display residuals distinguish overall tilt from remaining variation without presenting it as a mechanical diagnosis.
- Difference heatmaps use pointwise after-minus-before values with a separate reference selection and symmetric colour bounds. Require matching grids and declared dimensions; explicit flips align displayed coordinates, while users establish physical origins. Never resample silently. Setting edits invalidate stale exports immediately.
- Optional measurement declarations travel with each mesh: local recorded date/time, bed temperature, build surface, printer/setup, and notes. Version 2 workspaces remain backward compatible. Strict file imports reject invalid context before replacing any panels; local-storage recovery has separate tolerant defaults. Comparison notices report missing/different declared conditions without treating matching text as physical validation.
- Plotly owns its chart container: do not clear its DOM before `react`. Purge only on disposal/reset.
- Inputs are validated before plotting. A rendering failure must leave editable input and original data exports usable.
- The database journal is independently configured with environment variables and a safe empty schema. Public queries require published status, a non-future publication date, and an enabled category. Private requests recheck the administrator role in the database. CSRF applies to every mutation. Production credentials and user data are absent.
- Explicit migrations preserve legacy articles as drafts, stop on legacy duplicate slugs, and enforce URL uniqueness. Concurrent creation retries database collisions. Login throttling persists across new sessions.
- Editor formatting operates on source text without evaluating it; server sanitization remains authoritative. Unsaved-change tracking and one-insert undo are progressive enhancements.
- Publishing saves versioned canonical articles with at most 50 database revision snapshots. Restore preserves the URL and always creates a private draft. Separate per-administrator/article database recovery never publishes or overwrites canonical content. Recovery versions retain null markers after discard/expiry to prevent stale-tab replacement; unacknowledged recovery is not cleared by another form's save. Text expires after 14 days; new upload bytes must be reselected.
- Relevant article screenshots live in `assets/articles/` with provenance in `docs/ARTICLE_IMAGES.md`. Captions label simulated examples; featured images require alt text before publishing. Trusted local image resolution, intrinsic dimensions, contained previews, full-size links, and escaped credits preserve readable chart evidence.
- Motion is shared through `css/motion.css` and `js/motion.js`: native disclosure sizing, keyboard-safe hidden/inert menus, one-time content entrances, and brief changed-status feedback. Contents stay visible without JavaScript; reduced-motion preferences disable movement and active Web Animations. Plotly's DOM is never observed or wrapped by these enhancements.
- Public guides are independent of the blog/database. Article pages additionally load the shared table-of-contents script; publishing scripts stay off public pages.
- Shared metadata uses a trusted configured origin, never the incoming Host header. Private/error pages omit canonical URLs. Preview-server pages are noindex. Sitemaps include public pages and eligible database articles.
- Shared PHP adds content hashes to CSS and entry-module URLs to bypass caches from older deployments. Stable native module imports also require JavaScript MIME types and revalidation on the host. The live browser check caught stale legacy assets despite otherwise successful HTTP checks.
- The preview launcher puts temporary files and sessions in ignored `.work/` paths; it does not change global PHP configuration.

## Verify a change

Run `php scripts/check-release.php` for the JavaScript tests, PHP security helpers, and loopback HTTP checks. For a journal change, also run the [isolated database integration tests](../blog/README.md). The [firmware fixtures](FIRMWARE_FIXTURES.md) document which printer reports are represented and where they came from.

Use example meshes when checking the first visit, the chart and its keyboard controls, and whether exported workspaces open again. Check the hosting configuration separately using the [deployment notes](DEPLOYMENT.md).
