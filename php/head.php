<?php
/** Shared public metadata. Never build canonical URLs from an untrusted Host header. */
declare(strict_types=1);

function site_escape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function site_origin(): string
{
    $configured = getenv('BEDMESH_SITE_URL');
    if (is_string($configured) && preg_match('~^https?://[a-z0-9.-]+(?::[0-9]{1,5})?/?$~i', $configured)) {
        return rtrim($configured, '/');
    }
    return 'https://bedmesh.com';
}

function site_analytics_id(): ?string
{
    $configured = getenv('BEDMESH_GA_MEASUREMENT_ID');
    return is_string($configured) && preg_match('/\AG-[A-Z0-9]{10}\z/', $configured) ? $configured : null;
}

/** Version trusted entry assets so a cached earlier release cannot mix with new markup. */
function site_asset_url(string $path): string
{
    static $versions = [];
    if (!preg_match('~^/(?:css|js)/[a-z0-9-]+\.(?:css|js|mjs)$~i', $path)) {
        throw new InvalidArgumentException('Expected a local stylesheet or browser module.');
    }
    if (!isset($versions[$path])) {
        $digest = hash_file('sha256', dirname(__DIR__) . $path);
        if ($digest === false) throw new RuntimeException('A required site asset is missing.');
        $versions[$path] = substr($digest, 0, 16);
    }
    return $path . '?v=' . $versions[$path];
}

function render_site_schema(array $schema): void
{
    $json = json_encode(
        ['@context' => 'https://schema.org'] + $schema,
        JSON_HEX_TAG | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR
    );
    echo '<script type="application/ld+json">' . $json . '</script>' . "\n";
}

function render_site_head(array $meta = []): void
{
    $title = (string) ($meta['title'] ?? 'Bed Mesh — 3D Printer Bed Mesh Visualizer');
    $description = (string) ($meta['description'] ?? 'Explore your 3D printer bed mesh, compare measurements, and understand the surface. Free and open source.');
    $path = $meta['path'] ?? '/';
    $canonical = is_string($path) && str_starts_with($path, '/') && !str_starts_with($path, '//')
        ? site_origin() . $path : null;
    $noindex = !empty($meta['noindex']) || PHP_SAPI === 'cli-server' || getenv('BEDMESH_NOINDEX') === '1';
    $analyticsId = site_analytics_id();
    $type = ($meta['type'] ?? '') === 'article' ? 'article' : 'website';
    $card = $meta['card'] ?? [
        'path' => '/assets/social-card.png', 'width' => 1200, 'height' => 630,
        'alt' => 'Bed Mesh: visualize and compare your 3D printer’s measured bed surface.',
    ];
    ?>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="<?= site_escape($description) ?>">
    <meta name="theme-color" content="#536dfe">
    <meta name="robots" content="<?= $noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large' ?>">
    <title><?= site_escape($title) ?></title>
    <?php if ($canonical !== null): ?><link rel="canonical" href="<?= site_escape($canonical) ?>"><?php endif; ?>
    <?php if ($analyticsId !== null && $canonical !== null && !$noindex && site_origin() === 'https://bedmesh.com'
        && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET' && http_response_code() < 400): ?>
        <meta name="bedmesh-analytics-page" content="<?= site_escape($canonical) ?>">
        <meta name="bedmesh-analytics-id" content="<?= site_escape($analyticsId) ?>">
    <?php endif; ?>
    <meta property="og:site_name" content="Bed Mesh">
    <meta property="og:type" content="<?= $type ?>">
    <meta property="og:title" content="<?= site_escape($title) ?>">
    <meta property="og:description" content="<?= site_escape($description) ?>">
    <?php if ($canonical !== null): ?><meta property="og:url" content="<?= site_escape($canonical) ?>"><?php endif; ?>
    <meta property="og:image" content="<?= site_escape(site_origin() . $card['path']) ?>">
    <meta property="og:image:width" content="<?= (int) $card['width'] ?>">
    <meta property="og:image:height" content="<?= (int) $card['height'] ?>">
    <meta property="og:image:alt" content="<?= site_escape($card['alt']) ?>">
    <?php if (!empty($meta['schema'])) render_site_schema($meta['schema']); ?>
    <meta name="twitter:card" content="summary_large_image">
    <link rel="icon" type="image/png" sizes="64x64" href="/assets/bedmesh-icon.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/assets/bedmesh-touch.png">
    <link rel="preload" href="/assets/fonts/PlusJakartaSans-Regular.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700&amp;family=Plus+Jakarta+Sans:wght@500;600;700&amp;family=Poppins:wght@400;500;600&amp;display=swap">
    <link rel="stylesheet" href="<?= site_escape(site_asset_url('/css/app.css')) ?>">
    <link rel="stylesheet" href="<?= site_escape(site_asset_url('/css/chrome.css')) ?>">
    <link rel="stylesheet" href="<?= site_escape(site_asset_url('/css/motion.css')) ?>">
    <?php
}
