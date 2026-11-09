<section aria-labelledby="find-measured-point">
    <h2 id="find-measured-point">Check the measured point</h2>
    <p>If one point is much higher than its neighbours, first switch to <strong>Heatmap</strong> and hover the cell. Use <strong>View measured values</strong> to check the original number. This helps distinguish a sampled high point from an impression created by a steep 3D view, a changing colour scale, or a different view of the grid.</p>
    <p>Record the XY position and the plate and temperature you used. <a href="/guides/?topic=bed-mesh-flipped">Confirm which part of the physical bed that point represents</a>.</p>
</section>
<section aria-labelledby="repeat-the-grid">
    <h2 id="repeat-the-grid">Repeat the same grid three times</h2>
    <p>Keep the plate, temperature, bounds, and probing routine the same. Visualize at least three scans, match their scales, then open <strong>Compare repeat runs</strong>. The spread is the difference between the highest and lowest reading at each point across the selected scans.</p>
    <figure class="guide-figure">
        <img src="/assets/articles/mesh-repeatability-spike.png" width="920" height="398" alt="Bed Mesh repeatability heatmap with a large spread at the location of a simulated transient spike" loading="lazy" decoding="async">
        <figcaption>Three simulated scans. A transient point produces 0.120 mm of spread. Another high point persists in all three scans, so it has zero spread and remains visible in each individual heatmap.</figcaption>
    </figure>
    <p>If the high value disappears on a repeat scan, treat the original reading as uncertain. If it returns at the same coordinates, you have a repeatable pattern to investigate. Check the individual heatmaps as well as the spread map so a persistent high point stays visible.</p>
</section>
<section aria-labelledby="check-repeatable-spike">
    <h2 id="check-repeatable-spike">Investigate a repeatable spike</h2>
    <p>Let the printer cool, then check for debris under the plate and make sure the plate and probe mount are seated securely. Repeat the same grid after one change. If the reading stays at the same XY location, compare it with a first-layer test and follow your printer’s probe check for that location.</p>
    <p>A consistent reading can still be biased. Klipper documents location bias and notes that some probes can be affected by magnets under the bed. Check the source before changing probe or faulty-region settings. <a href="https://www.klipper3d.org/Probe_Calibrate.html#location-bias-check">Klipper location bias check</a> · <a href="https://www.klipper3d.org/Bed_Mesh.html#faulty-regions">Klipper faulty regions</a>.</p>
</section>
