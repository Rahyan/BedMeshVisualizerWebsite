import { calculateStats } from './mesh-data.mjs';
import { MESH_COLORS, DIFFERENCE_COLORS } from './mesh-plot.mjs';
import { comparisonProfilePanels } from './mesh-sections.mjs';
import { axisPosition, boundsText, frontEdgeText } from './mesh-coordinates.mjs';

function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
}

function cellColour(value, [min, max], stops) {
    const scale = Math.max(Math.abs(min), Math.abs(max));
    const position = min === max ? 0.5 : (value / scale - min / scale) / (max / scale - min / scale);
    const upper = stops.findIndex(([offset]) => offset >= position);
    if (upper <= 0) return upper === 0 ? stops[0][1] : stops.at(-1)[1];
    const [lowOffset, low] = stops[upper - 1];
    const [highOffset, high] = stops[upper];
    const fraction = (position - lowOffset) / (highOffset - lowOffset);
    const rgb = [1, 3, 5].map(index => {
        const start = parseInt(low.slice(index, index + 2), 16);
        const end = parseInt(high.slice(index, index + 2), 16);
        return Math.round(start + (end - start) * fraction);
    });
    return `rgb(${rgb.join(',')})`;
}

function heatmap(label, name, values, bounds, stops, format) {
    const figure = element('figure', undefined, 'report-figure');
    const caption = element('figcaption');
    caption.append(element('strong', label), element('span', name));
    const rows = values.length;
    const columns = values[0].length;
    const chart = element('canvas');
    chart.width = 360;
    chart.height = Math.round(360 * Math.max(0.45, Math.min(1.15, rows / columns)));
    chart.setAttribute('role', 'img');
    chart.setAttribute('aria-label', `${label} heatmap, ${columns} columns by ${rows} rows, scale ${format(bounds[0])} to ${format(bounds[1])} mm`);
    const context = chart.getContext('2d');
    if (!context) throw new Error('This browser could not draw the report heatmaps.');
    // Match the interactive heatmap: Y increases from bottom to top.
    values.forEach((row, y) => row.forEach((value, x) => {
        const left = Math.floor(x * chart.width / columns);
        const right = Math.floor((x + 1) * chart.width / columns);
        const top = Math.floor((rows - y - 1) * chart.height / rows);
        const bottom = Math.floor((rows - y) * chart.height / rows);
        context.fillStyle = cellColour(value, bounds, stops);
        context.fillRect(left, top, right - left, bottom - top);
    }));
    const scale = element('canvas', undefined, 'report-colour-scale');
    scale.width = chart.width;
    scale.height = 8;
    scale.setAttribute('aria-hidden', 'true');
    const bar = scale.getContext('2d');
    const gradient = bar.createLinearGradient(0, 0, scale.width, 0);
    if (bounds[0] === bounds[1]) {
        bar.fillStyle = cellColour(bounds[0], bounds, stops);
    } else {
        for (const [position, colour] of stops) gradient.addColorStop(position, colour);
        bar.fillStyle = gradient;
    }
    bar.fillRect(0, 0, scale.width, scale.height);
    const labels = element('div', undefined, 'report-scale-labels');
    labels.append(element('span', format(bounds[0])), element('span', `${format(bounds[1])} mm`));
    figure.append(caption, chart, scale, labels);
    return figure;
}

function runConditions(label, run, bounds) {
    const section = element('section', undefined, 'report-run');
    section.append(element('h3', label), element('p', run.name, 'report-run-name'));
    const { measuredAt, bedTemperature, surface, setup, notes } = run.measurement;
    const list = element('dl');
    const values = [
        ['Recorded', measuredAt ? measuredAt.replace('T', ' ') + ' (local)' : 'Not recorded'],
        ['Bed', bedTemperature === '' ? 'Not recorded' : `${bedTemperature} °C`],
        ['Surface', surface.trim() || 'Not recorded'],
        ['Setup', setup.trim() || 'Not recorded'],
        ['Orientation', [run.flipX && 'Flip X', run.flipY && 'Flip Y'].filter(Boolean).join(', ') || 'Input order'],
    ];
    if (run.frontEdge) values.push(['Front edge', frontEdgeText(run.frontEdge, bounds)]);
    for (const [key, value] of values) list.append(element('dt', key), element('dd', value));
    section.append(list);
    if (notes.trim()) section.append(element('p', notes.trim(), 'report-run-notes'));
    return section;
}

