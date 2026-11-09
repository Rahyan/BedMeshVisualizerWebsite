import { parseMesh, findMeshReports, calculateStats, analyzeMesh, exportMeshCsv, transformMesh, removeFittedTilt } from './mesh-data.mjs';
import { renderMeshPlot, purgePlot, resetPlotView, downloadPlot, heatmapCell } from './mesh-plot.mjs';
import { compareMeshes } from './mesh-comparison.mjs';
import { bindLogPicker } from './mesh-log-picker.mjs';
import { openComparisonReport, comparisonReportFile } from './mesh-report.mjs';
import { bindRepeatRuns } from './mesh-repeatability.mjs';
import { bindMeasurementHistory, saveMeasurementRun, updateMeasurementHistory } from './measurement-history.mjs';
import { showComparisonSections } from './mesh-sections.mjs';
import { bindPrinterPresets } from './printer-presets.mjs';
import { bindAdjustmentBaseline } from './mesh-baseline.mjs';
import { bindCalibrationSessions, sessionPanelMesh } from './calibration-sessions.mjs';
import { measure } from './analytics.mjs';
import { BOUND_FIELDS, SampledBoundsError, axisPosition, boundsText, frontEdgeText } from './mesh-coordinates.mjs';
import {
    MAX_PANELS, MAX_RAW_LENGTH, MAX_WORKSPACE_FILE_SIZE, DEFAULT_SETTINGS, DEFAULT_MEASUREMENT,
    meshSpatialOptions, normalizeSettings, normalizeMeasurement, validateMeasurement, normalizeSnapshot as normalizeWorkspaceSnapshot,
    validateWorkspaceFile as validateWorkspaceData,
} from './workspace-data.mjs';

const STORAGE_KEY = 'bedmesh.workspace.v2';
const LEGACY_KEY = /^mesh-(\d+)-input$/;
const workspace = document.querySelector('#visualizer');
const comparisonDemo = workspace?.hasAttribute('data-comparison-demo');
const container = document.querySelector('#mesh-panel-container');
const template = document.querySelector('#mesh-panel-template');
const sharedScale = document.querySelector('#shared-scale');
const saveStatus = document.querySelector('#save-status');
const workspaceMessage = document.querySelector('#workspace-message');
const comparison = document.querySelector('#mesh-comparison');
const comparisonBody = document.querySelector('#comparison-body');
const undoButton = document.querySelector('[data-global="undo"]');
const workspaceFile = document.querySelector('#workspace-file');
const workspaceFileMessage = document.querySelector('#workspace-file-message');
const difference = document.querySelector('#mesh-difference');
const logDialog = document.querySelector('#mesh-log-picker');
const logPicker = logDialog ? bindLogPicker(logDialog, openLogReports) : null;
const reportDialog = document.querySelector('#comparison-report');
const historyDialog = document.querySelector('#measurement-history');
const presetsDialog = document.querySelector('#printer-presets');
const sessionsDialog = document.querySelector('#calibration-sessions');
const inspector = document.querySelector('#point-inspector');
const sections = document.querySelector('#comparison-sections');
const pointX = document.querySelector('#inspect-x');
const pointY = document.querySelector('#inspect-y');
const delta = difference ? {
    before: difference.querySelector('#difference-before'),
    after: difference.querySelector('#difference-after'),
    reference: difference.querySelector('#difference-reference'),
    graph: difference.querySelector('#difference-graph'),
    placeholder: difference.querySelector('[data-delta-placeholder]'),
    message: difference.querySelector('#difference-message'),
    values: difference.querySelector('[data-delta-values]'),
    valuesDetail: difference.querySelector('[data-delta-values-detail]'),
    beforeId: null, afterId: null, result: null, plotted: false, busy: false,
    token: 0, lastKey: null, geometryKey: null, point: null, queue: Promise.resolve(),
} : null;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const states = [];
let nextId = 0;
let saveTimer;
let redrawPending;
let undoSnapshot = null;
let feedback = '';
let sharedReferenceNote = '';
let storage = null;
let workspaceDirty = false;
let lastStoredRaw = null;
let storageConflict = false;
let conflictNotice = null;
let clearLegacyAfterSave = false;
let workspaceImportToken = 0;
let activeCalibration = null;

if (!comparisonDemo) {
    try { storage = window.localStorage; }
    catch { /* The visualizer also works when browser storage is blocked. */ }
}

function makeExample() {
    const header = 'Bilinear Leveling Grid:\n      ' + Array.from({ length: 7 }, (_, index) => String(index).padStart(8)).join('');
    const rows = Array.from({ length: 7 }, (_, row) => {
        const y = (row - 3) / 3;
        const values = Array.from({ length: 7 }, (_, column) => {
            const x = (column - 3) / 3;
            const height = -0.055 + 0.05 * x + 0.025 * y - 0.09 * (1 - (x * x + y * y) / 2) + 0.007 * Math.sin(x * 2 + y);
            return (height >= 0 ? '+' : '') + height.toFixed(4);
        });
        return String(row).padStart(2) + '   ' + values.join('  ');
    });
    return header + '\n' + rows.join('\n');
}

const EXAMPLE_RAW = makeExample();
const thermalDemo = workspace?.dataset.comparisonDemo === 'thermal';

function demoMeasurements() {
    const raw = transform => Array.from({ length: 5 }, (_, y) => Array.from({ length: 5 }, (_, x) => {
        const base = (x - 2) * 20 + (y - 2) * 8 + (x - 2) ** 2 * 3 + (y - 2) ** 2 * 2;
        return ((base + transform(x, y)) / 1000).toFixed(3);
    }).join(' ')).join('\n');
    const variation = (x, y) => 6 + (x + y) % 3 * 2;
    const scans = thermalDemo
        ? [
            ['Before · cold', 22, 'Simulated reading before heating.', () => 0],
            ['After · heated', 60, 'Simulated reading after the bed stabilized.', (x, y) => 18 + 8 * (x - 2) ** 2 + 4 * (y - 2) ** 2],
        ]
        : [
            ['Before · scan 1', 60, 'Reference scan before adjustment.', () => 0],
            ['Baseline · scan 2', 60, 'Repeat scan with the setup unchanged.', variation],
            ['Baseline · scan 3', 60, 'Repeat scan with the setup unchanged.', (x, y) => -variation(x, y)],
            ['After · right side lowered', 60, 'Simulated adjustment near the right edge.', (x, y) => -Math.max(0, x - 1) * (19 + 2 * y)],
        ];
    return scans.map(([name, temperature, notes, change]) => ({
        name, raw: raw(change), view: 'heatmap',
        settings: { ...DEFAULT_SETTINGS, width: '180', depth: '180' },
        measurement: { ...DEFAULT_MEASUREMENT, bedTemperature: String(temperature),
            surface: 'Example build plate', setup: 'Simulated probing setup', notes },
    }));
}
const repeatSection = document.querySelector('#mesh-repeat-runs');
const repeatRuns = repeatSection ? bindRepeatRuns(repeatSection, {
    getRuns: () => states.filter(state => state.parsed),
    describe: differenceDescriptor,
    nameOf: meshName,
    contextOf: state => normalizeMeasurement(readMeasurement(state)),
    format: value => formatNumber(value, 4),
}) : null;
const history = historyDialog ? bindMeasurementHistory(historyDialog, { getStorage: () => storage, openRuns: openHistoryRuns, downloadFile }) : null;
const presets = presetsDialog ? bindPrinterPresets(presetsDialog, () => storage) : null;
const baselineSection = document.querySelector('#adjustment-baseline');
const baseline = baselineSection ? bindAdjustmentBaseline(baselineSection, {
    getComparison: currentComparison, getRuns: () => states, describe: differenceDescriptor, nameOf: meshName,
    contextOf: state => normalizeMeasurement(readMeasurement(state)), format: formatNumber,
}) : null;
const sessions = sessionsDialog ? bindCalibrationSessions(sessionsDialog, {
    getStorage: () => storage, openSession: openCalibrationSession, compareWithReference: openSessionReference,
    getOpenMeshes: () => states.filter(state => state.parsed).map(state => ({ id: state.id, name: meshName(state) })),
    onSaved: session => {
        rememberCalibration(session);
        showFeedback(`Saved “${session.name}” to Calibration sessions.`);
        if (realComparison()) measure('calibration_session_saved');
    },
}) : null;

function realMesh(state) {
    return Boolean(state?.parsed && state.parsedRaw.trim() !== EXAMPLE_RAW);
}

function realComparison() {
    const { result, before, after } = currentComparison();
    return Boolean(result && realMesh(before) && realMesh(after));
}

function countComparison() {
    if (realComparison()) measure('mesh_comparison_created', { once: true });
}

function meshName(state) {
    return state.name.value.trim() || `Mesh ${states.indexOf(state) + 1}`;
}

function formatNumber(value, digits = 3) {
    const rounded = Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value;
    return rounded.toFixed(digits);
}

function formatSigned(value, digits = 3) {
    const formatted = formatNumber(value, digits);
    return value > 0 && Number(formatted) !== 0 ? '+' + formatted : formatted;
}

function showFeedback(message = '') {
    feedback = message;
    updateWorkspaceMessage();
}

function showFileFeedback(message = '', error = false) {
    if (!workspaceFileMessage) { showFeedback(message); return; }
    workspaceFileMessage.textContent = message;
    workspaceFileMessage.classList.toggle('is-error', error);
}

function updateWorkspaceMessage() {
    workspaceMessage.textContent = [feedback, sharedReferenceNote].filter(Boolean).join(' ');
}

function setMessage(state, message = '', error = false, kind = 'status') {
    state.message.textContent = message;
    state.message.classList.toggle('is-error', error);
    state.messageKind = kind;
}

function animateOnce(element, className) {
    if (!element || reducedMotion.matches || element.classList.contains(className)) return;
    element.classList.add(className);
    const finish = () => {
        clearTimeout(timer);
        element.classList.remove(className);
        element.removeEventListener('animationend', onAnimationEnd);
    };
    const onAnimationEnd = event => {
        if (event.target === element) finish();
    };
    const timer = setTimeout(finish, 1000);
    element.addEventListener('animationend', onAnimationEnd);
}

function setPlaceholder(state, mode = 'empty') {
    state.placeholder.hidden = mode === 'ready';
    state.chartJump.hidden = mode !== 'ready';
    state.chartJump.textContent = state.view === 'heatmap' ? 'View heatmap ↓' : 'View 3D surface ↓';
    if (mode === 'ready') return;
    const text = state.placeholder.querySelector('p');
    const note = state.placeholder.querySelector('span');
    text.textContent = mode === 'loading' ? 'Preparing your mesh…' : mode === 'error' ? 'The chart is unavailable.' : 'Ready to visualize';
    note.textContent = mode === 'loading'
        ? 'Your measurements are being drawn in this browser.'
        : mode === 'error'
            ? 'Your statistics, measured values, and CSV export are still available.'
            : 'Paste a mesh and select Visualize, or try an example.';
}

