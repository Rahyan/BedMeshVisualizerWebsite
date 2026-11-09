import { calculateStats, transformMesh, removeFittedTilt } from './mesh-data.mjs';
import { BOUND_FIELDS, sampledBounds } from './mesh-coordinates.mjs';

function dimensions(mesh, label) {
    const bounds = mesh.bounds ? sampledBounds(mesh.bounds, label) : null;
    if (bounds) return { width: bounds.maxX - bounds.minX, depth: bounds.maxY - bounds.minY, bounds };
    const width = mesh.width ?? null;
    const depth = mesh.depth ?? null;
    for (const value of [width, depth]) {
        if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > 2000)) {
            throw new Error(`${label}: probed dimensions must be between 1 and 2000 mm, or both left empty.`);
        }
    }
    if ((width === null) !== (depth === null)) throw new Error(`${label}: enter both probed dimensions, or leave both empty.`);
    return { width, depth };
}

function orientedValues(mesh, reference, label) {
    for (const key of ['flipX', 'flipY']) {
        if (mesh[key] !== undefined && typeof mesh[key] !== 'boolean') throw new Error(`${label}: orientation settings must be true or false.`);
    }
    if (reference === 'plane' && (mesh.values.length < 2 || mesh.values[0].length < 2)) {
        throw new Error('Fitted-plane comparison needs at least two rows and two columns in each mesh. Choose measured heights or the mean reference.');
    }
    const source = reference === 'plane' ? removeFittedTilt(mesh.values) : mesh.values;
    return transformMesh(source, { flipX: mesh.flipX ?? false, flipY: mesh.flipY ?? false, center: reference === 'mean' });
}

function matchGrid(first, other, firstDimensions, otherDimensions) {
    if (first.values.length !== other.values.length || first.values[0].length !== other.values[0].length) {
        throw new Error('The meshes have different grid sizes. A pointwise comparison needs the same number of rows and columns; no interpolation is applied.');
    }
    if (BOUND_FIELDS.some(key => firstDimensions.bounds?.[key] !== otherDimensions.bounds?.[key])) {
        throw new Error('The sampled XY bounds differ or are missing from one scan. Use matching X and Y minima and maxima to compare the same points.');
    }
    if (firstDimensions.width !== otherDimensions.width || firstDimensions.depth !== otherDimensions.depth) {
        throw new Error('Use the same probed width and depth for all selected meshes, or leave all dimensions empty to compare sample indices.');
    }
}

function validateReference(reference) {
    if (!['original', 'mean', 'plane'].includes(reference)) throw new Error('Choose measured heights, the mean, or the fitted-plane reference.');
}

/**
 * Pointwise after-minus-before comparison, without resampling or interpolation.
 * Explicit flips map each input to its displayed X/Y order; users establish
 * whether those coordinates refer to the same physical points. Equal numeric
 * dimensions cannot establish a shared probing origin or physical area.
 */
export function compareMeshes(before, after, { reference = 'original' } = {}) {
    validateReference(reference);
    if (!before || !after) throw new Error('Choose two visualized meshes to compare.');
    const beforeStats = calculateStats(before.values);
    const afterStats = calculateStats(after.values);
    const rows = before.values.length;
    const columns = before.values[0].length;
    const beforeDimensions = dimensions(before, 'Before mesh');
    const afterDimensions = dimensions(after, 'After mesh');
    matchGrid(before, after, beforeDimensions, afterDimensions);
    const first = orientedValues(before, reference, 'Before mesh');
    const second = orientedValues(after, reference, 'After mesh');
    const values = second.map((row, y) => row.map((value, x) => value - first[y][x]));
    const stats = calculateStats(values);
    const scale = Math.max(Math.abs(stats.min), Math.abs(stats.max));
    const rms = scale === 0 ? 0 : Math.sqrt(values.flat().reduce((sum, value) => sum + (value / scale) ** 2, 0) / (rows * columns)) * scale;
    const meanHeightChange = afterStats.mean - beforeStats.mean;
    const measuredRangeChange = afterStats.range - beforeStats.range;
    if (![rms, meanHeightChange, measuredRangeChange].every(Number.isFinite)) throw new Error('These height differences are too large to compare.');
    const limit = Math.max(scale, 0.01);
    return {
        values, beforeValues: first, afterValues: second, rows, columns, reference,
        range: [-limit, limit],
        stats: { ...stats, rms },
        meanHeightChange, measuredRangeChange,
        dimensions: beforeDimensions,
        orientationDiffers: Boolean(before.flipX) !== Boolean(after.flipX) || Boolean(before.flipY) !== Boolean(after.flipY),
        frontEdge: before.frontEdge === after.frontEdge ? (before.frontEdge ?? '') : '',
        frontEdgesDiffer: Boolean(before.frontEdge && after.frontEdge && before.frontEdge !== after.frontEdge),
    };
}

