<section aria-labelledby="find-printer-directions">
    <h2 id="find-printer-directions">Find the printer’s directions</h2>
    <p>Start with the printer’s displayed X and Y coordinates and confirm which direction increases as you look at the bed from the front. Use the printer’s documented motion controls with the nozzle clear of the plate. On some printers, the bed moves under the nozzle, so follow the position on the plate relative to the nozzle.</p>
    <p>Find the minimum and maximum <em>sampled</em> coordinates. These often stop short of the physical edges and can start away from the printer’s origin. Use the coordinate positions of the probed points, rather than the order in which the probe visited them. Klipper describes the probe bounds and the position output in its documentation. <a href="https://www.klipper3d.org/Bed_Mesh.html#rectangular-beds">Klipper rectangular mesh bounds</a>.</p>
</section>
<section aria-labelledby="align-and-label">
    <h2 id="align-and-label">Align and label the heatmap</h2>
    <ol>
        <li>Open <strong>Heatmap</strong>. On this view, X increases to the right and Y increases upward.</li>
        <li>Under <strong>Settings</strong>, open <strong>Sampled XY bounds and front edge</strong>. Enter all four coordinates to put the chart in your printer’s coordinate system.</li>
        <li>Compare the firmware grid order with those axes. Use <strong>Flip X</strong> or <strong>Flip Y</strong> if the rows or columns run in the opposite direction. Set <strong>Front of printer</strong> to the edge you confirmed in the printer’s coordinate system.</li>
    </ol>
    <figure class="guide-figure">
        <img src="/assets/articles/mesh-front-edge.png" width="1126" height="353" alt="Bed Mesh heatmap with a Front label along low Y and axes showing absolute sampled X and Y positions" loading="lazy" decoding="async">
        <figcaption>This simulated bed has sampled X from 20 to 200 mm and Y from 30 to 210 mm. The <strong>FRONT</strong> label is on low Y, so the low-X, low-Y corner is the front left in this setup.</figcaption>
    </figure>
</section>
<section aria-labelledby="verify-corner">
    <h2 id="verify-corner">Verify the corner before adjusting it</h2>
    <p>Hover a point to read its X and Y in millimetres. In a compatible comparison, click the point to see its position and the row and column through it. Check the actual print or a documented probe reading at that position before making an adjustment.</p>
    <p>The flips and front label change your view in Bed Mesh. Printer motion, saved firmware profiles, and exported original height values have their own settings. If the print still behaves as if it uses a different mesh, <a href="/guides/?topic=uneven-first-layer-flat-mesh#verify-mesh-in-use">check the mesh used during the print</a>.</p>
</section>
