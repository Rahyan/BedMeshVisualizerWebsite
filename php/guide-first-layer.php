<section aria-labelledby="verify-mesh-in-use">
    <h2 id="verify-mesh-in-use">Check the mesh used by the print</h2>
    <p>When a bed mesh looks flat but the first layer is uneven, first check whether the print uses the mesh you inspected. Then see whether the nozzle is too high or low across the whole bed, or whether the problem stays in one area. Those two patterns call for different checks.</p>
    <p>Look at what happens after homing in the actual start routine. In Klipper, the routine may generate a fresh mesh or load a saved one. If you use adaptive probing, the print may use a different sampled area from a full-bed scan. For Marlin, check whether your build enables or restores leveling after homing, and whether the print enables a valid mesh. <a href="https://www.klipper3d.org/Bed_Mesh.html#loading-the-default-profile">Klipper's profile behavior</a> · <a href="https://marlinfw.org/docs/gcode/M420.html">Marlin's leveling state</a></p>
</section>
<section aria-labelledby="match-physical-location">
    <h2 id="match-physical-location">Match the symptom to a bed location</h2>
    <p>Check the units and colour range before calling a plot flat. Look at the height range in millimetres and match the scales if comparing multiple runs. Confirm that the plotted right edge actually corresponds to the physical right edge of your printer.</p>
    <figure class="guide-figure">
        <img src="/assets/articles/first-layer-cross-sections.png" width="1121" height="364" alt="Bed Mesh cross-sections through a selected right-edge point, with measured Before and After values plotted on the same height scale" loading="lazy" decoding="async">
        <figcaption>Bed Mesh's row and column profiles through a simulated right-edge adjustment. Click the grid position closest to the print defect and follow both directions through the mesh. <a href="/?demo=comparison#comparison-sections">Open these cross-sections</a>.</figcaption>
    </figure>
    <p>Use the nearest sampled points as evidence about the area. A mesh has finite spacing, so small features between probe points may be absent from the readings. A single wide plot is also easy to misread if the grid is flipped or the print falls outside the probed area.</p>
</section>
<section aria-labelledby="test-one-layer">
    <h2 id="test-one-layer">Read a one-layer test</h2>
    <p>Print a few thin patches at the centre and near the problem area using the same material, plate, and first-layer settings. Watch the lines as the printer lays them down. If the nozzle contacts or drags across the plate, stop the test and check the calibration before printing again.</p>
    <dl class="guide-definitions">
        <div><dt>Lines stay separate in most patches</dt><dd>Check for a nozzle gap that's too large. Confirm that extrusion is steady before changing the Z offset.</dd></div>
        <div><dt>Most patches have ridges between lines</dt><dd>Check for a nozzle gap that's too small and review first-layer flow. Follow the offset procedure for your printer model.</dd></div>
        <div><dt>One patch is poor while the others look fine</dt><dd>Check whether that location matches a mesh feature, plate contamination, or debris underneath the plate. If the pattern changes after heating, compare the same grid cold and hot.</dd></div>
    </dl>
    <p>Prusa illustrates what excessive and insufficient nozzle gap look like on a first-layer test. <a href="https://help.prusa3d.com/article/first-layer-calibration-i3_112364">Prusa's first-layer calibration examples</a></p>
</section>
<section aria-labelledby="narrow-down">
    <h2 id="narrow-down">Change one thing and test again</h2>
    <p>Record the location and appearance of the problem. Change one setting or condition, repeat the same print, and compare it with your notes. If the print symptom stays in one spot but the mesh differences move around from scan to scan, <a href="/guides/?topic=bed-mesh-repeatability">check the repeatability of your probing</a> before adjusting the bed.</p>
    <p>If the symptom appears only on a heated bed or after a long wait, follow the <a href="/guides/?topic=cold-vs-heated-bed-mesh">cold-versus-heated mesh procedure</a> to isolate the temperature change.</p>
</section>
