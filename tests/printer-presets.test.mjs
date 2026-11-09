import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePrinterPreset } from '../js/printer-presets.mjs';

test('presets validate geometry and contain only reusable labels and orientation', () => {
    const source = {
        setup: ' Printer   A ', surface: 'Textured PEI', width: 180, depth: '210.5',
        flipX: true, flipY: false, minX: 15, maxX: '195', minY: -4, maxY: 206.5, frontEdge: 'minY',
        bedTemperature: 70, notes: 'Run-specific note', measuredAt: '2026-11-09T14:32',
    };
    assert.deepEqual(validatePrinterPreset(source), {
        setup: 'Printer A', surface: 'Textured PEI', width: '180', depth: '210.5', flipX: true, flipY: false,
        minX: '15', maxX: '195', minY: '-4', maxY: '206.5', frontEdge: 'minY',
    });
    assert.throws(() => validatePrinterPreset({ ...source, depth: '' }), /both probed dimensions/);
    assert.throws(() => validatePrinterPreset({ ...source, setup: ' ' }), /printer and build plate name/);
    assert.throws(() => validatePrinterPreset({ ...source, flipX: 'true' }), /invalid orientation/);
});
