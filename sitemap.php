<?php
declare(strict_types=1);
require_once __DIR__ . '/php/head.php';
header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: no-cache');
echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
if (($_GET['part'] ?? '') === 'pages') {
    echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
    $guides = require __DIR__ . '/php/guide-catalog.php';
    $paths = ['/', '/guides/'];
    foreach (array_keys($guides) as $slug) $paths[] = '/guides/?topic=' . rawurlencode($slug);
    foreach ($paths as $path) {
        echo '  <url><loc>' . site_escape(site_origin() . $path) . '</loc></url>' . "\n";
    }
    echo '</urlset>';
} else {
    echo '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
    foreach (['/sitemap.xml?part=pages', '/blog/public/sitemap.xml'] as $path) {
        echo '  <sitemap><loc>' . site_escape(site_origin() . $path) . '</loc></sitemap>' . "\n";
    }
    echo '</sitemapindex>';
}
