const SITE = 'https://bedmesh.com';
const CHOICE_KEY = 'bedmesh.analytics.v1';
const EVENTS = new Set([
    'mesh_visualized', 'mesh_comparison_created',
    'comparison_report_downloaded', 'calibration_session_saved',
]);

export function bindAnalytics(browser, page) {
    const { document } = browser;
    const pageUrl = document.querySelector('meta[name="bedmesh-analytics-page"]')?.content;
    const measurementId = document.querySelector('meta[name="bedmesh-analytics-id"]')?.content ?? '';
    if (!/^G-[A-Z0-9]{10}$/.test(measurementId) || !pageUrl?.startsWith(SITE + '/') || browser.location.origin !== SITE) return () => {};

    const choices = document.querySelector('#analytics-choice');
    const settings = document.querySelector('#analytics-settings');
    const preferences = settings.querySelector('[data-analytics-preferences]');
    let enabled = false;
    let loaded = false;
    let hadFocus = false;
    const counted = new Set();
    const send = function () { browser.dataLayer.push(arguments); };
    const consent = analytics_storage => ({
        analytics_storage, ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    });

    function applyChoice(choice) {
        enabled = choice === 'on';
        browser['ga-disable-' + measurementId] = !enabled;
        if (!enabled) {
            if (loaded) send('consent', 'update', consent('denied'));
            if (loaded || choice === 'off') {
                for (const name of ['_ga', '_ga_' + measurementId.slice(2)]) {
                    document.cookie = name + '=; Max-Age=0; Path=/';
                    document.cookie = name + '=; Max-Age=0; Path=/; Domain=bedmesh.com';
                }
            }
            return;
        }
        if (loaded) {
            send('consent', 'update', consent('granted'));
            return;
        }
        loaded = true;
        browser.dataLayer ??= [];
        send('consent', 'default', consent('denied'));
        send('consent', 'update', consent('granted'));
        send('js', new Date());
        // Canonical public URLs and referrer origin keep arbitrary URL parameters out of events.
        const page_referrer = /^https?:\/\//.test(document.referrer) ? new URL(document.referrer).origin : '';
        send('config', measurementId, {
            send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
            page_location: pageUrl, page_title: page, page_referrer,
        });
        send('event', 'page_view');
        const script = document.createElement('script');
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
        document.head.append(script);
    }

    let choice;
    try { choice = browser.localStorage.getItem(CHOICE_KEY); }
    catch { /* A choice can still apply for this page. */ }
    applyChoice(choice);
    settings.hidden = false;
    choices.hidden = choice === 'on' || choice === 'off';
    preferences.addEventListener('click', () => {
        hadFocus = true;
        choices.hidden = false;
        choices.querySelector('button').focus();
    });
    for (const button of choices.querySelectorAll('[data-analytics-choice]')) {
        button.addEventListener('click', () => {
            const selected = button.dataset.analyticsChoice;
            try { browser.localStorage.setItem(CHOICE_KEY, selected); }
            catch { /* Apply the choice to the current page. */ }
            applyChoice(selected);
            choices.hidden = true;
            if (hadFocus) preferences.focus();
        });
    }
    browser.addEventListener('storage', event => {
        if (event.key !== CHOICE_KEY && event.key !== null) return;
        applyChoice(event.newValue);
        choices.hidden = event.newValue === 'on' || event.newValue === 'off';
    });

    return (event, { once = false } = {}) => {
        if (!enabled || !EVENTS.has(event) || (once && counted.has(event))) return;
        if (once) counted.add(event);
        send('event', event);
    };
}

export const measure = typeof window === 'undefined' ? () => {} : bindAnalytics(window, document.title);
