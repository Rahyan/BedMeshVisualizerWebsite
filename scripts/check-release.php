<?php
/** Local release verification. Never connects to a database or deployment host. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$root = dirname(__DIR__);
$failures = 0;
$warnings = [];
$environment = getenv();
foreach (array_keys($environment) as $key) {
    if (str_starts_with($key, 'BEDMESH_DB_') || $key === 'BEDMESH_GA_MEASUREMENT_ID') unset($environment[$key]);
}

function release_command(array $command, string $input = ''): array
{
    global $root, $environment;
    $process = @proc_open($command, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['redirect', 1]], $pipes, $root, $environment);
    if (!is_resource($process)) return [1, 'Could not start ' . $command[0]];
    $written = 0;
    while ($written < strlen($input)) {
        $count = fwrite($pipes[0], substr($input, $written));
        if ($count === false || $count === 0) break;
        $written += $count;
    }
    fclose($pipes[0]);
    $output = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    return [proc_close($process), (string) $output];
}

function release_result(string $label, bool $passed, string $detail = ''): void
{
    global $failures;
    echo ($passed ? '[PASS] ' : '[FAIL] ') . $label . PHP_EOL;
    if (!$passed) {
        $failures++;
        if ($detail !== '') echo trim($detail) . PHP_EOL;
    }
}

function release_test(string $label, array $command): void
{
    [$code, $output] = release_command($command);
    release_result($label, $code === 0, $output);
    if ($code === 0 && preg_match('/(?:# tests \d+|Ran \d+ tests?)/', $output, $match)) echo '       ' . $match[0] . PHP_EOL;
}

echo 'Bed Mesh release checks (local only)' . PHP_EOL;
release_result('PHP meets the application minimum (8.1+)', PHP_VERSION_ID >= 80100, PHP_VERSION);
if (PHP_VERSION_ID < 80200) $warnings[] = 'This local PHP branch is no longer security-supported. Use a supported, patched PHP release on the host: https://www.php.net/supported-versions.php';

// Include new source files being reviewed, while respecting ignored local data.
// safe.directory is scoped to this read-only invocation, never global Git config.
[$gitCode, $inventory] = release_command(['git', '-c', 'safe.directory=' . str_replace('\\', '/', $root), 'ls-files', '--cached', '--others', '--exclude-standard', '-z']);
release_result('Release candidate inventory is available from Git', $gitCode === 0, $inventory);
$files = $gitCode === 0 ? array_values(array_filter(explode("\0", $inventory), fn ($file) => is_file($root . '/' . $file))) : [];
$unsafe = [];
foreach ($files as $file) {
    $base = basename($file);
    if (strcasecmp($base, 'AGENTS.md') === 0 ||
        (preg_match('/^\.env(?:\.|$)/i', $base) && $base !== '.env.example') ||
        preg_match('/^google[0-9a-f]+\.html$/i', $base) ||
        (str_ends_with(strtolower($file), '.sql') && $file !== 'blog/database/schema.sql') ||
        preg_match('~(?:^|/)(?:uploads|sessions|\.work|\.aws|\.codex|\.agents)(?:/|$)|\.(?:sqlite3?|db|log|pem|key|p12|pfx)$~i', $file) ||
        preg_match('/^(?:credentials.*|service-account.*)\.json$/i', $base)) $unsafe[] = $file;
}
release_result('No environment files, verification files, runtime data, keys, or populated dump filenames in the candidate', $unsafe === [], implode(PHP_EOL, $unsafe));
$schema = @file_get_contents($root . '/blog/database/schema.sql');
release_result('The allowed database schema contains no inserted user/content rows', $schema !== false && !preg_match('/\b(?:INSERT|REPLACE)\s+INTO\b/i', $schema));

$phpErrors = [];
$phpCount = 0;
foreach ($files as $file) {
    if (strtolower(pathinfo($file, PATHINFO_EXTENSION)) !== 'php') continue;
    $phpCount++;
    [$code, $output] = release_command([PHP_BINARY, '-l', $root . '/' . $file]);
    if ($code !== 0) $phpErrors[] = $file . PHP_EOL . $output;
}
release_result('PHP syntax (' . $phpCount . ' files)', $phpErrors === [], implode(PHP_EOL, $phpErrors));

$jsErrors = [];
$jsFiles = array_merge(glob($root . '/js/*.js') ?: [], glob($root . '/js/*.mjs') ?: []);
foreach ($jsFiles as $file) {
    [$code, $output] = release_command(['node', '--input-type=module', '--check'], (string) file_get_contents($file));
    if ($code !== 0) $jsErrors[] = basename($file) . PHP_EOL . $output;
}
release_result('Browser module syntax (' . count($jsFiles) . ' files)', $jsErrors === [], implode(PHP_EOL, $jsErrors));

$missingAssets = [];
$styles = [];
$checkAsset = static function (string $url, string $relativeTo = '') use ($root, &$missingAssets, &$styles): void {
    $url = html_entity_decode($url, ENT_QUOTES, 'UTF-8');
    if (preg_match('~^(?:[a-z]+:|//|#)~i', $url)) return;
    $path = rawurldecode(explode('#', explode('?', $url, 2)[0], 2)[0]);
    if (!preg_match('/\.(?:css|js|mjs|png|jpe?g|webp|ico|svg|woff2?)$/i', $path)) return;
    $file = $root . '/' . (str_starts_with($path, '/') ? ltrim($path, '/') : ($relativeTo === '' ? '' : $relativeTo . '/') . $path);
    if (!is_file($file)) $missingAssets[] = $url;
    elseif (str_ends_with(strtolower($path), '.css')) $styles[$file] = true;
};
foreach (['index.php', 'guides/index.php'] as $entry) {
    [$code, $html] = release_command([PHP_BINARY, $root . '/' . $entry]);
    if ($code !== 0) $missingAssets[] = $entry . ' could not render without a database.';
    preg_match_all('~(?:src|href)=["\']([^"\']+)["\']~i', $html, $matches);
    foreach ($matches[1] as $url) $checkAsset($url);
}
foreach (array_keys($styles) as $file) {
    preg_match_all('~url\(\s*["\']?([^"\')]+)["\']?\s*\)~i', (string) file_get_contents($file), $matches);
    $relativeTo = str_replace('\\', '/', substr(dirname($file), strlen($root) + 1));
    foreach ($matches[1] as $url) $checkAsset(trim($url), $relativeTo);
}
release_result('Visualizer/guide images, styles, scripts, and font references exist locally', $missingAssets === [], implode(PHP_EOL, array_unique($missingAssets)));

release_test('Pure JavaScript regression tests', array_merge(['node', '--test'], glob($root . '/tests/*.test.mjs') ?: []));
release_test('Blog security helper checks (database environment removed)', [PHP_BINARY, $root . '/blog/tests/security.php']);
[$pythonCode] = release_command(['python', '--version']);
$python = $pythonCode === 0 ? 'python' : 'python3';
release_test('Loopback HTTP, native module MIME, private routes, and safe errors', [$python, $root . '/tests/test_http.py']);

foreach ($warnings as $warning) echo '[NOTE] ' . $warning . PHP_EOL;
echo $failures === 0 ? 'All local checks passed. Hosting configuration and browser checks still require review.' . PHP_EOL
    : $failures . ' release check group(s) failed.' . PHP_EOL;
exit($failures === 0 ? 0 : 1);
