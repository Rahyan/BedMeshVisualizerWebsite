<?php
/** Real HTTP + CRUD tests in a disposable database on the isolated local MariaDB only. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$root = dirname(__DIR__, 2);
$configFile = $root . '/.work/blog-local.json';
if (!is_file($configFile)) { fwrite(STDERR, "Start scripts/blog-local.php start first.\n"); exit(1); }
$config = json_decode(file_get_contents($configFile), true, 16, JSON_THROW_ON_ERROR);
if (($config['environment']['BEDMESH_DB_HOST'] ?? '') !== '127.0.0.1' || str_replace('\\', '/', $config['server']['datadir'] ?? '') !== str_replace('\\', '/', $root) . '/.work/blog-local/data') throw new RuntimeException('Tests require the isolated loopback database.');
$rootDb = new PDO('mysql:host=127.0.0.1;port=' . (int) $config['environment']['BEDMESH_DB_PORT'] . ';charset=utf8mb4', 'root', $config['rootPassword'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$actual = strtolower(rtrim(str_replace('\\', '/', (string) $rootDb->query('SELECT @@datadir')->fetchColumn()), '/'));
if ($actual !== strtolower(rtrim(str_replace('\\', '/', $config['server']['datadir']), '/'))) throw new RuntimeException('Tests refused a different data directory.');
$suffix = bin2hex(random_bytes(6));
$database = 'bedmesh_test_' . $suffix;
$dbUser = 'bmtest_' . $suffix;
$dbPassword = bin2hex(random_bytes(24));
$runtime = $root . '/.work/blog-tests/' . $suffix;
mkdir($runtime, 0700, true);
$rootDb->exec('CREATE DATABASE `' . $database . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
$rootDb->exec('CREATE USER ' . $rootDb->quote($dbUser) . "@'127.0.0.1' IDENTIFIED BY " . $rootDb->quote($dbPassword));
$rootDb->exec('GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,ALTER,INDEX ON `' . $database . '`.* TO ' . $rootDb->quote($dbUser) . "@'127.0.0.1'");
foreach (['HOST' => '127.0.0.1', 'PORT' => $config['environment']['BEDMESH_DB_PORT'], 'NAME' => $database, 'USER' => $dbUser, 'PASS' => $dbPassword] as $key => $value) putenv('BEDMESH_DB_' . $key . '=' . $value);
putenv('BEDMESH_BLOG_URL=/blog/public');
require $root . '/blog/app/core/init.php';
require $root . '/blog/app/core/editorial.php';
require $root . '/blog/app/core/migrations.php';
$checks = 0;
function verify(bool $condition, string $label): void
{
    global $checks;
    if (!$condition) throw new RuntimeException('Failed: ' . $label);
    $checks++;
}
$server = null;
$createdImages = [];
try {
    // Every existing managed table must be transactional before any migration DDL.
    // These fixtures live only in the guarded disposable test database.
    foreach (['users', 'categories', 'posts', 'blog_login_attempts', 'post_revisions', 'post_recoveries'] as $managed) {
        database_connection()->exec('CREATE TABLE `' . $managed . '` (id INT PRIMARY KEY, marker VARCHAR(80)) ENGINE=MyISAM');
        database_connection()->exec("INSERT INTO `" . $managed . "` (id,marker) VALUES (1,'Preserve this legacy row')");
        $beforeSchema = database_connection()->query('SHOW CREATE TABLE `' . $managed . '`')->fetchColumn(1);
        $beforeRows = database_connection()->query('SELECT * FROM `' . $managed . '`')->fetchAll(PDO::FETCH_ASSOC);
        $beforeTables = database_connection()->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
        $blocked = false;
        try { migrate_blog_database(); }
        catch (BlogMigrationBlocked $exception) { $blocked = str_contains($exception->getMessage(), $managed . ' must use InnoDB'); }
        verify($blocked
            && database_connection()->query('SHOW CREATE TABLE `' . $managed . '`')->fetchColumn(1) === $beforeSchema
            && database_connection()->query('SELECT * FROM `' . $managed . '`')->fetchAll(PDO::FETCH_ASSOC) === $beforeRows
            && database_connection()->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) === $beforeTables,
            'MyISAM ' . $managed . ' blocks migration before table creation or schema/data changes');
        $rootDb->exec('DROP TABLE `' . $database . '`.`' . $managed . '`');
    }
    $rootDb->exec("CREATE VIEW `" . $database . "`.`posts` AS SELECT 1 AS id, 'Preserve this view' AS marker");
    $beforeView = $rootDb->query('SHOW CREATE VIEW `' . $database . '`.`posts`')->fetchColumn(1);
    $beforeTables = database_connection()->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    $blocked = false;
    try { migrate_blog_database(); }
    catch (BlogMigrationBlocked $exception) { $blocked = str_contains($exception->getMessage(), 'posts must use InnoDB'); }
    verify($blocked
        && $rootDb->query('SHOW CREATE VIEW `' . $database . '`.`posts`')->fetchColumn(1) === $beforeView
        && database_connection()->query('SELECT marker FROM posts')->fetchColumn() === 'Preserve this view'
        && database_connection()->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) === $beforeTables,
        'a managed view blocks migration before table creation or definition changes');
    $rootDb->exec('DROP VIEW `' . $database . '`.`posts`');
    if ((int) database_connection()->query('SELECT @@lower_case_table_names')->fetchColumn() === 0) {
        database_connection()->exec('CREATE TABLE `Posts` (id INT PRIMARY KEY, marker VARCHAR(80)) ENGINE=InnoDB');
        database_connection()->exec("INSERT INTO `Posts` VALUES (1,'Preserve uppercase legacy table')");
        $beforeSchema = database_connection()->query('SHOW CREATE TABLE `Posts`')->fetchColumn(1);
        $beforeTables = database_connection()->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
        $blocked = false;
        try { migrate_blog_database(); }
        catch (BlogMigrationBlocked $exception) { $blocked = str_contains($exception->getMessage(), 'Posts differs in letter case'); }
        verify($blocked
            && database_connection()->query('SHOW CREATE TABLE `Posts`')->fetchColumn(1) === $beforeSchema
            && database_connection()->query('SELECT marker FROM `Posts`')->fetchColumn() === 'Preserve uppercase legacy table'
            && database_connection()->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) === $beforeTables,
            'uppercase legacy tables block migration before an empty lowercase journal can be created');
        $rootDb->exec('DROP TABLE `' . $database . '`.`Posts`');
    } else {
        echo "[SKIP] Case-sensitive legacy table fixture requires lower_case_table_names=0.\n";
    }
    database_connection()->exec("CREATE TABLE unrelated_legacy (marker VARCHAR(80)) ENGINE=MyISAM");
    database_connection()->exec("INSERT INTO unrelated_legacy VALUES ('Unrelated data stays untouched')");
    verify(migrate_blog_database() === [] && database_connection()->query('SELECT marker FROM unrelated_legacy')->fetchColumn() === 'Unrelated data stays untouched', 'unrelated nontransactional tables do not block a fresh journal setup');
    $fixtureImage = 'uploads/test-' . $suffix . '.png';
    if (!is_dir(BLOG_PUBLIC_PATH . '/uploads')) mkdir(BLOG_PUBLIC_PATH . '/uploads', 0755, true);
    file_put_contents(BLOG_PUBLIC_PATH . '/' . $fixtureImage, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVIcAAAAASUVORK5CYII='));
    $createdImages[] = $fixtureImage;
    // Simulate the previous schema in an empty, disposable database, preserving one article.
    create_tables();
    database_connection()->exec('ALTER TABLE posts DROP INDEX slug_unique');
    database_connection()->exec('ALTER TABLE categories DROP INDEX slug_unique');
    foreach (['excerpt', 'status', 'published_at', 'updated_at', 'image_alt', 'image_caption', 'image_credit', 'image_credit_url', 'edit_version'] as $column) database_connection()->exec('ALTER TABLE posts DROP COLUMN ' . $column);
    database_connection()->exec('ALTER TABLE posts MODIFY content TEXT NULL');
    blog_write("INSERT INTO posts (title,slug,content) VALUES ('Legacy preserved','legacy-preserved','<p>Original text survives.</p>')");
    blog_write("INSERT INTO posts (title,slug,content) VALUES ('Second legacy record','legacy-preserved','<p>Second text survives.</p>')");
    $blocked = false;
    try { migrate_blog_database(); } catch (BlogMigrationBlocked $exception) { $blocked = str_contains($exception->getMessage(), 'posts contains duplicate slugs'); }
    verify($blocked && (int) blog_record("SELECT COUNT(*) AS total FROM posts WHERE slug='legacy-preserved'")['total'] === 2, 'migration stops for duplicate article slugs without removing or renaming data');
    blog_write("UPDATE posts SET slug='legacy-preserved-second' WHERE title='Second legacy record'");
    blog_write("INSERT INTO categories (category,slug) VALUES ('Legacy A','legacy-category'),('Legacy B','legacy-category')");
    $blocked = false;
    try { migrate_blog_database(); } catch (BlogMigrationBlocked $exception) { $blocked = str_contains($exception->getMessage(), 'categories contains duplicate slugs'); }
    verify($blocked && (int) blog_record("SELECT COUNT(*) AS total FROM categories WHERE slug='legacy-category'")['total'] === 2, 'migration stops for duplicate category slugs without silently changing URLs');
    blog_write("UPDATE categories SET slug='legacy-category-b' WHERE category='Legacy B'");
    $changes = migrate_blog_database();
    $legacy = blog_record("SELECT * FROM posts WHERE slug='legacy-preserved'");
    verify($legacy['status'] === 'draft' && $legacy['published_at'] === null && $legacy['content'] === '<p>Original text survives.</p>', 'legacy migration preserves content and defaults to private draft');
    verify(count($changes) >= 5 && migrate_blog_database() === [], 'migration is additive and idempotent');
    $password = bin2hex(random_bytes(18));
    blog_write("INSERT INTO users (username,email,password,role) VALUES ('Test editor','editor@example.invalid',:password,'admin')", ['password' => password_hash($password, PASSWORD_DEFAULT)]);
    $author = (int) database_connection()->lastInsertId();
    blog_write("INSERT INTO users (username,email,password,role) VALUES ('Reader','reader@example.invalid',:password,'user')", ['password' => password_hash($password, PASSWORD_DEFAULT)]);
    blog_write("INSERT INTO categories (category,slug,disabled) VALUES ('Analysis','analysis',0),('Hidden','hidden',1)");
    $category = (int) blog_record("SELECT id FROM categories WHERE slug='analysis'")['id'];
    $hidden = (int) blog_record("SELECT id FROM categories WHERE slug='hidden'")['id'];
    $worker = 'require ' . var_export($root . '/blog/app/core/init.php', true) . '; require ' . var_export($root . '/blog/app/core/editorial.php', true) . '; '
        . '$data=["title"=>"Concurrent URL","excerpt"=>"","content"=>"<p>Race test.</p>","status"=>"draft","image"=>null,"published_at"=>null,"category_id"=>(int)$argv[1],"user_id"=>(int)$argv[2]];blog_save_article($data,0,0,(int)$argv[2]);blog_insert_category("Concurrent category");echo "ok";';
    $workers = [];
    for ($i = 0; $i < 8; $i++) {
        $process = proc_open([PHP_BINARY, '-d', 'display_errors=0', '-r', $worker, (string) $category, (string) $author], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['file', $runtime . '/concurrency.log', 'a']], $workerPipes, $root);
        fclose($workerPipes[0]);
        $workers[] = [$process, $workerPipes[1]];
    }
    foreach ($workers as [$process, $output]) {
        $result = stream_get_contents($output); fclose($output);
        verify(proc_close($process) === 0 && $result === 'ok', 'simultaneous transactional article/category creation finishes with collision retry');
    }
    $races = blog_record("SELECT COUNT(*) AS total,COUNT(DISTINCT slug) AS urls FROM posts WHERE title='Concurrent URL'");
    verify((int) $races['total'] === 8 && (int) $races['urls'] === 8, 'concurrent article saves each receive a distinct URL');
    $races = blog_record("SELECT COUNT(*) AS total,COUNT(DISTINCT slug) AS urls FROM categories WHERE category='Concurrent category'");
    verify((int) $races['total'] === 8 && (int) $races['urls'] === 8, 'concurrent category saves each receive a distinct URL');
    $constrained = false;
    try { blog_write("INSERT INTO categories (category,slug) VALUES ('Duplicate attempt','analysis')"); }
    catch (BlogSlugConflict $exception) { $constrained = true; }
    verify($constrained, 'database itself rejects duplicate slugs');

    for ($i = 1; $i <= 8; $i++) blog_write("INSERT INTO posts (user_id,category_id,title,slug,excerpt,content,status,published_at) VALUES (:author,:category,:title,:slug,'A real test summary.','<h2>A section</h2><p>Measured height.</p>','published',UTC_TIMESTAMP())", ['author' => $author, 'category' => $category, 'title' => 'Published article ' . $i, 'slug' => 'published-' . $i]);
    blog_write("INSERT INTO posts (user_id,category_id,title,slug,content,status) VALUES (:author,:category,'Secret draft','secret-draft','<p>Private body marker.</p>','draft')", ['author' => $author, 'category' => $category]);
    blog_write("INSERT INTO posts (user_id,category_id,title,slug,content,status,published_at) VALUES (:author,:category,'Future article','future-article','<p>Future body.</p>','published',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY))", ['author' => $author, 'category' => $category]);
    blog_write("INSERT INTO posts (user_id,category_id,title,slug,content,status,published_at) VALUES (:author,:category,'Hidden category article','hidden-article','<p>Hidden body.</p>','published',UTC_TIMESTAMP())", ['author' => $author, 'category' => $hidden]);
    blog_write("UPDATE posts SET image=:image,image_alt='A test-only pixel image'", ['image' => $fixtureImage]);
    $listener = stream_socket_server('tcp://127.0.0.1:0', $number, $error);
    $port = (int) substr(strrchr(stream_socket_get_name($listener, false), ':'), 1); fclose($listener);
    $server = proc_open([PHP_BINARY, '-d', 'display_errors=0', '-d', 'session.save_path=' . $runtime, '-d', 'upload_tmp_dir=' . $runtime, '-S', '127.0.0.1:' . $port, '-t', $root, $root . '/router.php'], [0 => ['pipe', 'r'], 1 => ['file', $runtime . '/server.log', 'a'], 2 => ['file', $runtime . '/server.log', 'a']], $pipes, $root);
    if (!is_resource($server)) throw new RuntimeException('Could not start the isolated HTTP test server.');
    fclose($pipes[0]);
    $base = 'http://127.0.0.1:' . $port . '/blog/public/';
    $request = static function (string $route, ?array $data = null, string $jar = 'admin', bool $multipart = false) use ($base, $runtime): array {
        $curl = curl_init($base . $route);
        curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true, CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_COOKIEJAR => $runtime . '/' . $jar . '.cookies', CURLOPT_COOKIEFILE => $runtime . '/' . $jar . '.cookies', CURLOPT_TIMEOUT => 5]);
        if ($data !== null) { curl_setopt($curl, CURLOPT_POST, true); curl_setopt($curl, CURLOPT_POSTFIELDS, $multipart ? $data : http_build_query($data)); }
        $raw = curl_exec($curl);
        if ($raw === false) { curl_close($curl); return [0, '', '']; }
        $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE); $size = curl_getinfo($curl, CURLINFO_HEADER_SIZE);
        curl_close($curl);
        return [$status, substr($raw, $size), substr($raw, 0, $size)];
    };
    $token = static function (string $body): string { preg_match('/name="csrf_token" value="([a-f0-9]+)"/', $body, $match); return $match[1] ?? ''; };
    for ($i = 0; $i < 40; $i++) { if ($request('')[0]) break; usleep(100000); }
    [$status, $html] = $request('');
    verify($status === 200 && str_contains($html, 'Published article') && !str_contains($html, 'Secret draft') && !str_contains($html, 'Future article') && !str_contains($html, 'Hidden category article'), 'public list contains only eligible published articles');
    verify(str_contains($html, 'Page 1 of 2') && $request('?page=2')[0] === 200, 'public pagination works');
    verify($request('category/analysis')[0] === 200 && $request('category/hidden')[0] === 404, 'category visibility is enforced');
    [$status, $html] = $request('search?find=Published');
    verify($status === 200 && str_contains($html, '8 articles found'), 'search reads published articles from database');
    [$status, $html] = $request('search?find=' . rawurlencode('<script>bad</script>'));
    verify($status === 200 && !str_contains($html, '<script>bad</script>') && str_contains($html, '&lt;script&gt;'), 'search query is escaped');
    verify($request('post/secret-draft')[0] === 404 && $request('post/secret-draft?preview=1')[0] === 404, 'drafts cannot be requested or previewed anonymously');
    verify($request('post/future-article')[0] === 404 && $request('post/hidden-article')[0] === 404, 'future and hidden articles are excluded from direct URLs');
    [$status, $html] = $request('post/published-1');
    preg_match('~<script type="application/ld\+json">([^<]+)</script>~', $html, $structured);
    $schema = json_decode($structured[1] ?? '', true);
    verify($status === 200 && ($schema['@type'] ?? '') === 'BlogPosting'
        && ($schema['headline'] ?? '') === 'Published article 1'
        && str_ends_with($schema['image'] ?? '', '/blog/public/' . $fixtureImage)
        && str_contains($html, 'property="og:image" content="' . ($schema['image'] ?? '') . '"'),
        'published article metadata uses its displayed title and hero');
    [$sitemapStatus, $sitemap] = $request('sitemap.xml');
    verify($sitemapStatus === 200 && str_contains($sitemap, '/post/published-1') && !str_contains($sitemap, 'secret-draft') && !str_contains($sitemap, 'future-article') && !str_contains($sitemap, 'hidden-article') && simplexml_load_string($sitemap) !== false, 'sitemap includes only published eligible URLs');
    verify($request('signup')[0] === 404 && $request('admin')[0] === 302, 'public signup is disabled and admin requires authentication');
    [$status, $html, $headers] = $request('login'); $csrf = $token($html);
    [$flagStatus, $flagBody, $flagHeaders] = $request('login', null, 'fresh-cookie');
    verify($status === 200 && strlen($csrf) === 64 && $flagStatus === 200 && stripos($flagHeaders, 'HttpOnly') !== false && stripos($flagHeaders, 'SameSite=Lax') !== false, 'login uses CSRF and safe session cookie flags');
    verify($request('login', ['email' => 'editor@example.invalid', 'password' => $password])[0] === 403, 'login rejects missing CSRF');
    $sessionBefore = file_get_contents($runtime . '/admin.cookies');
    [$status, $html, $headers] = $request('login', ['email' => 'editor@example.invalid', 'password' => $password, 'csrf_token' => $csrf]);
    verify($status === 303 && str_contains($headers, '/admin'), 'administrator can sign in');
    $sessionAfter = file_get_contents($runtime . '/admin.cookies');
    preg_match('/BEDMESH_BLOG_SESSION\t([^\r\n]+)/', $sessionBefore, $beforeId);
    preg_match('/BEDMESH_BLOG_SESSION\t([^\r\n]+)/', $sessionAfter, $afterId);
    verify(!empty($beforeId[1]) && !empty($afterId[1]) && $beforeId[1] !== $afterId[1], 'login rotates the session ID');
    [$status, $html] = $request('admin'); $csrf = $token($html);
    verify($status === 200 && str_contains($html, 'Secret draft'), 'admin list includes drafts');
    [$status, $html] = $request('post/secret-draft?preview=1');
    verify($status === 200 && str_contains($html, 'Private body marker.') && str_contains($html, 'Private preview.') && str_contains($html, 'noindex'), 'authenticated private draft preview works');
    [$status, $html] = $request('admin/categories/add'); $csrf = $token($html);
    verify($request('admin/categories/add', ['csrf_token' => $csrf, 'category' => 'New category'])[0] === 303, 'category create works');
    $newCategory = (int) blog_record("SELECT id FROM categories WHERE slug='new-category'")['id'];
    [$status, $html] = $request('admin/posts/add'); $csrf = $token($html);
    $article = ['csrf_token' => $csrf, 'title' => 'CRUD <script> title', 'excerpt' => 'Safe summary', 'content' => '<h2>Real section</h2><p onclick="bad()">Readable body<script>injected()</script></p><a href="javascript:bad()">Bad link</a>', 'status' => 'draft', 'category_id' => (string) $newCategory];
    verify($request('admin/posts/add', $article)[0] === 303, 'draft article create works without a required image');
    $created = blog_record("SELECT * FROM posts WHERE title='CRUD <script> title'"); $id = (int) $created['id'];
    verify($created['status'] === 'draft' && $created['published_at'] === null && !str_contains($created['content'], 'onclick') && !str_contains($created['content'], '<script') && !str_contains($created['content'], 'javascript:'), 'draft status and rich HTML sanitization are persisted');
    verify($request('post/' . $created['slug'])[0] === 404, 'new draft remains private');
    $withoutImage = $article; $withoutImage['status'] = 'published'; $withoutImage['edit_version'] = (string) $created['edit_version'];
    [$imageStatus, $imageBody] = $request('admin/posts/edit/' . $id, $withoutImage);
    verify($imageStatus === 200 && str_contains($imageBody, 'Add a relevant featured image') && blog_record('SELECT status FROM posts WHERE id=:id', ['id' => $id])['status'] === 'draft', 'publishing requires a relevant local image');
    $withoutImage['existing_image'] = $fixtureImage;
    [$imageStatus, $imageBody] = $request('admin/posts/edit/' . $id, $withoutImage);
    verify($imageStatus === 200 && str_contains($imageBody, 'Describe the featured image'), 'an image requires meaningful alternate text');
    $withoutImage['image_alt'] = 'A test-only image'; $withoutImage['image_credit_url'] = 'javascript:alert(1)';
    verify($request('admin/posts/edit/' . $id, $withoutImage)[0] === 200 && blog_record('SELECT status FROM posts WHERE id=:id', ['id' => $id])['status'] === 'draft', 'unsafe credit links cannot be saved');
    $article['status'] = 'published';
    $article['existing_image'] = $fixtureImage;
    $article['image_alt'] = 'A test-only pixel image';
    $article['image_caption'] = 'Caption <script>looks like text</script>';
    $article['image_credit'] = 'Bed Mesh test';
    $article['image_credit_url'] = 'https://example.invalid/source';
    $article['edit_version'] = (string) $created['edit_version'];
    verify($request('admin/posts/edit/' . $id, $article)[0] === 303, 'publish update works');
    [$status, $html] = $request('post/' . $created['slug']);
    verify($status === 200 && str_contains($html, 'CRUD &lt;script&gt; title') && !str_contains($html, 'onclick=') && str_contains($html, 'article-section-1'), 'published article renders escaped metadata and generated outline');
    verify(str_contains($html, 'alt="A test-only pixel image"') && str_contains($html, 'Caption &lt;script&gt;looks like text&lt;/script&gt;') && str_contains($html, 'https://example.invalid/source'), 'public image metadata is useful and HTML-escaped');
    $imageFile = $runtime . '/test-image.png';
    file_put_contents($imageFile, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVIcAAAAASUVORK5CYII='));
    $upload = $article;
    $upload['edit_version'] = (string) blog_record('SELECT edit_version FROM posts WHERE id=:id', ['id' => $id])['edit_version'];
    $upload['image'] = new CURLFile($imageFile, 'image/png', '../../not-executable.php');
    verify($request('admin/posts/edit/' . $id, $upload, 'admin', true)[0] === 303, 'actual multipart image upload works with a hostile supplied filename');
    $withImage = blog_record('SELECT image FROM posts WHERE id=:id', ['id' => $id]);
    $createdImages[] = $withImage['image'];
    verify(preg_match('~^uploads/[a-f0-9]{32}\.png$~', $withImage['image']) === 1 && blog_public_file($withImage['image']) !== null, 'uploaded image receives a random byte-verified extension');
    file_put_contents($imageFile, '<?php echo "not an image";');
    $upload['image'] = new CURLFile($imageFile, 'image/png', 'spoof.png');
    [$uploadStatus, $uploadBody] = $request('admin/posts/edit/' . $id, $upload, 'admin', true);
    verify($uploadStatus === 200 && str_contains($uploadBody, 'Choose a valid JPEG') && blog_record('SELECT image FROM posts WHERE id=:id', ['id' => $id])['image'] === $withImage['image'], 'spoofed upload is rejected without replacing the image');
    verify($request('admin/categories/edit/' . $newCategory, ['csrf_token' => $csrf, 'category' => 'Renamed category', 'disabled' => '1'])[0] === 303, 'category edit works');
    verify(blog_record('SELECT slug FROM categories WHERE id=:id', ['id' => $newCategory])['slug'] === 'new-category', 'category renaming preserves its existing URL');
    verify($request('post/' . $created['slug'])[0] === 404 && $request('post/' . $created['slug'] . '?preview=1')[0] === 200, 'hidden category also protects direct published pages while allowing admin preview');
    verify($request('admin/categories/edit/' . $newCategory, ['csrf_token' => $csrf, 'category' => 'Renamed category'])[0] === 303, 'category can be re-enabled');
    $article['status'] = 'draft';
    $article['edit_version'] = (string) blog_record('SELECT edit_version FROM posts WHERE id=:id', ['id' => $id])['edit_version'];
    verify($request('admin/posts/edit/' . $id, $article)[0] === 303 && $request('post/' . $created['slug'])[0] === 404, 'unpublishing removes the public article');
    $canonicalBefore = blog_record('SELECT * FROM posts WHERE id=:id', ['id' => $id]);
    $canonicalText = json_encode($canonicalBefore);
    [$recoveryStatus, $recoveryBody, $recoveryHeaders] = $request('admin/recovery/' . $id);
    $recovery = json_decode($recoveryBody, true);
    verify($recoveryStatus === 200 && $recovery['available'] === false && $recovery['version'] === 0 && stripos($recoveryHeaders, 'no-store') !== false, 'private recovery starts empty and is never cached');
    verify($request('admin/recovery/' . $id, null, 'anonymous-recovery')[0] === 401, 'recovery is unavailable anonymously');
    [$missingStatus, $missingBody] = $request('admin/recovery/' . $id, ['action' => 'save']);
    verify($missingStatus === 403 && (json_decode($missingBody, true)['error'] ?? '') === 'csrf_failed', 'recovery mutation requires CSRF with a JSON error');
    $autosave = ['csrf_token' => $csrf, 'action' => 'save', 'expected_version' => '0', 'base_version' => (string) $canonicalBefore['edit_version'], 'title' => 'Unsaved recovery', 'content' => '<p>Recovery body.</p><script>Private unrendered source</script>', 'excerpt' => 'An unfinished summary', 'status' => 'draft', 'category_id' => (string) $newCategory, 'image_alt' => 'Recovered description', 'image_caption' => 'Recovered caption', 'image_credit' => 'Recovered credit', 'image_credit_url' => 'https://example.invalid/credit', 'remove_image' => ''];
    [$recoveryStatus, $recoveryBody] = $request('admin/recovery/' . $id, $autosave); $recovery = json_decode($recoveryBody, true);
    verify($recoveryStatus === 200 && $recovery['available'] && $recovery['version'] === 1 && $recovery['payload']['content'] === $autosave['content'] && !str_contains($recoveryBody, '<script>') && preg_match('/T\d{2}:\d{2}:\d{2}Z$/', $recovery['updated_at']) === 1, 'unsaved source is privately recoverable with safe JSON and UTC timestamps');
    verify(json_encode(blog_record('SELECT * FROM posts WHERE id=:id', ['id' => $id])) === $canonicalText, 'autosave never modifies or publishes the canonical article');
    verify($request('admin/recovery/' . $id, $autosave)[0] === 409, 'stale recovery version cannot overwrite existing work');
    $autosave['expected_version'] = '1'; $autosave['content'] = '<p>Later recovery text.</p>';
    [$recoveryStatus, $recoveryBody] = $request('admin/recovery/' . $id, $autosave); $recovery = json_decode($recoveryBody, true);
    verify($recoveryStatus === 200 && $recovery['version'] === 2, 'optimistic recovery updates increment their version');
    $discard = ['csrf_token' => $csrf, 'action' => 'discard', 'expected_version' => '1', 'base_version' => $autosave['base_version']];
    verify($request('admin/recovery/' . $id, $discard)[0] === 409, 'stale discard cannot destroy newer recovery text');
    $discard['expected_version'] = '2';
    [$discardStatus, $discardBody] = $request('admin/recovery/' . $id, $discard); $discarded = json_decode($discardBody, true);
    verify($discardStatus === 200 && !$discarded['available'] && $discarded['version'] === 3, 'explicit discard clears text while retaining its concurrency marker');
    $autosave['expected_version'] = '2';
    verify($request('admin/recovery/' . $id, $autosave)[0] === 409, 'pre-discard versions cannot reuse a recovery slot');
    $autosave['expected_version'] = '3';
    [$recoveryStatus, $recoveryBody] = $request('admin/recovery/' . $id, $autosave); $recovery = json_decode($recoveryBody, true);
    verify($recoveryStatus === 200 && $recovery['version'] === 4, 'new recovery after discard respects the retained version');
    blog_write("INSERT INTO users (username,email,password,role) VALUES ('Other editor','other@example.invalid',:password,'admin')", ['password' => password_hash($password, PASSWORD_DEFAULT)]);
    [$otherStatus, $otherLogin] = $request('login', null, 'other-editor');
    verify($request('login', ['csrf_token' => $token($otherLogin), 'email' => 'other@example.invalid', 'password' => $password], 'other-editor')[0] === 303, 'second administrator can authenticate independently');
    [$otherStatus, $otherBody] = $request('admin/recovery/' . $id, null, 'other-editor');
    verify($otherStatus === 200 && !json_decode($otherBody, true)['available'], 'one administrator cannot read another administrator’s recovery');
    $article['edit_version'] = (string) $canonicalBefore['edit_version']; $article['recovery_version'] = '4';
    verify($request('admin/posts/edit/' . $id, $article)[0] === 303, 'manual save applies the canonical article with optimistic edit version');
    [$recoveryStatus, $recoveryBody] = $request('admin/recovery/' . $id); $recovery = json_decode($recoveryBody, true);
    verify(!$recovery['available'] && $recovery['version'] === 5, 'successful manual save clears only its matching recovery version');
    $afterSave = blog_record('SELECT * FROM posts WHERE id=:id', ['id' => $id]);
    verify($request('admin/posts/edit/' . $id, $article)[0] === 409 && blog_record('SELECT edit_version FROM posts WHERE id=:id', ['id' => $id])['edit_version'] === $afterSave['edit_version'], 'a stale canonical form cannot overwrite newer saved work');
    $history = blog_rows('SELECT * FROM post_revisions WHERE post_id=:post ORDER BY id', ['post' => $id]);
    verify(count($history) >= 5, 'manual saves record immutable article history');
    $firstSnapshot = $history[0]['snapshot_json'];
    $publishedRevision = null;
    foreach ($history as $revision) if ((json_decode($revision['snapshot_json'], true)['status'] ?? '') === 'published') { $publishedRevision = $revision; break; }
    verify($publishedRevision !== null, 'history includes the previously published snapshot');
    [$historyStatus, $historyBody, $historyHeaders] = $request('admin/revisions/' . $id . '?revision=' . $publishedRevision['id']);
    verify($historyStatus === 200 && str_contains($historyBody, 'Restore as a private draft') && stripos($historyHeaders, 'no-store') !== false, 'revision review is private, explicit, and not cached');
    verify($request('admin/revisions/' . $id, null, 'anonymous-revisions')[0] === 302, 'revision history requires authentication');
    $restore = ['csrf_token' => $csrf, 'action' => 'restore', 'revision_id' => (string) $publishedRevision['id'], 'edit_version' => (string) $afterSave['edit_version']];
    verify($request('admin/revisions/' . $id, array_diff_key($restore, ['csrf_token' => true]))[0] === 403, 'revision restore requires CSRF');
    verify($request('admin/revisions/' . $id, $restore)[0] === 303, 'explicit revision restore succeeds');
    $restored = blog_record('SELECT * FROM posts WHERE id=:id', ['id' => $id]);
    verify($restored['status'] === 'draft' && $restored['published_at'] === null && $restored['slug'] === $created['slug'] && $request('post/' . $created['slug'])[0] === 404, 'restoring a published revision creates a draft and preserves the canonical URL');
    verify($restored['image_alt'] === 'A test-only pixel image' && $restored['image_credit'] === 'Bed Mesh test', 'revision restore includes image metadata');
    verify(blog_record('SELECT snapshot_json FROM post_revisions WHERE id=:id', ['id' => $history[0]['id']])['snapshot_json'] === $firstSnapshot, 'earlier stored snapshots remain unchanged');
    verify($request('admin/revisions/' . $id, $restore)[0] === 409, 'stale revision review cannot overwrite a newer article version');
    $otherPost = blog_record("SELECT * FROM posts WHERE slug='legacy-preserved'"); blog_add_revision($otherPost, $author);
    $foreignRevision = blog_record('SELECT id FROM post_revisions WHERE post_id=:id ORDER BY id DESC LIMIT 1', ['id' => $otherPost['id']]);
    $restore['revision_id'] = (string) $foreignRevision['id']; $restore['edit_version'] = (string) $restored['edit_version'];
    verify($request('admin/revisions/' . $id, $restore)[0] === 404, 'a revision from another article cannot be restored here');
    for ($historyIndex = 0; $historyIndex < 53; $historyIndex++) blog_add_revision($restored, $author);
    verify((int) blog_record('SELECT COUNT(*) AS total FROM post_revisions WHERE post_id=:id', ['id' => $id])['total'] === BLOG_REVISION_LIMIT, 'revision retention is bounded to the latest fifty snapshots');
    $autosave['expected_version'] = '5'; $autosave['base_version'] = (string) $restored['edit_version'];
    [$recoveryStatus, $recoveryBody] = $request('admin/recovery/' . $id, $autosave);
    blog_write('UPDATE post_recoveries SET updated_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 15 DAY) WHERE user_id=:user AND post_id=:post', ['user' => $author, 'post' => $id]);
    [$recoveryStatus, $recoveryBody] = $request('admin/recovery/' . $id); $expired = json_decode($recoveryBody, true);
    verify(!$expired['available'] && $expired['version'] === 7 && blog_record('SELECT payload_json FROM post_recoveries WHERE user_id=:user AND post_id=:post', ['user' => $author, 'post' => $id])['payload_json'] === 'null', 'expired text is removed while its version marker prevents stale-write reuse');
    verify($request('admin/categories/delete/' . $newCategory, ['csrf_token' => $csrf])[0] === 200 && blog_record('SELECT id FROM categories WHERE id=:id', ['id' => $newCategory]) !== null, 'occupied category cannot be deleted');
    verify($request('admin/posts/delete/' . $id, [])[0] === 403 && blog_record('SELECT id FROM posts WHERE id=:id', ['id' => $id]) !== null, 'article delete requires CSRF');
    verify($request('admin/posts/delete/' . $id, ['csrf_token' => $csrf])[0] === 303 && blog_record('SELECT id FROM posts WHERE id=:id', ['id' => $id]) === null, 'article delete works');
    verify((int) blog_record('SELECT COUNT(*) AS total FROM post_revisions WHERE post_id=:id', ['id' => $id])['total'] === 0 && (int) blog_record('SELECT COUNT(*) AS total FROM post_recoveries WHERE post_id=:id', ['id' => $id])['total'] === 0, 'article deletion also removes its private history and recovery records');
    verify($request('admin/categories/delete/' . $newCategory, ['csrf_token' => $csrf])[0] === 303 && blog_record('SELECT id FROM categories WHERE id=:id', ['id' => $newCategory]) === null, 'empty category delete works');
    [$status, $html] = $request('login', null, 'reader'); $readerCsrf = $token($html);
    verify($request('login', ['csrf_token' => $readerCsrf, 'email' => 'reader@example.invalid', 'password' => $password], 'reader')[0] === 200 && $request('admin', null, 'reader')[0] === 302, 'ordinary accounts cannot enter publishing');
    verify($request('logout')[0] === 405 && $request('logout', ['csrf_token' => $csrf])[0] === 303 && $request('admin')[0] === 302, 'logout is POST-only and ends authentication');
    [$status, $html] = $request('login'); $finalCsrf = $token($html);
    verify($request('login', ['csrf_token' => $finalCsrf, 'email' => 'editor@example.invalid', 'password' => $password])[0] === 303, 'editor can sign in again');
    [$freshEditorStatus, $freshEditor] = $request('admin/posts/add');
    [$freshRecoveryStatus, $freshRecoveryBody] = $request('admin/recovery/0');
    $freshRecovery = json_decode($freshRecoveryBody, true);
    verify($freshEditorStatus === 200 && $freshRecoveryStatus === 200 && $freshRecovery['csrf_token'] === $token($freshEditor) && $freshRecovery['csrf_token'] !== $csrf, 'authenticated recovery refreshes the rotated CSRF token after signing in again');
    blog_write("UPDATE users SET role='user' WHERE id=:id", ['id' => $author]);
    verify($request('admin')[0] === 403 && $request('post/secret-draft?preview=1')[0] === 404, 'revoking the database role immediately revokes publishing and draft preview');
    for ($failure = 0; $failure < 8; $failure++) {
        $jar = 'failed-login-' . $failure;
        [$loginStatus, $loginBody] = $request('login', null, $jar);
        verify($request('login', ['csrf_token' => $token($loginBody), 'email' => 'blocked@example.invalid', 'password' => 'definitely-wrong'], $jar)[0] === 200, 'a failed login with a fresh session is counted');
    }
    [$loginStatus, $loginBody] = $request('login', null, 'fresh-blocked-cookie');
    verify($request('login', ['csrf_token' => $token($loginBody), 'email' => 'blocked@example.invalid', 'password' => 'definitely-wrong'], 'fresh-blocked-cookie')[0] === 429, 'database login throttle survives a completely new cookie and CSRF token');
    echo $checks . " real database and HTTP publishing checks passed. Disposable test database only.\n";
} finally {
    foreach ($createdImages as $image) delete_uploaded_image($image);
    if (is_resource($server)) { proc_terminate($server); proc_close($server); }
    // These names were generated here, on the verified isolated datadir only.
    if (preg_match('/^bedmesh_test_[a-f0-9]{12}$/', $database)) $rootDb->exec('DROP DATABASE `' . $database . '`');
    if (preg_match('/^bmtest_[a-f0-9]{12}$/', $dbUser)) $rootDb->exec('DROP USER IF EXISTS ' . $rootDb->quote($dbUser) . "@'127.0.0.1'");
}