function updateControls(state) {
    const busy = state.busy.size > 0;
    const editingPlot = state.busy.size === 1 && state.busy.has('render');
    state.element.setAttribute('aria-busy', String(busy));
    state.element.querySelectorAll('input, select, textarea, button').forEach(control => {
        control.disabled = busy && !(editingPlot && control.matches('[data-setting], [data-measurement]'));
    });
    state.element.querySelector('[data-action="csv"]').disabled = busy || !state.parsed;
    state.element.querySelector('[data-action="png"]').disabled = busy || !state.plotted;
    state.element.querySelector('[data-action="reset-view"]').disabled = busy || !state.plotted;
    const saveRun = state.element.querySelector('[data-action="save-run"]');
    if (saveRun) saveRun.disabled = busy || !state.parsed;
    const duplicate = state.element.querySelector('[data-action="duplicate"]');
    if (duplicate) duplicate.disabled = busy || states.length >= MAX_PANELS;
}

function setBusy(state, reason, busy) {
    if (busy) state.busy.add(reason);
    else state.busy.delete(reason);
    updateControls(state);
}

function readSettings(state) {
    return Object.fromEntries(Object.entries(state.settings).map(([key, field]) =>
        [key, field.type === 'checkbox' ? field.checked : field.value]));
}

function writeSettings(state, values) {
    for (const [key, value] of Object.entries(values)) {
        const field = state.settings[key];
        if (field.type === 'checkbox') field.checked = value;
        else field.value = value;
    }
}

function readSpatialOptions(state, settings) {
    if (BOUND_FIELDS.some(key => state.settings[key].validity.badInput)) {
        throw new SampledBoundsError('Enter valid numbers for the sampled XY bounds.');
    }
    if (state.settings.width.validity.badInput || state.settings.depth.validity.badInput) {
        throw new Error('Enter valid numbers for the probed width and depth.');
    }
    return meshSpatialOptions(settings, meshName(state));
}

function readMeasurement(state) {
    return Object.fromEntries(Object.keys(DEFAULT_MEASUREMENT).map(key => [key, state.measurement[key]?.value ?? '']));
}

function checkMeasurement(state) {
    let error = '';
    for (const key of Object.keys(DEFAULT_MEASUREMENT)) {
        const field = state.measurement[key];
        if (!field) continue;
        let invalid = false;
        try {
            if (field.validity.badInput) throw new Error(key === 'measuredAt'
                ? 'Use a valid recorded local date and time, or leave it empty.'
                : 'Use a recorded bed temperature between -50 and 300 °C, or leave it empty.');
            validateMeasurement({ [key]: field.value });
        } catch (problem) {
            invalid = true;
            if (!error) error = problem.message;
        }
        field.setAttribute('aria-invalid', String(invalid));
    }
    state.measurementError = error;
    if (state.measurementMessage && state.measurementMessage.textContent !== error) state.measurementMessage.textContent = error;
    return !error;
}

function updateMeasurementSummary(state) {
    if (!state.measurementSummary) return;
    const context = normalizeMeasurement(readMeasurement(state));
    state.measurementSummary.textContent = state.measurementError ? 'Check context'
        : [context.bedTemperature === '' ? '' : `${context.bedTemperature} °C`, context.surface || context.setup].filter(Boolean).join(' · ')
            || (context.measuredAt ? context.measuredAt.slice(0, 10) : context.notes ? 'Notes added' : 'Optional');
}

function applyMeasurement(state, value, preserveDraft = false) {
    const context = preserveDraft ? value : normalizeMeasurement(value);
    for (const key of Object.keys(DEFAULT_MEASUREMENT)) {
        if (state.measurement[key]) state.measurement[key].value = context?.[key] ?? '';
    }
    checkMeasurement(state);
    updateMeasurementSummary(state);
}

function checkSettings(state, report = true) {
    const settings = readSettings(state);
    let spatial;
    let error = '';
    let boundsInvalid = false;
    try { spatial = readSpatialOptions(state, settings); }
    catch (problem) {
        error = problem.message;
        boundsInvalid = problem instanceof SampledBoundsError;
    }
    for (const key of BOUND_FIELDS) state.settings[key].setAttribute('aria-invalid', String(boundsInvalid));
    for (const key of ['width', 'depth']) state.settings[key].setAttribute('aria-invalid', String(Boolean(error) && !boundsInvalid));
    const planeUnavailable = settings.reference === 'plane' && state.parsed && !state.analysis?.canFitPlane;
    if (!error && planeUnavailable) error = 'Removing fitted tilt needs at least two rows and two columns. Choose Measured height or Centre on mean for this mesh.';
    state.settings.reference.setAttribute('aria-invalid', String(Boolean(planeUnavailable)));
    const wasInvalid = Boolean(state.settingsError);
    state.settingsError = error;
    if (error && report) setMessage(state, error, true, 'settings');
    else if (!error && wasInvalid && state.messageKind === 'settings') setMessage(state);
    return { valid: !error, settings, options: { ...settings, ...spatial } };
}

function resetStatistics(state) {
    state.element.querySelectorAll('[data-stat]').forEach(value => { value.textContent = '—'; });
    state.meta.textContent = 'Ready for your data';
    state.insight.textContent = '';
    state.values.replaceChildren();
    state.valuesDetail.hidden = true;
    state.valuesDetail.open = false;
    state.element.querySelectorAll('[data-analysis]').forEach(value => { value.textContent = '—'; });
    const detail = state.element.querySelector('[data-analysis-detail]');
    if (detail) { detail.hidden = true; detail.open = false; }
}

function showStatistics(state) {
    for (const [key, value] of Object.entries(state.stats)) {
        const output = state.element.querySelector(`[data-stat="${key}"]`);
        if (output) output.textContent = formatNumber(value);
    }
    const { values, rows, columns, format } = state.parsed;
    state.meta.textContent = `${columns} × ${rows} points · ${format}`;
    let low = [0, 0];
    let high = [0, 0];
    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
            if (values[row][column] < values[low[0]][low[1]]) low = [row, column];
            if (values[row][column] > values[high[0]][high[1]]) high = [row, column];
        }
    }
    state.insight.textContent = state.stats.range === 0
        ? 'All measured points have the same height.'
        : `Original grid: lowest at X ${low[1]}, Y ${low[0]}; highest at X ${high[1]}, Y ${high[0]}.`;
    buildValuesTable(state);
    showAnalysis(state);
    if (state.lastStatisticsRevision !== state.dataRevision) {
        animateOnce(state.element.querySelector('.stats-strip'), 'is-updated');
        state.lastStatisticsRevision = state.dataRevision;
    }
}

function showAnalysis(state) {
    const detail = state.element.querySelector('[data-analysis-detail]');
    if (!detail) return;
    const { analysis } = state;
    const metrics = {
        median: analysis.median,
        meanAbsDeviation: analysis.meanAbsDeviation,
        xRise: analysis.canFitPlane ? analysis.plane.xRise : null,
        yRise: analysis.canFitPlane ? analysis.plane.yRise : null,
        residualRange: analysis.residualRange,
        residualRms: analysis.residualRms,
    };
    for (const [key, value] of Object.entries(metrics)) {
        const output = detail.querySelector(`[data-analysis="${key}"]`);
        if (output) output.textContent = Number.isFinite(value)
            ? (key === 'xRise' || key === 'yRise' ? formatSigned(value) : formatNumber(value)) : '—';
    }
    const note = detail.querySelector('[data-analysis-note]');
    if (note) note.textContent = analysis.canFitPlane
        ? 'X and Y rise follow the original input order. Residual values describe the measurements after removing the fitted overall tilt.'
        : 'Fitted tilt and residual metrics need at least two rows and two columns. Median and mean absolute deviation are available for this mesh.';
    detail.hidden = false;
}

function buildValuesTable(state) {
    const table = document.createElement('table');
    const caption = document.createElement('caption');
    caption.textContent = `${meshName(state)} — original measured heights (mm), in input row order`;
    table.append(caption);
    const head = table.createTHead().insertRow();
    const corner = document.createElement('th');
    corner.scope = 'col';
    corner.textContent = 'Y / X';
    head.append(corner);
    for (let column = 0; column < state.parsed.columns; column++) {
        const cell = document.createElement('th');
        cell.scope = 'col';
        cell.textContent = String(column);
        head.append(cell);
    }
    const body = table.createTBody();
    state.parsed.values.forEach((row, rowIndex) => {
        const tr = body.insertRow();
        const heading = document.createElement('th');
        heading.scope = 'row';
        heading.textContent = String(rowIndex);
        tr.append(heading);
        row.forEach(value => { tr.insertCell().textContent = String(value); });
    });
    state.values.replaceChildren(table);
    state.valuesDetail.hidden = false;
}

function updateComparison() {
    const valid = states.filter(state => state.parsed);
    comparison.hidden = valid.length < 2;
    const fragment = document.createDocumentFragment();
    for (const state of valid) {
        const row = document.createElement('tr');
        const name = document.createElement('th');
        name.scope = 'row';
        name.textContent = meshName(state);
        row.append(name);
        for (const text of [`${state.parsed.columns} × ${state.parsed.rows}`, formatNumber(state.stats.range), formatNumber(state.stats.mean), formatNumber(state.stats.std),
            Number.isFinite(state.analysis.residualRange) ? formatNumber(state.analysis.residualRange) : '—']) {
            const cell = document.createElement('td');
            cell.textContent = text;
            row.append(cell);
        }
        fragment.append(row);
    }
    comparisonBody.replaceChildren(fragment);
    updateDifference();
}

function deltaMessage(message = '', error = false) {
    delta.message.textContent = message;
    delta.message.classList.toggle('is-error', error);
}

function updateDeltaControls() {
    difference.setAttribute('aria-busy', String(delta.busy));
    difference.querySelector('[data-difference="csv"]').disabled = !delta.result;
    difference.querySelector('[data-difference="report"]').disabled = !delta.result;
    difference.querySelector('[data-difference="png"]').disabled = delta.busy || !delta.plotted;
    difference.querySelector('[data-difference="reset"]').disabled = delta.busy || !delta.plotted;
    difference.querySelector('[data-difference="refresh"]').disabled = delta.busy || !delta.result;
    difference.querySelector('[data-difference="swap"]').disabled = states.length < 2;
}

