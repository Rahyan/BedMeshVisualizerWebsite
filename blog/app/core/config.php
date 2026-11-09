<?php

// Set an absolute URL or a deployment path; a local checkout works without config.
$blogRoot = getenv('BEDMESH_BLOG_URL');
define('ROOT', rtrim($blogRoot === false || $blogRoot === '' ? '/blog/public' : $blogRoot, '/'));
define('APP_NAME', 'Bed Mesh Blog');
define('BLOG_PUBLIC_PATH', dirname(__DIR__, 2) . '/public');
