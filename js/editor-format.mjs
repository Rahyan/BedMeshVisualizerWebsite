const escapeHtml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function safeArticleLink(input) {
    const value = String(input).trim();
    if (!value || /[\u0000-\u0020\u007f\\]/.test(value)) throw new Error('Use an https:// address, a /path on this site, or a #section link.');
    if ((value.startsWith('/') && !value.startsWith('//')) || value.startsWith('#')) return value;
    let parsed;
    try { parsed = new URL(value); } catch { throw new Error('Enter a complete https:// address or a /path on this site.'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Use a web address without embedded credentials.');
    return value;
}

/** Edit source text without evaluating HTML or changing text outside the selection. */
export function formatArticleSelection(value, start, end, kind, { href } = {}) {
    if (typeof value !== 'string' || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > value.length) throw new Error('Select the text you want to format.');
    let selected = value.slice(start, end);
    let prefix;
    let suffix;
    let block = false;
    switch (kind) {
        case 'paragraph': prefix = '<p>'; suffix = '</p>'; selected ||= 'Paragraph text'; block = true; break;
        case 'heading': prefix = '<h2>'; suffix = '</h2>'; selected ||= 'Section heading'; block = true; break;
        case 'bold': prefix = '<strong>'; suffix = '</strong>'; selected ||= 'Emphasis'; break;
        case 'italic': prefix = '<em>'; suffix = '</em>'; selected ||= 'Emphasis'; break;
        case 'list':
            prefix = '<ul>\n'; suffix = '\n</ul>';
            selected = (selected || 'List item').split(/\r?\n/).filter(line => line.trim()).map(line => '  <li>' + line + '</li>').join('\n');
            block = true;
            break;
        case 'code': prefix = '<pre><code>'; suffix = '</code></pre>'; selected = escapeHtml(selected || 'Code or mesh values'); block = true; break;
        case 'link': prefix = '<a href="' + escapeHtml(safeArticleLink(href)) + '">'; suffix = '</a>'; selected ||= 'Link text'; break;
        default: throw new Error('Choose a formatting control.');
    }
    const before = value.slice(0, start);
    const after = value.slice(end);
    if (block && before && !before.endsWith('\n')) prefix = '\n' + prefix;
    if (block && after && !after.startsWith('\n')) suffix += '\n';
    return {
        value: before + prefix + selected + suffix + after,
        start: start + prefix.length,
        end: start + prefix.length + selected.length,
    };
}
