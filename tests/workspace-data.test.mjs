import test from 'node:test';
import assert from 'node:assert/strict';
import {
    MAX_PANELS, MAX_RAW_LENGTH, MAX_WORKSPACE_FILE_SIZE, DEFAULT_SETTINGS, DEFAULT_MEASUREMENT,
    normalizeSettings, normalizeMeasurement, validateMeasurement, normalizeSnapshot, validateWorkspaceFile,
} from '../js/workspace-data.mjs';

function panel(overrides = {}) {
    return { id: '0', name: 'Mesh 1', raw: '0.1 0.2\n0.3 0.4', view: 'surface', settings: { ...DEFAULT_SETTINGS }, measurement: { ...DEFAULT_MEASUREMENT }, ...overrides };
}

function workspace(panels = [panel()], overrides = {}) {
    return { version: 2, panels, sharedScale: true, ...overrides };
}

test('exports limits and immutable default settings', () => {
    assert.equal(MAX_PANELS, 8);
    assert.equal(MAX_RAW_LENGTH, 200000);
    assert.equal(MAX_WORKSPACE_FILE_SIZE, 2000000);
    assert.ok(Object.isFrozen(DEFAULT_SETTINGS));
    assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
});

test('complete plane-reference workspace roundtrips, including unfinished mesh input', () => {
    const original = workspace([
        panel({ name: 'Before', settings: { ...DEFAULT_SETTINGS, scale: 'fixed', reference: 'plane', width: '220', depth: '235', flipX: true,
            minX: '-5', maxX: '215', minY: '30', maxY: '265', frontEdge: 'minY' } }),
        panel({ id: '1', name: 'An unfinished measurement', raw: 'Paste next row here…', view: 'heatmap', settings: { ...DEFAULT_SETTINGS, reference: 'mean', flipY: true } }),
    ], { format: 'bedmesh-workspace', exportedAt: '2026-11-06T20:00:00.000Z', revision: 4, sharedScale: false });
    const before = structuredClone(original);
    const result = validateWorkspaceFile(original);
    assert.deepEqual(result, workspace(original.panels, { sharedScale: false }));
    assert.deepEqual(validateWorkspaceFile(JSON.parse(JSON.stringify(result))), result);
    assert.deepEqual(original, before, 'normalization does not mutate the source');
});

test('workspace imports require complete increasing XY bounds and accept older settings', () => {
    const legacy = { scale: 'fit', reference: 'original', width: '', depth: '', flipX: false, flipY: false };
    assert.deepEqual(validateWorkspaceFile(workspace([panel({ settings: legacy })])).panels[0].settings, DEFAULT_SETTINGS);
    const bounds = { minX: '-5', maxX: '200', minY: '15', maxY: '165', frontEdge: 'minY' };
    for (const [change, message] of [
        [{ minX: '' }, /all four sampled XY bounds/],
        [{ minY: '180' }, /above its minimum/],
        [{ frontEdge: 'unknown' }, /valid front edge/],
    ]) {
        assert.throws(() => validateWorkspaceFile(workspace([panel({ settings: { ...legacy, ...bounds, ...change } })])), message);
    }
});

test('file imports require one to eight panels and a version 2 workspace record', () => {
    for (const input of [null, [], 'text', 2, {}, workspace([], {}), workspace(Array.from({ length: 9 }, () => panel()))]) {
        assert.throws(() => validateWorkspaceFile(input), /version 2 workspace file containing one to eight meshes/);
    }
    for (const version of [undefined, '2', 1, 3]) {
        assert.throws(() => validateWorkspaceFile(workspace(undefined, { version })), /version 2/);
    }
    assert.equal(validateWorkspaceFile(workspace(Array.from({ length: 8 }, (_, index) => panel({ id: String(index) })))).panels.length, 8);
});

test('a malformed panel anywhere rejects the complete file without losing earlier panels', () => {
    const broken = [null, [], {}, panel({ raw: 42 }), panel({ name: undefined }), panel({ settings: undefined }), panel({ view: 'unsupported' })];
    for (const invalid of broken) {
        const source = workspace([panel(), invalid, panel({ id: '2' })]);
        const before = structuredClone(source);
        assert.throws(() => validateWorkspaceFile(source), /Mesh 2/);
        assert.deepEqual(source, before);
    }
});

