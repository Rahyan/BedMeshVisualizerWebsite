<?php
$navigationPath = explode('?', $_SERVER['REQUEST_URI'] ?? '/', 2)[0];
$onGuides = str_starts_with($navigationPath, '/guides');
$onBlog = str_starts_with($navigationPath, '/blog');
$onVisualizer = $navigationPath === '/' || $navigationPath === '/index.php';
?>
<header class="site-header">
    <div class="site-header__inner">
        <a class="site-brand" href="/" aria-label="Bed Mesh home">
            <img src="/assets/bedmesh-brand.png" width="58" height="58" alt="" decoding="async">
            <span>Bed Mesh</span>
        </a>
        <button class="site-nav-toggle" type="button" aria-expanded="true" aria-controls="site-navigation" hidden>
            <span class="site-nav-toggle__icon" aria-hidden="true"></span>
            <span>Menu</span>
        </button>
        <nav class="site-nav" id="site-navigation" aria-label="Main navigation">
            <ul class="site-nav__list">
                <li><a href="/#visualizer"<?= $onVisualizer ? ' aria-current="page"' : '' ?>>Visualizer</a></li>
                <li><a href="/guides/"<?= $onGuides ? ' aria-current="page"' : '' ?>>Guides</a></li>
                <li><a href="/blog/public/"<?= $onBlog ? ' aria-current="page"' : '' ?>>Blog</a></li>
                <li><a href="/#about">About</a></li>
                <li class="site-projects">
                    <button class="site-projects__toggle" type="button" aria-expanded="true" aria-controls="site-project-links">
                        Projects <span class="site-chevron" aria-hidden="true"></span>
                    </button>
                    <ul class="site-projects__list" id="site-project-links">
                        <li>
                            <a href="https://faceoff.watch">
                                <span class="site-projects__name">Face-Off <span aria-hidden="true">↗</span></span>
                                <span class="site-projects__description">A fresh face for your smartwatch.</span>
                            </a>
                        </li>
                        <li>
                            <a href="https://simpmusicwear.faceoff.watch">
                                <span class="site-projects__name">SimpMusic Wear OS <span aria-hidden="true">↗</span></span>
                                <span class="site-projects__description">Your music, on your wrist.</span>
                            </a>
                        </li>
                    </ul>
                </li>
                <li><a class="site-nav__github" href="https://github.com/Rahyan/BedMeshVisualizerWebsite">GitHub <span aria-hidden="true">↗</span></a></li>
            </ul>
        </nav>
    </div>
</header>
