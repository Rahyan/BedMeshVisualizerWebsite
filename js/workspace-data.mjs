import { BOUND_FIELDS, FRONT_EDGES, normalizeCoordinate, sampledBounds } from './mesh-coordinates.mjs';

export const MAX_PANELS = 8;
export const MAX_RAW_LENGTH = 200000;
export const MAX_WORKSPACE_FILE_SIZE = 2000000;
export const DEFAULT_SETTINGS = Object.freeze({
    scale: 'fit', reference: 'original', width: '', depth: '', flipX: false, flipY: false,
    minX: '', maxX: '', minY: '', maxY: '', frontEdge: '',
});
export const DEFAULT_MEASUREMENT = Object.freeze({ measuredAt: '', bedTemperature: '', surface: '', setup: '', notes: '' });

function validMeasuredAt(value) {
    if (value === '') return true;
    if (typeof value !== 'string') return false;
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return false;
    const [year, month, day, hour, minute, second] = match.slice(1).map(item => Number(item ?? 0));
    if (year < 1900 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return false;
    return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function measurementTemperature(value) {
    if (value === '' || value === null || value === undefined) return '';
    if (!['string', 'number'].includes(typeof value) || (typeof value === 'string' && value.trim() === '')) return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= -50 && number <= 300 ? String(number) : null;
}

/** Optional declarations; never infer measurement context from an import or clock. */
export function normalizeMeasurement(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
        measuredAt: typeof source.measuredAt === 'string' && validMeasuredAt(source.measuredAt) ? source.measuredAt : '',
        bedTemperature: measurementTemperature(source.bedTemperature) ?? '',
        surface: typeof source.surface === 'string' ? source.surface.slice(0, 80) : '',
        setup: typeof source.setup === 'string' ? source.setup.slice(0, 80) : '',
        notes: typeof source.notes === 'string' ? source.notes.slice(0, 1000) : '',
    };
}

export function validateMeasurement(value, label = 'Measurement context') {
    if (value === undefined) return { ...DEFAULT_MEASUREMENT };
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(DEFAULT_MEASUREMENT, key))) {
        throw new Error(`${label} must contain only the supported measurement fields.`);
    }
    for (const [key, limit] of Object.entries({ measuredAt: 19, surface: 80, setup: 80, notes: 1000 })) {
        if (value[key] !== undefined && (typeof value[key] !== 'string' || value[key].length > limit)) {
            throw new Error(`${label}: ${key} must be text of at most ${limit} characters.`);
        }
    }
    if (!validMeasuredAt(value.measuredAt ?? '')) throw new Error(`${label}: use a valid recorded local date and time, or leave it empty.`);
    if (measurementTemperature(value.bedTemperature) === null) throw new Error(`${label}: bed temperature must be between -50 and 300 °C, or left empty.`);
    return normalizeMeasurement(value);
}

export function normalizeSettings(value) {
    const settings = value && typeof value === 'object' ? value : {};
    const dimension = value => {
        if (value === '' || value === null || value === undefined) return '';
        if (!['number', 'string'].includes(typeof value)) return '';
        const numeric = Number(value);
        return Number.isFinite(numeric) && numeric >= 1 && numeric <= 2000 ? String(numeric) : '';
    };
    return {
        scale: settings.scale === 'fixed' ? 'fixed' : 'fit',
        reference: ['mean', 'plane'].includes(settings.reference) ? settings.reference : 'original',
        width: dimension(settings.width),
        depth: dimension(settings.depth),
        flipX: settings.flipX === true,
        flipY: settings.flipY === true,
        ...Object.fromEntries(BOUND_FIELDS.map(key => [key, normalizeCoordinate(settings[key])])),
        frontEdge: typeof settings.frontEdge === 'string' && Object.hasOwn(FRONT_EDGES, settings.frontEdge) ? settings.frontEdge : '',
    };
}

export function validateProbedDimensions(width, depth, label) {
    const dimension = (input, axis) => {
        if (input === undefined || input === null || input === '') return '';
        if (!['string', 'number'].includes(typeof input) || !Number.isFinite(Number(input)) || Number(input) < 1 || Number(input) > 2000) {
            throw new Error(`${label}: ${axis} must be between 1 and 2000 mm, or left empty.`);
        }
        return String(Number(input));
    };
    const validWidth = dimension(width, 'probed width');
    const validDepth = dimension(depth, 'probed depth');
    if ((validWidth === '') !== (validDepth === '')) throw new Error(`${label}: include both probed dimensions, or leave both empty.`);
    return { width: validWidth, depth: validDepth };
}

export function validateSpatialSettings(settings, label) {
    const dimensions = validateProbedDimensions(settings.width, settings.depth, label);
    const bounds = sampledBounds(settings, label);
    const frontEdge = settings.frontEdge ?? '';
    if (typeof frontEdge !== 'string' || (frontEdge !== '' && !Object.hasOwn(FRONT_EDGES, frontEdge))) {
        throw new Error(`${label}: choose a valid front edge or leave it unspecified.`);
    }
    return {
        ...dimensions,
        ...Object.fromEntries(BOUND_FIELDS.map(key => [key, bounds ? String(bounds[key]) : ''])),
        frontEdge,
    };
}

