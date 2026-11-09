<?php

ini_set('session.use_strict_mode', '1');
session_set_cookie_params([
    'httponly' => true,
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'samesite' => 'Lax',
    'path' => '/',
]);
session_name('BEDMESH_BLOG_SESSION');
session_start();
require __DIR__ . '/../app/core/init.php';

$recoveryRequest = is_string($_GET['url'] ?? null) && preg_match('~^admin/recovery(?:/|$)~', trim($_GET['url'], '/'));
// Every state-changing request, including sign-in, needs its session token.
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST' && !csrf_valid($_POST['csrf_token'] ?? null)) {
    http_response_code(403);
    if ($recoveryRequest) { header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store, private'); echo json_encode(['ok' => false, 'error' => 'csrf_failed']); exit; }
    exit('Your form expired. Go back, reload the page, and try again.');
}

foreach ($_POST as $field) {
    if (!is_string($field)) {
        http_response_code(400);
        if ($recoveryRequest) { header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store, private'); echo json_encode(['ok' => false, 'error' => 'invalid_payload']); exit; }
        exit('Invalid form data.');
    }
}

// Keep legacy relative uploads anchored to public/, without loading legacy pages.
chdir(__DIR__);
require_once __DIR__ . '/../app/core/editorial.php';
ob_start();
try {
    require __DIR__ . '/../app/application.php';
    ob_end_flush();
} catch (BlogDatabaseUnavailable $exception) {
    ob_end_clean();
    if ($recoveryRequest) { blog_json(['ok' => false, 'error' => 'temporarily_unavailable'], 503); exit; }
    blog_error_page(503, 'The journal is taking a short break', 'Published stories are temporarily unavailable. The mesh visualizer and guides are ready to use.');
}
