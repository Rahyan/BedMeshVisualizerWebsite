import { meshSpatialOptions, validateWorkspaceFile, validateMeasurement } from './workspace-data.mjs';
import { analyzeMesh, parseMesh } from './mesh-data.mjs';
import { compareMeshes, compareAdjustmentToBaseline, comparisonSections } from './mesh-comparison.mjs';

const SESSION_PREFIX = 'bedmesh.calibration.v1.';
const MAX_SESSIONS = 25;

export function sessionPanelMesh(panel) {
    const { flipX, flipY } = panel.settings;
    return { values: parseMesh(panel.raw).values, flipX, flipY, ...meshSpatialOptions(panel.settings, panel.name) };
}

function normalizeSession(value) {
    if (value?.version !== 1 || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80 ||
        !Number.isSafeInteger(value.savedAt) || value.savedAt < 0 || !Number.isFinite(new Date(value.savedAt).getTime())) {
        throw new Error('A calibration session needs a name of up to 80 characters and a valid save date.');
    }
    const metadata = validateMeasurement({ setup: value.setup, surface: value.surface, notes: value.notes }, 'Session');
    const workspace = validateWorkspaceFile(value.workspace);
    const ids = new Set(workspace.panels.map(panel => panel.id));
    const { beforeId, afterId, baselineIds, reference, point, pin } = value;
    if (!ids.has(beforeId) || !ids.has(afterId) || beforeId === afterId ||
        !Array.isArray(baselineIds) || baselineIds.length < 3 || new Set(baselineIds).size !== baselineIds.length ||
        baselineIds.some(id => id === afterId || !ids.has(id)) ||
        new Set([beforeId, afterId, ...baselineIds]).size !== ids.size) {
        throw new Error('A session needs a Before/After pair and at least three distinct baseline scans. After cannot be part of the baseline.');
    }
    if (!['original', 'mean', 'plane'].includes(reference) || ![null, 'before', 'after'].includes(pin)) {
        throw new Error('The saved height reference or marked run is invalid.');
    }
    if (point !== null && (!Number.isInteger(point?.x) || !Number.isInteger(point?.y))) {
        throw new Error('The session’s selected point is invalid.');
    }
    return { version: 1, name: value.name.trim(), savedAt: value.savedAt, setup: metadata.setup.trim(), surface: metadata.surface.trim(),
        notes: metadata.notes.trim(), workspace, beforeId, afterId, baselineIds: [...baselineIds], reference,
        point: point ? { x: point.x, y: point.y } : null, pin };
}

export function validateCalibrationSession(value) {
    const session = normalizeSession(value);
    const meshes = new Map(session.workspace.panels.map(panel => {
        const mesh = sessionPanelMesh(panel);
        analyzeMesh(mesh.values);
        return [panel.id, mesh];
    }));
    const comparison = compareMeshes(meshes.get(session.beforeId), meshes.get(session.afterId), { reference: session.reference });
    compareAdjustmentToBaseline(comparison, session.baselineIds.map(id => meshes.get(id)));
    if (session.point) comparisonSections(comparison, session.point);
    return session;
}

function sessionKeys(storage) {
    if (!storage) throw new Error('Calibration sessions need browser storage.');
    const keys = [];
    for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (key?.startsWith(SESSION_PREFIX)) keys.push(key);
    }
    return keys;
}

function storeSession(storage, key, session) {
    try { storage.setItem(key, JSON.stringify(session)); }
    catch (error) {
        if (error.name === 'QuotaExceededError') throw new Error('Browser storage is full. Remove an unused session or save the open meshes as a workspace file.');
        throw new Error('This browser could not save the session.');
    }
}

function readSession(storage, key) {
    if (!key.startsWith(SESSION_PREFIX)) throw new Error('Choose a saved session.');
    const raw = storage.getItem(key);
    if (raw === null) throw new Error('That session is no longer saved in this browser.');
    return normalizeSession(JSON.parse(raw));
}

