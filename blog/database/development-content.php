<?php
/** Original editorial content, seeded only by an explicit isolated-local command. No user data. */
return [
    [
        'category' => 'Project notes', 'category_slug' => 'project-notes',
        'title' => 'A clearer way to read the same measurements', 'slug' => 'a-clearer-way-to-read-the-same-measurements',
        'excerpt' => 'A good mesh tool should help you inspect the numbers without getting between you and your printer. A few choices behind the refreshed Bed Mesh.',
        'image' => 'assets/articles/visualizer-workspace.png',
        'image_alt' => 'Bed Mesh input beside a three-dimensional example surface and its original height statistics.',
        'image_caption' => 'The visualizer with a simulated 3 × 3 grid: numeric input, surface, and original statistics in one panel.',
        'image_credit' => 'Bed Mesh interface', 'image_credit_url' => 'https://bedmesh.com/',
        'content' => <<<'HTML'
<p>A mesh begins as a small table of numbers. The interesting part is what happens when you can connect those numbers to a position, a shape, and the next measurement. That is the job Bed Mesh is built around.</p>
<h2>Keep the measurement close</h2>
<p>The visualizer puts input and output beside each other. Paste a supported console grid or import a numeric file, then inspect the 3D surface or heatmap. The measured-values table stays available so that a chart is always traceable back to the original grid.</p>
<p>Statistics and CSV exports use those original heights. Changing the display reference, flipping the view, or removing fitted tilt does not rewrite your measurements. The distinction matters when you return to an earlier run and need to know exactly what was recorded.</p>
<h2>Give comparison a consistent frame</h2>
<p>A surface fitted tightly to its own range can look dramatic even when its variation is small. Matching chart scales gives two runs a shared frame. Keeping their height references aligned makes the comparison easier to interpret.</p>
<p>There is room for several meshes in one workspace. Each can carry an optional recorded date, bed temperature, build surface, printer setup, and notes. These are your declarations; the tool does not infer them from the grid. Save the workspace as a file to keep the measurements and context together.</p>
<p>The difference heatmap compares matching points directly: after minus before. Its colour scale stays centred on zero, so lower and higher measurements have a consistent meaning. Grid sizes and declared sampled areas must match; Bed Mesh does not silently interpolate one run to fit another.</p>
<h2>Stay useful when a chart cannot load</h2>
<p>Parsing, measured values, and CSV exports run in the browser. The chart library loads separately. If it cannot be reached, your measurements and their summaries should remain usable. You can also switch to a heatmap when a browser cannot render a 3D surface.</p>
<h2>A small tool with a clear job</h2>
<p>Bed Mesh does not command your printer or decide which screw to turn. A mesh describes a measurement process, including its limitations. The aim is to make that evidence easier to inspect and compare while leaving the printer-specific decisions with you.</p>
<p><a href="/#visualizer">Bring your own grid to the visualizer</a>, or start with the <a href="/guides/">practical guides</a>.</p>
HTML,
    ],
    [
        'category' => 'Mesh analysis', 'category_slug' => 'mesh-analysis',
        'title' => 'The slope is only part of the story', 'slug' => 'the-slope-is-only-part-of-the-story',
        'excerpt' => 'A large height range can describe a tilted flat surface, a curved surface, or a mixture of both. Fitted-plane analysis helps separate those observations.',
        'image' => 'assets/articles/tilted-plane-measured.png',
        'image_alt' => 'An illustrative flat plane rising 0.100 millimetres in X, with zero range and RMS after fitted tilt is removed.',
        'image_caption' => 'A simulated tilted plane in the visualizer. The original range is 0.100 mm; the fitted-plane residual range and RMS are zero.',
        'image_credit' => 'Bed Mesh interface', 'image_credit_url' => 'https://bedmesh.com/',
        'content' => <<<'HTML'
<p>Two meshes can have the same highest and lowest measurements while describing very different surfaces. One may rise steadily from left to right. Another may have high edges and a low centre. Their height ranges alone do not tell those stories apart.</p>
<h2>A simple tilted example</h2>
<p>Consider this illustrative grid in millimetres. Each column increases by the same amount, and each row is identical:</p>
<pre><code>0.00  0.05  0.10
0.00  0.05  0.10
0.00  0.05  0.10</code></pre>
<p>The original height range is 0.10 mm. A plane can describe every point in this example, so subtracting its fitted plane leaves essentially zero residual variation, apart from numerical rounding. The original range still correctly records what was measured.</p>
<h2>What the fit measures</h2>
<p>Bed Mesh fits a least-squares plane to the regularly spaced grid. The fitted X rise is the plane's change from the first column to the last. The fitted Y rise runs from the first row to the last. These directions follow input order; they do not identify the front, back, or a particular screw on your printer.</p>
<p>Residuals are the measurements after that plane is subtracted. Residual range records their spread, and residual RMS describes their typical magnitude around zero. Curvature or isolated features can remain even when the overall slope has been removed.</p>
<figure><img src="/assets/articles/tilted-plane-residual.png" alt="The same example after removing fitted tilt: a flat residual surface at zero, while the original height range remains 0.100 mm."><figcaption>The same simulated grid with “Remove fitted tilt” selected. Original statistics remain visible below the residual chart. Screenshot: Bed Mesh.</figcaption></figure>
<h2>Use both descriptions</h2>
<p>Read original and residual values together. The original grid preserves the full measured surface. The residual view answers a narrower question: what shape remains once a simple overall tilt has been accounted for?</p>
<p>A fitted plane is a mathematical summary. It does not establish why a slope exists, whether the probe is accurate, or which mechanical change would help. Repeat measurements and knowledge of the printer still matter.</p>
<p>Try <strong>Remove fitted tilt</strong> in the visualizer's height-reference setting, then return to <strong>Measured height</strong>. The statistics and exported CSV continue to use the original data in either view.</p>
HTML,
    ],
    [
        'category' => 'Workshop practice', 'category_slug' => 'workshop-practice',
        'title' => 'Two meshes, one fair comparison', 'slug' => 'two-meshes-one-fair-comparison',
        'excerpt' => 'The most useful before-and-after starts before the second probe run. Keep the conditions, sampled area, and visual references consistent.',
        'image' => 'assets/articles/mesh-difference.png',
        'image_alt' => 'Signed difference heatmap for two simulated three-by-three grids, with lower points blue and higher points warm.',
        'image_caption' => 'An illustrative comparison in Bed Mesh. The mean changes by −0.037 mm; the original range changes by −0.100 mm. These are simulated grids, not printer measurements.',
        'image_credit' => 'Bed Mesh interface', 'image_credit_url' => 'https://bedmesh.com/',
        'content' => <<<'HTML'
<p>After an adjustment, it is tempting to look for a nicer-looking surface and call the job done. A useful comparison asks a more precise question: what changed in the measurements, under conditions that were otherwise comparable?</p>
<h2>Write down the conditions</h2>
<p>Keep the same build surface, sampled area, grid, bed temperature, and probing setup where possible. Give the printer a similar settling period before each run. Note the specific change you made rather than bundling several adjustments into one comparison.</p>
<p>Use the optional <strong>Measurement context</strong> beside each input to record the temperature, surface, setup, date, and notes. The comparison calls out missing or different declared conditions without claiming that matching text proves matching physical conditions. Keep the original console output as well. The extra context is often more useful than another decimal place.</p>
<h2>Make the charts comparable</h2>
<p>Enable matching scales and choose the same height reference in both panels. A fitted scale can make subtle variation fill the chart, which is helpful for inspection but can distort a visual comparison between runs.</p>
<p>Use measured heights to inspect original offsets, centre on mean to compare variation around each average, or remove fitted tilt to inspect the remaining shape. Each setting answers a different question. Choose it deliberately and use it consistently.</p>
<h2>Look beyond one number</h2>
<p>Check the original range and standard deviation, then inspect fitted rise and residual variation. A changed mean with a similar spread can reflect a changed reference. A smaller range on a coarser grid can reflect a missed local feature. Neither observation is enough on its own to diagnose an improvement.</p>
<p>The heatmap and measured-values table help you locate differences. When a result looks promising, another run under the same conditions can show whether it repeats. A measurement that repeats is more useful than a single attractive chart.</p>
<p>For a point-by-point view, choose a before mesh and an after mesh in <strong>Difference heatmap</strong>. Blue means the after point is lower; warm colours mean it is higher. The chart uses a symmetric scale around zero. Matching the grid and sampled area is required, and you still need to check the probing origin and orientation yourself.</p>
<h2>Keep the evidence together</h2>
<p>Export the original CSVs and save the workspace with its display settings. Chart images are useful for sharing an observation; the numeric source lets someone check it. A browser workspace is convenient, while an exported file gives you a separate record.</p>
<p>For a step-by-step reference, see <a href="/guides/?topic=comparing-runs">comparing two mesh runs</a>.</p>
HTML,
    ],
];
