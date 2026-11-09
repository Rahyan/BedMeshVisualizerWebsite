import { MAX_PANELS, validateWorkspaceFile } from './workspace-data.mjs';
import { analyzeMesh, parseMesh } from './mesh-data.mjs';

const PREFIX = 'bedmesh.history.v1.';
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const MAX_RUNS = 50;
const MAX_BACKUP_BYTES = 12_000_000;
const BACKUP_FORMAT = 'bedmesh-measurement-history';

function historyKey(key) {
    return key?.startsWith(PREFIX) && ID.test(key.slice(PREFIX.length));
}

function validateRun(panel) {
    return validateWorkspaceFile({ version: 2, sharedScale: true, panels: [panel] }).panels[0];
}

function validateEntry(entry) {
    if (!Number.isSafeInteger(entry?.savedAt) || entry.savedAt < 0 ||
        !Number.isFinite(new Date(entry.savedAt).getTime())) throw new Error('Invalid saved run date.');
    return { version: 1, savedAt: entry.savedAt, panel: validateRun(entry.panel) };
}

function parseStoredEntry(raw) {
    const entry = JSON.parse(raw);
    if (entry?.version !== 1) throw new Error('Unsupported saved run.');
    return validateEntry(entry);
}

// Cooperating tabs serialize writes when the browser exposes Web Locks.
export function updateMeasurementHistory(operation) {
    const locks = globalThis.navigator?.locks;
    return locks ? locks.request('bedmesh.measurement-history', operation) : Promise.resolve().then(operation);
}

export function readMeasurementHistory(storage) {
    const keys = [];
    for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (historyKey(key)) keys.push(key);
    }
    const runs = [];
    let unreadable = 0;
    for (const key of keys) {
        const raw = storage.getItem(key);
        if (raw === null) continue;
        try {
            const { savedAt, panel } = parseStoredEntry(raw);
            runs.push({ key, savedAt, panel });
        } catch {
            unreadable++;
        }
    }
    runs.sort((a, b) => b.savedAt - a.savedAt || a.key.localeCompare(b.key));
    return { runs, unreadable };
}

export function saveMeasurementRun(storage, panel) {
    if (!storage) throw new Error('Measurement history needs browser storage.');
    const valid = validateRun(panel);
    const { runs, unreadable } = readMeasurementHistory(storage);
    if (runs.length + unreadable >= MAX_RUNS) throw new Error('History holds up to 50 runs. Remove a run before saving another.');
    const key = PREFIX + crypto.randomUUID();
    if (storage.getItem(key) !== null) throw new Error('A run with this identifier already exists. Try again.');
    try {
        storage.setItem(key, JSON.stringify({ version: 1, savedAt: Date.now(), panel: valid }));
    } catch (error) {
        if (error.name === 'QuotaExceededError') throw new Error('Browser storage is full. Remove a saved run or export your current workspace.');
        throw new Error('This browser could not save the run.');
    }
}

export function measurementHistoryBackup(storage) {
    const { runs, unreadable } = readMeasurementHistory(storage);
    return {
        backup: { format: BACKUP_FORMAT, version: 1, runs: runs.map(({ key, savedAt, panel }) => ({ id: key.slice(PREFIX.length), savedAt, panel })) },
        unreadable,
    };
}

export function restoreMeasurementHistory(storage, backup) {
    if (!storage) throw new Error('Measurement history needs browser storage.');
    if (backup?.format !== BACKUP_FORMAT || backup.version !== 1 ||
        !Array.isArray(backup.runs) || backup.runs.length > MAX_RUNS) {
        throw new Error('Choose a Bed Mesh measurement history backup with up to 50 runs.');
    }
    const incoming = new Map();
    backup.runs.forEach((run, index) => {
        try {
            if (typeof run?.id !== 'string' || !ID.test(run.id) || incoming.has(PREFIX + run.id)) {
                throw new Error('Invalid or repeated run identifier.');
            }
            const entry = validateEntry(run);
            analyzeMesh(parseMesh(entry.panel.raw).values);
            incoming.set(PREFIX + run.id, JSON.stringify(entry));
        } catch {
            throw new Error(`Run ${index + 1} in this backup is invalid. History was left intact.`);
        }
    });
    const additions = [];
    for (const [key, raw] of incoming) {
        const current = storage.getItem(key);
        if (current === null) {
            additions.push([key, raw]);
            continue;
        }
        let same = false;
        try { same = JSON.stringify(parseStoredEntry(current)) === raw; }
        catch { /* An unreadable existing record must also be preserved. */ }
        if (!same) throw new Error('A run identifier conflicts with this history. No runs were restored.');
    }
    const { runs, unreadable } = readMeasurementHistory(storage);
    if (runs.length + unreadable + additions.length > MAX_RUNS) {
        throw new Error('Restoring this backup would exceed 50 saved runs. Make room before restoring it.');
    }
    const written = [];
    try {
        for (const [key, raw] of additions) {
            if (storage.getItem(key) !== null) throw new Error('History changed during the restore.');
            storage.setItem(key, raw);
            written.push([key, raw]);
        }
    } catch (error) {
        try {
            for (const [key, raw] of written.reverse()) {
                if (storage.getItem(key) === raw) storage.removeItem(key);
            }
        } catch {
            throw new Error('The browser blocked cleanup after a restore error. Check which runs were added before retrying.');
        }
        if (error.name === 'QuotaExceededError') throw new Error('Browser storage is full. No runs were restored.');
        throw new Error('History could not be updated. No runs were restored.');
    }
    return { added: additions.length, skipped: incoming.size - additions.length };
}