function clearDifference(message, error = false) {
    const hadData = delta.result || delta.plotted || delta.busy;
    if (hadData) delta.token++;
    delta.result = null;
    delta.plotted = false;
    delta.busy = false;
    delta.lastKey = null;
    delta.geometryKey = null;
    if (delta.point) requestRedraw();
    delta.point = null;
    baseline?.update();
    updatePointReadout();
    delta.placeholder.hidden = false;
    delta.placeholder.textContent = 'Choose two compatible visualized meshes to see their difference.';
    difference.querySelectorAll('[data-delta-stat]').forEach(output => { output.textContent = '—'; });
    delta.values.replaceChildren();
    delta.valuesDetail.hidden = true;
    delta.valuesDetail.open = false;
    deltaMessage(message, error);
    updateDeltaControls();
    if (hadData) delta.queue = delta.queue.catch(() => {}).then(() => { purgePlot(delta.graph); });
}

function differenceDescriptor(state) {
    const settings = readSettings(state);
    return {
        values: state.parsed.values,
        flipX: settings.flipX,
        flipY: settings.flipY,
        ...readSpatialOptions(state, settings),
    };
}

function deltaDescription(result) {
    const { width, depth, bounds } = result.dimensions;
    const area = bounds ? boundsText(bounds) : width === null ? 'Sample-index coordinates' : `${width} × ${depth} mm sampled area`;
    const orientation = result.orientationDiffers
        ? ' Different Flip X/Y settings: confirm the points align.' : '';
    const edge = frontEdgeText(result.frontEdge, bounds);
    const front = result.frontEdgesDiffer ? ' Front-edge labels differ. Check which edges the scans represent.' : edge ? ` ${edge}.` : '';
    const reference = result.reference === 'mean' ? 'each mean removed'
        : result.reference === 'plane' ? 'each fitted tilt removed' : 'measured heights';
    return `${area} · ${reference}.${orientation}${front}`;
}

function buildDeltaTable(before, after) {
    const table = document.createElement('table');
    const caption = table.createCaption();
    caption.textContent = `${meshName(after)} minus ${meshName(before)} — ${delta.reference.selectedOptions[0].textContent}, mm, displayed sample-index order. Values rounded to six decimal places with trailing zeros omitted; CSV retains full computed precision.`;
    const head = table.createTHead().insertRow();
    const corner = document.createElement('th');
    corner.scope = 'col';
    corner.textContent = 'Y / X';
    head.append(corner);
    for (let column = 0; column < delta.result.columns; column++) {
        const cell = document.createElement('th');
        cell.scope = 'col';
        cell.textContent = String(column);
        head.append(cell);
    }
    const body = table.createTBody();
    delta.result.values.forEach((values, index) => {
        const row = body.insertRow();
        const label = document.createElement('th');
        label.scope = 'row';
        label.textContent = String(index);
        row.append(label);
        values.forEach(value => { row.insertCell().textContent = String(Number(value.toFixed(6))); });
    });
    delta.values.replaceChildren(table);
    delta.valuesDetail.hidden = false;
}

function updatePointReadout() {
    const { result, point } = delta;
    inspector.hidden = !result;
    inspector.querySelector('[data-clear-point]').disabled = !point;
    const readout = inspector.querySelector('[data-point-readout]');
    readout.textContent = '';
    showComparisonSections(sections, result, point, formatNumber, formatSigned);
    if (!result) return;
    pointX.max = String(result.columns - 1);
    pointY.max = String(result.rows - 1);
    if (!point) return;
    const { x, y } = point;
    pointX.value = String(x);
    pointY.value = String(y);
    const before = formatNumber(result.beforeValues[y][x], 6);
    const after = formatNumber(result.afterValues[y][x], 6);
    const change = formatSigned(result.values[y][x], 6);
    const reference = delta.reference.selectedOptions[0].textContent;
    const { width, depth, bounds } = result.dimensions;
    const physical = bounds
        ? ` · X ${formatNumber(axisPosition(x, result.columns, width, bounds.minX, bounds.maxX), 3)}, Y ${formatNumber(axisPosition(y, result.rows, depth, bounds.minY, bounds.maxY), 3)} mm`
        : '';
    readout.textContent = `X ${x}, Y ${y}${physical} · Before ${before} mm · After ${after} mm · Change ${change} mm · ${reference}`;
}

function selectPoint(point) {
    if (!delta.result || (point && point.x === delta.point?.x && point.y === delta.point?.y)) return;
    delta.point = point;
    updatePointReadout();
    baseline?.updatePoint();
    if (delta.plotted || delta.busy) drawDifference({ keepChart: true });
    requestRedraw();
}

function onDifferenceClick(event) {
    const point = delta.plotted && delta.result && heatmapCell(event?.points?.[0], delta.result);
    if (point) selectPoint(point);
}

function drawDifference({ keepChart = false } = {}) {
    const { result, point, lastKey } = delta;
    if (!keepChart || !delta.plotted) {
        delta.plotted = false;
        delta.placeholder.hidden = false;
        delta.placeholder.textContent = 'Drawing the difference heatmap…';
    }
    delta.busy = true;
    const token = ++delta.token;
    updateDeltaControls();
    delta.queue = delta.queue.catch(() => {}).then(async () => {
        if (token !== delta.token) return;
        try {
            await renderMeshPlot(delta.graph, result.values, {
                view: 'heatmap', reference: 'original', difference: true, point,
                ...result.dimensions, frontEdge: result.frontEdge,
                range: result.range, uirevision: `difference-${lastKey}`,
            });
            if (token !== delta.token) return;
            delta.graph.removeListener?.('plotly_click', onDifferenceClick);
            delta.graph.on?.('plotly_click', onDifferenceClick);
            delta.plotted = true;
            delta.placeholder.hidden = true;
        } catch (error) {
            if (token !== delta.token) return;
            purgePlot(delta.graph);
            delta.plotted = false;
            delta.placeholder.hidden = false;
            delta.placeholder.textContent = 'The heatmap is unavailable. Difference statistics, values, and CSV are still available.';
            deltaMessage(`${error.message || 'The heatmap could not be drawn.'} Use Refresh heatmap to retry.`, true);
        } finally {
            if (token === delta.token) { delta.busy = false; updateDeltaControls(); }
        }
    });
}

function currentComparison() {
    return {
        result: delta?.result, point: delta?.point,
        before: states.find(state => state.id === delta?.beforeId),
        after: states.find(state => state.id === delta?.afterId),
    };
}

function updateDifference() {
    repeatRuns?.update();
    if (!delta) return;
    const valid = states.filter(state => state.parsed);
    if (!states.some(state => state.id === delta.beforeId)) delta.beforeId = valid[0]?.id ?? states[0]?.id;
    if (!states.some(state => state.id === delta.afterId)) delta.afterId = valid.find(state => state.id !== delta.beforeId)?.id ?? states.find(state => state.id !== delta.beforeId)?.id;
    for (const [select, selected] of [[delta.before, delta.beforeId], [delta.after, delta.afterId]]) {
        const options = states.map(state => {
            const option = document.createElement('option');
            option.value = state.id;
            option.textContent = meshName(state) + (state.parsed ? '' : ' (needs Visualize)');
            option.disabled = !state.parsed;
            return option;
        });
        select.replaceChildren(...options);
        select.value = selected ?? '';
    }
    updateMeasurementComparison();
    if (valid.length < 2) { clearDifference('Visualize at least two meshes to compare their measurements.'); return; }
    const before = states.find(state => state.id === delta.beforeId);
    const after = states.find(state => state.id === delta.afterId);
    try {
        if (!before?.parsed || !after?.parsed) throw new Error('Visualize both selected meshes again after editing their input.');
        if (before === after) throw new Error('Choose two different meshes for the before and after measurements.');
        const first = differenceDescriptor(before);
        const second = differenceDescriptor(after);
        const reference = delta.reference.value;
        const signature = descriptor => [descriptor.flipX, descriptor.flipY, descriptor.width, descriptor.depth, descriptor.bounds];
        const geometryKey = JSON.stringify([before.id, before.dataRevision, signature(first), after.id, after.dataRevision, signature(second)]);
        const key = JSON.stringify([geometryKey, reference, first.frontEdge, second.frontEdge]);
        delta.graph.setAttribute('aria-label', `${meshName(after)} minus ${meshName(before)}: signed height difference heatmap, ${delta.reference.selectedOptions[0].textContent.toLowerCase()}, millimetres`);
        if (delta.lastKey === key && delta.result) {
            const caption = delta.values.querySelector('caption');
            if (caption) caption.textContent = `${meshName(after)} minus ${meshName(before)} — ${delta.reference.selectedOptions[0].textContent}, mm, displayed sample-index order. Values rounded to six decimal places with trailing zeros omitted; CSV retains full computed precision.`;
            baseline?.update();
            return;
        }
        const result = compareMeshes(first, second, { reference });
        if (delta.geometryKey !== geometryKey) {
            if (delta.point) requestRedraw();
            delta.point = null;
            pointX.value = '0';
            pointY.value = '0';
            delta.geometryKey = geometryKey;
        }
        delta.result = result;
        delta.lastKey = key;
        for (const [metric, value] of Object.entries({ meanHeightChange: result.meanHeightChange, measuredRangeChange: result.measuredRangeChange, range: result.stats.range, rms: result.stats.rms })) {
            difference.querySelector(`[data-delta-stat="${metric}"]`).textContent = metric.endsWith('Change') ? formatSigned(value) : formatNumber(value);
        }
        buildDeltaTable(before, after);
        updatePointReadout();
        baseline?.update();
        deltaMessage(deltaDescription(result));
        drawDifference();
    } catch (error) { clearDifference(error.message || 'These meshes could not be compared.', true); }
}

