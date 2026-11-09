import { formatArticleSelection } from './editor-format.mjs';

const input = document.querySelector('textarea[data-editor]');
const form = input?.closest('form');

if (input && form) {
    // Insert outside the textarea's label so buttons do not change its name.
    const label = input.closest('label');
    const tools = document.createElement('div');
    tools.className = 'editor-tools';
    tools.setAttribute('role', 'group');
    tools.setAttribute('aria-label', 'Article formatting');
    const controls = [['paragraph', 'Paragraph'], ['heading', 'Heading'], ['bold', 'Bold'], ['italic', 'Italic'], ['list', 'List'], ['code', 'Code'], ['link', 'Link']];
    for (const [action, text] of controls) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.format = action;
        button.textContent = text;
        button.setAttribute('aria-controls', input.id);
        if (action === 'bold') button.setAttribute('aria-keyshortcuts', 'Control+B Meta+B');
        if (action === 'italic') button.setAttribute('aria-keyshortcuts', 'Control+I Meta+I');
        tools.append(button);
    }
    const undo = document.createElement('button');
    undo.type = 'button'; undo.textContent = 'Undo insert'; undo.hidden = true;
    tools.append(undo);
    const status = document.createElement('p');
    status.className = 'editor-save-state'; status.setAttribute('role', 'status');
    const linkPanel = document.createElement('div');
    linkPanel.className = 'editor-link-panel'; linkPanel.hidden = true;
    const linkLabel = document.createElement('label');
    linkLabel.textContent = 'Link address';
    const linkInput = document.createElement('input');
    linkInput.type = 'text'; linkInput.inputMode = 'url'; linkInput.placeholder = 'https:// or /path';
    linkInput.autocomplete = 'off'; linkLabel.append(linkInput);
    const insertLink = document.createElement('button');
    insertLink.type = 'button'; insertLink.className = 'text-button'; insertLink.textContent = 'Insert link';
    const cancelLink = document.createElement('button');
    cancelLink.type = 'button'; cancelLink.className = 'text-button'; cancelLink.textContent = 'Cancel';
    const linkMessage = document.createElement('p');
    linkMessage.className = 'editor-link-message'; linkMessage.setAttribute('role', 'status');
    linkPanel.append(linkLabel, insertLink, cancelLink, linkMessage);
    const bodyGroup = document.createElement('div');
    bodyGroup.className = 'editor-body';
    label.before(bodyGroup);
    label.classList.add('editor-body-label');
    bodyGroup.append(label, tools, linkPanel, input, status);

    const recoveryFields = ['title', 'excerpt', 'content', 'category_id', 'status', 'existing_image', 'image_alt', 'image_caption', 'image_credit', 'image_credit_url', 'remove_image'];
    const payload = () => Object.fromEntries(recoveryFields.map(key => {
        const field = form.elements.namedItem(key);
        return [key, field?.type === 'checkbox' ? (field.checked ? '1' : '') : field?.value ?? ''];
    }));
    const signature = () => JSON.stringify([payload(), ...[...new FormData(form)].filter(([, value]) => typeof value !== 'string').map(([key, value]) => [key, value.name ? [value.name, value.size, value.lastModified] : null])]);
    const initial = signature();
    const initialErrors = form.dataset.hasUnsaved === 'true';
    let dirty = false;
    let previous = null;
    let linkSelection = null;
    let internalInput = false;
    let recoveryMessage = '';
    let scheduleRecovery = () => {};
    let invalidateRecoveryUndo = () => {};
    const beforeUnload = event => { event.preventDefault(); event.returnValue = ''; };
    const updateDirty = () => {
        const changed = initialErrors || signature() !== initial;
        if (changed !== dirty) {
            dirty = changed;
            if (dirty) window.addEventListener('beforeunload', beforeUnload);
            else window.removeEventListener('beforeunload', beforeUnload);
        }
        const message = dirty ? (recoveryMessage || 'Unsaved changes') : 'Changes save when you select Save article.';
        if (status.textContent !== message) status.textContent = message;
        status.classList.toggle('is-dirty', dirty);
    };
    const closeLink = () => {
        linkPanel.hidden = true;
        linkSelection = null;
        linkMessage.textContent = '';
        tools.querySelector('[data-format="link"]').setAttribute('aria-expanded', 'false');
    };
    const apply = (kind, href, selection = null) => {
        const source = selection ?? { value: input.value, start: input.selectionStart, end: input.selectionEnd };
        if (source.value !== input.value) throw new Error('The article changed. Select your link text again.');
        const formatted = formatArticleSelection(source.value, source.start, source.end, kind, { href });
        previous = source;
        input.value = formatted.value;
        input.focus();
        input.setSelectionRange(formatted.start, formatted.end);
        undo.hidden = false;
        internalInput = true;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        internalInput = false;
    };
    tools.querySelector('[data-format="link"]').setAttribute('aria-expanded', 'false');
    tools.addEventListener('click', event => {
        const action = event.target.closest('[data-format]')?.dataset.format;
        if (!action) return;
        if (action === 'link') {
            linkSelection = { value: input.value, start: input.selectionStart, end: input.selectionEnd };
            linkInput.value = ''; linkMessage.textContent = ''; linkPanel.hidden = false;
            tools.querySelector('[data-format="link"]').setAttribute('aria-expanded', 'true');
            linkInput.focus();
        } else {
            closeLink();
            apply(action);
        }
    });
    const completeLink = () => {
        try { apply('link', linkInput.value, linkSelection); closeLink(); }
        catch (error) { linkMessage.textContent = error.message; linkInput.focus(); }
    };
    insertLink.addEventListener('click', completeLink);
    cancelLink.addEventListener('click', () => { closeLink(); input.focus(); });
    linkInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); completeLink(); }
        if (event.key === 'Escape') { event.preventDefault(); closeLink(); tools.querySelector('[data-format="link"]').focus(); }
    });
    undo.addEventListener('click', () => {
        if (!previous) return;
        invalidateRecoveryUndo();
        input.value = previous.value; input.focus(); input.setSelectionRange(previous.start, previous.end);
        previous = null; undo.hidden = true; updateDirty(); scheduleRecovery();
    });
    input.addEventListener('keydown', event => {
        if (event.isComposing || event.repeat || !event.ctrlKey && !event.metaKey || event.altKey) return;
        if (event.key.toLowerCase() === 'b' || event.key.toLowerCase() === 'i') {
            event.preventDefault(); closeLink(); apply(event.key.toLowerCase() === 'b' ? 'bold' : 'italic');
        }
    });
    form.addEventListener('input', event => {
        invalidateRecoveryUndo();
        if (event.target === input && !internalInput) { previous = null; undo.hidden = true; }
        updateDirty();
        scheduleRecovery();
    });
    form.addEventListener('change', () => { invalidateRecoveryUndo(); updateDirty(); scheduleRecovery(); });

    const recoveryUrl = form.dataset.recoveryUrl;
    if (recoveryUrl) {
        const panel = document.createElement('section');
        panel.className = 'editor-recovery'; panel.hidden = true;
        panel.setAttribute('aria-label', 'Article recovery');
        const message = document.createElement('p');
        message.setAttribute('role', 'status');
        const actions = document.createElement('div');
        const recover = document.createElement('button');
        recover.type = 'button'; recover.className = 'text-button'; recover.textContent = 'Recover saved changes';
        const discard = document.createElement('button');
        discard.type = 'button'; discard.className = 'text-button'; discard.textContent = 'Discard recovery';
        const retry = document.createElement('button');
        retry.type = 'button'; retry.className = 'text-button'; retry.textContent = 'Check again'; retry.hidden = true;
        actions.append(recover, discard, retry); panel.append(message, actions);
        form.prepend(panel);
        let ready = false;
        let paused = true;
        let version = 0;
        let available = null;
        let timer;
        let inFlight = null;
        let submitting = false;
        let allowSubmit = false;
        let lastSaved = null;
        const versionField = form.elements.namedItem('recovery_version');
        const setVersion = (value, ownsRecovery = true) => {
            version = Number.isSafeInteger(value) && value >= 0 ? value : 0;
            // Seeing another tab's recovery is not permission to clear it on Save.
            if (versionField) versionField.value = ownsRecovery ? String(version) : '0';
        };
        const notice = (text, canRecover = false, canDiscard = false, canRetry = false) => {
            message.textContent = text;
            recover.hidden = !canRecover; discard.hidden = !canDiscard; retry.hidden = !canRetry;
            panel.hidden = false;
        };
        const request = async options => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            try {
                const response = await fetch(recoveryUrl, { credentials: 'same-origin', cache: 'no-store', ...options, signal: controller.signal, headers: { Accept: 'application/json' } });
                const data = await response.json();
                if (!response.ok || data.ok !== true) {
                    const error = new Error(response.status === 409 ? 'Recovery changed in another tab. Your form is still here. Check again before replacing it.' : response.status === 401 || response.status === 403 ? 'Recovery is paused. Sign in again in another tab, then check again.' : 'Database recovery is unavailable. Keep this page open or save the article manually.');
                    error.conflict = response.status === 409;
                    throw error;
                }
                // Signing in again rotates the session token. Refresh it through this
                // authenticated same-origin response before resuming recovery or Save.
                if (typeof data.csrf_token === 'string' && /^[a-f0-9]{64}$/.test(data.csrf_token)) {
                    const token = form.elements.namedItem('csrf_token');
                    if (token) token.value = data.csrf_token;
                }
                return data;
            } finally { clearTimeout(timeout); }
        };
        const post = (action, fields = {}) => {
            const body = new URLSearchParams({
                csrf_token: form.elements.namedItem('csrf_token')?.value ?? '', action,
                expected_version: String(version), base_version: form.elements.namedItem('edit_version')?.value ?? '0',
                ...fields,
            });
            return request({ method: 'POST', body });
        };
        const failure = error => {
            paused = true;
            recoveryMessage = 'Changes are still in this form; database recovery is paused.';
            notice(error.message || 'Database recovery is unavailable. Save manually or check again.', false, false, true);
            updateDirty();
        };
        const save = () => {
            if (!ready || paused || submitting || inFlight) return inFlight;
            const current = signature();
            if (current === lastSaved || (!dirty && version === 0)) return null;
            const snapshot = payload();
            recoveryMessage = 'Saving recovery…'; updateDirty();
            inFlight = post(dirty ? 'save' : 'discard', snapshot).then(data => {
                setVersion(data.version);
                lastSaved = current;
                const upload = [...form.querySelectorAll('input[type=file]')].some(field => field.files.length);
                recoveryMessage = !dirty ? '' : upload ? 'Text recovery saved to database. Reselect the image if you return later.' : 'Recovery saved to database. Save article to apply these changes.';
                updateDirty();
            }).catch(failure).finally(() => {
                inFlight = null;
                if (!submitting && signature() !== current) scheduleRecovery();
            });
            return inFlight;
        };
        scheduleRecovery = () => {
            clearTimeout(timer);
            if (ready && !paused && !submitting) {
                recoveryMessage = 'Unsaved changes · recovery pending'; updateDirty();
                timer = setTimeout(save, 1100);
            }
        };
        const check = () => {
            if (inFlight || submitting) return;
            invalidateRecoveryUndo();
            paused = true; ready = false;
            retry.disabled = true;
            inFlight = request().then(data => {
                setVersion(data.version, !data.available); ready = true; available = data;
                if (data.available) {
                    const stamp = typeof data.updated_at === 'string' ? data.updated_at.replace('T', ' ').replace(/Z$/, ' UTC') : '';
                    const stale = data.base_version !== data.current_version;
                    notice(`Unapplied changes are available${stamp ? ` from ${stamp}` : ''}.${stale ? ' The article has changed since this recovery; review both before saving.' : ''} Recovering replaces the text in this form. New image files must be selected again.`, true, true);
                    recoveryMessage = 'Choose whether to recover or discard the saved changes.';
                    updateDirty();
                } else {
                    panel.hidden = true; paused = false;
                    if (dirty) scheduleRecovery();
                }
            }).catch(failure).finally(() => { inFlight = null; retry.disabled = false; });
        };
        recover.addEventListener('click', () => {
            if (!available?.payload) return;
            invalidateRecoveryUndo();
            const old = payload();
            for (const key of recoveryFields) {
                const field = form.elements.namedItem(key);
                if (!field) continue;
                if (field.type === 'checkbox') field.checked = available.payload[key] === '1';
                else if (typeof available.payload[key] === 'string') field.value = available.payload[key];
            }
            // Keep the current canonical version; recovering old work is an explicit merge.
            previous = null; undo.hidden = true; paused = false;
            setVersion(version);
            available = null; lastSaved = signature();
            recoveryMessage = 'Recovered text loaded. Review it, then Save article to apply it.';
            notice('Recovered text is in the form. Review image selections and publishing status before saving.');
            const undoRecovery = document.createElement('button');
            undoRecovery.type = 'button'; undoRecovery.className = 'text-button'; undoRecovery.textContent = 'Undo recovery';
            actions.append(undoRecovery);
            invalidateRecoveryUndo = () => { undoRecovery.remove(); invalidateRecoveryUndo = () => {}; };
            undoRecovery.addEventListener('click', () => {
                for (const key of recoveryFields) {
                    const field = form.elements.namedItem(key);
                    if (!field) continue;
                    if (field.type === 'checkbox') field.checked = old[key] === '1'; else field.value = old[key];
                }
                undoRecovery.remove(); panel.hidden = true; recoveryMessage = ''; updateDirty(); scheduleRecovery();
            }, { once: true });
            updateDirty(); input.focus();
        });
        discard.addEventListener('click', () => {
            if (inFlight || submitting) return;
            discard.disabled = true;
            inFlight = post('discard').then(data => {
                setVersion(data.version); available = null; panel.hidden = true; paused = false;
                lastSaved = null; recoveryMessage = ''; updateDirty();
                if (dirty) scheduleRecovery();
            }).catch(failure).finally(() => { inFlight = null; discard.disabled = false; });
        });
        retry.addEventListener('click', check);
        form.addEventListener('submit', async event => {
            if (allowSubmit) { window.removeEventListener('beforeunload', beforeUnload); return; }
            event.preventDefault();
            if (submitting) return;
            submitting = true; clearTimeout(timer);
            // Finish an already-issued recovery write before the canonical POST clears it.
            await inFlight;
            // A new task exits the browser's original submit algorithm before resubmitting.
            setTimeout(() => {
                allowSubmit = true;
                form.requestSubmit(event.submitter || undefined);
                // Native validation can reject a field edited while the request was finishing.
                allowSubmit = false; submitting = false;
            }, 0);
        });
        check();
    } else {
        form.addEventListener('submit', () => { window.removeEventListener('beforeunload', beforeUnload); });
    }
    updateDirty();
}
