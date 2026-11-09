import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readMeasurementHistory, saveMeasurementRun, measurementHistoryBackup, restoreMeasurementHistory } from '../js/measurement-history.mjs';
import { DEFAULT_SETTINGS } from '../js/workspace-data.mjs';

function memoryStorage(entries = new Map()) {
    return {
        get length() { return entries.size; },
        key: index => [...entries.keys()][index] ?? null,
        getItem: key => entries.get(key) ?? null,
        setItem: (key, value) => entries.set(key, value),
        removeItem: key => entries.delete(key),
    };
}

const samplePanel = {
    name: 'Before heat soak', raw: '0 0.1\n0.2 0.3', view: 'heatmap',
    settings: { ...DEFAULT_SETTINGS, width: '180', depth: '120', flipY: true },
    measurement: { measuredAt: '2026-11-09T14:32', setup: 'Printer A', surface: 'Smooth plate' },
};

test('history writes independent snapshots and preserves them through a failed save', t => {
    if (!globalThis.crypto) {
        Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
        t.after(() => { delete globalThis.crypto; });
    }
    const entries = new Map([['bedmesh.workspace.v2', 'existing workspace']]);
    const storage = memoryStorage(entries);
    const panel = samplePanel;
    saveMeasurementRun(storage, panel);
    saveMeasurementRun(storage, { ...panel, name: 'After heat soak' });
    const before = readMeasurementHistory(storage);
    assert.equal(before.runs.length, 2);
    assert.equal(new Set(before.runs.map(run => run.key)).size, 2);
    const first = before.runs.find(run => run.panel.name === panel.name);
    assert.equal(first.panel.raw, panel.raw);
    assert.equal(first.panel.measurement.measuredAt, '2026-11-09T14:32');
    assert.equal(first.panel.settings.flipY, true);
    assert.throws(() => saveMeasurementRun(storage, { ...panel, settings: { ...panel.settings, depth: '' } }), /both probed/);
    storage.setItem = () => { throw new DOMException('Quota reached', 'QuotaExceededError'); };
    assert.throws(() => saveMeasurementRun(storage, panel), /storage is full/);
    assert.deepEqual(readMeasurementHistory(storage), before);
    assert.equal(entries.get('bedmesh.workspace.v2'), 'existing workspace');
});

const makeBackup = runs => ({ format: 'bedmesh-measurement-history', version: 1, runs });
const makeRun = (id, panel = samplePanel) => ({ id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`, savedAt: 12345, panel });

test('restoring a history backup preserves old runs and skips identical identifiers on repeat imports', () => {
    const storage = memoryStorage(new Map([['bedmesh.workspace.v2', 'existing workspace']]));
    const original = makeRun(1);
    const incoming = makeRun(2, { ...samplePanel, name: 'After heat soak' });
    restoreMeasurementHistory(storage, makeBackup([original]));
    assert.deepEqual(restoreMeasurementHistory(storage, makeBackup([original, incoming])), { added: 1, skipped: 1 });
    const { backup } = measurementHistoryBackup(storage);
    assert.deepEqual(restoreMeasurementHistory(storage, backup), { added: 0, skipped: 2 });
    assert.equal(backup.runs[0].panel.measurement.measuredAt, samplePanel.measurement.measuredAt);
    assert.equal(storage.getItem('bedmesh.workspace.v2'), 'existing workspace');
    assert.throws(() => restoreMeasurementHistory(storage, makeBackup([makeRun(1, { ...samplePanel, raw: '0.8' })])), /identifier conflicts/);
    assert.equal(readMeasurementHistory(storage).runs.length, 2);
});

test('invalid or oversized history restores add nothing, and quota failures roll back partial writes', () => {
    const storage = memoryStorage();
    restoreMeasurementHistory(storage, makeBackup([makeRun(1)]));
    assert.throws(() => restoreMeasurementHistory(storage, makeBackup([makeRun(2), makeRun(3, { ...samplePanel, raw: 'invalid grid' })])), /Run 2.*invalid/);
    assert.throws(() => restoreMeasurementHistory(storage, makeBackup(Array.from({ length: 50 }, (_, index) => makeRun(index + 2)))), /exceed 50/);
    assert.equal(readMeasurementHistory(storage).runs.length, 1);
    const write = storage.setItem;
    let attempts = 0;
    storage.setItem = (key, value) => {
        if (++attempts === 2) throw new DOMException('Quota reached', 'QuotaExceededError');
        write(key, value);
    };
    assert.throws(() => restoreMeasurementHistory(storage, makeBackup([makeRun(2), makeRun(3)])), /No runs were restored/);
    assert.equal(readMeasurementHistory(storage).runs.length, 1);
});
