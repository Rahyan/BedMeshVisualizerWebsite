<dialog id="calibration-sessions" class="mesh-dialog" aria-labelledby="calibration-title">
    <header class="mesh-dialog-heading">
        <h2 id="calibration-title">Calibration sessions</h2>
        <form method="dialog"><button class="button button-quiet">Close</button></form>
    </header>
    <div data-session-library>
        <p>Open a saved session or use one of its scans as a reference for another mesh.</p>
        <label class="mesh-dialog-label" for="session-choice">Saved session</label>
        <select id="session-choice"></select>
        <p class="report-caption" data-session-preview></p>
        <p class="report-run-notes" data-session-notes></p>
        <div class="toolbar-actions preset-actions">
            <button class="button button-secondary" type="button" data-session-open disabled>Open session</button>
            <button class="button button-quiet" type="button" data-session-remove disabled>Remove session</button>
            <button class="button button-quiet" type="button" data-session-cancel hidden>Cancel removal</button>
        </div>
        <p class="report-caption">Opening a session replaces the open meshes. Undo open restores them until your next edit.</p>
        <section class="preset-form" aria-labelledby="session-reference-title">
            <h3 id="session-reference-title">Reference run</h3>
            <div class="log-choices">
                <div><label class="mesh-dialog-label" for="session-reference">Mark a saved scan</label><select id="session-reference" disabled><option value="">No reference</option><option value="before">Before</option><option value="after">After</option></select><button class="button button-quiet" type="button" data-session-mark disabled>Save reference choice</button></div>
                <div><label class="mesh-dialog-label" for="session-target">Open mesh to compare</label><select id="session-target" disabled></select><button class="button button-secondary" type="button" data-session-compare disabled>Compare with reference</button></div>
            </div>
        </section>
    </div>
    <form id="session-form" class="preset-form" hidden>
        <h3>Save this calibration session</h3>
        <p>Keep a copy of the Before and After pair, the baseline scans, and the selected point in this browser.</p>
        <label class="mesh-dialog-label" for="session-name">Session name</label>
        <input id="session-name" name="name" type="text" maxlength="80" required>
        <div class="log-choices">
            <div><label class="mesh-dialog-label" for="session-printer">Printer / setup</label><input id="session-printer" name="setup" type="text" maxlength="80"></div>
            <div><label class="mesh-dialog-label" for="session-plate">Build plate</label><input id="session-plate" name="surface" type="text" maxlength="80"></div>
        </div>
        <label class="mesh-dialog-label" for="session-notes">Adjustment notes</label>
        <textarea id="session-notes" name="notes" rows="3" maxlength="1000"></textarea>
        <button class="button" type="submit">Save session</button>
    </form>
    <p class="mesh-dialog-message" data-session-message role="status"></p>
</dialog>
