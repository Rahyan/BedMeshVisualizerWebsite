import { measureRepeatability } from './mesh-comparison.mjs';
import { renderMeshPlot, purgePlot } from './mesh-plot.mjs';

export function bindRepeatRuns(section, { getRuns, describe, nameOf, contextOf, format }) {
    const choices = section.querySelector('[data-repeat-choices]');
    const message = section.querySelector('[data-repeat-message]');
    const conditions = section.querySelector('[data-repeat-conditions]');
    const output = section.querySelector('[data-repeat-output]');
    const graph = section.querySelector('[data-repeat-graph]');
    const placeholder = section.querySelector('[data-repeat-placeholder]');
    const retry = section.querySelector('[data-repeat-retry]');
    const excluded = new WeakSet();
    const options = new Map();
    let key;
    let token = 0;
    let queue = Promise.resolve();

    function clear() {
        if (key !== undefined) {
            token++;
            key = undefined;
            queue = queue.then(() => { purgePlot(graph); });
        }
        output.hidden = true;
        conditions.textContent = '';
    }

    function syncChoices(runs) {
        for (const [run, option] of options) {
            if (runs.includes(run)) continue;
            option.label.remove();
            options.delete(run);
        }
        for (const run of runs) {
            let option = options.get(run);
            if (!option) {
                const label = document.createElement('label');
                const input = document.createElement('input');
                const text = document.createElement('span');
                input.type = 'checkbox';
                input.checked = !excluded.has(run);
                label.append(input, text);
                choices.append(label);
                option = { label, text };
                options.set(run, option);
                input.addEventListener('change', () => {
                    if (input.checked) excluded.delete(run);
                    else excluded.add(run);
                    update();
                });
            }
            option.text.textContent = nameOf(run);
        }
    }

    function compareConditions(runs, grids) {
        const contexts = runs.map(contextOf);
        const warnings = [];
        for (const [field, label] of [['bedTemperature', 'bed temperature'], ['surface', 'build surface'], ['setup', 'printer/setup']]) {
            const values = contexts.map(context => context[field].trim().replace(/\s+/g, ' ').toLowerCase());
            if (new Set(values.filter(Boolean)).size > 1) warnings.push(`Recorded ${label} differs.`);
            if (values.includes('')) warnings.push(`Some runs omit ${label}.`);
        }
        if (grids.some(grid => grid.flipX !== grids[0].flipX || grid.flipY !== grids[0].flipY)) {
            warnings.push('Flip X/Y settings differ. Check that the points line up.');
        }
        if (new Set(grids.map(grid => grid.frontEdge).filter(Boolean)).size > 1) {
            warnings.push('Front-edge labels differ. Check the orientation of these scans.');
        }
        conditions.textContent = warnings.join(' ');
    }

    function update() {
        const runs = getRuns();
        section.hidden = runs.length < 3;
        if (!section.open || section.hidden) {
            clear();
            return;
        }
        syncChoices(runs);
        const selected = runs.filter(run => !excluded.has(run));
        try {
            if (selected.length < 3) throw new Error('Select at least three visualized runs.');
            const grids = selected.map(describe);
            const nextKey = JSON.stringify(grids.map(({ flipX, flipY, width, depth, bounds, frontEdge }, index) =>
                [selected[index].id, selected[index].dataRevision, flipX, flipY, width, depth, bounds, frontEdge]));
            compareConditions(selected, grids);
            message.textContent = `${selected.length} selected runs · ${grids[0].values[0].length} × ${grids[0].values.length} points`;
            if (key === nextKey) return;
            const result = measureRepeatability(grids);
            key = nextKey;
            const revision = ++token;
            section.querySelector('[data-repeat-mean]').textContent = `${format(result.stats.mean)} mm`;
            section.querySelector('[data-repeat-max]').textContent = `${format(result.stats.max)} mm`;
            section.querySelector('[data-repeat-point]').textContent = result.stats.max === 0
                ? 'All points equal' : `X ${result.widest.x}, Y ${result.widest.y}`;
            output.hidden = false;
            placeholder.hidden = false;
            placeholder.textContent = 'Drawing the spread heatmap…';
            retry.hidden = true;
            queue = queue.then(async () => {
                if (revision !== token) return;
                try {
                    await renderMeshPlot(graph, result.values, {
                        view: 'heatmap', spread: true, ...result.dimensions, frontEdge: result.frontEdge,
                        range: [0, result.stats.max || 0.01], uirevision: `repeat-${nextKey}`,
                    });
                    if (revision === token) placeholder.hidden = true;
                } catch {
                    if (revision !== token) return;
                    purgePlot(graph);
                    placeholder.textContent = 'The spread heatmap is unavailable. The summary above is still available.';
                    retry.hidden = false;
                }
            });
        } catch (error) {
            clear();
            message.textContent = error.message;
        }
    }

    section.addEventListener('toggle', update);
    retry.addEventListener('click', () => { clear(); update(); });
    return {
        update,
        selectRuns(selection) {
            for (const run of getRuns()) {
                if (selection.includes(run)) excluded.delete(run);
                else excluded.add(run);
                const checkbox = options.get(run)?.label.querySelector('input');
                if (checkbox) checkbox.checked = !excluded.has(run);
            }
            section.open = true;
            update();
        },
    };
}
