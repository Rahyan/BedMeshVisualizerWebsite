import { compareAdjustmentToBaseline } from './mesh-comparison.mjs';
import { baselineSummary } from './mesh-report.mjs';

function conditionWarnings(contexts, grids) {
    const warnings = [];
    for (const [key, label] of [['setup', 'printer/setup'], ['surface', 'build plate'], ['bedTemperature', 'bed temperature']]) {
        const values = contexts.map(context => context[key].trim().replace(/\s+/g, ' ').toLowerCase());
        if (new Set(values.filter(Boolean)).size > 1) warnings.push(`Recorded ${label} differs between the comparison and baseline scans.`);
        if (values.includes('')) warnings.push(`Some scans omit ${label}.`);
    }
    if (grids.some(grid => grid.flipX !== grids[0].flipX || grid.flipY !== grids[0].flipY)) {
        warnings.push('Check that the Flip X/Y settings align the physical probe locations.');
    }
    if (new Set(grids.map(grid => grid.frontEdge).filter(Boolean)).size > 1) {
        warnings.push('Front-edge labels differ. Check the orientation of these scans.');
    }
    return warnings;
}

export function bindAdjustmentBaseline(section, { getComparison, getRuns, describe, nameOf, contextOf, format }) {
    const list = section.querySelector('[data-baseline-choices]');
    const message = section.querySelector('[data-baseline-message]');
    const output = section.querySelector('[data-baseline-output]');
    const pointReadout = section.querySelector('[data-baseline-point]');
    const save = section.querySelector('[data-difference="save-session"]');
    const options = new Map();
    const selected = new Set();
    let active = null;

    function updatePoint() {
        const { point, result } = getComparison();
        pointReadout.textContent = active && point
            ? `X ${point.x}, Y ${point.y} · Absolute change ${format(Math.abs(result.values[point.y][point.x]), 6)} mm · Observed spread ${format(active.spread.values[point.y][point.x], 6)} mm · Above spread by ${format(active.excess[point.y][point.x], 6)} mm`
            : '';
    }

    function clear(text) {
        active = null;
        output.replaceChildren();
        output.hidden = true;
        message.textContent = text;
        if (save) save.disabled = true;
        updatePoint();
    }

    function syncChoices(candidates) {
        for (const [run, option] of options) {
            if (candidates.includes(run)) continue;
            option.label.remove();
            options.delete(run);
            selected.delete(run);
        }
        for (const run of candidates) {
            let option = options.get(run);
            if (!option) {
                const label = document.createElement('label');
                const input = document.createElement('input');
                const text = document.createElement('span');
                input.type = 'checkbox';
                label.append(input, text);
                list.append(label);
                option = { label, input, text };
                options.set(run, option);
                input.addEventListener('change', () => {
                    if (input.checked) selected.add(run);
                    else selected.delete(run);
                    update();
                });
            }
            option.input.checked = selected.has(run);
            option.input.disabled = !run.parsed && !selected.has(run);
            option.text.textContent = nameOf(run) + (run.parsed ? '' : ' (needs Visualize)');
        }
    }

    function update() {
        const { result, before, after } = getComparison();
        section.hidden = !result;
        const candidates = getRuns().filter(run => run !== after);
        syncChoices(candidates);
        if (!result) { clear(''); return; }
        if (selected.size < 3) {
            clear(candidates.filter(run => run.parsed).length < 3
                ? 'Visualize at least three repeat scans taken before the adjustment. Before can be one of them.'
                : 'Select at least three repeat scans to build a baseline.');
            return;
        }
        try {
            const members = [...selected];
            if (members.some(run => !run.parsed)) throw new Error('Visualize each selected baseline scan again after editing.');
            const grids = members.map(describe);
            const runs = members.map(run => ({ name: nameOf(run), measurement: contextOf(run) }));
            const warnings = conditionWarnings([contextOf(before), contextOf(after), ...runs.map(run => run.measurement)],
                [describe(before), describe(after), ...grids]);
            const key = JSON.stringify([members.map((run, index) =>
                [run.id, run.dataRevision, grids[index].width, grids[index].depth, grids[index].bounds,
                    grids[index].flipX, grids[index].flipY, grids[index].frontEdge]), runs, warnings]);
            if (active?.result === result && active.key === key) { updatePoint(); return; }
            active = { ...compareAdjustmentToBaseline(result, grids), result, key, members, runs, warnings };
            output.replaceChildren(...baselineSummary(active, format));
            output.hidden = false;
            message.textContent = `${runs.length} baseline scans · Same height reference as the difference view`;
            if (save) save.disabled = false;
            updatePoint();
        } catch (error) {
            clear(error.message || 'The selected baseline scans could not be compared.');
        }
    }

    return {
        update, updatePoint,
        current: () => active,
        setRuns(runs) {
            selected.clear();
            runs.forEach(run => selected.add(run));
            if (runs.length) section.open = true;
            update();
        },
    };
}
