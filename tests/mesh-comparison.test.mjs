import test from 'node:test';
import assert from 'node:assert/strict';
import { compareMeshes, measureRepeatability, comparisonSections, compareAdjustmentToBaseline } from '../js/mesh-comparison.mjs';

const mesh = (values, options = {}) => ({ values, ...options });
const near = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not close to ${expected}`);

test('same-sized grids at different origins cannot be compared or included in a repeatability baseline', () => {
    const values = [[0, 1], [2, 3]];
    const bounds = { minX: -5, maxX: 195, minY: 25, maxY: 125 };
    const aligned = mesh(values, { bounds, frontEdge: 'minY' });
    const shifted = mesh(values, { bounds: { ...bounds, minX: 10, maxX: 210 } });
    for (const other of [shifted, mesh(values, { width: 200, depth: 100 })]) {
        assert.throws(() => compareMeshes(aligned, other), /sampled XY bounds differ/);
        assert.throws(() => measureRepeatability([aligned, aligned, other]), /sampled XY bounds differ/);
    }
    const result = compareMeshes(aligned, aligned);
    assert.equal(result.frontEdge, 'minY');
    assert.deepEqual(result.dimensions, { width: 200, depth: 100, bounds });
    assert.deepEqual(comparisonSections(result, { x: 0, y: 0 }).map(profile => [profile.min, profile.max]), [[-5, 195], [25, 125]]);
    assert.equal(compareMeshes(aligned, { ...aligned, frontEdge: 'maxY' }).frontEdgesDiffer, true);
});

test('after-minus-before preserves signed uniform shifts without claiming improved variation', () => {
    const result = compareMeshes(mesh([[0, 0], [0, 0]]), mesh([[0.1, 0.1], [0.1, 0.1]]));
    assert.deepEqual(result.values, [[0.1, 0.1], [0.1, 0.1]]);
    near(result.meanHeightChange, 0.1);
    near(result.stats.rms, 0.1);
    assert.equal(result.stats.range, 0);
    assert.equal(result.measuredRangeChange, 0);
    assert.deepEqual(result.range, [-0.1, 0.1]);
});

test('mixed changes use symmetric bounds and meaningful pointwise statistics', () => {
    const result = compareMeshes(mesh([[0, 0], [0, 0]]), mesh([[-0.1, 0.2], [0.3, -0.4]]));
    near(result.stats.mean, 0);
    near(result.stats.range, 0.7);
    near(result.stats.rms, Math.sqrt(0.075));
    assert.deepEqual(result.range, [-0.4, 0.4]);
});

test('identical meshes retain a usable neutral zero-centred scale', () => {
    const result = compareMeshes(mesh([[0.2]]), mesh([[0.2]]));
    assert.deepEqual(result.values, [[0]]);
    assert.deepEqual(result.range, [-0.01, 0.01]);
    assert.equal(result.stats.rms, 0);
});

test('mean reference removes each uniform offset but retains original mean-height change', () => {
    const result = compareMeshes(mesh([[0, 1], [2, 3]]), mesh([[10, 11], [12, 13]]), { reference: 'mean' });
    result.values.flat().forEach(value => near(value, 0));
    near(result.meanHeightChange, 10);
    near(result.measuredRangeChange, 0);
    near(result.stats.rms, 0);
});

test('fitted-plane reference removes independent planes without mutating either input', () => {
    const before = mesh([[0, 1, 2], [2, 3, 4], [4, 5, 6]]);
    const after = mesh([[10, 12, 14], [13, 15, 17], [16, 18, 20]]);
    const original = structuredClone([before, after]);
    const result = compareMeshes(before, after, { reference: 'plane' });
    result.values.flat().forEach(value => near(value, 0));
    assert.deepEqual([before, after], original);
    near(result.meanHeightChange, 12);
});

test('explicit independent flips align displayed points before subtraction', () => {
    const result = compareMeshes(mesh([[1, 2], [3, 4]]), mesh([[4, 3], [2, 1]], { flipX: true, flipY: true }));
    assert.deepEqual(result.values, [[0, 0], [0, 0]]);
    assert.equal(result.orientationDiffers, true);
    assert.equal(compareMeshes(mesh([[0]]), mesh([[0]])).orientationDiffers, false);
});

test('grid mismatch is rejected without interpolation, including equal cell counts', () => {
    assert.throws(() => compareMeshes(mesh([[1, 2], [3, 4]]), mesh([[1, 2, 3, 4]])), /different grid sizes/);
    assert.throws(() => compareMeshes(mesh([[1, 2]]), mesh([[1], [2]])), /different grid sizes/);
});

test('probed areas must match exactly or both meshes must use indices', () => {
    const values = [[0, 0], [0, 0]];
    assert.deepEqual(compareMeshes(mesh(values, { width: 200, depth: 220 }), mesh(values, { width: 200, depth: 220 })).dimensions, { width: 200, depth: 220 });
    for (const options of [{ width: 200, depth: 221 }, {}, { width: 200 }, { width: 0, depth: 220 }, { width: Infinity, depth: 220 }, { width: '200', depth: 220 }]) {
        assert.throws(() => compareMeshes(mesh(values, { width: 200, depth: 220 }), mesh(values, options)), /dimension|width|depth/);
    }
});

test('one-dimensional meshes support measured and mean comparison but reject plane fitting', () => {
    assert.deepEqual(compareMeshes(mesh([[1, 2]]), mesh([[2, 3]])).values, [[1, 1]]);
    assert.throws(() => compareMeshes(mesh([[1, 2]]), mesh([[2, 3]]), { reference: 'plane' }), /at least two rows/);
});

test('invalid values, references, orientations and overflowing differences fail explicitly', () => {
    for (const values of [[[NaN]], [[Infinity]], [[null]], [], [[1], [1, 2]]]) {
        assert.throws(() => compareMeshes(mesh([[0]]), mesh(values)));
    }
    assert.throws(() => compareMeshes(mesh([[0]]), mesh([[0]]), { reference: 'unknown' }), /reference/);
    assert.throws(() => compareMeshes(mesh([[0]], { flipX: 'yes' }), mesh([[0]])), /orientation/);
    assert.throws(() => compareMeshes(mesh([[-1e308]]), mesh([[1e308]])), /finite number|too large/);
});

test('report grids use the chosen reference and flips before computing the delta', () => {
    const result = compareMeshes(mesh([[2, 0]], { flipX: true }), mesh([[12, 10]]), { reference: 'mean' });
    assert.deepEqual(result.beforeValues, [[-1, 1]]);
    assert.deepEqual(result.afterValues, [[1, -1]]);
    assert.deepEqual(result.values, [[2, -2]]);
    assert.equal(result.meanHeightChange, 10);
});

test('cross-sections use the selected reference, alignment, and physical axes', () => {
    const dimensions = { width: 180, depth: 120 };
    const before = mesh([[0, 2, 4], [6, 8, 10]], { ...dimensions, flipX: true });
    const after = mesh([[12, 8, 4], [10, 6, 2]], dimensions);
    const result = compareMeshes(before, after, { reference: 'mean' });
    const [row, column] = comparisonSections(result, { x: 2, y: 0 });
    assert.deepEqual(row, { title: 'Row Y 0', axis: 'X', size: 180, selected: 2,
        before: [-1, -3, -5], after: [5, 1, -3], change: [6, 4, 2] });
    assert.deepEqual(column, { title: 'Column X 2', axis: 'Y', size: 120, selected: 0,
        before: [-5, 1], after: [-3, -5], change: [2, -6] });
    assert.throws(() => comparisonSections(result, { x: 3, y: 0 }), /inside the comparison grid/);
    assert.equal(comparisonSections(compareMeshes(mesh([[0]]), mesh([[0.1]])), { x: 0, y: 0 })[0].size, null);
});

test('baseline maps separate magnitude from direction and treat roundoff ties as within spread', () => {
    const before = mesh([[0, 0.10], [0.20, 0.30]]);
    const after = mesh([[0.06, 0.09], [0.18, 0.36]]);
    const runs = [before, mesh([[0.01, 0.11], [0.19, 0.32]]), mesh([[0.02, 0.08], [0.20, 0.36]])];
    const baseline = compareAdjustmentToBaseline(compareMeshes(before, after), runs);
    assert.equal(baseline.aboveCount, 2);
    assert.equal(baseline.pointCount, 4);
    assert.ok(Math.abs(baseline.excess[0][0] - 0.04) < 1e-12);
    assert.ok(Math.abs(baseline.excess[1][0] - 0.01) < 1e-12);
    assert.equal(baseline.excess[1][1], 0);
    assert.throws(() => compareAdjustmentToBaseline(compareMeshes(before, after), Array(3).fill(mesh([[0.1]]))), /different grid sizes/);
    const dimensions = { width: 180, depth: 120 };
    assert.throws(() => compareAdjustmentToBaseline(compareMeshes(before, after), runs.map(run => ({ ...run, ...dimensions }))), /same probed width/);
});

test('baseline spread follows the comparison’s mean reference and explicit orientation', () => {
    const before = mesh([[0, 2]]);
    const after = mesh([[1, 1]]);
    const runs = [before, mesh([[4, 2]], { flipX: true }), mesh([[5, 7]])];
    const result = compareAdjustmentToBaseline(compareMeshes(before, after, { reference: 'mean' }), runs);
    assert.ok(result.spread.values[0].every(value => value < 1e-12));
    assert.equal(result.aboveCount, 2);
});

test('repeat-run spread compares all aligned runs and finds the widest observed point', () => {
    const runs = [
        mesh([[0, 1], [2, 3]]),
        mesh([[1, 0], [3, 2]], { flipX: true }),
        mesh([[0, 2], [2, 5]]),
    ];
    const original = structuredClone(runs);
    const result = measureRepeatability(runs);
    assert.deepEqual(result.values, [[0, 1], [0, 2]]);
    assert.deepEqual(result.widest, { x: 1, y: 1, spread: 2 });
    assert.equal(result.stats.mean, 0.75);
    assert.deepEqual(runs, original);
});

test('repeat-run analysis refuses too few scans, mismatched areas and differently sized grids', () => {
    const scan = mesh([[0, 1]]);
    assert.throws(() => measureRepeatability([scan, scan]), /at least three/);
    assert.throws(() => measureRepeatability([scan, scan, mesh([[0], [1]])]), /different grid sizes/);
    assert.throws(() => measureRepeatability([scan, scan, mesh([[0, 1]], { width: 200, depth: 220 })]), /probed width and depth/);
    assert.deepEqual(measureRepeatability([scan, scan, scan]).values, [[0, 0]]);
});
