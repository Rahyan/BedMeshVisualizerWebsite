const header = document.querySelector('.site-header');

if (header) {
    const navToggle = header.querySelector('.site-nav-toggle');
    const nav = header.querySelector('.site-nav');
    const projects = header.querySelector('.site-projects');
    const projectsToggle = header.querySelector('.site-projects__toggle');
    const projectLinks = header.querySelector('.site-projects__list');
    const mobile = window.matchMedia('(max-width: 720px)');

    if (navToggle && nav && projects && projectsToggle && projectLinks) {
        const setProjectsOpen = (open, restoreFocus = false) => {
            projectsToggle.setAttribute('aria-expanded', String(open));
            projectLinks.inert = !open;
            projectLinks.hidden = !open;
            if (restoreFocus) projectsToggle.focus();
        };

        const setNavOpen = (open, restoreFocus = false) => {
            navToggle.setAttribute('aria-expanded', String(open));
            nav.inert = !open;
            nav.hidden = !open;
            if (!open) setProjectsOpen(false);
            if (restoreFocus) navToggle.focus();
        };

        header.dataset.enhanced = 'true';
        navToggle.hidden = false;
        setProjectsOpen(false);
        setNavOpen(!mobile.matches);

        mobile.addEventListener('change', () => {
            // Avoid leaving keyboard focus inside a newly hidden mobile menu.
            const focusWasInNav = nav.contains(document.activeElement);
            setNavOpen(!mobile.matches, mobile.matches && focusWasInNav);
        });

        navToggle.addEventListener('click', () => {
            setNavOpen(navToggle.getAttribute('aria-expanded') !== 'true');
        });

        projectsToggle.addEventListener('click', () => {
            setProjectsOpen(projectsToggle.getAttribute('aria-expanded') !== 'true');
        });

        projectsToggle.addEventListener('keydown', (event) => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            event.preventDefault();
            setProjectsOpen(true);
            const links = projectLinks.querySelectorAll('a');
            const link = event.key === 'ArrowUp' ? links[links.length - 1] : links[0];
            link?.focus();
        });

        header.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            if (!projectLinks.hidden) {
                event.preventDefault();
                setProjectsOpen(false, true);
            } else if (mobile.matches && !nav.hidden) {
                event.preventDefault();
                setNavOpen(false, true);
            }
        });

        projects.addEventListener('focusout', () => {
            queueMicrotask(() => {
                if (!projects.contains(document.activeElement)) setProjectsOpen(false);
            });
        });

        document.addEventListener('click', (event) => {
            if (!projects.contains(event.target)) setProjectsOpen(false);
            if (mobile.matches && !header.contains(event.target)) setNavOpen(false);
        });

        nav.addEventListener('click', (event) => {
            if (!event.target.closest('a')) return;
            setProjectsOpen(false);
            if (mobile.matches) setNavOpen(false);
        });
    }
}

const revealPrivacy = () => {
    if (window.location.hash !== '#privacy') return;
    const privacy = document.querySelector('details#privacy');
    if (privacy) privacy.open = true;
};

window.addEventListener('hashchange', revealPrivacy);
document.querySelectorAll('a[href="/#privacy"], a[href="#privacy"]').forEach((link) => {
    link.addEventListener('click', revealPrivacy);
});
revealPrivacy();
