import { comparisonSections } from './mesh-comparison.mjs';

const SVG = 'http://www.w3.org/2000/svg';

function svg(parent, tag, attributes, label) {
    const element = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    if (label !== undefined) element.textContent = label;
    parent.append(element);
    return element;
}

function profileChart(profile, low, high, format) {
    const chart = document.createElementNS(SVG, 'svg');
    chart.setAttribute('viewBox', '0 0 400 164');
    chart.setAttribute('role', 'img');
    chart.setAttribute('aria-label', `${profile.title}, Before and After height profiles in millimetres. Sample values are listed below.`);
    const left = 63, right = 380, top = 16, bottom = 121;
    const count = profile.before.length;
    const scale = Math.max(Math.abs(low), Math.abs(high));
    const x = index => count === 1 ? (left + right) / 2 : left + index / (count - 1) * (right - left);
    const y = value => low === high ? (top + bottom) / 2 :
        bottom - (value / scale - low / scale) / (high / scale - low / scale) * (bottom - top);
    const ticks = low === high ? [low] : [low, low / 2 + high / 2, high];
    for (const value of ticks) {
        const at = y(value);
        svg(chart, 'line', { x1: left, x2: right, y1: at, y2: at, class: 'section-gridline' });
        svg(chart, 'text', { x: left - 7, y: at + 4, 'text-anchor': 'end' }, format(value));
    }
    const selected = x(profile.selected);
    svg(chart, 'line', { x1: selected, x2: selected, y1: top, y2: bottom, class: 'section-probe-line' });
    svg(chart, 'text', { x: x(0), y: 143, 'text-anchor': 'middle' }, String(profile.min ?? 0));
    if (count > 1) svg(chart, 'text', { x: right, y: 143, 'text-anchor': 'middle' }, String(profile.max ?? profile.size ?? count - 1));
    svg(chart, 'text', { x: (left + right) / 2, y: 157, 'text-anchor': 'middle' },
        `${profile.axis} (${profile.size === null ? 'sample index' : 'mm'})`);
    for (const [kind, values] of [['before', profile.before], ['after', profile.after]]) {
        const group = svg(chart, 'g', { class: `profile-${kind}` });
        svg(group, 'polyline', { points: values.map((value, index) => `${x(index)},${y(value)}`).join(' ') });
        for (const [index, value] of values.entries()) {
            svg(group, 'circle', { cx: x(index), cy: y(value), r: index === profile.selected ? 4.5 : 2 });
        }
    }
    return chart;
}

function profileValues(profile, format, signed) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = `View ${profile.title.toLowerCase()} values`;
    const scroll = document.createElement('div');
    scroll.className = 'table-scroll';
    const table = document.createElement('table');
    table.createCaption().textContent = `${profile.title} · heights and changes in mm`;
    const header = table.createTHead().insertRow();
    for (const label of [`${profile.axis} index`, 'Before', 'After', 'Change']) {
        const cell = document.createElement('th');
        cell.scope = 'col';
        cell.textContent = label;
        header.append(cell);
    }
    const body = table.createTBody();
    profile.before.forEach((value, index) => {
        const row = body.insertRow();
        const label = document.createElement('th');
        label.scope = 'row';
        label.textContent = index === profile.selected ? `${index} (selected)` : String(index);
        row.append(label);
        for (const height of [format(value, 6), format(profile.after[index], 6), signed(profile.change[index], 6)]) {
            row.insertCell().textContent = height;
        }
    });
    scroll.append(table);
    details.append(summary, scroll);
    return details;
}

export function comparisonProfilePanels(result, point, format, signed) {
    const profiles = comparisonSections(result, point);
    const heights = profiles.flatMap(profile => [...profile.before, ...profile.after]);
    const low = Math.min(...heights);
    const high = Math.max(...heights);
    return profiles.map(profile => {
        const panel = document.createElement('section');
        const heading = document.createElement('h5');
        heading.textContent = profile.title;
        panel.append(heading, profileChart(profile, low, high, format), profileValues(profile, format, signed));
        return panel;
    });
}

export function showComparisonSections(section, result, point, format, signed) {
    section.hidden = !result || !point;
    const grid = section.querySelector('[data-section-profiles]');
    grid.replaceChildren(...(section.hidden ? [] : comparisonProfilePanels(result, point, format, signed)));
}
