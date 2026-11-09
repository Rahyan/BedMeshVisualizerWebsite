export const BOUND_FIELDS = ['minX', 'maxX', 'minY', 'maxY'];
export const FRONT_EDGES = { minX: 'low X', maxX: 'high X', minY: 'low Y', maxY: 'high Y' };
export class SampledBoundsError extends Error {}

export function normalizeCoordinate(value) {
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return '';
    const number = Number(value);
    return Number.isFinite(number) && Math.abs(number) <= 10000 ? String(number) : '';
}

export function sampledBounds(source = {}, label = 'Mesh') {
    const inputs = BOUND_FIELDS.map(key => source[key] ?? '');
    if (inputs.every(value => value === '')) return null;
    if (inputs.some(value => normalizeCoordinate(value) === '')) {
        throw new SampledBoundsError(`${label}: enter all four sampled XY bounds between −10000 and 10000 mm, or leave all four empty.`);
    }
    const [minX, maxX, minY, maxY] = inputs.map(Number);
    const width = maxX - minX;
    const depth = maxY - minY;
    if (width < 1 || depth < 1 || width > 2000 || depth > 2000) {
        throw new SampledBoundsError(`${label}: each sampled maximum must be 1 to 2000 mm above its minimum.`);
    }
    return { minX, maxX, minY, maxY };
}

export function frontEdgeText(edge, bounds) {
    return Object.hasOwn(FRONT_EDGES, edge)
        ? `Front at ${FRONT_EDGES[edge]}${bounds ? ` (${bounds[edge]} mm)` : ''}` : '';
}

export function boundsText(bounds) {
    return `X ${bounds.minX} to ${bounds.maxX} mm · Y ${bounds.minY} to ${bounds.maxY} mm`;
}

export function axisPosition(index, count, size, start = 0, end = start + size) {
    if (size === null) return index;
    if (index === 0 || count === 1) return start;
    return index === count - 1 ? end : start + index / (count - 1) * size;
}
