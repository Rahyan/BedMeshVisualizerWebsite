import test from 'node:test';
import assert from 'node:assert/strict';
import { formatArticleSelection, safeArticleLink } from '../js/editor-format.mjs';

test('formatting preserves surrounding source and selects the original text', () => {
    const result = formatArticleSelection('One clear observation.', 4, 9, 'bold');
    assert.equal(result.value, 'One <strong>clear</strong> observation.');
    assert.equal(result.value.slice(result.start, result.end), 'clear');
});
test('block formatting separates adjacent source without dropping it', () => {
    const result = formatArticleSelection('<p>Before</p>Heading<p>After</p>', 13, 20, 'heading');
    assert.equal(result.value, '<p>Before</p>\n<h2>Heading</h2>\n<p>After</p>');
});
test('multiline lists retain items and skip empty lines', () => {
    const value = 'First\n\nSecond';
    assert.equal(formatArticleSelection(value, 0, value.length, 'list').value, '<ul>\n  <li>First</li>\n  <li>Second</li>\n</ul>');
});
test('code examples escape markup rather than turning it into an embed', () => {
    const value = '<script>"example" & test</script>';
    assert.equal(formatArticleSelection(value, 0, value.length, 'code').value, '<pre><code>&lt;script&gt;&quot;example&quot; &amp; test&lt;/script&gt;</code></pre>');
});
test('links allow web, local, and section targets while excluding unsafe schemes and credentials', () => {
    for (const value of ['https://example.com/path?q=1&x=2', '/guides/', '#section']) assert.equal(safeArticleLink(value), value);
    for (const value of ['javascript:alert(1)', 'data:text/html,x', '//example.com/path', 'https://name:secret@example.com', '/\\host/path', 'https://example.com/\npath']) assert.throws(() => safeArticleLink(value));
    assert.equal(formatArticleSelection('source', 0, 6, 'link', { href: 'https://example.com/?a=1&b=2' }).value, '<a href="https://example.com/?a=1&amp;b=2">source</a>');
});
test('empty selections get editable placeholders and invalid ranges cannot overwrite data', () => {
    assert.equal(formatArticleSelection('', 0, 0, 'paragraph').value, '<p>Paragraph text</p>');
    for (const [start, end] of [[-1, 1], [2, 1], [0, 99], [0.5, 1]]) assert.throws(() => formatArticleSelection('safe', start, end, 'bold'));
    assert.throws(() => formatArticleSelection('safe', 0, 4, 'unknown'));
});