export function meshSpatialOptions(settings, label) {
    const stored = validateSpatialSettings(settings, label);
    const bounds = sampledBounds(stored);
    return {
        width: bounds ? bounds.maxX - bounds.minX : (stored.width === '' ? null : Number(stored.width)),
        depth: bounds ? bounds.maxY - bounds.minY : (stored.depth === '' ? null : Number(stored.depth)),
        bounds, frontEdge: stored.frontEdge,
    };
}

// Stored version 2 workspaces predate strict file imports. Keep their tolerant
// defaults and recover usable panels without evaluating IDs or input strings.
export function normalizeSnapshot(value, startId = 0) {
    if (!value || value.version !== 2 || !Array.isArray(value.panels) || value.panels.length === 0) return null;
    let nextId = Number.isSafeInteger(startId) && startId >= 0 ? startId : 0;
    const panels = [];
    const usedIds = new Set();
    const allocateId = () => {
        if (!Number.isSafeInteger(nextId) || nextId < 0) nextId = 0;
        while (usedIds.has(String(nextId))) nextId = nextId < Number.MAX_SAFE_INTEGER ? nextId + 1 : 0;
        const id = String(nextId);
        nextId = nextId < Number.MAX_SAFE_INTEGER ? nextId + 1 : 0;
        return id;
    };
    for (const panel of value.panels.slice(0, MAX_PANELS)) {
        if (!panel || typeof panel.raw !== 'string' || panel.raw.length > MAX_RAW_LENGTH) continue;
        // JSON IDs may be objects with hostile toString properties. Only coerce
        // primitive strings/numbers, then use the canonical numeric spelling.
        let id = ['string', 'number'].includes(typeof panel.id) ? String(panel.id) : '';
        if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) > 1000000 || usedIds.has(String(Number(id)))) {
            id = allocateId();
        } else id = String(Number(id));
        usedIds.add(id);
        if (Number(id) < Number.MAX_SAFE_INTEGER) nextId = Math.max(nextId, Number(id) + 1);
        panels.push({ id, name: typeof panel.name === 'string' ? panel.name.slice(0, 60) : `Mesh ${panels.length + 1}`, raw: panel.raw, settings: normalizeSettings(panel.settings), measurement: normalizeMeasurement(panel.measurement), view: panel.view === 'heatmap' ? 'heatmap' : 'surface' });
    }
    return panels.length ? { version: 2, panels, sharedScale: value.sharedScale !== false } : null;
}

// Files replace the entire current workspace, so reject every malformed panel
// rather than silently dropping any measurements during import.
export function validateWorkspaceFile(value, startId = 0) {
    const record = item => item !== null && typeof item === 'object' && !Array.isArray(item);
    const fail = message => { throw new Error(message); };
    if (!record(value) || value.version !== 2 || !Array.isArray(value.panels) || value.panels.length < 1 || value.panels.length > MAX_PANELS) {
        fail('Choose a Bed Mesh version 2 workspace file containing one to eight meshes.');
    }
    if (value.format !== undefined && value.format !== 'bedmesh-workspace') fail('This file is not a Bed Mesh workspace.');
    if (typeof value.sharedScale !== 'boolean') fail('The workspace must include a valid shared-scale setting.');
    if (value.exportedAt !== undefined && (typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt)))) fail('The workspace export date is invalid.');
    if (value.revision !== undefined && (!Number.isSafeInteger(value.revision) || value.revision < 0)) fail('The workspace revision is invalid.');
    const panels = value.panels.map((panel, index) => {
        const label = `Mesh ${index + 1}`;
        if (!record(panel) || typeof panel.raw !== 'string' || panel.raw.length > MAX_RAW_LENGTH) fail(`${label} must contain text of at most 200,000 characters.`);
        if (typeof panel.name !== 'string' || panel.name.length > 60) fail(`${label} must have a name of at most 60 characters.`);
        if (!['surface', 'heatmap'].includes(panel.view)) fail(`${label} has an unsupported chart view.`);
        const settings = panel.settings;
        if (!record(settings) || Object.keys(settings).some(key => !Object.hasOwn(DEFAULT_SETTINGS, key)) ||
            !['fit', 'fixed'].includes(settings.scale) || !['original', 'mean', 'plane'].includes(settings.reference) ||
            typeof settings.flipX !== 'boolean' || typeof settings.flipY !== 'boolean') fail(`${label} contains invalid display settings.`);
        const spatial = validateSpatialSettings(settings, label);
        const id = ['string', 'number'].includes(typeof panel.id) ? panel.id : undefined;
        const measurement = validateMeasurement(panel.measurement, `${label} measurement context`);
        return { id, name: panel.name, raw: panel.raw, view: panel.view, settings: { ...settings, ...spatial }, measurement };
    });
    return normalizeSnapshot({ version: 2, panels, sharedScale: value.sharedScale }, startId);
}
