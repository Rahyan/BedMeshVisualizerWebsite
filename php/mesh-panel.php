<?php
declare(strict_types=1);
function render_mesh_panel(string $id, string $number, string $data = '', bool $personalTools = true): void
{
    $id = htmlspecialchars($id, ENT_QUOTES, 'UTF-8');
    $number = htmlspecialchars($number, ENT_QUOTES, 'UTF-8');
    $data = htmlspecialchars($data, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
?>
<section class="mesh-panel" data-panel data-id="<?= $id ?>" aria-labelledby="mesh-<?= $id ?>-heading">
    <header class="panel-head">
        <div class="panel-name"><span class="panel-number" id="mesh-<?= $id ?>-heading">Mesh data #<?= $number ?></span><input data-field="name" class="mesh-name" type="text" maxlength="60" value="Mesh <?= $number ?>" aria-label="Name for mesh <?= $number ?>"></div>
        <div class="panel-head-end"><span class="mesh-meta" data-meta>Ready for your data</span><button type="button" class="button button-quiet remove-panel" data-action="duplicate" aria-label="Duplicate mesh <?= $number ?>">Duplicate</button><button type="button" class="button button-quiet remove-panel" data-action="remove" aria-label="Remove mesh <?= $number ?>" hidden>Remove</button></div>
    </header>
    <div class="mesh-layout">
        <div class="mesh-input-column">
            <div class="section-heading"><label class="section-title" for="mesh-<?= $id ?>-input">Mesh input</label></div>
            <textarea id="mesh-<?= $id ?>-input" data-field="raw" name="data[]" rows="10" maxlength="200000" spellcheck="false" autocomplete="off" wrap="off" aria-describedby="mesh-<?= $id ?>-input-note mesh-<?= $id ?>-message" placeholder="Paste your bed mesh here…&#10;&#10;0.020  -0.010  -0.040&#10;0.010  -0.020  -0.050&#10;0.000  -0.010  -0.030"><?= $data ?></textarea>
            <p class="input-note" id="mesh-<?= $id ?>-input-note">One grid per panel. Ctrl/⌘ + Enter to visualize.</p>
            <div class="input-actions"><button type="button" class="button" data-action="visualize" title="Visualize this mesh (Ctrl or Command + Enter)">Visualize <kbd aria-hidden="true">↵</kbd></button><button type="button" class="button button-secondary" data-action="import">Import file</button><button type="button" class="button button-quiet" data-action="clear">Clear</button><input type="file" data-file accept=".txt,.csv,.json,.log,text/plain,text/csv,application/json" hidden aria-label="Import mesh data"></div>
            <p class="panel-message" id="mesh-<?= $id ?>-message" data-message role="status" aria-live="polite"></p>
            <button type="button" class="text-button" data-action="scan-input" hidden>Find meshes in this input</button>
            <a class="chart-jump" data-chart-jump href="#mesh-<?= $id ?>-output" hidden>View heatmap ↓</a>
            <details class="measurement-context" data-measurement-detail>
                <summary>Measurement context <span data-measurement-summary>Optional</span></summary>
                <p class="measurement-help">Record the conditions for this measurement. These fields do not change your mesh or its statistics.</p>
                <div class="measurement-fields">
                    <label for="mesh-<?= $id ?>-measured-at">Recorded date &amp; time<input id="mesh-<?= $id ?>-measured-at" data-measurement="measuredAt" type="datetime-local" step="1" min="1900-01-01T00:00" max="9999-12-31T23:59:59" aria-describedby="mesh-<?= $id ?>-measurement-note mesh-<?= $id ?>-measurement-message"></label>
                    <label for="mesh-<?= $id ?>-bed-temperature">Bed temperature <span>(°C)</span><input id="mesh-<?= $id ?>-bed-temperature" data-measurement="bedTemperature" type="number" step="any" min="-50" max="300" placeholder="Not recorded" aria-describedby="mesh-<?= $id ?>-measurement-message"></label>
                    <label for="mesh-<?= $id ?>-surface">Build surface<input id="mesh-<?= $id ?>-surface" data-measurement="surface" type="text" maxlength="80" placeholder="e.g. textured PEI" aria-describedby="mesh-<?= $id ?>-measurement-message"></label>
                    <label for="mesh-<?= $id ?>-setup">Printer / setup<input id="mesh-<?= $id ?>-setup" data-measurement="setup" type="text" maxlength="80" placeholder="Optional label" aria-describedby="mesh-<?= $id ?>-measurement-message"></label>
                    <label class="measurement-notes" for="mesh-<?= $id ?>-measurement-notes">Notes<textarea id="mesh-<?= $id ?>-measurement-notes" data-measurement="notes" rows="3" maxlength="1000" placeholder="Adjustments, heat soak, probing procedure…" aria-describedby="mesh-<?= $id ?>-measurement-message"></textarea></label>
                </div>
                <p class="measurement-help" id="mesh-<?= $id ?>-measurement-note">Date and time are recorded as local time, without timezone conversion. A mesh file's dates and the current date are never used to infer when it was measured.</p>
                <p class="measurement-message" id="mesh-<?= $id ?>-measurement-message" data-measurement-message role="status" aria-live="polite"></p>
            </details>
            <details class="plot-settings" open>
                <summary>Settings</summary>
                <div class="settings-grid">
                    <label>Height scale<select data-setting="scale"><option value="fit">Fit to mesh</option><option value="fixed">Fixed ±1 mm</option></select></label>
                    <label>Height reference<select data-setting="reference"><option value="original">Measured height</option><option value="mean">Centre on mean</option><option value="plane">Remove fitted tilt</option></select></label>
                    <label>Probed width <span>(mm)</span><input type="number" min="1" max="2000" step="any" data-setting="width" placeholder="Optional"></label>
                    <label>Probed depth <span>(mm)</span><input type="number" min="1" max="2000" step="any" data-setting="depth" placeholder="Optional"></label>
                </div>
                <div class="orientation-options"><label class="check-label"><input type="checkbox" data-setting="flipX"> Flip X</label><label class="check-label"><input type="checkbox" data-setting="flipY"> Flip Y</label></div>
                <details class="sampled-bounds">
                    <summary>Sampled XY bounds and front edge</summary>
                    <p class="small-note">Use the first and last sampled coordinates from your firmware. Complete bounds set the chart coordinates and take precedence over probed width and depth.</p>
                    <div class="settings-grid">
                        <label>Minimum X <span>(mm)</span><input type="number" min="-10000" max="10000" step="any" data-setting="minX" placeholder="Optional"></label>
                        <label>Maximum X <span>(mm)</span><input type="number" min="-10000" max="10000" step="any" data-setting="maxX" placeholder="Optional"></label>
                        <label>Minimum Y <span>(mm)</span><input type="number" min="-10000" max="10000" step="any" data-setting="minY" placeholder="Optional"></label>
                        <label>Maximum Y <span>(mm)</span><input type="number" min="-10000" max="10000" step="any" data-setting="maxY" placeholder="Optional"></label>
                        <label class="front-edge-control">Front of printer<select data-setting="frontEdge"><option value="">Unspecified</option><option value="minY">Low Y · bottom</option><option value="maxY">High Y · top</option><option value="minX">Low X · left</option><option value="maxX">High X · right</option></select></label>
                    </div>
                    <p class="small-note">The front label follows the displayed axes. Use Flip X or Flip Y to align the measurements with those axes.</p>
                </details>
                <?php if ($personalTools): ?><button type="button" class="text-button" data-action="presets">Printer and plate presets</button><?php endif; ?>
                <p class="small-note">Dimensions refer to the sampled area. Reference and orientation affect the plot; statistics and CSV use original measurements.</p>
            </details>
        </div>
        <div class="mesh-output-column">
            <div class="output-heading"><h2 class="section-title" id="mesh-<?= $id ?>-output" tabindex="-1">Chart</h2><div class="view-switch" role="group" aria-label="Chart view"><button type="button" data-view="heatmap" aria-pressed="true">Heatmap</button><button type="button" data-view="surface" aria-pressed="false">3D surface</button></div></div>
            <div class="plot-wrap"><div id="mesh-<?= $id ?>-graph" class="mesh-graph" data-graph role="img" aria-label="Bed mesh chart"></div><div class="plot-placeholder" data-placeholder><img src="/assets/bedmesh-brand.png" alt="" width="116" height="116" decoding="async"><p>Ready to visualize</p><span>Paste a mesh and select Visualize, or try an example.</span></div></div>
            <div class="plot-actions"><span data-chart-note class="small-note">Hover a point for its height</span><div><button type="button" class="text-button" data-action="reset-view" disabled>Reset view</button><button type="button" class="text-button" data-action="png" disabled>Save image</button><button type="button" class="text-button" data-action="csv" disabled>Export CSV</button><?php if ($personalTools): ?><button type="button" class="text-button" data-action="save-run" disabled>Save run</button><?php endif; ?></div></div>
            <div class="stats-heading"><h3 class="section-title">Statistics</h3><span>Original heights · mm</span></div>
            <dl class="stats-strip"><div class="stat-featured"><dt>Height range</dt><dd data-stat="range">—</dd></div><div><dt>Mean height</dt><dd data-stat="mean">—</dd></div><div><dt>Minimum</dt><dd data-stat="min">—</dd></div><div><dt>Maximum</dt><dd data-stat="max">—</dd></div><div><dt>Std. deviation</dt><dd data-stat="std">—</dd></div></dl>
            <p class="mesh-insight" data-insight></p>
            <details class="analysis-detail" data-analysis-detail hidden>
                <summary>Surface analysis</summary>
                <dl class="analysis-grid">
                    <div><dt>Median height</dt><dd data-analysis="median">—</dd></div>
                    <div><dt>Mean absolute deviation</dt><dd data-analysis="meanAbsDeviation">—</dd></div>
                    <div><dt>Fitted X rise</dt><dd data-analysis="xRise">—</dd></div>
                    <div><dt>Fitted Y rise</dt><dd data-analysis="yRise">—</dd></div>
                    <div><dt>Range without fitted tilt</dt><dd data-analysis="residualRange">—</dd></div>
                    <div><dt>RMS without fitted tilt</dt><dd data-analysis="residualRms">—</dd></div>
                </dl>
                <p class="small-note" data-analysis-note>All values are in mm. A fitted plane separates overall tilt from the remaining surface variation. X and Y rise follow the original input order.</p>
            </details>
            <details class="values-detail" data-values-detail hidden><summary>View measured values</summary><div class="table-scroll" data-values></div></details>
        </div>
    </div>
</section>
<?php
}
