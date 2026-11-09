<?php
declare(strict_types=1);
require_once __DIR__ . '/php/mesh-panel.php';
require_once __DIR__ . '/php/head.php';
$datasets = [];
$serverMessage = '';
if (isset($_POST['data'])) {
    $posted = (array) $_POST['data'];
    if (count($posted) > 8) {
        http_response_code(413);
        $serverMessage = 'Open at most eight meshes at a time. No partial input was loaded.';
    } else {
        foreach ($posted as $value) {
            if (!is_string($value) || strlen($value) > 200000) {
                http_response_code(is_string($value) ? 413 : 400);
                $serverMessage = 'Each mesh must be plain text of at most 200 KB. The input was not loaded; shorten it and try again.';
                $datasets = [];
                break;
            }
            $datasets[] = $value;
        }
    }
}
$count = filter_input(INPUT_GET, 'panels', FILTER_VALIDATE_INT) ?: 1;
foreach (array_keys($_GET) as $key) {
    if (is_numeric($key)) $count = (int) $key;
}
$count = max(1, min(8, max($count, count($datasets))));
$demo = $_GET['demo'] ?? '';
$comparisonDemo = in_array($demo, ['comparison', 'thermal'], true) && ($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST';
$thermalDemo = $comparisonDemo && $demo === 'thermal';
if ($comparisonDemo) $count = $thermalDemo ? 2 : 4;
?>
<!doctype html>
<html lang="en">
<head>
    <?php render_site_head([
        'description' => 'Explore your 3D printer bed mesh as an interactive 3D surface or heatmap. Compare measurements and export your data. Free, with local browser storage.',
        'path' => '/',
        'noindex' => $comparisonDemo,
    ]); ?>
    <?php if (!$comparisonDemo && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
        render_site_schema([
            '@type' => 'WebApplication',
            'name' => 'Bed Mesh',
            'url' => site_origin() . '/',
            'applicationCategory' => 'UtilitiesApplication',
            'browserRequirements' => 'Requires JavaScript',
            'isAccessibleForFree' => true,
            'offers' => ['@type' => 'Offer', 'price' => 0, 'priceCurrency' => 'USD'],
        ]);
    } ?>
    <link rel="stylesheet" href="<?= site_escape(site_asset_url('/css/comparison.css')) ?>">
    <link rel="stylesheet" href="<?= site_escape(site_asset_url('/css/sessions.css')) ?>">
    <link rel="stylesheet" id="mesh-tool-styles" href="<?= site_escape(site_asset_url('/css/mesh-tools.css')) ?>">
</head>
<body>
    <a class="skip-link" href="#visualizer">Skip to visualizer</a>
    <?php require __DIR__ . '/php/menu.php'; ?>
    <main class="page-shell">
        <div class="page-intro">
            <h1>3D Printer Bed Mesh Visualizer</h1>
            <p>Plot your printer’s bed mesh as a heatmap or 3D surface. Inspect each point and compare your next adjustment.</p>
            <p class="format-note">Marlin G29 <span aria-hidden="true">·</span> Prusa G81 <span aria-hidden="true">·</span> Klipper matrices <span aria-hidden="true">·</span> CSV &amp; JSON</p>
        </div>
        <section id="visualizer" class="workspace" aria-label="Bed mesh visualizer" data-posted="<?= ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST' ? 'true' : 'false' ?>"<?php if ($comparisonDemo): ?> data-comparison-demo="<?= $thermalDemo ? 'thermal' : 'comparison' ?>"<?php endif; ?>>
            <?php if ($comparisonDemo): ?>
                <div class="demo-banner">
                    <div>
                        <h2><?= $thermalDemo ? 'Cold vs. heated bed demo' : 'Calibration walkthrough' ?></h2>
                        <p><?= $thermalDemo
                            ? 'Compare two simulated scans of the same bed at 22 °C and 60 °C. Explore the centre and the edge to separate a height shift from a change in shape.'
                            : 'Three simulated scans show how much the readings vary before an adjustment. A fourth scan shows what changes when one side of the bed is lowered. This is a temporary workspace.' ?></p>
                    </div>
                    <?php if ($thermalDemo): ?>
                        <div class="toolbar-actions"><a class="button button-secondary" href="#mesh-difference">See cold vs. heated</a><a class="button button-quiet" href="/guides/?topic=cold-vs-heated-bed-mesh">Read the guide</a></div>
                    <?php else: ?>
                        <ol class="demo-steps">
                            <li><a href="#adjustment-baseline">Read the baseline</a><span>See the spread across the three unchanged scans.</span></li>
                            <li><a href="#mesh-difference">Compare the adjustment</a><span>Read the signed change across the bed.</span></li>
                            <li><button type="button" data-demo-action="point">Inspect the right edge</button><span>Compare the change with the spread and follow the row and column.</span></li>
                            <li><button type="button" data-demo-action="report">Open the report</button><span>Download a copy with the maps and selected cross-sections.</span></li>
                        </ol>
                        <div class="toolbar-actions"><a class="button button-quiet" href="/">Open my workspace</a></div>
                    <?php endif; ?>
                </div>
            <?php endif; ?>
            <div class="workspace-toolbar">
                <div class="workspace-label"><span class="status-dot" aria-hidden="true"></span><span id="save-status" role="status">Your meshes stay in this browser</span></div>
                <div class="toolbar-actions">
                    <button type="button" class="button button-quiet" data-global="example">Try example</button>
                    <button type="button" class="button button-quiet" data-global="log">Scan a printer log</button>
                    <button type="button" class="button button-secondary" data-global="visualize"<?= $count < 2 ? ' hidden' : '' ?>>Visualize all</button>
                    <button type="button" class="button" data-global="add"><span aria-hidden="true">＋</span> Add mesh</button>
                </div>
            </div>
            <noscript><p class="notice notice-error">The interactive visualizer needs JavaScript. Enable it to plot and compare meshes; the instructions below are available without it.</p></noscript>
            <?php if ($serverMessage !== ''): ?><p class="notice notice-error" role="alert"><?= htmlspecialchars($serverMessage, ENT_QUOTES, 'UTF-8') ?></p><?php endif; ?>
            <?php if (!$comparisonDemo): ?>
                <p class="workspace-start">Paste one height grid or import a file below. For a full console log, choose <strong>Scan a printer log</strong>. <a href="/guides/?topic=getting-mesh-data#firmware-output">Find your printer’s mesh data</a>.</p>
            <?php endif; ?>
            <div id="workspace-message" class="workspace-message" role="status" aria-live="polite"></div>
            <div id="mesh-panel-container">
                <?php for ($index = 0; $index < $count; $index++) { render_mesh_panel((string) $index, (string) ($index + 1), $datasets[$index] ?? '', !$comparisonDemo); } ?>
            </div>
            <div class="workspace-bottom">
                <label class="check-label"><input id="shared-scale" type="checkbox" checked> Match scales when comparing meshes</label>
                <div class="toolbar-actions">
                    <button type="button" class="button button-quiet" data-global="undo" hidden>Undo clear</button>
                    <?php if (!$comparisonDemo): ?>
                        <button type="button" class="button button-quiet" data-global="history">Measurement history</button>
                        <button type="button" class="button button-quiet" data-global="sessions">Calibration sessions</button>
                    <?php endif; ?>
                    <button type="button" class="button button-quiet" data-global="save-workspace">Save workspace</button>
                    <button type="button" class="button button-quiet" data-global="open-workspace">Open workspace</button>
                    <button type="button" class="button button-quiet" data-global="clear"><?= $comparisonDemo ? 'Clear demo meshes' : 'Clear all saved meshes' ?></button>
                    <input id="workspace-file" type="file" accept=".json,application/json" aria-label="Open a saved workspace" hidden>
                </div>
            </div>
            <p id="workspace-file-message" class="workspace-file-message" role="status" aria-live="polite"></p>
            <section id="mesh-comparison" class="comparison" aria-labelledby="comparison-title" hidden>
                <div class="section-heading"><h2 id="comparison-title">Compare your meshes</h2><span>Measured heights &amp; plane residuals · mm</span></div>
                <div class="table-scroll"><table><thead><tr><th scope="col">Mesh</th><th scope="col">Grid</th><th scope="col">Height range</th><th scope="col">Mean height</th><th scope="col">Std. deviation</th><th scope="col">Residual range</th></tr></thead><tbody id="comparison-body"></tbody></table></div>
                <p class="small-note">A smaller range means less measured height variation. Compare meshes taken with the same probing setup and bed temperature.</p>
                <div class="difference" id="mesh-difference" aria-labelledby="difference-title">
                    <div class="difference-heading"><div><h3 id="difference-title" tabindex="-1">Difference heatmap</h3><p>Point-by-point height change, after minus before.</p></div><button class="button button-secondary" type="button" data-difference="swap">Swap meshes <span aria-hidden="true">⇄</span></button></div>
                    <div class="difference-controls">
                        <label for="difference-before">Before mesh<select id="difference-before"></select></label>
                        <label for="difference-after">After mesh<select id="difference-after"></select></label>
                        <label for="difference-reference">Compare heights<select id="difference-reference"><option value="original">As measured</option><option value="mean">Relative to each mesh's mean</option><option value="plane">With each fitted tilt removed</option></select></label>
                    </div>
                    <p class="difference-alignment">Compare the same probed points. Match the grid size and sampled XY bounds, then use Flip X/Y to align their orientation.</p>
                    <p id="difference-message" class="difference-message" role="status" aria-live="polite"></p>
                    <dl class="difference-summary">
                        <div><dt>Mean height change</dt><dd data-delta-stat="meanHeightChange">—</dd></div>
                        <div><dt>Measured range change</dt><dd data-delta-stat="measuredRangeChange">—</dd></div>
                        <div><dt>Delta grid range</dt><dd data-delta-stat="range">—</dd></div>
                        <div><dt>RMS point change</dt><dd data-delta-stat="rms">—</dd></div>
                    </dl>
                    <p class="difference-summary-note">All values are in mm. Mean and range changes use original heights; delta range and RMS follow the chosen reference.</p>
                    <details class="difference-help"><summary>Reading the difference</summary><p>A positive value means the after measurement is higher. A uniform height shift changes the mean without necessarily changing surface variation. RMS describes the size of the changes, rather than whether they improved your first layer.</p><p>The selected reference applies to each mesh before subtraction. Flip X/Y follows each panel's settings. Matching grid sizes and dimensions cannot establish that their physical probing origins match; check that both runs measured the same area. No interpolation is applied.</p></details>
                    <div class="difference-plot-wrap"><div id="difference-graph" class="difference-graph" role="img" aria-label="After-minus-before height difference heatmap"></div><div class="difference-placeholder" data-delta-placeholder>Choose two compatible visualized meshes to see their difference.</div></div>
                    <section class="point-inspector" id="point-inspector" aria-labelledby="point-title" hidden>
                        <h4 id="point-title" tabindex="-1">Inspect a point</h4>
                        <p>Click a heatmap cell or enter its displayed sample indices. The same point is marked on both meshes.</p>
                        <form id="inspect-point">
                            <label for="inspect-x">X index<input type="number" id="inspect-x" min="0" step="1" required value="0"></label>
                            <label for="inspect-y">Y index<input type="number" id="inspect-y" min="0" step="1" required value="0"></label>
                            <button type="submit" class="button button-secondary">Inspect point</button>
                            <button type="button" class="button button-quiet" data-clear-point disabled>Clear marker</button>
                        </form>
                        <div data-point-readout role="status"></div>
                        <section class="comparison-sections" id="comparison-sections" aria-labelledby="sections-title" hidden>
                            <h4 id="sections-title">Cross-sections</h4>
                            <p>Before and After share a height scale. The lines connect measured samples, with the selected point marked in each profile.</p>
                            <div class="sections-legend"><span class="profile-key-before">Before</span><span class="profile-key-after">After</span><span>Height (mm)</span></div>
                            <div class="section-profiles" data-section-profiles></div>
                        </section>
                    </section>
                    <div class="difference-actions"><span>Blue: after lower <span aria-hidden="true">·</span> White: no change <span aria-hidden="true">·</span> Warm: after higher</span><div><button class="text-button" type="button" data-difference="refresh" disabled>Refresh heatmap</button><button class="text-button" type="button" data-difference="reset" disabled>Reset view</button><button class="text-button" type="button" data-difference="png" disabled>Save image</button><button class="text-button" type="button" data-difference="csv" disabled>Export delta CSV</button><button class="text-button" type="button" data-difference="report" disabled>Comparison report</button></div></div>
                    <details class="difference-values" data-delta-values-detail hidden><summary>View difference values</summary><div class="table-scroll" data-delta-values></div></details>
                    <details class="adjustment-baseline" id="adjustment-baseline" hidden>
                        <summary>Adjustment vs. repeatability</summary>
                        <p class="difference-summary-note">Choose repeat scans taken before the adjustment under the same conditions. The After scan is excluded. Use the same sampled area and verify that the probe points line up.</p>
                        <fieldset class="repeat-choices"><legend>Baseline scans</legend><div data-baseline-choices></div></fieldset>
                        <p class="difference-message" data-baseline-message role="status"></p>
                        <div data-baseline-output hidden></div>
                        <p class="baseline-point" data-baseline-point aria-live="polite"></p>
                        <?php if (!$comparisonDemo): ?><button class="button button-secondary" type="button" data-difference="save-session" disabled>Save calibration session</button><?php endif; ?>
                    </details>
                </div>
                <?php require __DIR__ . '/php/mesh-repeat-runs.php'; ?>
            </section>
            <template id="mesh-panel-template"><?php render_mesh_panel('__ID__', '__NUMBER__', '', !$comparisonDemo); ?></template>
        </section>
        <section id="how-to" class="guide" aria-labelledby="how-to-title">
            <div class="section-heading"><h2 id="how-to-title">How to use Bed Mesh</h2><a href="/guides/">Read the guides ↗</a></div>
            <div class="guide-steps">
                <div><span class="step-number">01</span><h3>Get your mesh</h3><p>Copy the numeric grid from your printer console: Marlin's <code>G29</code> output, Prusa's <code>G81</code> output, or a Klipper mesh matrix.</p></div>
                <div><span class="step-number">02</span><h3>See the surface</h3><p>Paste the output or import a text, CSV, or JSON file. Switch between a 3D surface and a top-down heatmap to inspect each measured point.</p></div>
                <div><span class="step-number">03</span><h3>Compare your changes</h3><p>Add another mesh after an adjustment. <a href="/?demo=comparison" target="_blank" rel="noopener">Try the calibration walkthrough</a> to see how repeat scans help you interpret a change.</p></div>
            </div>
            <details class="help-detail"><summary>Which data formats can I use?</summary><p>Paste the full console grid, including numbered rows and columns. Plain rectangular matrices, comma-separated values, and JSON arrays of numeric rows also work. Measurements should be in millimetres. Missing points and inconsistent row lengths need to be corrected before plotting.</p><p>The example is a simulated mesh so you can explore the controls without connecting a printer. Bed Mesh does not send commands to your printer.</p></details>
            <details class="help-detail"><summary>How should I read the chart?</summary><p>Blue marks lower measurements; warm colours mark higher measurements. The range is the difference between the highest and lowest point. Mean height is the signed average, while standard deviation describes the spread around that average.</p><p>Probe indices follow the order of your pasted grid. Use Flip X or Flip Y to match your printer's orientation. Optional width and depth describe the <strong>probed area</strong>, not necessarily the entire print bed. The 3D view exaggerates height to make variation visible; hover a point for its measured value.</p></details>
        </section>
        <section id="about" class="about-section" aria-labelledby="about-title">
            <img src="/assets/bedmesh-brand.png" width="100" height="100" alt="" loading="lazy" decoding="async">
            <div><h2 id="about-title">About Bed Mesh</h2><p>Bed Mesh is a free, open-source project by Rahyan Saouab, made to help with 3D printer bed levelling. Your measurements are processed in your browser, with no account required.</p><p>Mesh variation is one part of a good first layer. Probe accuracy, nozzle offset, temperature, and your printer's mechanics matter too.</p></div>
        </section>
    </main>
    <?php require __DIR__ . '/php/mesh-dialogs.php'; ?>
    <?php if (!$comparisonDemo): ?>
        <?php require __DIR__ . '/php/calibration-dialog.php'; ?>
        <dialog id="measurement-history" class="mesh-dialog" aria-labelledby="history-title">
            <header class="mesh-dialog-heading">
                <h2 id="history-title">Measurement history</h2>
                <form method="dialog"><button class="button button-quiet">Close</button></form>
            </header>
            <p>Use <strong>Save run</strong> on a visualized mesh to keep a copy in this browser. For a comparison, select Before first and then After. Select three or more for a repeatability check.</p>
            <div class="log-choices">
                <div><label class="mesh-dialog-label" for="history-printer">Printer / setup</label><select id="history-printer"></select></div>
                <div><label class="mesh-dialog-label" for="history-plate">Build plate</label><select id="history-plate"></select></div>
            </div>
            <ul class="history-list" data-history-list aria-label="Saved runs"></ul>
            <div class="toolbar-actions history-backup">
                <button class="button button-quiet" type="button" data-history-backup disabled>Download history backup</button>
                <button class="button button-quiet" type="button" data-history-restore>Restore history backup</button>
                <input id="history-restore-file" type="file" accept=".json,application/json" aria-label="Choose a measurement history backup" hidden>
            </div>
            <p>Restore adds runs to this browser and skips runs already saved.</p>
            <p class="mesh-dialog-message" data-history-message role="status"></p>
            <div class="history-actions"><span data-history-count aria-live="polite"></span><button class="button" type="button" data-history-open disabled>Open run</button></div>
        </dialog>
        <dialog id="printer-presets" class="mesh-dialog" aria-labelledby="presets-title">
            <header class="mesh-dialog-heading">
                <h2 id="presets-title">Printer and plate presets</h2>
                <form method="dialog"><button class="button button-quiet">Close</button></form>
            </header>
            <p>Apply a preset to <strong data-preset-target></strong> to set its labels, sampled dimensions, and orientation.</p>
            <label class="mesh-dialog-label" for="preset-choice">Saved preset</label>
            <select id="preset-choice"></select>
            <p data-preset-preview></p>
            <div class="toolbar-actions preset-actions">
                <button class="button button-secondary" type="button" data-preset-apply disabled>Apply preset</button>
                <button class="button button-quiet" type="button" data-preset-remove disabled>Remove preset</button>
                <button class="button button-quiet" type="button" data-preset-cancel hidden>Cancel removal</button>
            </div>
            <form id="preset-form" class="preset-form">
                <h3>Save this mesh’s setup</h3>
                <p data-preset-current></p>
                <div class="log-choices">
                    <div><label class="mesh-dialog-label" for="preset-printer">Printer name</label><input id="preset-printer" type="text" required maxlength="80"></div>
                    <div><label class="mesh-dialog-label" for="preset-plate">Build plate name</label><input id="preset-plate" type="text" required maxlength="80"></div>
                </div>
                <button class="button" type="submit">Save preset</button>
            </form>
            <p class="mesh-dialog-message" data-preset-message role="status"></p>
        </dialog>
    <?php endif; ?>
    <?php require __DIR__ . '/php/footer.php'; ?>
    <script type="module" src="<?= site_escape(site_asset_url('/js/app.js')) ?>"></script>
</body>
</html>
