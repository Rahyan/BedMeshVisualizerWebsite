                        <section aria-labelledby="repeatable-conditions">
                            <h2 id="repeatable-conditions">Keep the probing setup fixed</h2>
                            <p>To test bed mesh repeatability, capture at least three full meshes without adjusting the printer. Compare the same XY positions across those runs. The spread at each point tells you how far the reported height moved while the setup stayed the same.</p>
                            <p>Keep the same plate, mesh bounds, point count, homing procedure, probe settings, and temperature. If you normally probe after heating the bed, use the same temperature and stabilization routine for each scan. Record the conditions so you can repeat the test after a change.</p>
                            <p>Take a separate scan after one adjustment. Changing several things at once makes it harder to tell what caused a difference.</p>
                        </section>
                        <section aria-labelledby="build-a-baseline">
                            <h2 id="build-a-baseline">Build a repeatability baseline in Bed Mesh</h2>
                            <ol>
                                <li>Load the unchanged scans and your post-adjustment scan. <a href="/guides/?topic=getting-mesh-data">Copy the measured grid</a> in its original order and check that the charts line up with the physical bed.</li>
                                <li>In <strong>Difference heatmap</strong>, pick a representative unchanged scan as <strong>Before</strong> and the adjusted scan as <strong>After</strong>.</li>
                                <li>Open <strong>Adjustment vs. repeatability</strong> and select the unchanged scans. The Before scan can be part of the baseline.</li>
                                <li>Use <strong>As measured</strong> to include height offsets. If you want to study shape, switch to the mean or fitted-plane reference. That reference applies to both the difference and the baseline.</li>
                            </ol>
                            <p>Click a heatmap cell to inspect its exact values and see the cross-sections through its row and column. Save a calibration session to preserve your baseline, selected point, and notes.</p>
                        </section>
                        <section aria-labelledby="repeatability-example">
                            <h2 id="repeatability-example">Work through one measured point</h2>
                            <p>Suppose three unchanged scans read <strong>−0.01, 0.00, and +0.01 mm</strong> at one point. The observed spread is 0.02 mm. Using the 0.00 mm scan as Before, a later reading of +0.06 mm gives a 0.06 mm change. That exceeds the observed spread by 0.04 mm.</p>
                            <figure class="guide-figure">
                                <svg viewBox="0 0 560 146" role="img" aria-labelledby="repeatability-figure-title repeatability-figure-desc" xmlns="http://www.w3.org/2000/svg">
                                    <title id="repeatability-figure-title">Unchanged scans and the adjusted scan at one grid point</title>
                                    <desc id="repeatability-figure-desc">The unchanged scans span minus 0.01 to plus 0.01 millimetres. The adjusted reading is plus 0.06 millimetres.</desc>
                                    <path d="M80 89H480" stroke="#d5dce8" stroke-width="2"/>
                                    <path d="M105 89H205" stroke="#536dfe" stroke-width="10" stroke-linecap="round" opacity=".24"/>
                                    <g fill="#465dea">
                                        <circle cx="105" cy="89" r="5"/><circle cx="155" cy="89" r="5"/><circle cx="205" cy="89" r="5"/>
                                    </g>
                                    <circle cx="455" cy="89" r="6" fill="#a34a25"/>
                                    <g fill="#263047" font-family="Arial, sans-serif" font-size="17" text-anchor="middle">
                                        <text x="155" y="48">Unchanged scans</text>
                                        <text x="455" y="48">Adjusted scan</text>
                                    </g>
                                    <g fill="#526070" font-family="Arial, sans-serif" font-size="15" text-anchor="middle">
                                        <text x="105" y="117">−0.01</text><text x="155" y="117">0.00</text><text x="205" y="117">+0.01</text><text x="455" y="117">+0.06 mm</text>
                                    </g>
                                </svg>
                                <figcaption>Illustrative readings at the same XY position. Check nearby points for a consistent pattern before drawing a conclusion from one cell.</figcaption>
                            </figure>
                            <p>A result within the observed spread is inconclusive at that point. A result above it is a reason to probe again under the same conditions. Three runs provide a starting baseline, with limited evidence about rarer variations.</p>
                            <p><a href="/?demo=comparison#adjustment-baseline">Try the baseline in the calibration walkthrough</a> with three unchanged scans and a simulated adjustment.</p>
                        </section>
                        <section aria-labelledby="probe-vs-mesh">
                            <h2 id="probe-vs-mesh">Isolate probe and whole-bed variation</h2>
                            <p>A stationary probe test repeats the reading at one location. A whole-bed test also includes movement across the plate and whatever homing and heating routine you use. In Klipper, <a href="https://www.klipper3d.org/Probe_Calibrate.html#repeatability-check">the probe repeatability check</a> documents <code>PROBE_ACCURACY</code>. Use it to examine one location, then compare complete meshes to see where the variation shows up across your sampled area.</p>
                            <p>If the largest difference moves around from run to run, start by repeating the original setup. If a region keeps changing in the same direction after an adjustment, save the comparison report with the probing conditions and check the result against a first-layer print.</p>
                        </section>
