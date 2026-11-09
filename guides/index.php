<?php
declare(strict_types=1);
require_once __DIR__ . '/../php/head.php';

function guide_escape(string $text): string
{
    return htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

$guides = require __DIR__ . '/../php/guide-catalog.php';

$requested = $_GET['topic'] ?? '';
$isIndex = $requested === '';
$topic = is_string($requested) && isset($guides[$requested]) ? $requested : null;
$notFound = !$isIndex && $topic === null;
if ($notFound) {
    http_response_code(404);
}
$guide = $topic !== null ? $guides[$topic] : null;
$title = $notFound ? 'Guide not found' : ($guide['title'] ?? 'Bed Mesh guides');
$guidePath = $topic === null ? '/guides/' : '/guides/?topic=' . rawurlencode($topic);
$description = $guide['description'] ?? 'Practical guides to getting, reading, and comparing your 3D printer bed mesh measurements.';
?>
<!doctype html>
<html lang="en">
<head>
    <?php render_site_head([
        'title' => $title . ' — Bed Mesh',
        'description' => $description,
        'path' => $notFound ? false : $guidePath,
        'noindex' => $notFound,
        'type' => $guide !== null ? 'article' : 'website',
    ]); ?>
    <?php if (!$notFound):
        $breadcrumbs = [
            ['name' => 'Bed Mesh', 'item' => site_origin() . '/'],
            ['name' => 'Guides', 'item' => site_origin() . '/guides/'],
        ];
        if ($guide !== null) $breadcrumbs[] = ['name' => $title, 'item' => site_origin() . $guidePath];
        render_site_schema([
            '@type' => 'BreadcrumbList',
            'itemListElement' => array_map(
                static fn (array $item, int $index): array => ['@type' => 'ListItem', 'position' => $index + 1] + $item,
                $breadcrumbs, array_keys($breadcrumbs)
            ),
        ]);
    endif; ?>
    <link rel="stylesheet" href="<?= site_escape(site_asset_url('/css/guides.css')) ?>">
</head>
<body>
    <a class="skip-link" href="#guide-content">Skip to guide content</a>
    <?php require __DIR__ . '/../php/menu.php'; ?>
    <main class="guide-shell" id="guide-content">
        <nav class="guide-breadcrumbs" aria-label="Breadcrumb">
            <a href="/">Bed Mesh</a><span aria-hidden="true">/</span>
            <?php if ($isIndex): ?>
                <span aria-current="page">Guides</span>
            <?php else: ?>
                <a href="/guides/">Guides</a><span aria-hidden="true">/</span><span aria-current="page"><?= guide_escape($title) ?></span>
            <?php endif; ?>
        </nav>

        <?php if ($notFound): ?>
            <section class="guide-missing">
                <p class="guide-eyebrow">404 · Guide not found</p>
                <h1>That guide isn't here.</h1>
                <p>Choose a guide below, or return to your meshes. Your saved workspace stays in this browser.</p>
                <div class="guide-link-row"><a class="button" href="/guides/">Browse the guides</a><a href="/#visualizer">Back to the visualizer <span aria-hidden="true">↗</span></a></div>
            </section>
        <?php elseif ($isIndex): ?>
            <header class="guides-intro">
                <p class="guide-eyebrow">Bed Mesh guides</p>
                <h1>Bed mesh guides</h1>
                <p>Get your mesh data, understand the measurements, and test whether an adjustment is larger than your observed probing variation.</p>
            </header>
            <ol class="guides-list">
                <?php $number = 0; foreach ($guides as $slug => $item): $number++; ?>
                    <li>
                        <span class="guide-list-number" aria-hidden="true"><?= str_pad((string) $number, 2, '0', STR_PAD_LEFT) ?></span>
                        <div class="guide-list-copy">
                            <p class="guide-eyebrow"><?= guide_escape($item['label']) ?></p>
                            <h2><a href="/guides/?topic=<?= guide_escape($slug) ?>"><?= guide_escape($item['title']) ?><span class="guide-list-arrow" aria-hidden="true">↗</span></a></h2>
                            <p><?= guide_escape($item['summary']) ?></p>
                        </div>
                        <span class="guide-reading-time"><?= count($item['sections']) ?> sections</span>
                    </li>
                <?php endforeach; ?>
            </ol>
            <div class="guides-return"><p>Have a mesh ready?</p><a href="/#visualizer">Open the visualizer <span aria-hidden="true">↗</span></a></div>
        <?php else: ?>
            <header class="guide-article-header">
                <p class="guide-eyebrow"><?= guide_escape($guide['label']) ?><span aria-hidden="true"> · </span><span class="guide-time"><?= count($guide['sections']) ?> sections</span></p>
                <h1><?= guide_escape($guide['title']) ?></h1>
                <p class="guide-deck"><?= guide_escape($guide['summary']) ?></p>
            </header>
            <div class="guide-article-layout">
                <aside class="guide-sidebar">
                    <nav class="guide-toc" aria-label="In this guide">
                        <h2>In this guide</h2>
                        <ol>
                            <?php foreach ($guide['sections'] as $anchor => $heading): ?>
                                <li><a href="#<?= guide_escape($anchor) ?>"><?= guide_escape($heading) ?></a></li>
                            <?php endforeach; ?>
                        </ol>
                    </nav>
                    <a class="guide-sidebar-return" href="/#visualizer">Try it in the visualizer <span aria-hidden="true">↗</span></a>
                </aside>
                <article class="guide-prose" aria-label="<?= guide_escape($guide['title']) ?>">
                    <?php if ($topic === 'reading-a-mesh'): ?>
                        <section aria-labelledby="measured-grid">
                            <h2 id="measured-grid">Start with the measured grid</h2>
                            <p>A mesh records heights at sampled positions across your print bed. It describes the measurements your printer reported, including the effects of the probe and measurement setup. A smooth-looking chart alone does not establish the accuracy of those measurements.</p>
                            <p>Bed Mesh keeps the original row order. Hover a point or open <strong>View measured values</strong> to check it. Use <strong>Flip X</strong> or <strong>Flip Y</strong> to match the plot to your printer. If you enter dimensions, use the width and depth of the <em>sampled area</em>, which may be smaller than the bed.</p>
                        </section>
                        <section aria-labelledby="mesh-statistics">
                            <h2 id="mesh-statistics">Read the numbers together</h2>
                            <dl class="guide-definitions">
                                <div><dt>Height range</dt><dd>The highest measurement minus the lowest. It captures the full spread, including isolated points.</dd></div>
                                <div><dt>Mean height</dt><dd>The signed average. It can change when the height reference changes between measurements.</dd></div>
                                <div><dt>Standard deviation</dt><dd>The spread around the mean, using every sampled value. It adds context to the two extremes.</dd></div>
                            </dl>
                            <p>The main statistics and exported CSV always use the <strong>original measurements</strong>. Display settings do not rewrite them.</p>
                        </section>
                        <section aria-labelledby="tilt-and-shape">
                            <h2 id="tilt-and-shape">Separate tilt from surface shape</h2>
                            <p>The analysis fits a least-squares plane to the regularly spaced grid. <strong>Fitted X rise</strong> describes that plane's height change from the first column to the last; <strong>Fitted Y rise</strong> runs from the first row to the last. Their signs follow input order, so identify your printer's orientation before interpreting a direction.</p>
                            <p>Subtracting the plane leaves <em>residuals</em>: the variation that a simple overall slope cannot explain. Residual range is their full spread; residual RMS is their root-mean-square height around zero. A tilted, flat mesh can have a large original range and tiny residuals. A bowl can retain substantial residual variation.</p>
                            <figure class="guide-figure">
                                <svg viewBox="0 0 640 228" role="img" aria-labelledby="mesh-shape-title mesh-shape-description" xmlns="http://www.w3.org/2000/svg">
                                    <title id="mesh-shape-title">Overall tilt and remaining curvature</title>
                                    <desc id="mesh-shape-description">The left cross-section has five points on a straight tilted line. The right shows a separate bowed cross-section after fitted tilt removal, with its edges above zero and centre below zero. Height is exaggerated.</desc>
                                    <g fill="#526070" font-family="Arial, sans-serif" font-size="12">
                                        <text x="40" y="27" font-weight="bold" fill="#263047">Tilted, flat surface</text>
                                        <text x="40" y="45">Original heights</text>
                                        <text x="360" y="27" font-weight="bold" fill="#263047">Bowed residual</text>
                                        <text x="360" y="45">After fitted tilt removal</text>
                                        <text x="40" y="212">Position across the sampled area</text>
                                        <text x="360" y="212">Position across the sampled area</text>
                                        <text x="340" y="124">0</text>
                                    </g>
                                    <g fill="none" stroke="#d5dce8" stroke-width="1">
                                        <path d="M40 65V185H280M360 65V185H600"/>
                                        <path d="M360 120H600" stroke-dasharray="4 5"/>
                                    </g>
                                    <g fill="none" stroke="#536dfe" stroke-width="3" stroke-linecap="round">
                                        <path d="M50 160L270 80"/>
                                        <path d="M370 80Q480 240 590 80"/>
                                    </g>
                                    <g fill="#536dfe" stroke="#fff" stroke-width="2">
                                        <circle cx="50" cy="160" r="4.5"/><circle cx="105" cy="140" r="4.5"/><circle cx="160" cy="120" r="4.5"/><circle cx="215" cy="100" r="4.5"/><circle cx="270" cy="80" r="4.5"/>
                                        <circle cx="370" cy="80" r="4.5"/><circle cx="425" cy="140" r="4.5"/><circle cx="480" cy="160" r="4.5"/><circle cx="535" cy="140" r="4.5"/><circle cx="590" cy="80" r="4.5"/>
                                    </g>
                                </svg>
                                <figcaption>Two illustrative cross-sections. Removing overall tilt flattens a straight slope; curvature remains in a bowed surface. Height is exaggerated.</figcaption>
                            </figure>
                            <p>These are descriptions of the grid. They do not identify which component needs adjustment or calculate screw turns.</p>
                        </section>
                        <section aria-labelledby="choose-a-view">
                            <h2 id="choose-a-view">Choose a useful view</h2>
                            <p>The 3D view exaggerates height to reveal variation. Use the heatmap for a view from above. <strong>Centre on mean</strong> and <strong>Remove fitted tilt</strong> change the displayed reference only. Return to <strong>Measured height</strong> whenever you want to inspect the original heights.</p>
                        </section>
                    <?php elseif ($topic === 'getting-mesh-data'): ?>
                        <section aria-labelledby="firmware-output">
                            <h2 id="firmware-output">Find the output for your firmware</h2>
                            <p>Begin with one complete height grid from your printer's console or an existing export. Check the instructions for your printer and installed firmware before sending commands. Bed Mesh reads measurements; it does not connect to your printer or start a probing routine.</p>
                            <h3>Marlin</h3>
                            <p>Use the grid from your documented mesh routine. <code>G29</code> behaves differently across Marlin's configured levelling systems and can initiate probing. Identify the mode in your build before choosing commands. See the <a href="https://marlinfw.org/docs/gcode/G029.html">official Marlin G29 documentation</a>.</p>
                            <h3>Prusa</h3>
                            <p>The documented Prusa Firmware <code>G81</code> command reports mesh status and, when active, the bed profile. This command reference does not cover every newer Prusa firmware family; confirm your model's documentation. See <a href="https://help.prusa3d.com/article/prusa-firmware-specific-g-code-commands_112173">Prusa's firmware-specific command reference</a>.</p>
                            <h3>Klipper</h3>
                            <p><code>BED_MESH_OUTPUT</code> reports the current mesh state. Copy the numeric height matrix you want to inspect. The generated-point coordinate table from <code>PGP=1</code> describes positions, rather than a matrix of measured heights. See <a href="https://www.klipper3d.org/Bed_Mesh.html#output">Klipper's mesh output documentation</a>.</p>
                        </section>
                        <section aria-labelledby="preserve-the-grid">
                            <h2 id="preserve-the-grid">Keep the values intact</h2>
                            <p>Bed Mesh accepts supported Marlin and Prusa console grids, Klipper numeric matrices, plain rectangular grids, numeric CSV, and JSON arrays of numeric rows. Keep every measurement in its original row and column. A simple JSON input looks like this:</p>
                            <pre aria-label="Example JSON height grid"><code>[[0.02, -0.01, -0.04],
 [0.01, -0.02, -0.05],
 [0.00, -0.01, -0.03]]</code></pre>
                            <p>Use millimetres and decimal points. Preserve minus signs and precision. Each row must contain the same number of heights. Missing or invalid points need resolving at the source; replacing them with zero would introduce a measurement you did not take.</p>
                        </section>
                        <section aria-labelledby="check-your-input">
                            <h2 id="check-your-input">Load it and check the result</h2>
                            <p>Paste one grid into <strong>Mesh input</strong> and select <strong>Visualize</strong>. Choose <strong>Import file</strong> to open a text, CSV, or JSON grid, or <strong>Scan a printer log</strong> to find the grids in a full console log. Check the detected grid size and compare a few cells in <strong>View measured values</strong> with your source.</p>
                            <p><a class="button button-secondary" href="/#visualizer">Open the visualizer ↗</a></p>
                            <p>If parsing fails, read the message and check for incomplete rows or unrelated numeric tables mixed into the output. Keep a copy of the source while cleaning the input.</p>
                        </section>
                        <section aria-labelledby="keep-the-source">
                            <h2 id="keep-the-source">Keep a useful record</h2>
                            <p>No account is needed. The visualizer processes your grid locally and saves the workspace in this browser. Export CSV for a separate copy, and keep the original console output with the date, bed temperature, and probing setup. Those details make your <a href="/guides/?topic=comparing-runs">next comparison</a> much more useful.</p>
                        </section>
                    <?php elseif ($topic === 'comparing-runs'): ?>
                        <section aria-labelledby="consistent-runs">
                            <h2 id="consistent-runs">Keep the runs comparable</h2>
                            <p><a class="button button-secondary" href="/?demo=comparison" target="_blank" rel="noopener">Try a comparison ↗</a></p>
                            <p>A useful comparison begins at the printer. Keep the build surface, probing setup, bed temperature, and preparation consistent. Allow a similar settling period. Use the same sampled area and grid when possible, and record what you changed between runs.</p>
                            <p>Label the panels with meaningful names such as <em>Before · 60 °C</em> and <em>After · 60 °C</em>. Bed Mesh can display different grid sizes, but they sample different positions: a smaller range on a coarser grid may simply miss a local feature.</p>
                        </section>
                        <section aria-labelledby="matching-scales">
                            <h2 id="matching-scales">Match scales and height references</h2>
                            <p>Add a second mesh and select <strong>Visualize all</strong>. Enable <strong>Match scales when comparing meshes</strong> so heights share a consistent colour and vertical scale. Separate fitted scales can make a small variation look as dramatic as a larger one.</p>
                            <p>Choose the same <strong>Height reference</strong> in both panels. <strong>Measured height</strong> keeps original offsets visible. <strong>Centre on mean</strong> removes each mesh's average from its display. <strong>Remove fitted tilt</strong> shows the remaining variation around each mesh's fitted plane. Comparing different references can obscure the change you are trying to inspect.</p>
                            <p>Check orientation too. Flip controls affect the plot, while the measured-values table stays in original input order. Enter the actual sampled width and depth in both panels if you want physical X/Y coordinates.</p>
                        </section>
                        <section aria-labelledby="read-the-change">
                            <h2 id="read-the-change">Read the change at more than one level</h2>
                            <p>Start with the comparison table: original height range, mean, and standard deviation describe the full measurements. A shift in mean with similar spread may indicate a changed reference between runs; it does not, by itself, demonstrate a flatter surface.</p>
                            <p>Then inspect the analysis. Fitted X and Y rise describe overall slope in the original column and row directions. Range and RMS <em>without fitted tilt</em> describe what remains after a least-squares plane is removed from each regular grid. Compare original range and residual range together to understand whether slope, remaining shape, or both changed.</p>
                            <p>Check the heatmaps and individual values for isolated differences. These summaries cannot distinguish real surface change from a changed measurement process. A universal target range cannot account for every printer, probe, surface, and first-layer setup.</p>
                            <h3>Inspect the difference heatmap</h3>
                            <p>In <strong>Difference heatmap</strong>, choose the before and after meshes. Each cell shows <strong>after minus before</strong>: blue means the later measurement is lower, warm colours mean it is higher, and white means no change. The colour scale stays centred on zero. The grids and declared sampled dimensions must match; Bed Mesh does not invent intermediate measurements.</p>
                            <p>The difference view has its own reference control. Use <strong>As measured</strong> to retain height offsets, or compare relative to each mesh's mean or fitted plane to inspect changes in shape. Enter the <a href="/guides/?topic=bed-mesh-flipped">sampled XY bounds</a> for both runs to catch differences in their physical footprint. Confirm the probe points line up and use Flip X/Y to correct display orientation. RMS point change describes the size of the change.</p>
                            <p>Select a cell to see <strong>Cross-sections</strong> through its row and column. The profiles use the difference view’s height reference and show the sampled readings in both runs.</p>
                            <p>With three or more comparable scans taken before the adjustment, open <strong>Adjustment vs. repeatability</strong>. It compares the absolute change at each point with the highest minus lowest reading in the selected baseline scans. A point above that spread is outside the variation you observed in those runs. <a href="/guides/?topic=bed-mesh-repeatability">Set up a repeatability baseline</a> before using it to interpret a change.</p>
                        </section>
                        <section aria-labelledby="save-the-comparison">
                            <h2 id="save-the-comparison">Save enough context to repeat it</h2>
                            <p>Use <strong>Save workspace</strong> for a JSON backup of the meshes and their display settings. Export original CSVs, delta CSVs, and chart images for separate records, and keep your probing notes alongside them. Browser storage is convenient for returning to a workspace; exported files give you another copy. Use a repeated measurement under the same conditions to check whether an apparent improvement is consistent.</p>
                            <p>Open <strong>Comparison report</strong> under the difference heatmap for a printable view of both runs, their difference, and the recorded conditions. If you have at least three scans from the same setup, <strong>Compare repeat runs</strong> shows how much each point varied between them.</p>
                        </section>
                    <?php elseif ($topic === 'bed-mesh-repeatability'): ?>
                        <?php require __DIR__ . '/../php/guide-repeatability.php'; ?>
                    <?php elseif ($topic === 'cold-vs-heated-bed-mesh'): ?>
                        <?php require __DIR__ . '/../php/guide-thermal.php'; ?>
                    <?php elseif ($topic === 'uneven-first-layer-flat-mesh'): ?>
                        <?php require __DIR__ . '/../php/guide-first-layer.php'; ?>
                    <?php elseif ($topic === 'how-flat-should-a-3d-printer-bed-be'): ?>
                        <?php require __DIR__ . '/../php/guide-flatness.php'; ?>
                    <?php elseif ($topic === 'bed-mesh-flipped'): ?>
                        <?php require __DIR__ . '/../php/guide-orientation.php'; ?>
                    <?php elseif ($topic === 'klipper-adaptive-mesh-3x3'): ?>
                        <?php require __DIR__ . '/../php/guide-adaptive.php'; ?>
                    <?php elseif ($topic === 'bed-mesh-spike'): ?>
                        <?php require __DIR__ . '/../php/guide-spike.php'; ?>
                    <?php endif; ?>
                    <footer class="guide-article-end">
                        <a href="/#visualizer">Back to the visualizer <span aria-hidden="true">↗</span></a>
                        <a href="/guides/">All guides <span aria-hidden="true">→</span></a>
                    </footer>
                </article>
            </div>
            <nav class="guide-next-reading" aria-label="More guides">
                <h2>Keep reading</h2>
                <ul>
                    <?php foreach ($guides as $slug => $item): if ($slug === $topic) continue; ?>
                        <li><a href="/guides/?topic=<?= guide_escape($slug) ?>"><?= guide_escape($item['title']) ?><span aria-hidden="true">↗</span></a></li>
                    <?php endforeach; ?>
                </ul>
            </nav>
        <?php endif; ?>
    </main>
    <?php require __DIR__ . '/../php/footer.php'; ?>
    <?php if ($guide !== null): ?><script type="module" src="<?= site_escape(site_asset_url('/js/reading.js')) ?>"></script><?php endif; ?>
</body>
</html>