function updateMeasurementComparison() {
    if (!delta) return;
    const before = states.find(state => state.id === delta.beforeId);
    const after = states.find(state => state.id === delta.afterId);
    if (!delta.context) {
        const section = document.createElement('section');
        section.className = 'measurement-comparison';
        section.setAttribute('aria-label', 'Recorded measurement conditions');
        const heading = document.createElement('h4');
        heading.textContent = 'Recorded conditions';
        const cards = document.createElement('div');
        cards.className = 'measurement-cards';
        const note = document.createElement('p');
        note.className = 'measurement-condition-note';
        note.setAttribute('role', 'status');
        note.setAttribute('aria-live', 'polite');
        section.append(heading, cards, note);
        difference.querySelector('.difference-controls').insertAdjacentElement('afterend', section);
        delta.context = section;
    }
    delta.context.hidden = !before || !after;
    if (!before || !after) return;
    const contexts = [normalizeMeasurement(readMeasurement(before)), normalizeMeasurement(readMeasurement(after))];
    const cards = [];
    for (const [index, state] of [before, after].entries()) {
        const context = contexts[index];
        const card = document.createElement('div');
        const name = document.createElement('p');
        name.className = 'measurement-card-name';
        name.textContent = `${index ? 'After' : 'Before'} · ${meshName(state)}`;
        const list = document.createElement('dl');
        const entries = [
            ['Recorded', context.measuredAt ? context.measuredAt.replace('T', ' ') + ' (local)' : 'Not recorded'],
            ['Bed', context.bedTemperature === '' ? 'Not recorded' : `${context.bedTemperature} °C`],
            ['Surface', context.surface.trim() || 'Not recorded'],
            ['Setup', context.setup.trim() || 'Not recorded'],
        ];
        for (const [label, text] of entries) {
            const term = document.createElement('dt');
            term.textContent = label;
            const description = document.createElement('dd');
            description.textContent = text;
            list.append(term, description);
        }
        card.append(name, list);
        cards.push(card);
    }
    const hasContext = contexts.some(context => Object.values(context).some(value => value.trim()));
    const container = delta.context.querySelector('.measurement-cards');
    container.replaceChildren(...cards);
    container.hidden = !hasContext;
    const messages = [];
    const missingBoth = [];
    for (const [key, label] of [['bedTemperature', 'Bed temperature'], ['surface', 'Build surface'], ['setup', 'Printer/setup']]) {
        const values = contexts.map(context => context[key].trim());
        const missing = values.map((value, index) => value === '' ? (index ? 'After' : 'Before') : '').filter(Boolean);
        if (missing.length === 2) missingBoth.push(label.toLowerCase());
        else if (missing.length) messages.push(`${label} is not recorded for ${missing[0]}.`);
        else if (values[0].replace(/\s+/g, ' ').toLowerCase() !== values[1].replace(/\s+/g, ' ').toLowerCase()) {
            messages.push(`Declared ${label.toLowerCase()} differs between the meshes.`);
        }
    }
    if (missingBoth.length) messages.unshift(`Not recorded for either mesh: ${missingBoth.join(', ')}.`);
    const note = delta.context.querySelector('.measurement-condition-note');
    const message = messages.length ? messages.join(' ') + ' Add or check the optional context beside each input; comparison math remains available.'
        : 'Temperature, surface and setup are recorded for both meshes. These declarations do not verify identical probing conditions.';
    if (note.textContent !== message) note.textContent = message;
    note.classList.toggle('has-differences', messages.length > 0);
}

function deltaFilename() {
    const before = states.find(state => state.id === delta.beforeId);
    const after = states.find(state => state.id === delta.afterId);
    return `${safeFilename(after)}-minus-${safeFilename(before)}-${delta.result.reference}-delta`.slice(0, 170);
}

function handleDifferenceAction(action) {
    if (action === 'swap') {
        [delta.beforeId, delta.afterId] = [delta.afterId, delta.beforeId];
        updateDifference();
        countComparison();
    } else if (action === 'refresh') {
        delta.lastKey = null;
        updateDifference();
    } else if (action === 'csv' && delta.result) {
        downloadFile(new Blob([exportMeshCsv(delta.result.values)], { type: 'text/csv;charset=utf-8' }), deltaFilename() + '.csv');
    } else if (action === 'report' && delta.result) {
        const before = states.find(state => state.id === delta.beforeId);
        const after = states.find(state => state.id === delta.afterId);
        const reportRun = state => ({
            name: meshName(state), stats: state.stats, ...readSettings(state),
            measurement: normalizeMeasurement(readMeasurement(state)),
        });
        try {
            openComparisonReport(reportDialog, {
                before: reportRun(before), after: reportRun(after), result: delta.result,
                format: formatNumber, signed: formatSigned, demo: comparisonDemo,
                conditions: delta.context.querySelector('.measurement-condition-note').textContent,
                point: delta.point, baseline: baseline?.current(), session: matchingCalibration(),
            });
            countComparison();
            reportDialog.toggleAttribute('data-measure-download', realComparison());
        } catch (error) {
            deltaMessage(error.message || 'The comparison report could not be opened.', true);
        }
    } else if (action === 'save-session' && sessions) {
        try {
            const snapshot = captureCalibration();
            sessions.showSave(snapshot, snapshot.workspace.panels[0].measurement);
        } catch (error) { deltaMessage(error.message, true); }
    } else if ((action === 'png' || action === 'reset') && delta.plotted && !delta.busy) {
        const token = delta.token;
        const filename = deltaFilename();
        delta.busy = true;
        updateDeltaControls();
        delta.queue = delta.queue.catch(() => {}).then(async () => {
            if (token !== delta.token) return;
            try {
                if (action === 'png') await downloadPlot(delta.graph, filename);
                else await resetPlotView(delta.graph, 'heatmap');
            } catch (error) {
                if (token === delta.token) deltaMessage(error.message || 'The chart action could not be completed.', true);
            } finally {
                if (token === delta.token) { delta.busy = false; updateDeltaControls(); }
            }
        });
    }
}

// Each chart has one queue. A clear/remove always purges after an in-flight
// Plotly call, and a later render can never race an earlier one on the same DOM.
function queuePurge(state) {
    state.queue = state.queue.catch(() => {}).then(() => { purgePlot(state.graph); });
}

function cancelOperations(state) {
    clearTimeout(state.settingsTimer);
    state.renderToken++;
    state.fileToken++;
    state.actionToken++;
    state.busy.clear();
    state.lastRenderKey = null;
    updateControls(state);
}

function invalidatePanel(state, message = '') {
    const hadData = Boolean(state.parsed || state.plotted || state.busy.size);
    cancelOperations(state);
    state.parsed = null;
    state.stats = null;
    state.analysis = null;
    state.parsedRaw = null;
    state.plotted = false;
    state.raw.removeAttribute('aria-invalid');
    state.scanInput.hidden = true;
    state.graph.setAttribute('aria-label', 'Bed mesh chart');
    resetStatistics(state);
    setPlaceholder(state);
    setMessage(state, message);
    updateControls(state);
    if (hadData) queuePurge(state);
}

function paddedRange(min, max) {
    const midpoint = min / 2 + max / 2;
    const span = Math.max(max - min, 0.02);
    const result = [midpoint - span * 0.6, midpoint + span * 0.6];
    if (!result.every(Number.isFinite) || result[0] >= result[1]) throw new Error('These mesh heights are too large to display on a shared scale.');
    return result;
}

function updateChartNote(state, shared = false, coordinates) {
    const reference = state.settings.reference.value === 'plane' ? 'Fitted tilt removed'
        : state.settings.reference.value === 'mean' ? 'Centred on mean' : 'Measured height';
    const interaction = state.view === 'surface' ? 'Drag to rotate · toolbar to zoom' : 'Hover a point for its height';
    const front = frontEdgeText(coordinates.frontEdge, coordinates.bounds);
    state.chartNote.textContent = [shared && 'Shared height scale', front, interaction].filter(Boolean).join(' · ');
    state.graph.setAttribute('aria-label', `${meshName(state)}: ${state.view === 'surface' ? '3D surface' : 'heatmap'}, ${reference.toLowerCase()} in millimetres${shared ? ', shared height scale' : ''}${front ? ', ' + front : ''}`);
}

function renderPanel(state, checked, range, isShared) {
    const point = state.id === delta?.beforeId || state.id === delta?.afterId ? delta.point : null;
    const baseKey = JSON.stringify([state.dataRevision, state.view, checked.settings, range]);
    const key = JSON.stringify([baseKey, point]);
    updateChartNote(state, isShared, checked.options);
    if (state.lastRenderKey === key && (state.plotted || state.busy.has('render'))) return state.queue;
    const markerOnly = state.plotted && state.lastBaseRenderKey === baseKey;
    state.lastBaseRenderKey = baseKey;
    state.lastRenderKey = key;
    const token = ++state.renderToken;
    const values = state.parsed.values;
    const geometry = JSON.stringify([checked.options.width, checked.options.depth, checked.options.bounds]);
    const options = { ...checked.options, view: state.view, range, point, uirevision: `mesh-${state.id}-${state.dataRevision}-${state.view}-${geometry}` };
    state.plotted = false;
    setBusy(state, 'render', true);
    if (!markerOnly) {
        setPlaceholder(state, 'loading');
        if (state.messageKind !== 'settings') setMessage(state, 'Drawing your mesh…');
    }
    state.queue = state.queue.catch(() => {}).then(async () => {
        if (state.removed || token !== state.renderToken) return;
        try {
            await renderMeshPlot(state.graph, values, options);
            if (state.removed || token !== state.renderToken) return;
            state.plotted = true;
            setPlaceholder(state, 'ready');
            if (state.lastAnimatedRevision !== state.dataRevision) {
                animateOnce(state.graph.closest('.plot-wrap'), 'plot-updated');
                state.lastAnimatedRevision = state.dataRevision;
            }
            const label = state.parsedRaw === EXAMPLE_RAW ? 'Simulated example' : state.parsed.format + ' mesh';
            const view = state.view === 'surface' ? '3D surface' : 'heatmap';
            setMessage(state, `${label} plotted as a ${state.parsed.columns} × ${state.parsed.rows} ${view}.`);
        } catch (error) {
            if (state.removed || token !== state.renderToken) return;
            state.plotted = false;
            state.lastRenderKey = null;
            purgePlot(state.graph);
            setPlaceholder(state, 'error');
            setMessage(state, `${error.message || 'The chart could not be drawn. Try Visualize again.'} Your statistics and CSV are still available.`, true, 'chart');
        } finally {
            if (!state.removed && token === state.renderToken) setBusy(state, 'render', false);
        }
    });
    return state.queue;
}

function redrawWorkspace() {
    const eligible = [];
    for (const state of states) {
        if (!state.parsed) continue;
        const checked = checkSettings(state);
        if (checked.valid) eligible.push({ state, checked });
        else {
            setPlaceholder(state, 'error');
            if (state.plotted || state.busy.has('render')) {
                state.renderToken++;
                state.lastRenderKey = null;
                state.plotted = false;
                setBusy(state, 'render', false);
                queuePurge(state);
            }
        }
    }
    const isShared = sharedScale.checked && eligible.length >= 2;
    let sharedRange = null;
    sharedReferenceNote = '';
    if (isShared) {
        try {
            let min = Infinity;
            let max = -Infinity;
            let hasFixedScale = false;
            for (const { state, checked } of eligible) {
                const source = checked.settings.reference === 'plane' ? removeFittedTilt(state.parsed.values) : state.parsed.values;
                const transformed = transformMesh(source, { center: checked.settings.reference === 'mean' });
                const stats = calculateStats(transformed);
                min = Math.min(min, stats.min);
                max = Math.max(max, stats.max);
                if (checked.settings.scale === 'fixed') {
                    hasFixedScale = true;
                    min = Math.min(min, -1);
                    max = Math.max(max, 1);
                }
            }
            sharedRange = hasFixedScale ? [min, max] : paddedRange(min, max);
            if (new Set(eligible.map(item => item.checked.settings.reference)).size > 1) {
                sharedReferenceNote = 'These charts share a scale but use different height references. Match the references to compare absolute heights.';
            }
        } catch (error) {
            sharedReferenceNote = error.message;
        }
    }
    updateComparison();
    updateWorkspaceMessage();
    return Promise.allSettled(eligible.map(({ state, checked }) => renderPanel(state, checked,
        sharedRange ?? (checked.settings.scale === 'fixed' ? [-1, 1] : null), Boolean(sharedRange))));
}

