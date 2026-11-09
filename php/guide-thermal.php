<section aria-labelledby="control-conditions">
    <h2 id="control-conditions">Set up the cold and heated runs</h2>
    <p>Probe the same grid twice, once with the bed cold and once after it stabilizes at your normal first-layer bed temperature. Compare the readings point by point. The temperature displayed by your printer is one part of the test, so record how long you waited before probing as well.</p>
    <ol>
        <li>Use the same plate, orientation, probe settings, homing sequence, and sampled XY bounds. Use a fixed grid for both runs if your printer normally adapts the mesh to each print.</li>
        <li>Start with a cold run and record the bed and nozzle temperatures. Then follow your printer's normal heating and probing routine for the heated run. If several temperatures changed together, treat the result as a comparison of the two complete setups.</li>
        <li>Repeat the scans at each condition if the differences are small or inconsistent. Keep the files and record the wait time, plate, and probing sequence.</li>
    </ol>
    <p>A temperature-dependent reading can come from the probe or printer as well as from the plate. Klipper describes a way to check a probe's readings at one location before and after heating. <a href="https://www.klipper3d.org/Probe_Calibrate.html#temperature-bias">Klipper's temperature bias check</a></p>
</section>
<section aria-labelledby="compare-temperature">
    <h2 id="compare-temperature">Compare the same points in Bed Mesh</h2>
    <p>Load both scans and pick cold as <strong>Before</strong> and heated as <strong>After</strong> in <strong>Difference heatmap</strong>. Start with <strong>As measured</strong>. A positive change means the reported point is higher in the heated run. Confirm the same bounds, point count, and physical grid orientation before interpreting an edge or corner.</p>
    <figure class="guide-figure">
        <img src="/assets/articles/cold-vs-heated-heatmap.png" width="1151" height="400" alt="Bed Mesh difference heatmap with simulated heated readings higher across the grid and a larger change near the corners" loading="lazy" decoding="async">
        <figcaption>Bed Mesh's simulated 22 °C and 60 °C scans. The centre rises by 0.018 mm and the right-edge midpoint rises by 0.050 mm. The values illustrate the workflow. <a href="/?demo=thermal#mesh-difference">Open this comparison</a>.</figcaption>
    </figure>
</section>
<section aria-labelledby="read-thermal-patterns">
    <h2 id="read-thermal-patterns">Separate offset, tilt and shape</h2>
    <dl class="guide-definitions">
        <div><dt>Similar change across the grid</dt><dd>Start by checking your height reference and probing conditions. Switch to <strong>Relative to each mesh's mean</strong> to see how much of the difference remains after removing a uniform offset.</dd></div>
        <div><dt>A steady change from one edge to the other</dt><dd>Compare the fitted X and Y rise. Switch to <strong>With each fitted tilt removed</strong> to see which parts of the change remain after removing overall slope.</dd></div>
        <div><dt>A region keeps changing more than the rest</dt><dd>Inspect a cross-section through it, then compare against repeated scans taken under the same conditions. The pattern may be repeatable even when its cause is still unclear.</dd></div>
    </dl>
    <p>In the simulated example, the centre and edge move by different amounts, so subtracting the mean still leaves a pattern. If you see a similar result on your printer, repeat the comparison before deciding whether to change your probing routine.</p>
</section>
<section aria-labelledby="choose-print-condition">
    <h2 id="choose-print-condition">Use the results for your next print</h2>
    <p>If your measurements keep shifting while the printer warms up, repeat scans at different wait times with the same target temperature. Use the results to choose a wait time that gives repeatable scans on your machine. Then check the setup with a first-layer test at the same print conditions.</p>
    <p>Keep a comparison report with your probing notes so you can repeat the procedure after changing the plate, probe, or print temperature. <a href="/guides/?topic=bed-mesh-repeatability">How to build a repeatability baseline</a>.</p>
</section>
