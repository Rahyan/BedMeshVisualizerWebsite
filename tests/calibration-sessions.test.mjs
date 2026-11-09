import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCalibrationSession } from '../js/calibration-sessions.mjs';
import { DEFAULT_SETTINGS } from '../js/workspace-data.mjs';

function exampleSession() {
    const panels = ['0 0.1\n0.2 0.3', '0.06 0.09\n0.18 0.36', '0.01 0.11\n0.19 0.32', '0.02 0.08\n0.2 0.36']
        .map((raw, index) => ({ id: String(index), name: `Run ${index + 1}`, raw, settings: { ...DEFAULT_SETTINGS }, view: 'heatmap' }));
    return { version: 1, name: 'After levelling', savedAt: 123, setup: 'Printer A', surface: 'PEI', notes: 'One adjustment',
        workspace: { version: 2, sharedScale: true, panels }, beforeId: '0', afterId: '1',
        baselineIds: ['0', '2', '3'], reference: 'original', point: { x: 1, y: 0 }, pin: 'after' };
}

test('a saved session keeps independent scans, roles, point, and reference metadata', () => {
    const source = exampleSession();
    const spatial = { minX: '20', maxX: '200', minY: '-15', maxY: '165', frontEdge: 'minY' };
    for (const panel of source.workspace.panels) Object.assign(panel.settings, spatial);
    const saved = validateCalibrationSession(source);
    source.workspace.panels[0].raw = '0.7';
    source.baselineIds.pop();
    assert.deepEqual(saved.baselineIds, ['0', '2', '3']);
    assert.equal(saved.workspace.panels[0].raw, '0 0.1\n0.2 0.3');
    assert.deepEqual(saved.workspace.panels[0].settings, { ...DEFAULT_SETTINGS, ...spatial });
    assert.deepEqual(saved.point, { x: 1, y: 0 });
    assert.equal(saved.pin, 'after');
    assert.equal(saved.notes, 'One adjustment');
});

test('sessions reject repeated or post-adjustment baseline roles, mismatched geometry, and invalid points', () => {
    const source = exampleSession();
    for (const baselineIds of [['0', '2', '2'], ['0', '2', '1'], ['0', '2']]) {
        assert.throws(() => validateCalibrationSession({ ...source, baselineIds }), /three distinct baseline/);
    }
    assert.throws(() => validateCalibrationSession({ ...source, point: { x: 2, y: 0 } }), /inside the comparison grid/);
    source.workspace.panels[3].settings.width = '180';
    source.workspace.panels[3].settings.depth = '120';
    assert.throws(() => validateCalibrationSession(source), /same probed width/);
});
