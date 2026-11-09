<details class="difference repeat-runs" id="mesh-repeat-runs" hidden>
    <summary>Compare repeat runs</summary>
    <p class="repeat-intro">Select three or more scans from the same setup and probing area. Each cell shows the highest minus the lowest measured height at that point.</p>
    <fieldset class="repeat-choices">
        <legend>Runs to include</legend>
        <div data-repeat-choices></div>
    </fieldset>
    <p class="difference-message" data-repeat-message role="status"></p>
    <p class="repeat-intro" data-repeat-conditions></p>
    <div data-repeat-output hidden>
        <dl class="difference-summary">
            <div><dt>Average point spread</dt><dd data-repeat-mean></dd></div>
            <div><dt>Largest point spread</dt><dd data-repeat-max></dd></div>
            <div><dt>Point with largest spread</dt><dd data-repeat-point></dd></div>
        </dl>
        <div class="difference-plot-wrap">
            <div class="difference-graph" data-repeat-graph role="img" aria-label="Observed spread at each sample point, in millimetres"></div>
            <div class="difference-placeholder" data-repeat-placeholder></div>
        </div>
        <button type="button" class="text-button" data-repeat-retry hidden>Retry heatmap</button>
        <p class="repeat-intro">Point labels use zero-based sample indices. The spread includes any shifts in overall height between runs. Compare it with the size of a change after an adjustment.</p>
    </div>
</details>