const EXCESS_COLORS = [[0, '#f5f6fa'], [0.001, '#b9cdfd'], [0.5, '#536dfe'], [1, '#3a2694']];

export function baselineSummary(baseline, format) {
    const { spread, excess, aboveCount, pointCount, maxExcess, runs, warnings } = baseline;
    const heading = element('p', `${aboveCount} of ${pointCount} points above the observed spread`, 'baseline-metric');
    const explanation = element('p', 'Spread is the highest minus the lowest baseline reading at each point. The second map shows how much the absolute change exceeds that spread.', 'report-caption');
    const charts = element('div', undefined, 'report-charts baseline-maps');
    const palette = (max, stops) => max ? stops : [[0, stops[0][1]], [1, stops[0][1]]];
    charts.append(
        heatmap('Baseline spread', `${runs.length} repeat scans`, spread.values, [0, spread.stats.max], palette(spread.stats.max, MESH_COLORS), format),
        heatmap('Change above spread', 'Zero where change is within the spread', excess, [0, maxExcess], palette(maxExcess, EXCESS_COLORS), format),
    );
    const info = element('p', `Largest baseline spread ${format(spread.stats.max, 6)} mm · Largest excess ${format(maxExcess, 6)} mm`, 'report-caption');
    const sources = element('ul', undefined, 'baseline-sources');
    for (const run of runs) {
        const { measuredAt, bedTemperature, setup, surface } = run.measurement;
        const detail = [measuredAt ? measuredAt.replace('T', ' ') : '', bedTemperature ? `${bedTemperature} °C` : '', setup, surface].filter(Boolean);
        sources.append(element('li', [run.name, ...detail].join(' · ')));
    }
    return [heading, explanation, charts, info, sources,
        element('p', warnings.join(' '), 'baseline-warnings'),
        element('p', 'These scans provide an observed range. Use consistent probing conditions and verify that the grids cover the same physical locations.', 'report-caption')];
}

