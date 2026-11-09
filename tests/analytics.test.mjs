import assert from 'node:assert/strict';
import test from 'node:test';
import { bindAnalytics } from '../js/analytics.mjs';

const TEST_MEASUREMENT_ID = 'G-0000000000';

function analyticsFixture({ stored, page = 'https://bedmesh.com/', origin = 'https://bedmesh.com', id = TEST_MEASUREMENT_ID } = {}) {
    const node = () => ({
        hidden: true, events: {},
        focus() {},
        addEventListener(name, callback) { this.events[name] = callback; },
    });
    const on = { ...node(), dataset: { analyticsChoice: 'on' } };
    const off = { ...node(), dataset: { analyticsChoice: 'off' } };
    const preferences = node();
    const choices = {
        ...node(),
        querySelector: () => off,
        querySelectorAll: () => [off, on],
    };
    const settings = { ...node(), querySelector: () => preferences };
    const scripts = [];
    const elements = {
        'meta[name="bedmesh-analytics-page"]': { content: page },
        'meta[name="bedmesh-analytics-id"]': { content: id },
        '#analytics-choice': choices,
        '#analytics-settings': settings,
    };
    const browser = {
        ...node(),
        document: {
            querySelector: selector => elements[selector],
            referrer: 'https://google.com/search?q=private',
            createElement: () => ({}),
            head: { append: script => scripts.push(script) },
        },
        location: { origin },
        localStorage: {
            getItem: () => stored,
            setItem: (_, value) => { stored = value; },
        },
    };
    const measure = bindAnalytics(browser, 'Bed Mesh');
    return { browser, scripts, choices, settings, on, off, preferences, measure };
}

test('Analytics loads only after opt-in on the canonical public origin', () => {
    for (const options of [{ origin: 'http://localhost' }, { page: '' }, { stored: 'off' },
        { id: '', stored: 'on' }, { id: 'invalid', stored: 'on' }]) {
        const { browser, scripts, measure } = analyticsFixture(options);
        measure('mesh_visualized');
        assert.equal(scripts.length, 0);
        assert.equal(browser.dataLayer, undefined);
    }
    const { browser, scripts, choices, on, off, preferences, measure } = analyticsFixture();
    assert.equal(choices.hidden, false);
    assert.equal(scripts.length, 0);
    measure('mesh_visualized');
    on.events.click();
    assert.equal(scripts.length, 1);
    assert.equal(new URL(scripts[0].src).hostname, 'www.googletagmanager.com');
    assert.equal(new URL(scripts[0].src).searchParams.get('id'), TEST_MEASUREMENT_ID);
    const commands = () => browser.dataLayer.map(args => Array.from(args));
    const config = commands().find(([kind]) => kind === 'config')[2];
    assert.equal(config.send_page_view, false);
    assert.equal(config.allow_google_signals, false);
    assert.equal(config.page_location, 'https://bedmesh.com/');
    assert.equal(config.page_referrer, 'https://google.com');
    measure('mesh_visualized', { once: true });
    measure('mesh_visualized', { once: true });
    measure('unknown_event');
    measure('comparison_report_downloaded');
    preferences.events.click();
    assert.equal(choices.hidden, false);
    off.events.click();
    measure('calibration_session_saved');
    assert.equal(browser['ga-disable-' + TEST_MEASUREMENT_ID], true);
    assert.equal(choices.hidden, true);
    assert.deepEqual(commands().filter(([kind]) => kind === 'event'), [
        ['event', 'page_view'], ['event', 'mesh_visualized'], ['event', 'comparison_report_downloaded'],
    ]);
});
