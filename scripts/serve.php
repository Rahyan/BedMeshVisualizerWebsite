<?php
/** Start a loopback-only preview without changing the machine's php.ini. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
$root = dirname(__DIR__);
$arguments = array_slice($argv, 1);
if (array_diff($arguments, ['--blog'])) {
    fwrite(STDERR, "Usage: php scripts/serve.php [--blog]\n");
    exit(2);
}
if (in_array('--blog', $arguments, true)) {
    $configuration = $root . '/.work/blog-local.json';
    $local = is_file($configuration) ? json_decode((string) file_get_contents($configuration), true) : null;
    $environment = is_array($local) && ($local['version'] ?? null) === 1 ? ($local['environment'] ?? null) : null;
    $allowed = ['BEDMESH_DB_HOST', 'BEDMESH_DB_PORT', 'BEDMESH_DB_NAME', 'BEDMESH_DB_USER', 'BEDMESH_DB_PASS', 'BEDMESH_BLOG_URL'];
    if (!is_array($environment) || ($environment['BEDMESH_DB_HOST'] ?? null) !== '127.0.0.1'
        || !isset($environment['BEDMESH_DB_PORT']) || !ctype_digit((string) $environment['BEDMESH_DB_PORT'])
        || (int) $environment['BEDMESH_DB_PORT'] < 1024 || (int) $environment['BEDMESH_DB_PORT'] > 65535) {
        fwrite(STDERR, "Local blog configuration is missing or invalid. Start php scripts/blog-local.php start first.\n");
        exit(1);
    }
    foreach ($allowed as $key) {
        if (!isset($environment[$key]) || !is_string($environment[$key]) || str_contains($environment[$key], "\0")) {
            fwrite(STDERR, "Local blog configuration is incomplete. Recreate it with scripts/blog-local.php.\n");
            exit(1);
        }
        putenv($key . '=' . $environment[$key]);
    }
    echo "Using the isolated local blog database.\n";
}
$temporary = $root . '/.work/tmp';
$sessions = $root . '/.work/sessions';
foreach ([$temporary, $sessions] as $directory) {
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        fwrite(STDERR, 'Could not create local PHP runtime directories.' . PHP_EOL);
        exit(1);
    }
}
$command = [PHP_BINARY,
    '-d', 'sys_temp_dir=' . $temporary,
    '-d', 'upload_tmp_dir=' . $temporary,
    '-d', 'session.save_path=' . $sessions,
    '-d', 'display_errors=0',
    '-d', 'log_errors=1',
    '-S', '127.0.0.1:8765', '-t', $root, $root . '/router.php'];
$process = proc_open($command, [STDIN, STDOUT, STDERR], $pipes, $root);
if (!is_resource($process)) {
    fwrite(STDERR, 'Could not start the local PHP server.' . PHP_EOL);
    exit(1);
}
exit(proc_close($process));