test('strict imports enforce raw text and name types and exact length boundaries', () => {
    const atLimit = workspace([panel({ raw: 'x'.repeat(MAX_RAW_LENGTH), name: 'n'.repeat(60) })]);
    assert.equal(validateWorkspaceFile(atLimit).panels[0].raw.length, MAX_RAW_LENGTH);
    assert.equal(validateWorkspaceFile(atLimit).panels[0].name.length, 60);
    for (const raw of [undefined, null, true, 1, [], {}, 'x'.repeat(MAX_RAW_LENGTH + 1)]) {
        assert.throws(() => validateWorkspaceFile(workspace([panel({ raw })])), /text of at most 200,000 characters/);
    }
    for (const name of [undefined, null, true, 1, [], {}, 'n'.repeat(61)]) {
        assert.throws(() => validateWorkspaceFile(workspace([panel({ name })])), /name of at most 60 characters/);
    }
    assert.equal(validateWorkspaceFile(workspace([panel({ name: '', raw: '' })])).panels[0].raw, '');
});

test('strict imports accept only supported settings, references, views and booleans', () => {
    for (const settings of [undefined, null, [], 'fit', {}, { ...DEFAULT_SETTINGS, extra: true }]) {
        assert.throws(() => validateWorkspaceFile(workspace([panel({ settings })])), /invalid display settings/);
    }
    for (const scale of ['auto', undefined, null, 1]) {
        assert.throws(() => validateWorkspaceFile(workspace([panel({ settings: { ...DEFAULT_SETTINGS, scale } })])), /invalid display settings/);
    }
    for (const reference of ['flat', undefined, null, 1]) {
        assert.throws(() => validateWorkspaceFile(workspace([panel({ settings: { ...DEFAULT_SETTINGS, reference } })])), /invalid display settings/);
    }
    for (const key of ['flipX', 'flipY']) for (const value of [undefined, null, 'true', 1]) {
        assert.throws(() => validateWorkspaceFile(workspace([panel({ settings: { ...DEFAULT_SETTINGS, [key]: value } })])), /invalid display settings/);
    }
    for (const view of ['3d', undefined, null, 1]) {
        assert.throws(() => validateWorkspaceFile(workspace([panel({ view })])), /unsupported chart view/);
    }
    for (const scale of ['fit', 'fixed']) for (const reference of ['original', 'mean', 'plane']) for (const view of ['surface', 'heatmap']) {
        assert.equal(validateWorkspaceFile(workspace([panel({ view, settings: { ...DEFAULT_SETTINGS, scale, reference } })])).panels[0].settings.reference, reference);
    }
});

test('strict probed dimensions must be paired, finite numbers within inclusive bounds', () => {
    for (const blank of ['', null, undefined]) {
        const result = validateWorkspaceFile(workspace([panel({ settings: { ...DEFAULT_SETTINGS, width: blank, depth: blank } })]));
        assert.equal(result.panels[0].settings.width, '');
        assert.equal(result.panels[0].settings.depth, '');
    }
    for (const [width, depth] of [[1, 2000], ['220.5', '235'], [2000, 1]]) {
        const result = validateWorkspaceFile(workspace([panel({ settings: { ...DEFAULT_SETTINGS, width, depth } })]));
        assert.equal(result.panels[0].settings.width, String(Number(width)));
        assert.equal(result.panels[0].settings.depth, String(Number(depth)));
    }
    for (const key of ['width', 'depth']) {
        assert.throws(() => validateWorkspaceFile(workspace([panel({ settings: { ...DEFAULT_SETTINGS, [key]: 220 } })])), /include both probed dimensions/);
        for (const value of [0, -1, 2000.01, NaN, Infinity, 'Infinity', 'no', true, [], {}, ' ']) {
            assert.throws(() => validateWorkspaceFile(workspace([panel({ settings: { ...DEFAULT_SETTINGS, width: 220, depth: 220, [key]: value } })])), /must be between 1 and 2000 mm/);
        }
    }
});

