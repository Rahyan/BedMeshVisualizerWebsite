// No chart observers or animation loops: Plotly owns its entire chart DOM.
const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
const active = new Set();
const animate = (element, frames, options = {}) => {
    if (preference.matches || !element.animate) return;
    const animation = element.animate(frames, {
        duration: 320, easing: 'cubic-bezier(.22,1,.36,1)', ...options,
    });
    active.add(animation);
    animation.finished.catch(() => {}).finally(() => active.delete(animation));
};
preference.addEventListener('change', () => {
    if (preference.matches) for (const animation of active) animation.cancel();
});

// Animate content on its first appearance, without making it invisible while waiting.
if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            observer.unobserve(entry.target);
            animate(entry.target, [{ opacity: .65, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }]);
        }
    }, { threshold: .08 });
    document.querySelectorAll('.guide-steps > div, .guides-list > li, .blog-list-item, .blog-hero-image, .about-section, .blog-related').forEach(element => observer.observe(element));
    window.addEventListener('pagehide', event => { if (!event.persisted) observer.disconnect(); });
}

// A short, single response to changed status text. Never observe the live graph.
const statuses = document.querySelectorAll('#save-status, #workspace-file-message, .editor-save-state');
for (const element of statuses) {
    let previous = element.textContent;
    let pending;
    const observer = new MutationObserver(() => {
        const current = element.textContent;
        if (current === previous) return;
        previous = current;
        pending?.cancel();
        if (!preference.matches && current.trim() && element.animate) {
            pending = element.animate([{ opacity: .45 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
            active.add(pending);
            const animation = pending;
            animation.finished.catch(() => {}).finally(() => active.delete(animation));
        }
    });
    observer.observe(element, { childList: true, characterData: true, subtree: true });
    window.addEventListener('pagehide', event => { if (!event.persisted) observer.disconnect(); });
}
