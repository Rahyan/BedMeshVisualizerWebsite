<dialog id="mesh-log-picker" class="mesh-dialog" aria-labelledby="log-title">
    <header class="mesh-dialog-heading">
        <h2 id="log-title">Scan a printer log</h2>
        <form method="dialog"><button class="button button-quiet">Close</button></form>
    </header>
    <p>Paste your console log to find the height grids inside it. Open one grid as a heatmap or choose two to compare. The log stays in this browser.</p>
    <label class="mesh-dialog-label" for="mesh-log-input">Printer log</label>
    <textarea id="mesh-log-input" rows="6" spellcheck="false" autocomplete="off" autofocus placeholder="Paste console output including mesh headings or G29/G81 commands"></textarea>
    <button type="button" class="button button-secondary" data-log-scan>Find meshes</button>
    <p class="mesh-dialog-message" data-log-message role="status"></p>
    <div data-log-results hidden>
        <div class="log-choices">
            <div><label class="mesh-dialog-label" for="log-before">Before report</label><select id="log-before"></select><pre data-log-preview="log-before" aria-label="Before grid preview"></pre></div>
            <div><label class="mesh-dialog-label" for="log-after">After report</label><select id="log-after"></select><pre data-log-preview="log-after" aria-label="After grid preview"></pre></div>
        </div>
        <button type="button" class="button" data-log-open disabled>Open selected meshes</button>
    </div>
</dialog>

<dialog id="comparison-report" class="mesh-dialog report-dialog" aria-labelledby="report-title">
    <header class="mesh-dialog-heading">
        <div><span class="report-brand">Bed Mesh</span><h2 id="report-title">Comparison report</h2></div>
        <div class="toolbar-actions report-controls">
            <form method="dialog"><button class="button button-quiet" autofocus>Close</button></form>
            <button type="button" class="button" data-report-download>Download report</button>
        </div>
    </header>
    <p class="report-screen-help">Open the downloaded HTML report in your browser to print or save a PDF.</p>
    <p class="mesh-dialog-message" data-report-message role="status"></p>
    <div data-report-content></div>
</dialog>