test('file metadata is validated while revision-less version 2 remains supported', () => {
    for (const sharedScale of [undefined, null, 'true', 1, [], {}]) {
        assert.throws(() => validateWorkspaceFile(workspace(undefined, { sharedScale })), /valid shared-scale setting/);
    }
    assert.throws(() => validateWorkspaceFile(workspace(undefined, { format: 'other' })), /not a Bed Mesh workspace/);
    for (const exportedAt of [null, 42, 'not a date']) {
        assert.throws(() => validateWorkspaceFile(workspace(undefined, { exportedAt })), /export date is invalid/);
    }
    for (const revision of [null, -1, 1.5, '1', Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        assert.throws(() => validateWorkspaceFile(workspace(undefined, { revision })), /revision is invalid/);
    }
    assert.deepEqual(validateWorkspaceFile(workspace()), workspace());
});

test('malicious, duplicate and noncanonical IDs become unique safe numeric strings', () => {
    const ids = ['<img src=x onerror=alert(1)>', '0', '00', -1, {}, null, '900719925474099999999', '1000000'];
    const result = validateWorkspaceFile(workspace(ids.map(id => panel({ id }))), 20);
    const normalized = result.panels.map(item => item.id);
    assert.equal(new Set(normalized).size, ids.length);
    assert.ok(normalized.every(id => /^\d+$/.test(id) && Number.isSafeInteger(Number(id))));
    assert.equal(normalized[0], '20', 'caller can reserve earlier live panel identifiers');
    assert.equal(normalized[1], '0');
    assert.notEqual(normalized[2], '0', 'leading zero spelling cannot evade duplicate detection');
    assert.deepEqual(validateWorkspaceFile(JSON.parse(JSON.stringify(result))), result);
});

test('ID normalization never invokes object coercion and handles unsafe start counters', () => {
    const hostileId = { toString() { throw new Error('must not run'); }, [Symbol.toPrimitive]() { throw new Error('must not run'); } };
    for (const startId of [-1, NaN, Infinity, '10', {}, Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER]) {
        const source = workspace([panel({ id: hostileId }), panel({ id: hostileId })]);
        for (const normalize of [normalizeSnapshot, validateWorkspaceFile]) {
            const result = normalize(source, startId);
            const ids = result.panels.map(item => item.id);
            assert.equal(new Set(ids).size, 2);
            assert.ok(ids.every(id => /^\d+$/.test(id) && Number.isSafeInteger(Number(id))));
        }
    }
});

test('HTML and JSON __proto__ values remain inert data and never pollute prototypes', () => {
    const html = '<img src=x onerror="alert(1)">';
    const source = JSON.parse(JSON.stringify(workspace([panel({ name: html, raw: '<script>alert(1)</script>' })])).replace('"version":2', '"version":2,"__proto__":{"bedmeshPolluted":true}'));
    const result = validateWorkspaceFile(source);
    assert.equal(result.panels[0].name, html);
    assert.equal(result.panels[0].raw, '<script>alert(1)</script>');
    assert.equal({}.bedmeshPolluted, undefined);
    assert.equal(Object.hasOwn(result, '__proto__'), false);
    const hostileSettings = JSON.parse('{"scale":"fit","reference":"original","width":"","depth":"","flipX":false,"flipY":false,"__proto__":{"bedmeshPolluted":true}}');
    assert.throws(() => validateWorkspaceFile(workspace([panel({ settings: hostileSettings })])), /invalid display settings/);
    assert.deepEqual(normalizeSettings(hostileSettings), DEFAULT_SETTINGS);
    assert.equal({}.bedmeshPolluted, undefined);
});

test('loose legacy storage recovery retains old version 2 defaults and usable panels', () => {
    const old = { version: 2, panels: [{ id: '5', raw: 'unfinished draft' }, { id: '5', raw: 42 }, { id: '5', raw: '' }] };
    assert.deepEqual(normalizeSnapshot(old), {
        version: 2,
        panels: [panel({ id: '5', raw: 'unfinished draft', name: 'Mesh 1' }), panel({ id: '6', raw: '', name: 'Mesh 2' })],
        sharedScale: true,
    });
    assert.equal(normalizeSnapshot({ version: 1, panels: [panel()] }), null);
    assert.equal(normalizeSnapshot(workspace([])), null);
    assert.equal(normalizeSnapshot(workspace([panel({ raw: null })])), null);
    assert.equal(normalizeSnapshot(workspace(Array.from({ length: 10 }, () => panel()))).panels.length, MAX_PANELS);
    assert.deepEqual(normalizeSettings({ scale: 'old', reference: 'unknown', width: 3000, depth: '200', flipX: 'true', flipY: true }), { ...DEFAULT_SETTINGS, depth: '200', flipY: true });
});

test('old version 2 workspaces gain blank context without inventing a measurement date', () => {
    const old = panel();
    delete old.measurement;
    assert.deepEqual(validateWorkspaceFile(workspace([old])).panels[0].measurement, DEFAULT_MEASUREMENT);
    assert.deepEqual(normalizeSnapshot(workspace([old])).panels[0].measurement, DEFAULT_MEASUREMENT);
    assert.deepEqual(normalizeMeasurement(undefined), DEFAULT_MEASUREMENT);
    assert.ok(Object.isFrozen(DEFAULT_MEASUREMENT));
});

test('measurement context survives JSON roundtrip without converting recorded local times', () => {
    const measurement = { measuredAt: '2026-11-06T14:35:12', bedTemperature: '60.5', surface: 'Textured PEI', setup: 'Printer A / spring steel', notes: 'Heat soaked for 15 minutes.\nSame probing origin.' };
    const source = workspace([panel({ measurement })]);
    const original = structuredClone(source);
    assert.deepEqual(validateWorkspaceFile(JSON.parse(JSON.stringify(source))), source);
    assert.deepEqual(source, original);
    assert.equal(validateMeasurement({ measuredAt: '2024-02-29T00:00' }).measuredAt, '2024-02-29T00:00');
    for (const temperature of [-50, 0, 300, '-12.5', '60.0']) {
        assert.equal(validateMeasurement({ bedTemperature: temperature }).bedTemperature, String(Number(temperature)));
    }
});

test('measurement text bounds are exact and malformed metadata rejects the whole workspace', () => {
    const bounded = { surface: 's'.repeat(80), setup: 'p'.repeat(80), notes: 'n'.repeat(1000) };
    assert.deepEqual(validateMeasurement(bounded), { ...DEFAULT_MEASUREMENT, ...bounded });
    for (const [key, limit] of Object.entries({ surface: 80, setup: 80, notes: 1000 })) {
        for (const invalid of ['x'.repeat(limit + 1), null, 7, [], {}]) {
            const source = workspace([panel(), panel({ id: '1', measurement: { [key]: invalid } })]);
            assert.throws(() => validateWorkspaceFile(source), /Mesh 2 measurement context/);
        }
        assert.equal(normalizeMeasurement({ [key]: 'x'.repeat(limit + 1) })[key].length, limit);
    }
    for (const measurement of [null, [], true, 1, 'context', { unknown: 'value' }]) {
        assert.throws(() => validateMeasurement(measurement), /supported measurement fields/);
    }
});

test('measurement dates and temperatures require valid declared values', () => {
    for (const measuredAt of ['2026-02-29T12:00', '2024-02-30T12:00', '2026-13-01T12:00', '2026-00-01T12:00', '2026-11-00T12:00', '2026-11-06T24:00', '2026-11-06T12:60', '2026-11-06T12:00:60', '1899-11-06T12:00', '2026-11-06T12:00Z', '2026-11-06', 0, null]) {
        assert.throws(() => validateMeasurement({ measuredAt }), /recorded local date|measuredAt must be text/);
        assert.equal(normalizeMeasurement({ measuredAt }).measuredAt, '');
    }
    for (const bedTemperature of [-50.01, 300.01, NaN, Infinity, 'hot', ' ', true, [], {}]) {
        assert.throws(() => validateMeasurement({ bedTemperature }), /bed temperature/);
        assert.equal(normalizeMeasurement({ bedTemperature }).bedTemperature, '');
    }
});

test('measurement HTML remains data and unknown prototype fields cannot pollute snapshots', () => {
    const notes = '<script>alert(1)</script>';
    assert.equal(validateMeasurement({ notes }).notes, notes);
    const hostile = JSON.parse('{"notes":"saved","__proto__":{"measurementPolluted":true}}');
    assert.throws(() => validateMeasurement(hostile), /supported measurement fields/);
    assert.deepEqual(normalizeMeasurement(hostile), { ...DEFAULT_MEASUREMENT, notes: 'saved' });
    assert.equal({}.measurementPolluted, undefined);
});