function requestRedraw() {
    if (!redrawPending) {
        redrawPending = Promise.resolve().then(() => {
            redrawPending = null;
            return redrawWorkspace();
        });
    }
    return redrawPending;
}

function visualizePanel(state, { persist = false, userInitiated = false } = {}) {
    try {
        if (state.raw.value.length > MAX_RAW_LENGTH) throw new Error('This input is too large. Use one mesh of at most 200,000 characters.');
        const parsed = parseMesh(state.raw.value);
        const stats = calculateStats(parsed.values);
        const analysis = analyzeMesh(parsed.values);
        const changed = state.parsedRaw !== state.raw.value;
        cancelOperations(state);
        state.parsed = parsed;
        state.stats = stats;
        state.analysis = analysis;
        state.parsedRaw = state.raw.value;
        if (changed) state.dataRevision++;
        state.raw.removeAttribute('aria-invalid');
        state.scanInput.hidden = true;
        state.plotted = false;
        showStatistics(state);
        updateControls(state);
        if (!checkSettings(state).valid) {
            setPlaceholder(state, 'error');
            queuePurge(state);
        }
    } catch (error) {
        invalidatePanel(state);
        state.raw.setAttribute('aria-invalid', 'true');
        setMessage(state, error.message || 'This mesh could not be read. Check that every row contains the same number of values.', true, 'input');
        if (userInitiated && state.raw.value.trim()) {
            try { state.scanInput.hidden = !findMeshReports(state.raw.value, MAX_RAW_LENGTH).reports.length; }
            catch { /* Keep the original parsing message for unrecoverable input. */ }
        }
    }
    const parsed = state.parsed;
    const drawn = requestRedraw();
    if (userInitiated && realMesh(state)) {
        drawn.then(() => {
            if (state.removed || state.parsed !== parsed || !state.plotted) return;
            measure('mesh_visualized', { once: true });
            countComparison();
        }).catch(() => {});
    }
    if (persist) scheduleSave();
}

function discardUndo() {
    if (undoSnapshot) {
        showFeedback();
        showFileFeedback();
    }
    undoSnapshot = null;
    undoButton.hidden = true;
    undoButton.textContent = 'Undo clear';
}

function snapshotWorkspace() {
    return {
        version: 2,
        panels: states.map(snapshotPanel),
        sharedScale: sharedScale.checked,
    };
}

function snapshotPanel(state) {
    return { id: state.id, name: state.name.value, raw: state.raw.value, settings: readSettings(state), measurement: readMeasurement(state), view: state.view };
}

function saveWorkspace() {
    if (comparisonDemo) return false;
    clearTimeout(saveTimer);
    if (!workspaceDirty) return false;
    if (storageConflict) {
        saveStatus.textContent = 'Saving paused: another tab changed the saved workspace';
        return false;
    }
    if (!storage) {
        saveStatus.textContent = 'Local saving is unavailable in this browser';
        return false;
    }
    try {
        const snapshot = snapshotWorkspace();
        if (snapshot.panels.some(panel => panel.raw.length > MAX_RAW_LENGTH)) {
            saveStatus.textContent = 'An input exceeds 200,000 characters. Shorten it before saving.';
            return false;
        }
        const current = storage.getItem(STORAGE_KEY);
        if (current !== lastStoredRaw) {
            showStorageConflict(current);
            return false;
        }
        let revision = 0;
        try {
            const previous = JSON.parse(current);
            if (Number.isSafeInteger(previous?.revision) && previous.revision >= 0 && previous.revision < Number.MAX_SAFE_INTEGER) revision = previous.revision;
        } catch { /* Older or invalid snapshots can be replaced after acknowledgement. */ }
        snapshot.revision = revision + 1;
        const serialized = JSON.stringify(snapshot);
        storage.setItem(STORAGE_KEY, serialized);
        lastStoredRaw = serialized;
        workspaceDirty = false;
        if (clearLegacyAfterSave) {
            removeLegacySavedMeshes();
            clearLegacyAfterSave = false;
        }
        saveStatus.textContent = 'Saved in this browser';
        return true;
    } catch (error) {
        saveStatus.textContent = error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED'
            ? 'Browser storage is full. Export your meshes to keep a copy.'
            : 'Local saving is unavailable. Export your meshes to keep a copy.';
        return false;
    }
}

function scheduleSave() {
    if (comparisonDemo) return;
    workspaceDirty = true;
    clearTimeout(saveTimer);
    if (!storage) { saveStatus.textContent = 'Local saving is unavailable in this browser'; return; }
    if (storageConflict) { saveStatus.textContent = 'Saving paused: another tab changed the saved workspace'; return; }
    saveTimer = setTimeout(saveWorkspace, 300);
}

function clearStorageConflict() {
    storageConflict = false;
    conflictNotice?.remove();
    conflictNotice = null;
}

function showStorageConflict(current) {
    clearTimeout(saveTimer);
    storageConflict = true;
    saveStatus.textContent = 'Saving paused: another tab changed the saved workspace';
    if (!conflictNotice) {
        conflictNotice = document.createElement('div');
        conflictNotice.className = 'storage-conflict';
        conflictNotice.setAttribute('role', 'status');
        const text = document.createElement('p');
        const actions = document.createElement('div');
        const load = document.createElement('button');
        load.type = 'button';
        load.className = 'button button-secondary';
        load.textContent = 'Load saved version';
        load.addEventListener('click', loadRemoteWorkspace);
        const keep = document.createElement('button');
        keep.type = 'button';
        keep.className = 'button';
        keep.textContent = 'Keep this tab';
        keep.addEventListener('click', keepLocalWorkspace);
        actions.append(load, keep);
        conflictNotice.append(text, actions);
        workspaceMessage.insertAdjacentElement('afterend', conflictNotice);
    }
    conflictNotice.querySelector('p').textContent = current === null
        ? 'The saved workspace was cleared in another tab. Saving here is paused. Load the saved version to clear this view, or keep this tab to save the meshes shown here.'
        : 'Another tab saved a different workspace. Saving here is paused. Load the saved version to replace the meshes shown here, or keep this tab to save them.';
    conflictNotice.querySelector('button').disabled = false;
}

function loadRemoteWorkspace() {
    if (!storage) return;
    try {
        const current = storage.getItem(STORAGE_KEY);
        let snapshot;
        if (current === null) {
            snapshot = { version: 2, panels: [{ id: String(nextId++), name: 'Mesh 1', raw: '', settings: DEFAULT_SETTINGS, view: 'surface' }], sharedScale: true };
        } else {
            try { snapshot = normalizeSnapshot(JSON.parse(current)); }
            catch { snapshot = null; }
            if (!snapshot) {
                conflictNotice.querySelector('p').textContent = 'The saved workspace could not be read. Your meshes in this tab are safe. Choose Keep this tab to replace the saved version with them.';
                conflictNotice.querySelector('button').disabled = true;
                return;
            }
        }
        clearTimeout(saveTimer);
        lastStoredRaw = current;
        workspaceDirty = false;
        clearLegacyAfterSave = false;
        discardUndo();
        clearStorageConflict();
        replacePanels(snapshot);
        visualizeAll({ persist: false });
        requestRedraw();
        saveStatus.textContent = current === null ? 'Saved workspace cleared in another tab' : 'Loaded the workspace saved in this browser';
        showFeedback(current === null ? 'The saved workspace was cleared. This tab now shows an empty mesh.' : 'Loaded the workspace saved by another tab.');
    } catch {
        saveStatus.textContent = 'The saved workspace could not be loaded. Your meshes in this tab are unchanged.';
    }
}

function keepLocalWorkspace() {
    if (!storage) return;
    try {
        // This explicit choice acknowledges the latest saved version. The write
        // still checks the baseline again in case another tab changes it next.
        lastStoredRaw = storage.getItem(STORAGE_KEY);
        clearStorageConflict();
        workspaceDirty = true;
        if (saveWorkspace()) showFeedback('Saved the meshes from this tab.');
    } catch {
        saveStatus.textContent = 'Local saving is unavailable. Export your meshes to keep a copy.';
    }
}

function rememberSnapshotIds(snapshot) {
    if (snapshot) {
        for (const panel of snapshot.panels) nextId = Math.max(nextId, Number(panel.id) + 1);
    }
    return snapshot;
}

function normalizeSnapshot(value) {
    return rememberSnapshotIds(normalizeWorkspaceSnapshot(value, nextId));
}

function validateWorkspaceFile(value) {
    return rememberSnapshotIds(validateWorkspaceData(value, nextId));
}

function legacyKeys() {
    if (!storage) return [];
    return Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(key => LEGACY_KEY.test(key || ''));
}

function loadSavedWorkspace() {
    if (!storage) return { snapshot: null, found: false, migrated: [] };
    try {
        const saved = storage.getItem(STORAGE_KEY);
        lastStoredRaw = saved;
        if (saved !== null) {
            let snapshot = null;
            try { snapshot = normalizeSnapshot(JSON.parse(saved)); }
            catch { /* Corrupt saved text is never evaluated or inserted as HTML. */ }
            if (!snapshot) showFeedback('The saved workspace could not be restored. Paste a mesh or load an example to start again.');
            return { snapshot, found: true, migrated: [] };
        }
        const keys = legacyKeys().sort((a, b) => Number(a.match(LEGACY_KEY)[1]) - Number(b.match(LEGACY_KEY)[1]));
        const selected = keys.map(key => ({ key, raw: storage.getItem(key) }))
            .filter(entry => typeof entry.raw === 'string' && entry.raw.length <= MAX_RAW_LENGTH)
            .slice(0, MAX_PANELS);
        const panels = selected.map((entry, index) => ({ id: index, name: `Mesh ${index + 1}`, raw: entry.raw, settings: DEFAULT_SETTINGS, view: 'surface' }));
        const snapshot = panels.length ? normalizeSnapshot({ version: 2, panels, sharedScale: true }) : null;
        return { snapshot, found: keys.length > 0, migrated: snapshot ? selected.map(entry => entry.key) : [] };
    } catch {
        storage = null;
        saveStatus.textContent = 'Local saving is unavailable in this browser';
        return { snapshot: null, found: false, migrated: [] };
    }
}

function removeLegacySavedMeshes() {
    if (!storage) return;
    try {
        const keys = legacyKeys();
        for (const key of keys) storage.removeItem(key);
    } catch { saveStatus.textContent = 'The browser could not remove its saved data.'; }
}