export function bindMeasurementHistory(dialog, { getStorage, openRuns, downloadFile }) {
    const list = dialog.querySelector('[data-history-list]');
    const printer = dialog.querySelector('#history-printer');
    const plate = dialog.querySelector('#history-plate');
    const message = dialog.querySelector('[data-history-message]');
    const count = dialog.querySelector('[data-history-count]');
    const open = dialog.querySelector('[data-history-open]');
    const backupButton = dialog.querySelector('[data-history-backup]');
    const restoreButton = dialog.querySelector('[data-history-restore]');
    const restoreFile = dialog.querySelector('#history-restore-file');
    const selected = new Set();
    const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    let runs = [];
    let restoreToken = 0;

    function setFilters(select, values, title) {
        const previous = select.value;
        const choices = [...new Set(values)].sort((a, b) => a.localeCompare(b));
        select.replaceChildren(new Option(title, ''), ...choices.map(value => new Option(value || 'Not recorded', `label:${value}`)));
        select.value = Array.from(select.options).some(option => option.value === previous) ? previous : '';
    }

    function updateSelection() {
        const order = [...selected];
        for (const input of list.querySelectorAll('input[type="checkbox"]')) {
            const position = order.indexOf(input.value);
            input.checked = position !== -1;
            input.disabled = position === -1 && order.length === MAX_PANELS;
            input.closest('label').querySelector('[data-history-order]').textContent = position < 0 ? '' :
                order.length === 2 ? ['Before', 'After'][position] : String(position + 1);
        }
        count.textContent = order.length ? `${order.length} selected` : `Select up to ${MAX_PANELS} runs`;
        open.disabled = order.length === 0;
        open.textContent = order.length < 2 ? 'Open run' : order.length === 2 ? 'Open comparison' : 'Open repeat runs';
    }

    function showRuns() {
        const visible = runs.filter(({ panel }) => (!printer.value || printer.value === `label:${panel.measurement.setup.trim()}`) &&
            (!plate.value || plate.value === `label:${panel.measurement.surface.trim()}`));
        list.replaceChildren();
        for (const { key, savedAt, panel } of visible) {
            const row = document.createElement('li');
            const label = document.createElement('label');
            const input = document.createElement('input');
            const body = document.createElement('span');
            const name = document.createElement('strong');
            const context = document.createElement('small');
            const order = document.createElement('span');
            const remove = document.createElement('button');
            const cancel = document.createElement('button');
            input.type = 'checkbox';
            input.value = key;
            name.textContent = panel.name;
            const { setup, surface, measuredAt } = panel.measurement;
            context.textContent = [setup.trim() || 'Printer unrecorded', surface.trim() || 'Build plate unrecorded',
                measuredAt ? `Measured ${measuredAt.replace('T', ' ')}` : `Saved ${date.format(savedAt)}`].join(' · ');
            order.dataset.historyOrder = '';
            body.append(name, context);
            label.append(input, body, order);
            remove.type = cancel.type = 'button';
            remove.className = cancel.className = 'text-button';
            remove.textContent = 'Remove';
            remove.setAttribute('aria-label', `Remove ${panel.name} from history`);
            cancel.textContent = 'Cancel';
            cancel.hidden = true;
            row.append(label, remove, cancel);
            list.append(row);
            input.addEventListener('change', () => {
                if (input.checked) selected.add(key);
                else selected.delete(key);
                updateSelection();
            });
            remove.addEventListener('click', async () => {
                if (cancel.hidden) {
                    cancel.hidden = false;
                    remove.textContent = 'Confirm remove';
                    remove.setAttribute('aria-label', `Confirm remove ${panel.name}`);
                    return;
                }
                remove.disabled = cancel.disabled = true;
                try {
                    await updateMeasurementHistory(() => getStorage().removeItem(key));
                    selected.delete(key);
                    refresh();
                    message.textContent = `Removed ${panel.name} from history.`;
                    if (dialog.open) printer.focus();
                } catch {
                    message.textContent = 'This browser could not remove the run.';
                } finally {
                    remove.disabled = cancel.disabled = false;
                }
            });
            cancel.addEventListener('click', () => {
                cancel.hidden = true;
                remove.textContent = 'Remove';
                remove.setAttribute('aria-label', `Remove ${panel.name} from history`);
                remove.focus();
            });
        }
        if (!visible.length) {
            const empty = document.createElement('li');
            empty.textContent = runs.length ? 'No runs match these filters.' : 'Save a visualized mesh to start your history.';
            list.append(empty);
        }
        updateSelection();
    }

    function refresh() {
        message.textContent = '';
        try {
            const storage = getStorage();
            if (!storage) throw new Error('Storage is unavailable.');
            const result = readMeasurementHistory(storage);
            runs = result.runs;
            if (result.unreadable) message.textContent = `${result.unreadable} saved entries could not be read.`;
        } catch {
            runs = [];
            message.textContent = 'Measurement history is unavailable in this browser.';
        }
        const available = new Set(runs.map(run => run.key));
        backupButton.disabled = !runs.length;
        for (const key of selected) if (!available.has(key)) selected.delete(key);
        setFilters(printer, runs.map(run => run.panel.measurement.setup.trim()), 'All printers');
        setFilters(plate, runs.map(run => run.panel.measurement.surface.trim()), 'All build plates');
        showRuns();
    }

    open.addEventListener('click', () => {
        try {
            // Read the current records again in case another tab removed a selection.
            const current = new Map(readMeasurementHistory(getStorage()).runs.map(run => [run.key, run.panel]));
            const panels = [...selected].map(key => current.get(key));
            if (panels.some(panel => !panel)) {
                refresh();
                throw new Error('A selected run was removed in another tab. Check your selection.');
            }
            openRuns(panels);
            dialog.close();
        } catch (error) {
            message.textContent = error.message;
        }
    });
    backupButton.addEventListener('click', () => {
        try {
            const { backup, unreadable } = measurementHistoryBackup(getStorage());
            const file = new Blob([JSON.stringify(backup)], { type: 'application/json' });
            if (file.size > MAX_BACKUP_BYTES) throw new Error('The history is too large for a single backup file.');
            downloadFile(file, 'bed-mesh-history.json');
            const count = backup.runs.length;
            message.textContent = `Backup prepared with ${count} saved ${count === 1 ? 'run' : 'runs'}.` +
                (unreadable ? ` Skipped ${unreadable} unreadable entries.` : '');
        } catch (error) {
            message.textContent = error.message;
        }
    });
    restoreButton.addEventListener('click', () => restoreFile.click());
    restoreFile.addEventListener('change', async () => {
        const file = restoreFile.files?.[0];
        restoreFile.value = '';
        if (!file) return;
        const token = ++restoreToken;
        restoreButton.disabled = true;
        try {
            if (file.size > MAX_BACKUP_BYTES) throw new Error('Choose a history backup smaller than 12 MB.');
            const text = await file.text();
            let backup;
            try { backup = JSON.parse(text); }
            catch { throw new Error('This file is not a valid JSON backup.'); }
            const result = await updateMeasurementHistory(() => {
                if (token !== restoreToken || !dialog.open) return null;
                return restoreMeasurementHistory(getStorage(), backup);
            });
            if (!result || token !== restoreToken) return;
            refresh();
            message.textContent = `Restored ${result.added} ${result.added === 1 ? 'run' : 'runs'}. Skipped ${result.skipped} already saved.`;
        } catch (error) {
            if (token === restoreToken) message.textContent = error.message;
        } finally {
            if (token === restoreToken) restoreButton.disabled = false;
        }
    });
    printer.addEventListener('change', showRuns);
    plate.addEventListener('change', showRuns);
    dialog.addEventListener('close', () => {
        restoreToken++;
        restoreButton.disabled = false;
        selected.clear();
    });
    window.addEventListener('storage', event => {
        if (dialog.open && (event.key === null || historyKey(event.key))) refresh();
    });
    return {
        show() {
            refresh();
            dialog.showModal();
        },
    };
}
