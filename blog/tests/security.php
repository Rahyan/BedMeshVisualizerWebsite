<?php
/** Local regression checks. Never connects to a database or needs credentials. */
ini_set('session.save_path', sys_get_temp_dir());
session_start();
require __DIR__ . '/../app/core/init.php';
require __DIR__ . '/../app/core/editorial.php';
$count = 0;
function check($condition, $label): void
{
    global $count;
    if (!$condition) {
        throw new RuntimeException('Failed: ' . $label);
    }
    ++$count;
}

$cleanup = [];
try {
    $_SESSION = [];
    check(!csrf_valid(null), 'missing CSRF token fails');
    $token = csrf_token();
    check(strlen($token) === 64 && csrf_valid($token), 'valid CSRF token passes');
    check(!csrf_valid(str_repeat('0', 64)), 'wrong CSRF token fails');
    check(!csrf_valid([$token]), 'array CSRF token fails');
    check(strpos(csrf_field(), 'name="csrf_token"') !== false, 'hidden CSRF field exists');

    $_POST = ['email' => '\"><script>alert(1)</script>', 'password' => 'never-reflect'];
    check(strpos(old_value('email'), '<script>') === false, 'old input is escaped');
    check(old_value('password') === '', 'passwords are not reflected');
    check(strpos(old_value('fallback', '\" onfocus="bad'), '&quot;') !== false, 'defaults are escaped');
    check(esc(['malformed']) === '', 'malformed scalar output is harmless');

    $before = session_id();
    authenticate(['id' => 4, 'username' => 'test', 'role' => 'user', 'password' => 'private-hash']);
    check(session_id() !== $before, 'login rotates session identifier');
    check(!array_key_exists('password', user()), 'password hash is not stored in session');
    check(logged_in() && !is_admin(), 'ordinary account cannot administer');
    check(!csrf_valid($token), 'login rotates CSRF token');
    $_SESSION['USER']['role'] = 'admin';
    check(is_admin(), 'exact administrator role passes');
    $_SESSION['USER']['role'] = 'administrator';
    check(!is_admin(), 'near-matching administrator role fails');

    check(blog_public_file('../app/core/config.php') === null, 'outside-public file is rejected');
    check(get_image('../app/core/config.php') === esc(ROOT . '/assets/images/no_image.jpg'), 'unsafe image path falls back');
    $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVIcAAAAASUVORK5CYII=');
    $temporary = tempnam(sys_get_temp_dir(), 'bedmesh-security-');
    $cleanup[] = $temporary;
    file_put_contents($temporary, $png);
    check(validated_image_extension($temporary) === 'png', 'image extension comes from bytes');
    file_put_contents($temporary, '<?php echo "not an image";');
    $rejected = false;
    try {
        validated_image_extension($temporary);
    } catch (InvalidArgumentException $exception) {
        $rejected = true;
    }
    check($rejected, 'executable payload fails image validation');
    $rejected = false;
    try {
        save_uploaded_image(['tmp_name' => $temporary, 'error' => UPLOAD_ERR_OK]);
    } catch (InvalidArgumentException $exception) {
        $rejected = true;
    }
    check($rejected, 'non-HTTP upload cannot be moved');

    $html = '<img data-filename="../../malicious.php" src="data:image/png;base64,' . base64_encode($png) . '">';
    $converted = remove_images_from_content($html, '../');
    check(preg_match('~src="(uploads/[a-f0-9]{32}\.png)"~', $converted, $match) === 1, 'embedded filename and folder are ignored');
    $stored = BLOG_PUBLIC_PATH . '/' . $match[1];
    $cleanup[] = $stored;
    check(is_file($stored), 'verified embedded image was saved');
    delete_uploaded_image($match[1]);
    check(!file_exists($stored), 'owned uploaded image is removable');
    check(remove_images_from_content('<img src="data:image/svg+xml;base64,PHN2Zz4=">') === '', 'embedded SVG fails validation');
    check(remove_images_from_content('<img src="data:image/png;base64,not valid">') === '', 'malformed embedded data fails validation');
    check(add_root_to_images('<img src="https://example.com/photo.png">') === '<img src="https://example.com/photo.png">', 'remote image URL is preserved');
    check(add_root_to_images('<img src="uploads/photo.png">') === '<img src="' . esc(ROOT) . '/uploads/photo.png">', 'local image URL receives root');

    $_GET = ['url' => 'search', 'find' => '\" onclick="bad', 'page' => '2'];
    $page = get_pagination_vars();
    check($page['page_number'] === 2 && strpos($page['next_link'], 'page=3') !== false, 'pagination advances');
    check(strpos($page['next_link'], 'onclick="') === false, 'pagination encodes hostile query data');
    $_GET = ['url' => ['malformed'], 'page' => ['malformed']];
    check(get_pagination_vars()['page_number'] === 1, 'malformed pagination input is harmless');

    $clean = blog_clean_html('<h2 id="bad" onclick="bad()">A heading</h2><p style="position:fixed">Text</p><script>bad()</script><iframe src="https://example.com"></iframe><a href="javascript:bad()">link</a><img src="https://tracker.example/image.png">');
    check(!str_contains($clean, 'onclick') && !str_contains($clean, '<script') && !str_contains($clean, '<iframe') && !str_contains($clean, 'javascript:') && !str_contains($clean, 'position:') && !str_contains($clean, 'tracker.example'), 'editorial sanitizer removes active content and external image tracking');
    check(str_contains($clean, '<h2>A heading</h2>') && str_contains($clean, '<p>Text</p>'), 'editorial sanitizer retains semantic content');
    $outline = blog_content_outline('<h2>First</h2><p>Text.</p><h2>Second</h2>');
    check(count($outline['headings']) === 2 && str_contains($outline['html'], 'id="article-section-2"'), 'article outlines receive safe generated IDs');
    check(!blog_safe_link('javascript:alert(1)') && !blog_safe_link('//other.example') && blog_safe_link('https://example.com/source') && blog_safe_link('/guides/'), 'article link protocols are constrained');

    // Remove config only inside this test process; the connection must fail before PDO.
    foreach (['HOST', 'NAME', 'USER', 'PASS'] as $name) {
        putenv('BEDMESH_DB_' . $name);
    }
    $unavailable = false;
    try {
        database_connection();
    } catch (BlogDatabaseUnavailable $exception) {
        $unavailable = true;
        check($exception->getMessage() === 'The blog database is unavailable.', 'database error text is generic');
    }
    check($unavailable, 'missing database configuration fails closed');
    echo $count . " security regression checks passed.\n";
} finally {
    foreach ($cleanup as $filename) {
        if (is_file($filename)) {
            unlink($filename);
        }
    }
    session_destroy();
}
