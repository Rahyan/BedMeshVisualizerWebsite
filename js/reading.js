// Keep the article's table of contents in step with its visible section.
const articleNavigation = document.querySelector('[data-reading-nav], .guide-toc');

if (articleNavigation) {
    const sections = [...articleNavigation.querySelectorAll('a[href^="#"]')].flatMap(link => {
        let id;
        try { id = decodeURIComponent(link.hash.slice(1)); }
        catch { return []; }
        const heading = document.getElementById(id);
        return heading ? [{ link, heading }] : [];
    });
    let scheduled = false;
    const update = () => {
        scheduled = false;
        if (!sections.length) return;
        const threshold = Math.min(180, window.innerHeight * 0.25);
        let current = sections[0];
        for (const section of sections) {
            if (section.heading.getBoundingClientRect().top <= threshold) current = section;
        }
        for (const section of sections) {
            if (section === current) section.link.setAttribute('aria-current', 'location');
            else section.link.removeAttribute('aria-current');
        }
    };
    const requestUpdate = () => {
        if (!scheduled) {
            scheduled = true;
            requestAnimationFrame(update);
        }
    };
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate, { passive: true });
    window.addEventListener('hashchange', requestUpdate);
    update();
}