export function openComparisonReport(dialog, { before, after, result, format, signed, conditions, demo, point, baseline, session }) {
    const beforeStats = calculateStats(result.beforeValues);
    const afterStats = calculateStats(result.afterValues);
    const shared = [Math.min(beforeStats.min, afterStats.min), Math.max(beforeStats.max, afterStats.max)];
    const charts = element('div', undefined, 'report-charts');
    charts.append(
        heatmap('Before', before.name, result.beforeValues, shared, MESH_COLORS, format),
        heatmap('After', after.name, result.afterValues, shared, MESH_COLORS, format),
        heatmap('Difference', 'After minus before', result.values, result.range, DIFFERENCE_COLORS, format),
    );
    const grid = `${result.columns} × ${result.rows} points`;
    const { width, depth, bounds } = result.dimensions;
    const area = bounds ? boundsText(bounds) : width === null ? 'Sampled area not declared' : `${width} × ${depth} mm sampled area`;
    const reference = { original: 'Measured heights', mean: 'Relative to each mesh’s mean', plane: 'With each fitted tilt removed' }[result.reference];
    const description = element('p', `${grid} · ${area} · ${reference}`, 'report-caption');
    const axes = element('p', 'X increases right, Y increases up. Before and After share a colour scale. The difference uses its own scale centred on zero.', 'report-caption');
    const summary = element('dl', undefined, 'report-metrics');
    const metrics = [
        ['Original range', `${format(before.stats.range)} → ${format(after.stats.range)} mm`],
        ['Original range change', `${signed(result.measuredRangeChange)} mm`],
        ['Original mean change', `${signed(result.meanHeightChange)} mm`],
        ['RMS point change', `${format(result.stats.rms)} mm`],
    ];
    for (const [label, value] of metrics) {
        const metric = element('div');
        metric.append(element('dt', label), element('dd', value));
        summary.append(metric);
    }
    const runs = element('div', undefined, 'report-conditions');
    runs.append(runConditions('Before', before, bounds), runConditions('After', after, bounds));
    const note = element('p', `${conditions} Confirm both runs used the same physical probe locations.`, 'report-caption');
    const content = dialog.querySelector('[data-report-content]');
    content.replaceChildren(...(demo ? [element('p', 'Simulated comparison', 'report-demo-label')] : []),
        description, charts, axes, summary, runs, note);
    if (session) {
        const notes = element('section', undefined, 'report-extra');
        notes.append(element('h3', session.name), element('p', [session.setup, session.surface].filter(Boolean).join(' · '), 'report-caption'));
        if (session.notes) notes.append(element('p', session.notes, 'report-run-notes'));
        content.append(notes);
    }
    if (point) {
        const { x, y } = point;
        const profiles = element('section', undefined, 'report-extra');
        const grid = element('div', undefined, 'section-profiles');
        grid.append(...comparisonProfilePanels(result, point, format, signed));
        const legend = element('div', undefined, 'sections-legend');
        legend.append(element('span', 'Before', 'profile-key-before'), element('span', 'After', 'profile-key-after'), element('span', 'Height (mm)'));
        const position = bounds ? `X ${format(axisPosition(x, result.columns, width, bounds.minX, bounds.maxX), 3)}, Y ${format(axisPosition(y, result.rows, depth, bounds.minY, bounds.maxY), 3)} mm · ` : '';
        const readings = `${position}Before ${format(result.beforeValues[y][x], 6)} mm · After ${format(result.afterValues[y][x], 6)} mm · Change ${signed(result.values[y][x], 6)} mm`;
        profiles.append(element('h3', `Cross-sections at X ${x}, Y ${y}`), element('p', readings, 'report-caption'), legend, grid);
        content.append(profiles);
    }
    if (baseline) {
        const section = element('section', undefined, 'report-extra');
        section.append(element('h3', 'Repeatability baseline'), ...baselineSummary(baseline, format));
        if (point) {
            const { x, y } = point;
            section.append(element('p', `At X ${x}, Y ${y} · Observed spread ${format(baseline.spread.values[y][x], 6)} mm · Above spread by ${format(baseline.excess[y][x], 6)} mm`, 'report-caption'));
        }
        content.append(section);
    }
    dialog.showModal();
}

/** Save a static document with embedded heatmaps and no external dependencies. */
export function comparisonReportFile(dialog, sheet) {
    const content = dialog.querySelector('[data-report-content]');
    const copy = content.cloneNode(true);
    const charts = content.querySelectorAll('canvas');
    copy.querySelectorAll('canvas').forEach((placeholder, index) => {
        const chart = charts[index];
        const image = document.createElement('img');
        image.className = chart.className;
        image.alt = chart.getAttribute('aria-label') ?? '';
        image.width = chart.width;
        image.height = chart.height;
        image.src = chart.toDataURL('image/png');
        placeholder.replaceWith(image);
    });
    const rules = Array.from(sheet.cssRules, rule => rule.cssText).join('\n');
    return new Blob([
        '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
        '<title>Bed Mesh comparison report</title><style>', rules, '</style>',
        '<body class="report-file"><main><span class="report-brand">Bed Mesh</span><h1>Comparison report</h1>',
        copy.outerHTML, '</main></body></html>',
    ], { type: 'text/html;charset=utf-8' });
}
