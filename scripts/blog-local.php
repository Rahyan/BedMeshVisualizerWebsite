<?php
/** Isolated MariaDB preview. No Windows service, Wamp config, or existing data is used. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$root = dirname(__DIR__);
$folder = $root . '/.work/blog-local';
$configFile = $root . '/.work/blog-local.json';
$action = $argv[1] ?? 'status';
function local_connection(array $config, bool $application = false): PDO
{
    $env = $config['environment'];
    $pdo = new PDO('mysql:host=127.0.0.1;port=' . (int) $env['BEDMESH_DB_PORT'] . ';charset=utf8mb4',
        $application ? $env['BEDMESH_DB_USER'] : 'root',
        $application ? $env['BEDMESH_DB_PASS'] : $config['rootPassword'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 2]);
    $actual = str_replace('\\', '/', (string) $pdo->query('SELECT @@datadir')->fetchColumn());
    $expected = str_replace('\\', '/', $config['server']['datadir']);
    if (strtolower(rtrim($actual, '/')) !== strtolower(rtrim($expected, '/'))) {
        throw new RuntimeException('The local data directory does not match.');
    }
    return $pdo;
}
function save_local_config(string $path, array $config): void
{
    file_put_contents($path, json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n", LOCK_EX);
    @chmod($path, 0600);
}
try {
    if (!in_array($action, ['init', 'start', 'status', 'stop'], true)) {
        fwrite(STDERR, "Usage: php scripts/blog-local.php init|start|status|stop\n"); exit(1);
    }
    $config = is_file($configFile) ? json_decode(file_get_contents($configFile), true, 16, JSON_THROW_ON_ERROR) : null;
    if ($config !== null && (($config['version'] ?? null) !== 1 || str_replace('\\', '/', $config['server']['datadir'] ?? '') !== str_replace('\\', '/', $folder) . '/data')) throw new RuntimeException();
    if (!$config && in_array($action, ['init', 'start'], true)) {
        $binaryFolder = getenv('BEDMESH_MARIADB_BIN') ?: '';
        if ($binaryFolder === '') {
            $candidates = glob('C:/wamp64/bin/mariadb/*/bin', GLOB_ONLYDIR) ?: [];
            rsort($candidates);
            $binaryFolder = $candidates[0] ?? '';
        }
        $binary = $binaryFolder . '/mysqld.exe';
        $installer = $binaryFolder . '/mysql_install_db.exe';
        if (!is_file($binary) || !is_file($installer)) {
            fwrite(STDERR, "MariaDB was not found. Set BEDMESH_MARIADB_BIN to its bin directory.\n"); exit(1);
        }
        if (is_dir($folder . '/data')) {
            fwrite(STDERR, "An unconfigured local data directory already exists; preserve it and inspect it before retrying.\n"); exit(1);
        }
        if (!is_dir($folder) && !mkdir($folder, 0700, true)) throw new RuntimeException();
        $listener = stream_socket_server('tcp://127.0.0.1:0', $errorNumber, $errorMessage);
        if (!$listener) throw new RuntimeException();
        $port = (int) substr(strrchr(stream_socket_get_name($listener, false), ':'), 1);
        fclose($listener);
        $config = [
            'version' => 1,
            'environment' => [
                'BEDMESH_DB_HOST' => '127.0.0.1', 'BEDMESH_DB_PORT' => (string) $port,
                'BEDMESH_DB_NAME' => 'bedmesh_blog', 'BEDMESH_DB_USER' => 'bedmesh_local',
                'BEDMESH_DB_PASS' => bin2hex(random_bytes(24)), 'BEDMESH_BLOG_URL' => '/blog/public',
            ],
            'server' => ['binary' => $binary, 'datadir' => $folder . '/data', 'port' => $port],
            'rootPassword' => bin2hex(random_bytes(24)),
        ];
        $command = [$installer, '--datadir=' . $config['server']['datadir'], '--port=' . $port,
            '--password=' . $config['rootPassword'], '--silent'];
        $process = proc_open($command, [0 => ['pipe', 'r'], 1 => ['file', $folder . '/initialize.log', 'a'], 2 => ['file', $folder . '/initialize.log', 'a']], $pipes, $folder);
        if (!is_resource($process)) throw new RuntimeException();
        fclose($pipes[0]);
        if (proc_close($process) !== 0) throw new RuntimeException();
        save_local_config($configFile, $config);
        echo "Initialized an isolated local MariaDB data directory. Configuration stays in ignored .work/.\n";
    }
    if (!$config) { echo "The isolated blog database has not been initialized. Run the start command.\n"; exit($action === 'status' ? 0 : 1); }
    if ($action === 'init') exit;
    if (in_array($action, ['status', 'stop'], true)) {
        try { $pdo = local_connection($config); }
        catch (Throwable $exception) { echo "The isolated blog database is stopped.\n"; exit($action === 'status' ? 0 : 1); }
        if ($action === 'stop') { $pdo->exec('SHUTDOWN'); echo "Stopped the isolated blog database.\n"; }
        else echo 'The isolated blog database is ready on 127.0.0.1:' . (int) $config['server']['port'] . ".\n";
        exit;
    }
    try {
        local_connection($config);
        echo "The isolated blog database is already running.\n"; exit;
    } catch (Throwable $exception) { /* Start only the configured private instance. */ }
    $datadir = $config['server']['datadir'];
    $command = [$config['server']['binary'], '--no-defaults', '--basedir=' . dirname(dirname($config['server']['binary'])),
        '--datadir=' . $datadir, '--port=' . (int) $config['server']['port'], '--bind-address=127.0.0.1',
        '--skip-name-resolve', '--skip-log-bin', '--innodb-buffer-pool-size=32M', '--max-connections=16',
        '--pid-file=' . $folder . '/server.pid', '--log-error=' . $folder . '/server.log'];
    $process = proc_open($command, [0 => ['pipe', 'r'], 1 => ['file', $folder . '/server-console.log', 'a'], 2 => ['file', $folder . '/server-console.log', 'a']], $pipes, $folder);
    if (!is_resource($process)) throw new RuntimeException();
    fclose($pipes[0]);
    register_shutdown_function(static function () use ($process) {
        if (is_resource($process) && proc_get_status($process)['running']) proc_terminate($process);
    });
    $pdo = null;
    for ($attempt = 0; $attempt < 100; $attempt++) {
        try { $pdo = local_connection($config); break; }
        catch (Throwable $exception) { usleep(100000); }
        if (!proc_get_status($process)['running']) break;
    }
    if (!$pdo) throw new RuntimeException();
    $env = $config['environment'];
    $pdo->exec('CREATE DATABASE IF NOT EXISTS bedmesh_blog CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    $pdo->exec("CREATE USER IF NOT EXISTS 'bedmesh_local'@'127.0.0.1' IDENTIFIED BY " . $pdo->quote($env['BEDMESH_DB_PASS']));
    $pdo->exec("GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX ON bedmesh_blog.* TO 'bedmesh_local'@'127.0.0.1'");
    echo 'Isolated MariaDB ready on 127.0.0.1:' . (int) $config['server']['port'] . ". Keep this process running.\n";
    echo "Next: php scripts/blog-db.php migrate --local; then start the preview with php scripts/serve.php --blog.\n";
    while (proc_get_status($process)['running']) usleep(250000);
    proc_close($process);
} catch (Throwable $exception) {
    fwrite(STDERR, "The isolated blog database operation failed. Inspect .work/blog-local/*.log locally; no existing database service was changed.\n");
    exit(1);
}