function updatePanelLabels() {
    states.forEach((state, index) => {
        state.element.querySelector('.panel-number').textContent = `Mesh data #${index + 1}`;
        state.name.setAttribute('aria-label', `Name for mesh ${index + 1}`);
        const remove = state.element.querySelector('[data-action="remove"]');
        remove.hidden = states.length === 1;
        remove.setAttribute('aria-label', `Remove ${meshName(state)}`);
        const duplicate = state.element.querySelector('[data-action="duplicate"]');
        if (duplicate) {
            duplicate.disabled = state.busy.size > 0 || states.length >= MAX_PANELS;
            duplicate.setAttribute('aria-label', `Duplicate ${meshName(state)}`);
        }
    });
    document.querySelector('[data-global="add"]').disabled = states.length >= MAX_PANELS;
    document.querySelector('[data-global="visualize"]').hidden = states.length < 2;
}

function setPanelView(state, view) {
    state.view = view;
    for (const button of state.element.querySelectorAll('[data-view]')) {
        button.setAttribute('aria-pressed', String(button.dataset.view === view));
    }
}

function applyPanelData(state, data) {
    state.name.value = data.name ?? state.name.value;
    state.raw.value = data.raw ?? '';
    writeSettings(state, normalizeSettings(data.settings));
    setPanelView(state, data.view === 'heatmap' ? 'heatmap' : 'surface');
    applyMeasurement(state, data.measurement);
}

function registerPanel(element, data = null) {
    const state = {
        id: element.dataset.id,
        element,
        name: element.querySelector('[data-field="name"]'),
        raw: element.querySelector('[data-field="raw"]'),
        settings: Object.fromEntries(Array.from(element.querySelectorAll('[data-setting]'), field => [field.dataset.setting, field])),
        measurement: Object.fromEntries(Array.from(element.querySelectorAll('[data-measurement]'), field => [field.dataset.measurement, field])),
        measurementMessage: element.querySelector('[data-measurement-message]'),
        measurementSummary: element.querySelector('[data-measurement-summary]'),
        measurementError: '',
        graph: element.querySelector('[data-graph]'),
        chartTitle: element.querySelector('.output-heading h2'),
        chartJump: element.querySelector('[data-chart-jump]'),
        scanInput: element.querySelector('[data-action="scan-input"]'),
        placeholder: element.querySelector('[data-placeholder]'),
        message: element.querySelector('[data-message]'),
        meta: element.querySelector('[data-meta]'),
        chartNote: element.querySelector('[data-chart-note]'),
        insight: element.querySelector('[data-insight]'),
        values: element.querySelector('[data-values]'),
        valuesDetail: element.querySelector('[data-values-detail]'),
        view: 'heatmap', parsed: null, parsedRaw: null, stats: null, analysis: null, plotted: false, removed: false,
        queue: Promise.resolve(), busy: new Set(), renderToken: 0, fileToken: 0, actionToken: 0,
        dataRevision: 0, lastRenderKey: null, settingsError: '', messageKind: 'status', lastSize: '',
        lastAnimatedRevision: -1, lastStatisticsRevision: -1, dragDepth: 0,
        settingsTimer: null,
    };
    states.push(state);
    nextId = Math.max(nextId, Number(state.id) + 1);
    if (data) applyPanelData(state, data);
    else applyMeasurement(state, DEFAULT_MEASUREMENT);
    if ((!data && !state.raw.value.trim()) || window.matchMedia('(max-width: 760px)').matches) {
        element.querySelector('.plot-settings').open = false;
    }
    state.raw.setAttribute('aria-keyshortcuts', 'Control+Enter Meta+Enter');
    state.raw.addEventListener('keydown', event => {
        if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey) || event.isComposing || event.repeat) return;
        event.preventDefault();
        if (!state.busy.size) visualizePanel(state, { userInitiated: true });
    });
    state.raw.addEventListener('input', () => {
        discardUndo();
        invalidatePanel(state, state.raw.value.trim() ? 'Input changed. Select Visualize to update the chart.' : 'Paste a mesh or use the example to get started.');
        requestRedraw();
        scheduleSave();
    });
    state.name.addEventListener('input', () => {
        discardUndo();
        updatePanelLabels();
        updateComparison();
        updateChartNote(state, state.chartNote.textContent.startsWith('Shared height scale'), checkSettings(state, false).options);
        const caption = state.values.querySelector('caption');
        if (caption) caption.textContent = `${meshName(state)} — original measured heights (mm), in input row order`;
        scheduleSave();
    });
    for (const field of Object.values(state.settings)) {
        field.addEventListener('input', () => {
            discardUndo();
            const checked = checkSettings(state);
            const hadPlot = state.plotted || state.busy.has('render');
            state.renderToken++;
            state.lastRenderKey = null;
            state.plotted = false;
            setBusy(state, 'render', false);
            if (state.parsed) setPlaceholder(state, checked.valid ? 'loading' : 'error');
            if (hadPlot) queuePurge(state);
            updateDifference();
            clearTimeout(state.settingsTimer);
            state.settingsTimer = setTimeout(requestRedraw, 160);
            scheduleSave();
        });
        field.addEventListener('change', () => {
            discardUndo();
            clearTimeout(state.settingsTimer);
            checkSettings(state);
            updateDifference();
            requestRedraw();
            scheduleSave();
        });
    }
    for (const field of Object.values(state.measurement)) {
        const changed = () => {
            discardUndo();
            checkMeasurement(state);
            updateMeasurementSummary(state);
            updateMeasurementComparison();
            repeatRuns?.update();
            baseline?.update();
            scheduleSave();
        };
        field.addEventListener('input', changed);
        field.addEventListener('change', changed);
    }
    element.querySelectorAll('[data-view]').forEach(button => {
        button.addEventListener('click', () => {
            if (state.view === button.dataset.view) return;
            discardUndo();
            setPanelView(state, button.dataset.view);
            requestRedraw();
            scheduleSave();
        });
    });
    element.addEventListener('click', event => {
        const button = event.target.closest('[data-action]');
        if (!button || button.disabled) return;
        handlePanelAction(state, button.dataset.action);
    });
    element.querySelector('[data-file]').addEventListener('change', event => importFile(state, event.target));
    bindFileDrop(state);
    updateControls(state);
    resizeObserver?.observe(state.graph);
    return state;
}

function addPanel(data = null, focus = false, animate = true) {
    if (states.length >= MAX_PANELS) { showFeedback('You can compare up to eight meshes. Remove a panel before adding another.'); return null; }
    let id = data?.id ?? String(nextId++);
    if (states.some(state => state.id === String(id))) id = String(nextId++);
    const copy = document.createElement('template');
    // Only the trusted PHP template and generated numeric identifiers use HTML.
    // Mesh input and names are assigned through text/value DOM properties.
    copy.innerHTML = template.innerHTML.replaceAll('__ID__', String(id)).replaceAll('__NUMBER__', String(states.length + 1));
    const element = copy.content.firstElementChild;
    container.append(element);
    const state = registerPanel(element, data);
    updatePanelLabels();
    if (animate) animateOnce(element, 'is-entering');
    if (focus) { state.raw.focus(); element.scrollIntoView({ block: 'nearest' }); }
    return state;
}

function removePanel(state) {
    if (states.length <= 1) return;
    discardUndo();
    const position = states.indexOf(state);
    disposePanel(state);
    states.splice(position, 1);
    updatePanelLabels();
    requestRedraw();
    scheduleSave();
    states[Math.min(position, states.length - 1)].name.focus();
}

function disposePanel(state) {
    state.removed = true;
    clearFileDrag(state);
    cancelOperations(state);
    queuePurge(state);
    resizeObserver?.unobserve(state.graph);
    state.element.remove();
}

function replacePanels(snapshot, { preserveDraftFields = false } = {}) {
    activeCalibration = null;
    states.forEach(disposePanel);
    states.length = 0;
    snapshot.panels.forEach(panel => {
        const state = addPanel(panel, false, false);
        if (state && preserveDraftFields) {
            writeSettings(state, panel.settings);
            applyMeasurement(state, panel.measurement ?? DEFAULT_MEASUREMENT, true);
        }
    });
    sharedScale.checked = snapshot.sharedScale;
    updatePanelLabels();
    updateComparison();
}

function samplePanel(state) {
    discardUndo();
    invalidatePanel(state);
    state.raw.value = EXAMPLE_RAW;
    setPanelView(state, 'heatmap');
    updatePanelLabels();
    visualizePanel(state);
    scheduleSave();
}

function duplicatePanel(state) {
    if (states.length >= MAX_PANELS) {
        showFeedback('You can compare up to eight meshes. Remove a panel before duplicating another.');
        return;
    }
    discardUndo();
    const settings = readSettings(state);
    const measurement = readMeasurement(state);
    const copy = addPanel({ id: String(nextId++), name: meshName(state).slice(0, 55).trimEnd() + ' copy', raw: state.raw.value, settings, measurement, view: state.view }, true);
    if (!copy) return;
    // Keep unfinished coordinate edits as entered when duplicating this tab.
    writeSettings(copy, settings);
    applyMeasurement(copy, measurement, true);
    if (copy.raw.value.trim()) visualizePanel(copy);
    showFeedback('Mesh duplicated. Change its settings or paste a new measurement to compare.');
    scheduleSave();
}

function safeFilename(state) {
    return meshName(state).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || `bed-mesh-${state.id}`;
}

function downloadCsv(state) {
    if (!state.parsed) return;
    downloadFile(new Blob([exportMeshCsv(state.parsed.values)], { type: 'text/csv;charset=utf-8' }), safeFilename(state) + '.csv');
}

function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportWorkspace() {
    showFileFeedback();
    try {
        const invalidContext = states.find(state => !checkMeasurement(state));
        if (invalidContext) throw new Error(`Correct the measurement context for ${meshName(invalidContext)} before saving a workspace file.`);
        const snapshot = snapshotWorkspace();
        validateWorkspaceFile(snapshot);
        const now = new Date();
        const data = { format: 'bedmesh-workspace', exportedAt: now.toISOString(), ...snapshot };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
        if (blob.size > MAX_WORKSPACE_FILE_SIZE) throw new Error('The workspace exceeds 2 MB. Export individual meshes or remove large unused input before saving.');
        const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        downloadFile(blob, `bedmesh-workspace-${date}.json`);
        showFileFeedback('Workspace file saved. It includes meshes, measurement context and display settings.');
    } catch (error) {
        showFileFeedback(`The workspace could not be saved as a file. ${error.message || 'Check the display settings and try again.'}`, true);
    }
}

