<?php

class BlogDatabaseUnavailable extends RuntimeException {}

/** One connection for every blog query. Credentials only come from the environment. */
function database_connection(): PDO
{
    static $connection = null;
    if ($connection instanceof PDO) {
        return $connection;
    }
    $settings = [];
    foreach (['HOST', 'NAME', 'USER', 'PASS'] as $name) {
        $value = getenv('BEDMESH_DB_' . $name);
        if ($value === false || ($name !== 'PASS' && $value === '')) {
            error_log('Bed Mesh Blog: database configuration is missing.');
            throw new BlogDatabaseUnavailable('The blog database is unavailable.');
        }
        $settings[$name] = $value;
    }
    $port = getenv('BEDMESH_DB_PORT');
    $port = $port === false || $port === '' ? 3306 : filter_var($port, FILTER_VALIDATE_INT);
    if ($port === false || $port < 1 || $port > 65535 || preg_match('/[;\r\n]/', $settings['HOST'] . $settings['NAME'])) {
        error_log('Bed Mesh Blog: database configuration is invalid.');
        throw new BlogDatabaseUnavailable('The blog database is unavailable.');
    }
    try {
        $connection = new PDO(
            'mysql:host=' . $settings['HOST'] . ';port=' . $port . ';dbname=' . $settings['NAME'] . ';charset=utf8mb4',
            $settings['USER'],
            $settings['PASS'],
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
             PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
             PDO::ATTR_EMULATE_PREPARES => false]
        );
    } catch (PDOException $exception) {
        // Driver exceptions can include connection details: keep the log generic.
        error_log('Bed Mesh Blog: database connection failed.');
        throw new BlogDatabaseUnavailable('The blog database is unavailable.');
    }
    return $connection;
}