export function bindCalibrationSessions(dialog, { getStorage, openSession, compareWithReference, getOpenMeshes, onSaved }) {
    const library = dialog.querySelector('[data-session-library]');
    const form = dialog.querySelector('#session-form');
    const choice = dialog.querySelector('#session-choice');
    const preview = dialog.querySelector('[data-session-preview]');
    const notes = dialog.querySelector('[data-session-notes]');
    const pin = dialog.querySelector('#session-reference');
    const target = dialog.querySelector('#session-target');
    const open = dialog.querySelector('[data-session-open]');
    const mark = dialog.querySelector('[data-session-mark]');
    const compare = dialog.querySelector('[data-session-compare]');
    const remove = dialog.querySelector('[data-session-remove]');
    const cancel = dialog.querySelector('[data-session-cancel]');
    const message = dialog.querySelector('[data-session-message]');
    const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    let sessions = new Map();
    let draft = null;

    function updateChoice() {
        const session = sessions.get(choice.value);
        open.disabled = mark.disabled = remove.disabled = pin.disabled = !session;
        pin.value = session?.pin ?? '';
        target.disabled = !session?.pin;
        compare.disabled = !session?.pin || !target.value;
        cancel.hidden = true;
        remove.textContent = 'Remove session';
        notes.textContent = session?.notes ?? '';
        if (!session) { preview.textContent = ''; return; }
        const name = id => session.workspace.panels.find(panel => panel.id === id).name;
        pin.options[1].text = `Before · ${name(session.beforeId)}`;
        pin.options[2].text = `After · ${name(session.afterId)}`;
        preview.textContent = [session.setup, session.surface, date.format(session.savedAt),
            `${session.baselineIds.length} baseline scans`, session.pin ? `Reference: ${name(session[session.pin + 'Id'])}` : ''].filter(Boolean).join(' · ');
    }

    function refresh(preferred = choice.value) {
        sessions = new Map();
        const storage = getStorage();
        for (const key of sessionKeys(storage)) {
            try { sessions.set(key, readSession(storage, key)); }
            catch { /* Corrupt records stay in storage and are not offered for use. */ }
        }
        const sorted = [...sessions].sort(([, a], [, b]) => b.savedAt - a.savedAt);
        choice.replaceChildren(new Option(sorted.length ? 'Choose a saved session' : 'No sessions saved yet', ''), ...sorted.map(([key, session]) =>
            new Option([session.name, session.setup, session.surface].filter(Boolean).join(' · '), key)));
        choice.value = sessions.has(preferred) ? preferred : '';
        const previousTarget = target.value;
        target.replaceChildren(new Option('Choose an open mesh', ''), ...getOpenMeshes().map(({ id, name }) => new Option(name, id)));
        target.value = Array.from(target.options).some(option => option.value === previousTarget) ? previousTarget : '';
        updateChoice();
    }

    function act(action) {
        message.textContent = '';
        try { action(); }
        catch (error) { message.textContent = error.message; }
    }

    form.addEventListener('submit', event => {
        event.preventDefault();
        if (!draft) return;
        act(() => {
            const storage = getStorage();
            if (sessionKeys(storage).length >= MAX_SESSIONS) throw new Error('This browser can hold 25 calibration sessions. Remove an unused session to save another.');
            const fields = Object.fromEntries(new FormData(form));
            const session = validateCalibrationSession({ ...draft, ...fields, version: 1, savedAt: Date.now(), pin: null });
            const key = SESSION_PREFIX + crypto.randomUUID();
            if (storage.getItem(key) !== null) throw new Error('The session identifier is already in use. Try saving again.');
            storeSession(storage, key, session);
            onSaved(session);
            dialog.close();
        });
    });
    choice.addEventListener('change', updateChoice);
    target.addEventListener('change', () => { compare.disabled = !sessions.get(choice.value)?.pin || !target.value; });
    open.addEventListener('click', () => act(() => {
        openSession(validateCalibrationSession(readSession(getStorage(), choice.value)));
        dialog.close();
    }));
    mark.addEventListener('click', () => act(() => {
        const storage = getStorage();
        const session = readSession(storage, choice.value);
        session.pin = pin.value || null;
        storeSession(storage, choice.value, session);
        refresh();
        message.textContent = session.pin ? 'Reference run saved.' : 'Reference cleared.';
    }));
    compare.addEventListener('click', () => act(() => {
        compareWithReference(validateCalibrationSession(readSession(getStorage(), choice.value)), target.value);
        dialog.close();
    }));
    remove.addEventListener('click', () => act(() => {
        if (cancel.hidden) {
            remove.textContent = 'Confirm removal';
            cancel.hidden = false;
            return;
        }
        getStorage().removeItem(choice.value);
        refresh('');
        message.textContent = 'Session removed.';
        choice.focus();
    }));
    cancel.addEventListener('click', () => { updateChoice(); remove.focus(); });
    dialog.addEventListener('close', () => { draft = null; });
    window.addEventListener('storage', event => {
        if (dialog.open && !library.hidden && (event.key === null || event.key.startsWith(SESSION_PREFIX))) act(() => refresh());
    });
    return {
        showLibrary() {
            library.hidden = false;
            form.hidden = true;
            act(() => refresh());
            dialog.showModal();
        },
        showSave(snapshot, context) {
            draft = snapshot;
            library.hidden = true;
            form.hidden = false;
            form.reset();
            form.elements.setup.value = context.setup;
            form.elements.surface.value = context.surface;
            message.textContent = '';
            dialog.showModal();
            form.elements.name.focus();
        },
    };
}
