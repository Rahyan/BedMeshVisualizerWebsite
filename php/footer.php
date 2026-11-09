<footer class="site-footer">
    <div class="site-footer__inner">
        <div class="site-footer__top">
            <div class="site-footer__intro">
                <a class="site-brand site-brand--footer" href="/">
                    <img src="/assets/bedmesh-brand.png" width="44" height="44" alt="" loading="lazy" decoding="async">
                    <span>Bed Mesh</span>
                </a>
                <p>Visualize your printer's measured bed surface.<br>Free and open source.</p>
            </div>
            <nav class="site-footer__links" aria-label="Bed Mesh resources">
                <h2>Bed Mesh</h2>
                <ul>
                    <li><a href="/#how-to">How to use</a></li>
                    <li><a href="/guides/">Guides</a></li>
                    <li><a href="/blog/public/">Blog</a></li>
                    <li><a href="/#about">About the project</a></li>
                    <li><a href="/#privacy">Privacy &amp; local data</a></li>
                </ul>
            </nav>
            <nav class="site-footer__links" aria-label="Project contributions">
                <h2>Make it better</h2>
                <ul>
                    <li><a href="https://github.com/Rahyan/BedMeshVisualizerWebsite">Source on GitHub <span aria-hidden="true">↗</span></a></li>
                    <li><a href="https://github.com/Rahyan/BedMeshVisualizerWebsite/issues">Report an issue <span aria-hidden="true">↗</span></a></li>
                    <li><a href="https://paypal.me/rsaouab">Support the project <span aria-hidden="true">↗</span></a></li>
                </ul>
            </nav>
            <nav class="site-footer__links" aria-label="More projects by Rahyan">
                <h2>More by Rahyan</h2>
                <ul>
                    <li><a href="https://faceoff.watch">Face-Off <span aria-hidden="true">↗</span></a></li>
                    <li><a href="https://simpmusicwear.faceoff.watch">SimpMusic Wear OS <span aria-hidden="true">↗</span></a></li>
                </ul>
            </nav>
        </div>
        <details class="site-footer__privacy" id="privacy">
            <summary>Privacy &amp; local data</summary>
            <div>
                <p>Your mesh is visualized in your browser. The visualizer does not upload your mesh data. Meshes, settings, and measurement notes are saved in this browser's local storage so you can return to them. Exported workspace files include those notes. Use <strong>Clear all</strong> in the visualizer to remove its saved mesh data.</p>
                <p>The visualizer loads Plotly from a third-party service, and the site uses Google Fonts. Your browser connects to those services to load their files.</p>
                <p>The blog stores articles and administrator accounts in its database. Signing in uses a session cookie; the visualizer does not require a blog account.</p>
                <?php if (site_origin() === 'https://bedmesh.com'): ?>
                    <div id="analytics-settings" hidden>
                        <p>Optional Google Analytics measures public page visits and completed tool actions using cookies. Mesh data, filenames, and measurement notes stay in your browser.</p>
                        <p><button type="button" class="button button-quiet" data-analytics-preferences>Change analytics choice</button></p>
                    </div>
                <?php endif; ?>
            </div>
        </details>
        <div class="site-footer__bottom">
            <p>&copy; <?= date('Y') ?> Bed Mesh. Created by <a href="https://github.com/Rahyan">Rahyan Saouab</a>.</p>
            <a href="/#visualizer">Back to visualizer <span aria-hidden="true">↑</span></a>
        </div>
    </div>
</footer>
<?php if (site_origin() === 'https://bedmesh.com'): ?>
    <aside class="analytics-choice" id="analytics-choice" aria-labelledby="analytics-choice-title" hidden>
        <h2 id="analytics-choice-title">Optional analytics</h2>
        <p>Help improve Bed Mesh by sharing page visits and completed tool actions with Google Analytics. Your mesh data stays in your browser.</p>
        <div class="analytics-choice__actions">
            <button type="button" class="button button-secondary" data-analytics-choice="off">Keep off</button>
            <button type="button" class="button button-secondary" data-analytics-choice="on">Allow analytics</button>
        </div>
    </aside>
    <script type="module" src="/js/analytics.mjs"></script>
<?php endif; ?>
<script type="module" src="<?= site_escape(site_asset_url('/js/navigation.js')) ?>"></script>
<script type="module" src="<?= site_escape(site_asset_url('/js/motion.js')) ?>"></script>