async function openWorkspace(input) {
    showFileFeedback();
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;
    if (files.length !== 1 || files[0].size > MAX_WORKSPACE_FILE_SIZE) {
        showFileFeedback('Open one JSON workspace file of at most 2 MB.', true);
        return;
    }
    const token = ++workspaceImportToken;
    const before = snapshotWorkspace();
    const beforeText = JSON.stringify(before);
    const openButton = document.querySelector('[data-global="open-workspace"]');
    if (openButton) openButton.disabled = true;
    try {
        const raw = await files[0].text();
        if (token !== workspaceImportToken) return;
        let parsed;
        try { parsed = JSON.parse(raw); }
        catch { throw new Error('This is not valid JSON. Choose a workspace exported by Bed Mesh.'); }
        const snapshot = validateWorkspaceFile(parsed);
        if (beforeText !== JSON.stringify(snapshotWorkspace())) throw new Error('The workspace changed while the file was opening. Open the file again to replace your current meshes.');
        replacePanels(snapshot);
        clearLegacyAfterSave = false;
        undoSnapshot = before;
        undoButton.textContent = 'Undo open';
        undoButton.hidden = false;
        visualizeAll({ persist: false });
        requestRedraw();
        scheduleSave();
        showFileFeedback('Workspace opened. You can undo this until your next edit.');
        states[0].name.focus();
    } catch (error) {
        showFileFeedback(`The workspace could not be opened. ${error.message || 'Choose a valid Bed Mesh workspace file.'}`, true);
    } finally {
        if (token === workspaceImportToken && openButton) openButton.disabled = false;
    }
}

async function chartAction(state, action) {
    if (!state.plotted) return;
    const token = ++state.actionToken;
    setBusy(state, 'action', true);
    try {
        if (action === 'png') await downloadPlot(state.graph, safeFilename(state));
        else await resetPlotView(state.graph, state.view);
    } catch (error) {
        if (!state.removed && token === state.actionToken) setMessage(state, error.message || 'The chart action could not be completed. Try again.', true, 'chart');
    } finally {
        if (!state.removed && token === state.actionToken) setBusy(state, 'action', false);
    }
}

function importFile(state, input) {
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;
    if (files.length !== 1) {
        setMessage(state, 'Import one mesh file at a time. Add another panel to compare more files.', true, 'input');
        return;
    }
    importMeshFile(state, files[0]);
}

async function importMeshFile(state, file) {
    if (state.removed) return;
    if (state.busy.size) {
        setMessage(state, 'Wait for this mesh to finish processing, then import your file again.', true, 'input');
        return;
    }
    const mime = String(file.type || '').split(';')[0].trim().toLowerCase();
    if (!/\.(txt|csv|json|log)$/i.test(file.name) && !['text/plain', 'text/csv', 'application/json'].includes(mime)) {
        setMessage(state, 'Choose a text, CSV, JSON, or log file containing one mesh (.txt, .csv, .json, or .log).', true, 'input');
        return;
    }
    if (file.size > MAX_RAW_LENGTH) {
        setMessage(state, 'This file is too large. Import one mesh in a text, CSV, or JSON file smaller than 200 KB.', true, 'input');
        return;
    }
    const token = ++state.fileToken;
    setBusy(state, 'file', true);
    try {
        const raw = await file.text();
        if (state.removed || token !== state.fileToken) return;
        if (raw.length > MAX_RAW_LENGTH) throw new Error('The file contains too much text. Import one mesh at a time.');
        discardUndo();
        invalidatePanel(state);
        state.raw.value = raw;
        visualizePanel(state, { userInitiated: true });
        scheduleSave();
    } catch (error) {
        if (!state.removed && token === state.fileToken) setMessage(state, error.message || 'The file could not be read. Try importing it again.', true, 'input');
    } finally {
        if (!state.removed && token === state.fileToken) setBusy(state, 'file', false);
    }
}

function isFileTransfer(event) {
    const transfer = event.dataTransfer;
    return Boolean(transfer && (Array.from(transfer.types ?? []).includes('Files') || transfer.files?.length));
}

function clearFileDrag(state) {
    state.dragDepth = 0;
    state.element.querySelector('.mesh-input-column').classList.remove('is-dragging');
}

function clearAllFileDrags() {
    states.forEach(clearFileDrag);
}

