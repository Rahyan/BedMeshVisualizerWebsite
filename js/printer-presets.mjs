import { validateMeasurement, validateSpatialSettings } from './workspace-data.mjs';
import { sampledBounds, boundsText, frontEdgeText } from './mesh-coordinates.mjs';

const PREFIX = 'bedmesh.presets.v1.';
const MAX_PRESETS = 30;

function labels(value) {
    const context = validateMeasurement({ setup: value?.setup, surface: value?.surface }, 'Preset');
    const setup = context.setup.trim().replace(/\s+/g, ' ');
    const surface = context.surface.trim().replace(/\s+/g, ' ');
    if (!setup || !surface) throw new Error('Enter a printer and build plate name.');
    return { setup, surface };
}

function keyFor({ setup, surface }) {
    return PREFIX + JSON.stringify([setup.toLowerCase(), surface.toLowerCase()]);
}

export function validatePrinterPreset(value) {
    const context = labels(value);
    const dimensions = validateSpatialSettings(value, 'Preset');
    if (typeof value.flipX !== 'boolean' || typeof value.flipY !== 'boolean') throw new Error('The preset has invalid orientation settings.');
    return { ...context, ...dimensions, flipX: value.flipX, flipY: value.flipY };
}

function readPresets(storage) {
    if (!storage) throw new Error('Printer and plate presets need browser storage.');
    const presets = new Map();
    for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (!key?.startsWith(PREFIX)) continue;
        try {
            const preset = validatePrinterPreset(JSON.parse(storage.getItem(key)));
            if (keyFor(preset) === key) presets.set(key, preset);
        } catch { /* Preserve invalid records without offering them for use. */ }
    }
    return presets;
}

function describe(preset) {
    const bounds = sampledBounds(preset);
    const area = bounds ? boundsText(bounds) : preset.width ? `${preset.width} × ${preset.depth} mm sampled area` : 'Sample indices';
    const flips = [preset.flipX && 'Flip X', preset.flipY && 'Flip Y'].filter(Boolean);
    return [area, flips.join(' and ') || 'Input orientation', frontEdgeText(preset.frontEdge, bounds)].filter(Boolean).join(' · ');
}

export function bindPrinterPresets(dialog, getStorage) {
    const choice = dialog.querySelector('#preset-choice');
    const preview = dialog.querySelector('[data-preset-preview]');
    const message = dialog.querySelector('[data-preset-message]');
    const apply = dialog.querySelector('[data-preset-apply]');
    const remove = dialog.querySelector('[data-preset-remove]');
    const cancel = dialog.querySelector('[data-preset-cancel]');
    const form = dialog.querySelector('#preset-form');
    const setup = dialog.querySelector('#preset-printer');
    const surface = dialog.querySelector('#preset-plate');
    const save = form.querySelector('button[type="submit"]');
    let presets = new Map();
    let current = null;

    function updateSaveLabel() {
        let replacing = false;
        try { replacing = presets.has(keyFor(labels({ setup: setup.value, surface: surface.value }))); }
        catch { /* The form validates labels on submission. */ }
        save.textContent = replacing ? 'Update preset' : 'Save preset';
    }

    function updateChoice() {
        const preset = presets.get(choice.value);
        preview.textContent = preset ? describe(preset) : 'Choose a preset to see its dimensions and orientation.';
        apply.disabled = remove.disabled = !preset;
        remove.textContent = 'Remove preset';
        cancel.hidden = true;
    }

    function refresh(preferred = choice.value) {
        presets = readPresets(getStorage());
        const options = [...presets].sort(([, a], [, b]) => a.setup.localeCompare(b.setup) || a.surface.localeCompare(b.surface));
        choice.replaceChildren(new Option(options.length ? 'Choose a preset' : 'No presets saved yet', ''), ...options.map(([key, preset]) =>
            new Option(`${preset.setup} · ${preset.surface}`, key)));
        choice.value = presets.has(preferred) ? preferred : '';
        updateChoice();
        updateSaveLabel();
    }

    choice.addEventListener('change', updateChoice);
    form.addEventListener('input', updateSaveLabel);
    form.addEventListener('submit', event => {
        event.preventDefault();
        if (!current) return;
        try {
            if (current.badDimensions) throw new Error('Correct the sampled XY settings in this mesh first.');
            const preset = validatePrinterPreset({ ...current.settings, setup: setup.value, surface: surface.value });
            const key = keyFor(preset);
            const storage = getStorage();
            const latest = readPresets(storage);
            if (!latest.has(key) && latest.size >= MAX_PRESETS) throw new Error('Remove a preset before saving another. This browser can hold 30 presets.');
            const existing = storage.getItem(key);
            if (existing !== null && (!presets.has(key) || JSON.stringify(presets.get(key)) !== JSON.stringify(latest.get(key)))) {
                refresh(key);
                throw new Error('That preset changed in another tab. Review its settings before updating it.');
            }
            storage.setItem(key, JSON.stringify(preset));
            refresh(key);
            message.textContent = 'Preset saved in this browser.';
        } catch (error) {
            message.textContent = error.name === 'QuotaExceededError' ? 'Browser storage is full.' : error.message;
        }
    });
    apply.addEventListener('click', () => {
        try {
            const preset = readPresets(getStorage()).get(choice.value);
            if (!preset || !current) throw new Error('Choose a saved preset first.');
            current.apply(preset);
            dialog.close();
        } catch (error) { message.textContent = error.message; }
    });
    remove.addEventListener('click', () => {
        if (cancel.hidden) {
            remove.textContent = 'Confirm removal';
            cancel.hidden = false;
            return;
        }
        try {
            getStorage().removeItem(choice.value);
            refresh('');
            message.textContent = 'Preset removed.';
            choice.focus();
        } catch { message.textContent = 'This browser could not remove the preset.'; }
    });
    cancel.addEventListener('click', () => { updateChoice(); remove.focus(); });
    window.addEventListener('storage', event => {
        if (!dialog.open || (event.key !== null && !event.key.startsWith(PREFIX))) return;
        try { refresh(); }
        catch (error) { message.textContent = error.message; }
    });
    dialog.addEventListener('close', () => { current = null; });
    return {
        show(source) {
            current = source;
            setup.value = source.setup;
            surface.value = source.surface;
            dialog.querySelector('[data-preset-target]').textContent = source.name;
            dialog.querySelector('[data-preset-current]').textContent = source.badDimensions
                ? 'Correct the sampled dimensions to save a preset from this mesh.'
                : describe(source.settings);
            message.textContent = '';
            try { refresh(''); }
            catch (error) {
                presets.clear();
                choice.replaceChildren(new Option('Presets unavailable', ''));
                updateChoice();
                updateSaveLabel();
                message.textContent = error.message;
            }
            dialog.showModal();
        },
    };
}
