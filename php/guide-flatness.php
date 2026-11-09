<section aria-labelledby="is-point-two-enough">
    <h2 id="is-point-two-enough">Is a 0.2 mm bed mesh range good enough?</h2>
    <p>A range of 0.2 mm tells you that the highest and lowest sampled points are 0.2 mm apart. Whether that matters depends on where the change occurs, how repeatable it is, and what the first layer looks like where you print. Even two meshes with the same range can call for different checks.</p>
    <p>Run your usual probing routine at your normal print conditions. In Bed Mesh, read <strong>Height range</strong> under <strong>Statistics</strong> and switch to <strong>Heatmap</strong>. When comparing runs, keep <strong>Match scales when comparing meshes</strong> enabled so the same colour represents the same height.</p>
</section>
<section aria-labelledby="same-range-different-shapes">
    <h2 id="same-range-different-shapes">Same range, three shapes</h2>
    <figure class="guide-figure">
        <img src="/assets/articles/mesh-shapes-same-range.png" width="1260" height="251" alt="Three Bed Mesh heatmaps on a shared scale: an even slope, a bowl and a single high corner" loading="lazy" decoding="async">
        <figcaption>Three simulated grids viewed in Bed Mesh. Each has a 0.200 mm range. From left to right, the pattern is a slope, a bowl, and a single high point.</figcaption>
    </figure>
    <dl class="guide-definitions">
        <div><dt>Steady slope</dt><dd>Check <strong>Fitted X rise</strong> and <strong>Fitted Y rise</strong>. If the <strong>Range without fitted tilt</strong> is much smaller, most of the variation follows one plane. Check the printer’s tramming or gantry alignment procedure before chasing individual low spots.</dd></div>
        <div><dt>Bowl or hump</dt><dd>Check whether the curve remains when you choose <strong>Remove fitted tilt</strong>. Repeat the scan with the plate seated the same way. If the shape depends on warm-up, compare cold and heated readings with matching bounds.</dd></div>
        <div><dt>One isolated high reading</dt><dd>Check its neighbours and repeat the scan before adjusting anything. A single point can set the whole range. <a href="/guides/?topic=bed-mesh-spike">How to investigate a mesh spike</a>.</dd></div>
    </dl>
</section>
<section aria-labelledby="check-first-layer">
    <h2 id="check-first-layer">Decide with a first-layer test</h2>
    <p>Print one-layer patches where your parts normally sit, including the area that looks unusual. Check for consistent lines and adhesion. A repeatable, even first layer is a practical reason to stop adjusting. If one area repeatedly fails, compare that location with the mesh and confirm that the print uses the expected profile.</p>
    <p><a href="/guides/?topic=uneven-first-layer-flat-mesh">Troubleshoot an uneven first layer</a> · <a href="https://help.prusa3d.com/article/first-layer-calibration-i3_112364">Prusa first-layer examples</a>.</p>
</section>