function bindFileDrop(state) {
    const column = state.element.querySelector('.mesh-input-column');
    column.addEventListener('dragenter', event => {
        if (!isFileTransfer(event)) return;
        event.preventDefault();
        state.dragDepth++;
        if (!state.busy.size) column.classList.add('is-dragging');
    });
    column.addEventListener('dragover', event => {
        if (!isFileTransfer(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = state.busy.size ? 'none' : 'copy';
    });
    column.addEventListener('dragleave', () => {
        state.dragDepth = Math.max(0, state.dragDepth - 1);
        if (!state.dragDepth) column.classList.remove('is-dragging');
    });
    column.addEventListener('drop', event => {
        if (!isFileTransfer(event)) return;
        event.preventDefault();
        clearFileDrag(state);
        const files = Array.from(event.dataTransfer.files ?? []);
        if (files.length !== 1) {
            setMessage(state, files.length ? 'Drop one mesh file at a time. Add another panel to compare more files.' : 'This item could not be read as a file. Try the Import file button.', true, 'input');
            return;
        }
        importMeshFile(state, files[0]);
    });
}

async function savePanelRun(state) {
    setBusy(state, 'history', true);
    try {
        if (!checkMeasurement(state)) {
            state.element.querySelector('[data-measurement-detail]').open = true;
            throw new Error('Check the recorded measurement conditions before saving this run.');
        }
        differenceDescriptor(state);
        const panel = { ...snapshotPanel(state), name: meshName(state) };
        await updateMeasurementHistory(() => saveMeasurementRun(storage, panel));
        if (!state.removed) setMessage(state, 'Saved a copy to Measurement history.');
    } catch (error) {
        if (!state.removed) setMessage(state, error.message, true, 'input');
    } finally {
        if (!state.removed) setBusy(state, 'history', false);
    }
}

function showPanelPresets(state) {
    const settings = readSettings(state);
    let badDimensions = false;
    try { readSpatialOptions(state, settings); }
    catch { badDimensions = true; }
    presets.show({
        name: meshName(state), setup: state.measurement.setup.value, surface: state.measurement.surface.value,
        settings, badDimensions,
        apply(preset) {
            if (state.removed) throw new Error('This mesh is no longer open.');
            discardUndo();
            const { setup, surface, ...spatial } = preset;
            writeSettings(state, spatial);
            state.measurement.setup.value = preset.setup;
            state.measurement.surface.value = preset.surface;
            checkMeasurement(state);
            updateMeasurementSummary(state);
            requestRedraw();
            scheduleSave();
            showFeedback(`Applied ${preset.setup} · ${preset.surface} to ${meshName(state)}.`);
        },
    });
}

function handlePanelAction(state, action) {
    if (action === 'visualize') visualizePanel(state, { userInitiated: true });
    else if (action === 'scan-input') logPicker.show(state);
    else if (action === 'remove') removePanel(state);
    else if (action === 'duplicate') duplicatePanel(state);
    else if (action === 'import') state.element.querySelector('[data-file]').click();
    else if (action === 'csv') downloadCsv(state);
    else if (action === 'save-run') savePanelRun(state);
    else if (action === 'presets') showPanelPresets(state);
    else if (action === 'png' || action === 'reset-view') chartAction(state, action);
    else if (action === 'clear') {
        discardUndo();
        invalidatePanel(state, 'Mesh cleared. Paste another measurement or use the example.');
        state.raw.value = '';
        applyMeasurement(state, DEFAULT_MEASUREMENT);
        requestRedraw();
        scheduleSave();
        state.raw.focus();
    }
}

function visualizeAll({ persist = false, userInitiated = false } = {}) {
    const populated = states.filter(state => state.raw.value.trim());
    if (!populated.length) { showFeedback('Paste a mesh or load an example to get started.'); return; }
    showFeedback();
    populated.forEach(state => visualizePanel(state, { persist, userInitiated }));
}

function unusedPanel(state, index) {
    return !state.raw.value.trim() && !state.busy.size && state.name.value === `Mesh ${index + 1}` &&
        Object.entries(readSettings(state)).every(([key, value]) => value === DEFAULT_SETTINGS[key]) &&
        [...Object.values(state.settings), ...Object.values(state.measurement)].every(field => !field.validity.badInput) &&
        Object.values(state.measurement).every(field => !field.value);
}

function openMeshBatch(panels, { userInitiated = false, reuse = null } = {}) {
    for (const panel of panels) {
        const parsed = parseMesh(panel.raw);
        calculateStats(parsed.values);
        analyzeMesh(parsed.values);
    }
    const empty = states.filter(unusedPanel);
    if (reuse) empty.unshift(reuse);
    if (panels.length > MAX_PANELS - states.length + empty.length) {
        throw new Error('There is not enough room for this selection. Select fewer runs or remove an unused mesh panel first.');
    }
    discardUndo();
    const opened = panels.map((panel, index) => {
        // Workspace panel identifiers belong to this workspace, not to a saved run.
        const data = { ...panel, id: undefined };
        const state = empty[index] ?? addPanel(data);
        if (empty[index]) applyPanelData(state, data);
        visualizePanel(state, { userInitiated });
        return state;
    });
    updatePanelLabels();
    if (opened.length === 2) {
        [delta.beforeId, delta.afterId] = opened.map(state => state.id);
        delta.reference.value = 'original';
    }
    scheduleSave();
    return opened;
}

function openLogReports(reports, source) {
    const panel = source?.panel;
    const reuse = panel && !panel.removed && !panel.busy.size && panel.raw.value === source.text ? panel : null;
    const opened = openMeshBatch(reports.map((report, index) => {
        const original = index === 0 && reuse ? snapshotPanel(reuse) : null;
        const name = reports.length === 2 ? `${index ? 'After' : 'Before'} · ${report.label}` : `${report.label} · line ${report.firstLine}`;
        return { name: original?.name.trim() || name, raw: report.raw, view: 'heatmap',
            settings: original?.settings ?? DEFAULT_SETTINGS, measurement: original?.measurement ?? DEFAULT_MEASUREMENT };
    }), { userInitiated: true, reuse });
    showFeedback(opened.length === 2 ? 'Two reports opened as Before and After.' : 'One mesh report opened.');
    requestAnimationFrame(() => {
        if (opened.length === 2) difference.querySelector('h3').focus();
        else opened[0].chartTitle.focus();
    });
}

function openHistoryRuns(panels) {
    const opened = openMeshBatch(panels);
    if (opened.length >= 3) repeatRuns.selectRuns(opened);
    showFeedback(opened.length === 1 ? 'Opened one saved run.' : `Opened ${opened.length} saved runs.`);
    requestAnimationFrame(() => {
        if (opened.length >= 3) repeatSection.querySelector('summary').focus();
        else if (opened.length === 2) difference.querySelector('h3').focus();
        else opened[0].name.focus();
    });
}

function captureCalibration() {
    const { before, after, result, point } = currentComparison();
    const selected = baseline?.current();
    if (!selected || selected.result !== result) throw new Error('Choose at least three compatible baseline scans to save a session.');
    const members = [...new Set([before, after, ...selected.members])];
    const ids = new Map(members.map((state, index) => [state, String(index)]));
    const panels = members.map(state => {
        if (!checkMeasurement(state)) throw new Error(`Correct the measurement conditions for ${meshName(state)} before saving.`);
        return { ...snapshotPanel(state), id: ids.get(state), name: meshName(state) };
    });
    const workspace = validateWorkspaceFile({ version: 2, sharedScale: sharedScale.checked, panels });
    return { workspace, beforeId: '0', afterId: '1', baselineIds: selected.members.map(state => ids.get(state)), reference: result.reference, point };
}

function calibrationKey(snapshot) {
    const meshes = snapshot.workspace.panels.map(({ id, name, raw, settings, measurement }) =>
        [id, name, raw, meshSpatialOptions(settings, name), settings.flipX, settings.flipY, measurement]);
    return JSON.stringify([meshes, snapshot.baselineIds, snapshot.reference]);
}

function rememberCalibration(session) {
    activeCalibration = { session, key: calibrationKey(session) };
}

function matchingCalibration() {
    if (!activeCalibration || !baseline?.current()) return null;
    try {
        return activeCalibration.key === calibrationKey(captureCalibration()) ? activeCalibration.session : null;
    } catch { return null; }
}

function openCalibrationSession(session) {
    const previous = snapshotWorkspace();
    replacePanels(session.workspace);
    delta.beforeId = session.beforeId;
    delta.afterId = session.afterId;
    delta.reference.value = session.reference;
    visualizeAll();
    baseline.setRuns(session.baselineIds.map(id => states.find(state => state.id === id)));
    updateComparison();
    if (session.point) selectPoint(session.point);
    rememberCalibration(session);
    undoSnapshot = previous;
    undoButton.textContent = 'Undo open';
    undoButton.hidden = false;
    clearLegacyAfterSave = false;
    scheduleSave();
    showFeedback(`Opened “${session.name}”. You can undo this until your next edit.`);
    requestAnimationFrame(() => difference.querySelector('h3').focus());
}

function openSessionReference(session, targetId) {
    const target = states.find(state => state.id === targetId && state.parsed);
    if (!target || !session.pin) throw new Error('Choose a saved reference and a visualized target mesh.');
    const panel = session.workspace.panels.find(item => item.id === session[session.pin + 'Id']);
    compareMeshes(sessionPanelMesh(panel), differenceDescriptor(target), { reference: session.reference });
    const [reference] = openMeshBatch([panel]);
    delta.beforeId = reference.id;
    delta.afterId = target.id;
    delta.reference.value = session.reference;
    baseline.setRuns([]);
    activeCalibration = null;
    showFeedback(`Opened ${meshName(reference)} as the Before reference.`);
    requestAnimationFrame(() => difference.querySelector('h3').focus());
}

function handleGlobalAction(action) {
    if (action === 'save-workspace') exportWorkspace();
    else if (action === 'open-workspace') { showFileFeedback(); workspaceFile?.click(); }
    else if (action === 'log') logPicker.show();
    else if (action === 'history') history.show();
    else if (action === 'sessions') sessions.showLibrary();
    else if (action === 'add') {
        discardUndo();
        const state = addPanel(null, true);
        if (state) { showFeedback(); scheduleSave(); }
    } else if (action === 'visualize') visualizeAll({ userInitiated: true });
    else if (action === 'example') {
        const existing = states.find(state => state.raw.value === EXAMPLE_RAW);
        if (existing) { existing.chartTitle.focus(); return; }
        const state = states.find(unusedPanel) ?? addPanel();
        if (state) { showFeedback(); samplePanel(state); state.chartTitle.focus(); }
    } else if (action === 'clear') {
        const snapshot = snapshotWorkspace();
        replacePanels({ version: 2, panels: [{ id: String(nextId++), name: 'Mesh 1', raw: '', settings: DEFAULT_SETTINGS, view: 'heatmap' }], sharedScale: true });
        undoSnapshot = snapshot;
        undoButton.textContent = 'Undo clear';
        undoButton.hidden = false;
        clearLegacyAfterSave = true;
        workspaceDirty = true;
        saveWorkspace();
        requestRedraw();
        showFeedback('Meshes cleared in this tab. You can undo this until your next edit.');
        states[0].raw.focus();
    } else if (action === 'undo' && undoSnapshot) {
        const snapshot = undoSnapshot;
        discardUndo();
        replacePanels(snapshot, { preserveDraftFields: true });
        visualizeAll({ persist: false });
        clearLegacyAfterSave = false;
        workspaceDirty = true;
        saveWorkspace();
        showFeedback('Your previous workspace has been restored.');
    }
}

const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => {
    for (const entry of entries) {
        const state = states.find(panel => panel.graph === entry.target);
        if (!state || state.removed) continue;
        const size = `${Math.round(entry.contentRect.width)}:${Math.round(entry.contentRect.height)}`;
        if (state.lastSize === size) continue;
        state.lastSize = size;
        if (!state.plotted || state.busy.size) continue;
        requestAnimationFrame(() => {
            if (!state.plotted || state.removed || state.busy.size) return;
            try { window.Plotly?.Plots?.resize(state.graph)?.catch(() => {}); }
            catch { /* A pending clear can remove a chart before this frame. */ }
        });
    }
}) : null;

if (workspace && container && template) {
    container.querySelectorAll('[data-panel]').forEach(element => registerPanel(element));
    if (comparisonDemo) {
        const samples = demoMeasurements();
        states.forEach((state, index) => applyPanelData(state, samples[index]));
        delta.beforeId = states[0].id;
        delta.afterId = states.at(-1).id;
        saveStatus.textContent = 'Temporary demo workspace';
    }
    const requestedPanels = states.length;
    const posted = workspace.dataset.posted === 'true' || states.some(state => state.raw.value.trim());
    if (posted && storage) {
        try { lastStoredRaw = storage.getItem(STORAGE_KEY); }
        catch { storage = null; }
    }
    const saved = posted ? { snapshot: null, found: false, migrated: [] } : loadSavedWorkspace();
    if (saved.snapshot) {
        replacePanels(saved.snapshot);
        while (states.length < requestedPanels) addPanel(null, false, false);
        saveStatus.textContent = 'Workspace restored from this browser';
    }
    updatePanelLabels();
    document.querySelectorAll('[data-global]').forEach(button => {
        button.addEventListener('click', () => { if (!button.disabled) handleGlobalAction(button.dataset.global); });
    });
    sharedScale.addEventListener('change', () => { discardUndo(); requestRedraw(); scheduleSave(); });
    workspaceFile?.addEventListener('change', event => openWorkspace(event.target));
    reportDialog.querySelector('[data-report-download]').addEventListener('click', () => {
        const message = reportDialog.querySelector('[data-report-message]');
        try {
            const report = comparisonReportFile(reportDialog, document.querySelector('#mesh-tool-styles').sheet);
            downloadFile(report, 'bed-mesh-comparison.html');
            message.textContent = 'Report downloaded as an HTML file.';
            if (reportDialog.hasAttribute('data-measure-download')) measure('comparison_report_downloaded');
        } catch {
            message.textContent = 'The file could not be created. You can still print this report from your browser.';
        }
    });
    reportDialog.addEventListener('close', () => {
        reportDialog.querySelector('[data-report-content]').replaceChildren();
        reportDialog.querySelector('[data-report-message]').textContent = '';
    });
    if (delta) {
        delta.before.addEventListener('change', () => { delta.beforeId = delta.before.value; updateDifference(); countComparison(); });
        delta.after.addEventListener('change', () => { delta.afterId = delta.after.value; updateDifference(); countComparison(); });
        delta.reference.addEventListener('change', updateDifference);
        inspector.querySelector('form').addEventListener('submit', event => {
            event.preventDefault();
            const x = pointX.valueAsNumber;
            const y = pointY.valueAsNumber;
            if (delta.result && Number.isInteger(x) && Number.isInteger(y) &&
                x >= 0 && x < delta.result.columns && y >= 0 && y < delta.result.rows) selectPoint({ x, y });
        });
        inspector.querySelector('[data-clear-point]').addEventListener('click', () => {
            inspector.querySelector('button[type="submit"]').focus();
            selectPoint(null);
        });
        difference.addEventListener('click', event => {
            const button = event.target.closest('[data-difference]');
            if (button && !button.disabled) handleDifferenceAction(button.dataset.difference);
        });
    }
    document.addEventListener('dragover', event => {
        if (!isFileTransfer(event)) return;
        event.preventDefault();
        if (!event.target.closest?.('.mesh-input-column')) event.dataTransfer.dropEffect = 'none';
    });
    document.addEventListener('drop', event => {
        if (!isFileTransfer(event)) return;
        event.preventDefault();
        clearAllFileDrags();
        if (!event.target.closest?.('.mesh-input-column')) showFeedback('Drop your file onto a mesh input area to import it.');
    });
    document.addEventListener('dragend', clearAllFileDrags);
    window.addEventListener('blur', clearAllFileDrags);
    window.addEventListener('storage', event => {
        if (!storage || (event.storageArea && event.storageArea !== storage) || (event.key !== STORAGE_KEY && event.key !== null)) return;
        try {
            const current = storage.getItem(STORAGE_KEY);
            if (current !== lastStoredRaw) showStorageConflict(current);
        } catch { saveStatus.textContent = 'Local saving is unavailable. Export your meshes to keep a copy.'; }
    });
    if (states.some(state => state.raw.value.trim())) visualizeAll({ persist: false });
    else updateComparison();
    if (comparisonDemo) {
        updateComparison();
        if (!thermalDemo) {
            baseline.setRuns(states.slice(0, 3));
            selectPoint({ x: 4, y: 2 });
            workspace.querySelector('[data-demo-action="point"]').addEventListener('click', () => {
                selectPoint({ x: 4, y: 2 });
                document.querySelector('#point-title').focus();
            });
            workspace.querySelector('[data-demo-action="report"]').addEventListener('click', () => {
                if (delta.result && !delta.point) selectPoint({ x: 4, y: 2 });
                handleDifferenceAction('report');
            });
        } else {
            selectPoint({ x: 4, y: 2 });
        }
        const target = document.getElementById(window.location.hash.slice(1));
        if (target && !target.closest('[hidden]')) target.scrollIntoView({ behavior: 'instant' });
    }
    if (saved.migrated.length) {
        workspaceDirty = true;
        if (saveWorkspace()) {
            try { saved.migrated.forEach(key => storage.removeItem(key)); }
            catch { /* New storage succeeded; retaining legacy copies is harmless. */ }
        }
    }
    if (!storage && !comparisonDemo) saveStatus.textContent = 'Local saving is unavailable in this browser';
    window.addEventListener('pagehide', () => { if (workspaceDirty && !storageConflict) saveWorkspace(); });
}
