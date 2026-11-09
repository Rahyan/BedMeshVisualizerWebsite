import { findMeshReports } from './mesh-data.mjs';
import { MAX_RAW_LENGTH } from './workspace-data.mjs';

export function bindLogPicker(dialog, openReports) {
    const input = dialog.querySelector('textarea');
    const results = dialog.querySelector('[data-log-results]');
    const message = dialog.querySelector('[data-log-message]');
    const before = dialog.querySelector('#log-before');
    const after = dialog.querySelector('#log-after');
    const use = dialog.querySelector('[data-log-open]');
    let reports = [];
    let source = null;
    let resultMessage = '';

    function preview(select) {
        const report = reports[Number(select.value)];
        const grid = dialog.querySelector(`[data-log-preview="${select.id}"]`);
        grid.hidden = select.value === '';
        grid.textContent = grid.hidden ? '' : report.values.map(row => row.join('  ')).join('\n');
    }

    function updateSelection() {
        preview(before);
        preview(after);
        for (const option of after.options) option.disabled = option.value !== '' && option.value === before.value;
        if (after.value && before.value === after.value) {
            use.disabled = true;
            message.textContent = 'Choose a different report for After.';
        } else {
            use.disabled = false;
            use.textContent = after.value === '' ? 'Show heatmap' : 'Compare selected meshes';
            message.textContent = resultMessage;
        }
    }

    function resetResults() {
        reports = [];
        resultMessage = '';
        results.hidden = true;
        use.disabled = true;
        message.textContent = '';
        before.replaceChildren();
        after.replaceChildren();
        for (const grid of results.querySelectorAll('[data-log-preview]')) grid.textContent = '';
    }

    function scan() {
        resetResults();
        try {
            const found = findMeshReports(input.value, MAX_RAW_LENGTH);
            reports = found.reports;
            if (!reports.length) throw new Error(found.skipped
                ? 'No complete mesh was found. Check the reported rows and dimensions.'
                : 'No mesh found. Include the firmware heading or echoed G29 or G81 command, or paste a single numeric grid.');
            after.append(new Option('None — open one mesh', ''));
            reports.forEach((report, index) => {
                const label = `${report.label} · ${report.columns} × ${report.rows} · lines ${report.firstLine}–${report.lastLine}`;
                before.append(new Option(label, String(index)));
                after.append(new Option(label, String(index)));
            });
            after.value = reports.length > 1 ? '1' : '';
            after.parentElement.hidden = reports.length === 1;
            results.hidden = false;
            resultMessage = `${reports.length} ${reports.length === 1 ? 'mesh' : 'meshes'} found.` +
                (found.skipped ? ` Skipped ${found.skipped} incomplete or unsupported sections.` : '');
            updateSelection();
            (reports.length === 1 ? use : before).focus();
        } catch (error) {
            message.textContent = error.message;
        }
    }

    dialog.querySelector('[data-log-scan]').addEventListener('click', scan);
    input.addEventListener('input', resetResults);
    before.addEventListener('change', updateSelection);
    after.addEventListener('change', updateSelection);
    use.addEventListener('click', () => {
        if (!reports.length || before.value === after.value) return;
        const chosen = [reports[Number(before.value)]];
        if (after.value !== '') chosen.push(reports[Number(after.value)]);
        try {
            openReports(chosen, source);
            dialog.close();
        } catch (error) {
            message.textContent = error.message;
        }
    });
    dialog.addEventListener('close', () => {
        source = null;
        input.value = '';
        resetResults();
    });
    return {
        show(panel = null) {
            const text = panel?.raw.value ?? '';
            source = panel ? { panel, text } : null;
            input.value = text;
            dialog.showModal();
            if (source) scan();
        },
    };
}