/** Observed max minus min at each aligned point, using the requested reference. */
export function measureRepeatability(runs, { reference = 'original' } = {}) {
    validateReference(reference);
    if (runs.length < 3) throw new Error('Select at least three visualized runs.');
    const first = runs[0];
    const area = dimensions(first, 'Run 1');
    const grids = runs.map((run, index) => {
        const label = `Run ${index + 1}`;
        calculateStats(run.values);
        matchGrid(first, run, area, dimensions(run, label));
        return orientedValues(run, reference, label);
    });
    let widest = { x: 0, y: 0, spread: -1 };
    const values = grids[0].map((row, y) => row.map((value, x) => {
        let low = value;
        let high = value;
        for (const grid of grids) {
            low = Math.min(low, grid[y][x]);
            high = Math.max(high, grid[y][x]);
        }
        const spread = high - low;
        if (spread > widest.spread) widest = { x, y, spread };
        return spread;
    }));
    const frontEdge = runs.every(run => run.frontEdge === first.frontEdge) ? (first.frontEdge ?? '') : '';
    return { values, dimensions: area, frontEdge, stats: calculateStats(values), widest };
}

export function compareAdjustmentToBaseline(comparison, runs) {
    const spread = measureRepeatability(runs, { reference: comparison.reference });
    matchGrid(comparison, spread, comparison.dimensions, spread.dimensions);
    let aboveCount = 0;
    let maxExcess = 0;
    const excess = comparison.values.map((row, y) => row.map((delta, x) => {
        const magnitude = Math.abs(delta);
        const observed = spread.values[y][x];
        const margin = magnitude - observed;
        // Ignore floating-point ties from subtraction and plane fitting.
        if (margin <= 16 * Number.EPSILON * Math.max(1, magnitude, observed)) return 0;
        aboveCount++;
        maxExcess = Math.max(maxExcess, margin);
        return margin;
    }));
    return { spread, excess, aboveCount, maxExcess, pointCount: comparison.rows * comparison.columns };
}

/** Sampled profiles through a point in the displayed, aligned grid. */
export function comparisonSections(result, { x, y }) {
    if (!Number.isInteger(x) || !Number.isInteger(y) ||
        x < 0 || x >= result.columns || y < 0 || y >= result.rows) {
        throw new Error('Choose a point inside the comparison grid.');
    }
    const { beforeValues, afterValues, values, dimensions } = result;
    return [
        { title: `Row Y ${y}`, axis: 'X', size: dimensions.width, selected: x,
            ...(dimensions.bounds && { min: dimensions.bounds.minX, max: dimensions.bounds.maxX }),
            before: beforeValues[y], after: afterValues[y], change: values[y] },
        { title: `Column X ${x}`, axis: 'Y', size: dimensions.depth, selected: y,
            ...(dimensions.bounds && { min: dimensions.bounds.minY, max: dimensions.bounds.maxY }),
            before: beforeValues.map(row => row[x]), after: afterValues.map(row => row[x]), change: values.map(row => row[x]) },
    ];
}
