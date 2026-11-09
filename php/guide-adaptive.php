<section aria-labelledby="why-grid-changes">
    <h2 id="why-grid-changes">Why the grid changes</h2>
    <p>Klipper’s adaptive meshing chooses a footprint around the objects in the current print, with any configured margin. It can reduce the probe count as it shrinks the area. A full-bed setting of 5×5 can therefore produce a 3×3 scan for a small part. KAMP users see a similar change when their setup scales the grid to the print area. <a href="https://www.klipper3d.org/Bed_Mesh.html#adaptive-meshes">Klipper adaptive mesh documentation</a> · <a href="https://github.com/kyleisah/Klipper-Adaptive-Meshing-Purging">KAMP documentation</a>.</p>
    <p>If the probed area seems unrelated to where the part sits, compare the adapted bounds reported during probing with the object’s placement in the slicer. Check that your start routine receives the expected object information before changing probe count or offsets.</p>
</section>
<section aria-labelledby="read-adapted-bounds">
    <h2 id="read-adapted-bounds">Read the actual sampled bounds</h2>
    <p>Use the bounds reported for that run. For example, a full scan may span X 20–200 mm and Y 30–210 mm, while an adaptive scan uses X 110–170 mm and Y 70–130 mm. Enter each set under <strong>Sampled XY bounds and front edge</strong> in Bed Mesh. The axes then show where each scan sits on the printer.</p>
    <figure class="guide-figure">
        <img src="/assets/articles/adaptive-sampled-bounds.png" width="1180" height="339" alt="Two Bed Mesh heatmaps comparing the sampled coordinates of a 5 by 5 full-bed scan and a smaller 3 by 3 adaptive scan" loading="lazy" decoding="async">
        <figcaption>Simulated full-bed and adaptive grids in Bed Mesh. The axes show the area each grid covers. Both charts fill their plot area, so read the coordinate labels to compare their physical size.</figcaption>
    </figure>
</section>
<section aria-labelledby="collect-matching-scans">
    <h2 id="collect-matching-scans">Collect two matching scans</h2>
    <p>For a before-and-after test, capture both scans over the same area with the same grid density and orientation. If you are diagnosing the entire bed, a pair of fixed full-bed runs is easier to reproduce. Two adaptive scans can also work if the sampled bounds and point count match exactly and the probe visited the same physical points.</p>
    <p>Bed Mesh rejects a point-by-point comparison when the grid sizes or declared bounds differ. Even two 3×3 scans may be incompatible if one is in the centre and the other is near a corner. Use the individual heatmaps to inspect both, then collect a matching pair to measure change. <a href="/guides/?topic=comparing-runs">Compare two mesh runs</a>.</p>
</section>
