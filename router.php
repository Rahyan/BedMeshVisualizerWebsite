<?php
/** Local PHP development router. Bind only to loopback. Apache uses .htaccess. */
declare(strict_types=1);

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');

$rawPath = explode('?', $_SERVER['REQUEST_URI'] ?? '/', 2)[0];
$path = rawurldecode($rawPath);

// Reject ambiguous paths before PHP's Windows file server interprets them.
// In particular, parse_url treats //path as a host, and Windows resolves \\.
$malformed = !str_starts_with($path, '/') || str_contains($path, '\\')
    || str_contains($path, '//') || preg_match('/[\x00-\x1f\x7f]/', $path);
foreach (explode('/', $path) as $segment) {
    if ($segment !== '' && ($segment !== rtrim($segment, ' .') || $segment === '.' || $segment === '..')) {
        $malformed = true;
    }
}
$privatePath = static fn (string $candidate): bool => (bool) preg_match(
    '~(?:^|/)\.|^/(?:php|tests|docs|scripts)(?:/|$)|^/blog/(?:app|database|tests)(?:/|$)|(?:^|/)(?:router\.php|README\.md|AGENTS\.md|test\.html)$|\.(?:sql|sqlite3?|db|log|bak|old|orig|save|pem|key|p12|pfx)$~i',
    $candidate
);
$resolved = realpath(__DIR__ . $path);
$root = str_replace('\\', '/', (string) realpath(__DIR__));
if ($resolved !== false) {
    $resolved = str_replace('\\', '/', $resolved);
    if ($resolved !== $root && strncasecmp($resolved, $root . '/', strlen($root) + 1) !== 0) {
        $malformed = true;
    } else {
        $malformed = $malformed || $privatePath(substr($resolved, strlen($root)) ?: '/');
    }
}
if ($malformed || $privatePath($path)) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Access denied.';
    return true;
}
if ($path === '/blog' || $path === '/blog/') {
    header('Location: /blog/public/', true, 302);
    return true;
}
if ($path === '/sitemap.xml') {
    require __DIR__ . '/sitemap.php';
    return true;
}
if (str_starts_with($path, '/blog/public/')) {
    $relative = substr($path, strlen('/blog/public/'));
    $file = realpath(__DIR__ . '/blog/public/' . $relative);
    $public = realpath(__DIR__ . '/blog/public') . DIRECTORY_SEPARATOR;
    if ($relative !== '' && $file !== false && str_starts_with($file, $public) && is_file($file)) {
        return false;
    }
    $_GET['url'] = $relative === '' ? 'home' : $relative;
    chdir(__DIR__ . '/blog/public');
    require 'index.php';
    return true;
}
if ($resolved === false) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Not found.';
    return true;
}
// Serving a file through return false discards router response headers. Handle
// native modules/styles explicitly, with MIME types matching the Apache rules.
$assetTypes = ['mjs' => 'text/javascript', 'js' => 'text/javascript', 'css' => 'text/css'];
$extension = strtolower(pathinfo($resolved, PATHINFO_EXTENSION));
if (is_file($resolved) && isset($assetTypes[$extension])) {
    header('Content-Type: ' . $assetTypes[$extension] . '; charset=utf-8');
    header('Cache-Control: no-cache');
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') readfile($resolved);
    return true;
}
return false;
