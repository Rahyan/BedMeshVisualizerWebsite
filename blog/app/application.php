<?php
/** Current public journal and private publishing routes. */
require_once __DIR__ . '/core/editorial.php';

$route = trim(is_string($_GET['url'] ?? null) ? $_GET['url'] : 'home', '/');
$parts = explode('/', $route);
$page = strtolower($parts[0] ?: 'home');
$isPost = ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST';
$flash = $_SESSION['blog_flash'] ?? '';
unset($_SESSION['blog_flash']);

if ($page === 'signup') {
    blog_error_page(404, 'Publishing is invite-only', 'This journal has no public accounts. You can read every published article and use the visualizer without signing up.');
    return;
}
if ($page === 'contact') { header('Location: /#about', true, 302); return; }
if ($page === 'blog') { header('Location: ' . blog_url(), true, 301); return; }
if ($page === 'logout') {
    if (!$isPost) { header('Allow: POST'); blog_error_page(405, 'Use the sign-out button', 'Sign out through the publishing menu to end your session.'); return; }
    $_SESSION = [];
    session_regenerate_id(true);
    blog_redirect();
}
if ($page === 'login') {
    $errors = [];
    if ($isPost) {
        $email = trim($_POST['email'] ?? '');
        $password = $_POST['password'] ?? '';
        // This database counter survives new cookies. Store no plaintext IP/email.
        $attemptKey = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . "\0" . mb_strtolower($email));
        blog_write('DELETE FROM blog_login_attempts WHERE window_started<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY)');
        $attempt = blog_record('SELECT attempts FROM blog_login_attempts WHERE attempt_key=:key AND window_started>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 15 MINUTE)', ['key' => $attemptKey]);
        if ($attempt && (int) $attempt['attempts'] >= 8) {
            http_response_code(429);
            header('Retry-After: 900');
            $errors['form'] = 'Please wait a few minutes before trying again.';
        } else {
            $account = filter_var($email, FILTER_VALIDATE_EMAIL) ? blog_record("SELECT * FROM users WHERE email=:email AND role='admin' ORDER BY id LIMIT 1", ['email' => $email]) : null;
            if ($account && password_verify($password, $account['password'])) {
                authenticate($account);
                blog_write('DELETE FROM blog_login_attempts WHERE attempt_key=:key', ['key' => $attemptKey]);
                blog_redirect('admin');
            }
            blog_write('INSERT INTO blog_login_attempts (attempt_key,attempts,window_started) VALUES (:key,1,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE attempts=IF(window_started<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 15 MINUTE),1,attempts+1),window_started=IF(window_started<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 15 MINUTE),UTC_TIMESTAMP(),window_started)', ['key' => $attemptKey]);
            $errors['form'] = 'The email or password was not recognised.';
        }
    }
    require __DIR__ . '/views/login.php';
    return;
}

if ($page === 'admin') {
    header('Cache-Control: no-store, private');
    $privateSection = $parts[1] ?? 'posts';
    if (!logged_in()) {
        if ($privateSection === 'recovery') blog_json(['ok' => false, 'error' => 'authentication_required'], 401);
        else header('Location: ' . blog_url('login'), true, 302);
        return;
    }
    if (!blog_admin()) {
        if ($privateSection === 'recovery') blog_json(['ok' => false, 'error' => 'forbidden'], 403);
        else blog_error_page(403, 'Administrator access is required', 'This account cannot publish articles.');
        return;
    }
    blog_schema_ready();
    if ($privateSection === 'recovery') {
        if (count($parts) !== 3 || !ctype_digit($parts[2])) { blog_json(['ok' => false, 'error' => 'not_found'], 404); return; }
        if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'POST'], true)) { header('Allow: GET, POST'); blog_json(['ok' => false, 'error' => 'method_not_allowed'], 405); return; }
        blog_recovery_endpoint((int) $parts[2], $isPost);
        return;
    }
    if ($privateSection === 'revisions') {
        $postId = isset($parts[2]) && ctype_digit($parts[2]) ? (int) $parts[2] : 0;
        $record = blog_record('SELECT * FROM posts WHERE id=:id', ['id' => $postId]);
        if (!$record) { blog_error_page(404, 'Article not found', 'Choose an article to review its saved history.'); return; }
        $errors = [];
        if ($isPost) {
            $revisionId = filter_var($_POST['revision_id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
            $expected = filter_var($_POST['edit_version'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
            if (($_POST['action'] ?? '') !== 'restore' || $revisionId === false || $expected === false) $errors['form'] = 'Choose an available revision to restore.';
            else {
                try {
                    blog_restore_revision($postId, $revisionId, $expected, (int) user('id'));
                    blog_flash('Revision restored as a private draft. Review it before publishing.');
                    blog_redirect('admin/posts/edit/' . $postId);
                } catch (BlogEditConflict $exception) { http_response_code(409); $errors['form'] = $exception->getMessage(); }
                catch (InvalidArgumentException $exception) { http_response_code(404); $errors['form'] = $exception->getMessage(); }
            }
        }
        $revisions = blog_rows('SELECT r.*,u.username AS editor FROM post_revisions r LEFT JOIN users u ON u.id=r.user_id WHERE r.post_id=:post ORDER BY r.id DESC LIMIT ' . BLOG_REVISION_LIMIT, ['post' => $postId]);
        $selectedId = is_string($_GET['revision'] ?? null) && ctype_digit($_GET['revision']) ? (int) $_GET['revision'] : 0;
        $selected = null; $snapshot = null;
        foreach ($revisions as $revision) if ((int) $revision['id'] === $selectedId) { $selected = $revision; $snapshot = json_decode($revision['snapshot_json'], true, 32, JSON_THROW_ON_ERROR); }
        if ($selectedId && !$selected) { blog_error_page(404, 'Revision not found', 'Only available saved revisions can be reviewed for this article.'); return; }
        require __DIR__ . '/views/revisions.php';
        return;
    }
    $section = $parts[1] ?? 'posts';
    $action = $parts[2] ?? 'view';
    $id = isset($parts[3]) && ctype_digit($parts[3]) ? (int) $parts[3] : 0;
    if (!in_array($section, ['posts', 'categories'], true) || !in_array($action, ['view', 'add', 'edit', 'delete'], true)) {
        blog_error_page(404, 'Publishing page not found', 'Return to the journal or the article list to continue.'); return;
    }
    $errors = [];
    if ($section === 'categories') {
        $record = $id ? blog_record('SELECT * FROM categories WHERE id=:id', ['id' => $id]) : [];
        if (in_array($action, ['edit', 'delete'], true) && !$record) { blog_error_page(404, 'Category not found', 'This category may have been removed.'); return; }
        if ($isPost && in_array($action, ['add', 'edit'], true)) {
            $name = trim($_POST['category'] ?? '');
            if ($name === '' || mb_strlen($name) > 50) $errors['category'] = 'Use a category name between 1 and 50 characters.';
            if (!$errors) {
                $slug = !empty($record['slug']) ? $record['slug'] : blog_unique_slug($name, 'categories', $id);
                $data = ['category' => $name, 'slug' => $slug, 'disabled' => ($_POST['disabled'] ?? '') === '1' ? 1 : 0];
                if ($action === 'edit') { $data['id'] = $id; blog_write('UPDATE categories SET category=:category,slug=:slug,disabled=:disabled WHERE id=:id', $data); }
                else blog_insert_category($name, $data['disabled']);
                blog_flash('Category saved.'); blog_redirect('admin/categories');
            }
        }
        if ($isPost && $action === 'delete') {
            $count = blog_record('SELECT COUNT(*) AS total FROM posts WHERE category_id=:id', ['id' => $id]);
            if ((int) $count['total'] > 0) $errors['form'] = 'Move this category’s articles to another category before deleting it.';
            else { blog_write('DELETE FROM categories WHERE id=:id', ['id' => $id]); blog_flash('Category deleted.'); blog_redirect('admin/categories'); }
        }
        $categories = blog_rows('SELECT categories.*,COUNT(posts.id) AS total FROM categories LEFT JOIN posts ON posts.category_id=categories.id GROUP BY categories.id ORDER BY categories.category');
        require __DIR__ . '/views/admin-categories.php';
        return;
    }
    $record = $id ? blog_record('SELECT * FROM posts WHERE id=:id', ['id' => $id]) : [];
    if (in_array($action, ['edit', 'delete'], true) && !$record) { blog_error_page(404, 'Article not found', 'This article may have been removed.'); return; }
    $categories = blog_rows('SELECT * FROM categories ORDER BY category');
    if ($isPost && in_array($action, ['add', 'edit'], true)) {
        $data = [
            'title' => trim($_POST['title'] ?? ''), 'excerpt' => trim($_POST['excerpt'] ?? ''),
            'content' => $_POST['content'] ?? '', 'status' => $_POST['status'] ?? 'draft',
            'category_id' => $_POST['category_id'] ?? '',
            'image_alt' => trim($_POST['image_alt'] ?? ''), 'image_caption' => trim($_POST['image_caption'] ?? ''),
            'image_credit' => trim($_POST['image_credit'] ?? ''), 'image_credit_url' => trim($_POST['image_credit_url'] ?? ''),
        ];
        $errors = blog_post_errors($data);
        if (!blog_record('SELECT id FROM categories WHERE id=:id AND disabled=0', ['id' => (int) $data['category_id']])) $errors['category_id'] = 'Choose an enabled category before publishing.';
        $image = trim($_POST['existing_image'] ?? '') ?: ($record['image'] ?? null);
        if ($image && !blog_article_image($image)) $errors['image'] = 'Choose an available local image or upload a valid image.';
        if (isset($_FILES['image']) && ($_FILES['image']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
            if (!is_array($_FILES['image'])) $errors['image'] = 'Choose an image file.';
            elseif (!$errors) {
                try { $image = save_uploaded_image($_FILES['image']); }
                catch (InvalidArgumentException $exception) { $errors['image'] = $exception->getMessage(); }
            }
        }
        if (!$errors) {
            $data['content'] = blog_clean_html(remove_images_from_content($data['content']));
            if (trim(strip_tags($data['content'])) === '') $errors['content'] = 'Add readable article text before saving.';
        }
        $data['image'] = ($_POST['remove_image'] ?? '') === '1' ? null : $image;
        $errors = array_merge($errors, blog_image_errors($data));
        $expectedVersion = filter_var($_POST['edit_version'] ?? ($action === 'add' ? '0' : null), FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
        if ($expectedVersion === false) $errors['form'] = 'Reload the saved article before editing it.';
        if (!$errors) {
            $data['slug'] = !empty($record['slug']) ? $record['slug'] : blog_unique_slug($data['title'], 'posts', $id);
            $data['image'] = ($_POST['remove_image'] ?? '') === '1' ? null : $image;
            $data['category_id'] = (int) $data['category_id'];
            $data['published_at'] = $data['status'] === 'published' ? ($record['published_at'] ?? gmdate('Y-m-d H:i:s')) : null;
            try {
                $previousId = $id;
                $id = blog_save_article($data, $id, $expectedVersion, (int) user('id'));
                $recoveryVersion = filter_var($_POST['recovery_version'] ?? '0', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
                if ($recoveryVersion !== false) blog_write("UPDATE post_recoveries SET payload_json='null',version=version+1,updated_at=UTC_TIMESTAMP() WHERE user_id=:user AND post_id=:post AND version=:version", ['user' => (int) user('id'), 'post' => $previousId, 'version' => $recoveryVersion]);
                blog_flash($data['status'] === 'published' ? 'Article published.' : 'Draft saved.');
                blog_redirect('admin/posts/edit/' . $id);
            } catch (BlogEditConflict $exception) { http_response_code(409); $errors['form'] = $exception->getMessage(); }

        }
    }
    if ($isPost && $action === 'delete') {
        blog_atomic(static function () use ($id) {
            blog_write('DELETE FROM post_revisions WHERE post_id=:id', ['id' => $id]);
            blog_write('DELETE FROM post_recoveries WHERE post_id=:id', ['id' => $id]);
            blog_write('DELETE FROM posts WHERE id=:id', ['id' => $id]);
        });
        // Do not remove shared uploaded files; older articles can reuse the same path.
        blog_flash('Article deleted.'); blog_redirect('admin');
    }
    $filter = in_array($_GET['status'] ?? '', ['draft', 'published'], true) ? $_GET['status'] : '';
    $search = is_string($_GET['find'] ?? null) ? mb_substr(trim($_GET['find']), 0, 100) : '';
    $where = '1=1'; $parameters = [];
    if ($filter !== '') { $where .= ' AND p.status=:status'; $parameters['status'] = $filter; }
    if ($search !== '') { $where .= ' AND p.title LIKE :find'; $parameters['find'] = '%' . $search . '%'; }
    $total = (int) blog_record('SELECT COUNT(*) AS total FROM posts p WHERE ' . $where, $parameters)['total'];
    $pages = max(1, (int) ceil($total / 12));
    $pageNumber = min($pages, max(1, is_scalar($_GET['page'] ?? 1) ? (int) ($_GET['page'] ?? 1) : 1));
    $offset = ($pageNumber - 1) * 12;
    $posts = blog_rows('SELECT p.*,c.category FROM posts p LEFT JOIN categories c ON c.id=p.category_id WHERE ' . $where . ' ORDER BY COALESCE(p.updated_at,p.date) DESC,p.id DESC LIMIT 12 OFFSET ' . $offset, $parameters);
    require __DIR__ . '/views/admin-posts.php';
    return;
}

blog_schema_ready();
if ($page === 'sitemap.xml' && count($parts) === 1) {
    require_once dirname(__DIR__, 2) . '/php/head.php';
    header('Content-Type: application/xml; charset=utf-8');
    $articles = blog_rows("SELECT p.slug,p.updated_at,p.published_at FROM posts p JOIN categories c ON c.id=p.category_id WHERE p.status='published' AND p.published_at<=UTC_TIMESTAMP() AND c.disabled=0 AND p.image IS NOT NULL AND p.image<>'' AND p.image_alt<>'' ORDER BY p.published_at DESC LIMIT 49999");
    $xml = static fn (string $text): string => htmlspecialchars($text, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    $publicPath = parse_url(ROOT, PHP_URL_PATH) ?: '';
    echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
    echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
    echo '<url><loc>' . $xml(site_origin() . rtrim($publicPath, '/') . '/') . '</loc></url>';
    foreach ($articles as $article) {
        $location = site_origin() . rtrim($publicPath, '/') . '/post/' . $article['slug'];
        echo '<url><loc>' . $xml($location) . '</loc>';
        $updated = strtotime(($article['updated_at'] ?: $article['published_at']) . ' UTC');
        if ($updated !== false) echo '<lastmod>' . gmdate('Y-m-d\TH:i:s\Z', $updated) . '</lastmod>';
        echo '</url>';
    }
    echo '</urlset>';
    return;
}
if ($page === 'post') {
    $slug = $parts[1] ?? '';
    if (!preg_match('/^[a-z0-9_-]+$/', $slug)) { blog_error_page(404, 'Article not found', 'Choose a published article from the journal.'); return; }
    $preview = isset($_GET['preview']) && blog_admin();
    if ($preview) header('Cache-Control: no-store, private');
    $publication = $preview ? '' : " AND p.status='published' AND p.published_at<=UTC_TIMESTAMP() AND c.disabled=0 AND p.image IS NOT NULL AND p.image<>'' AND p.image_alt<>''";
    $post = blog_record('SELECT p.*,c.category,c.slug AS category_slug,u.username AS author FROM posts p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN users u ON u.id=p.user_id WHERE p.slug=:slug' . $publication . ' ORDER BY p.id LIMIT 1', ['slug' => $slug]);
    if (!$post) { blog_error_page(404, 'Article not found', 'This article is not available. Browse the journal for published stories.'); return; }
    $related = blog_rows("SELECT p.*,c.category FROM posts p JOIN categories c ON c.id=p.category_id WHERE p.status='published' AND p.published_at<=UTC_TIMESTAMP() AND c.disabled=0 AND p.image IS NOT NULL AND p.image<>'' AND p.image_alt<>'' AND p.id<>:id ORDER BY (p.category_id=:category) DESC,p.published_at DESC LIMIT 2", ['id' => (int) $post['id'], 'category' => (int) $post['category_id']]);
    require __DIR__ . '/views/article.php';
    return;
}
if (!in_array($page, ['home', 'category', 'search'], true)) { blog_error_page(404, 'Page not found', 'Choose a story from the journal or return to the visualizer.'); return; }
$category = null;
$search = $page === 'search' && is_string($_GET['find'] ?? null) ? mb_substr(trim($_GET['find']), 0, 100) : '';
$where = "p.status='published' AND p.published_at<=UTC_TIMESTAMP() AND c.disabled=0 AND p.image IS NOT NULL AND p.image<>'' AND p.image_alt<>''";
$parameters = [];
if ($page === 'category') {
    $category = blog_record('SELECT * FROM categories WHERE slug=:slug AND disabled=0 LIMIT 1', ['slug' => $parts[1] ?? '']);
    if (!$category) { blog_error_page(404, 'Category not found', 'Choose a published topic from the journal.'); return; }
    $where .= ' AND p.category_id=:category'; $parameters['category'] = (int) $category['id'];
}
if ($page === 'search') {
    if ($search === '') $where .= ' AND 1=0';
    else { $where .= ' AND (p.title LIKE :title OR p.excerpt LIKE :excerpt OR p.content LIKE :content)'; foreach (['title', 'excerpt', 'content'] as $field) $parameters[$field] = '%' . $search . '%'; }
}
$total = (int) blog_record('SELECT COUNT(*) AS total FROM posts p JOIN categories c ON c.id=p.category_id WHERE ' . $where, $parameters)['total'];
$pages = max(1, (int) ceil($total / 6));
$pageNumber = min($pages, max(1, is_scalar($_GET['page'] ?? 1) ? (int) ($_GET['page'] ?? 1) : 1));
$offset = ($pageNumber - 1) * 6;
$posts = blog_rows('SELECT p.*,c.category,c.slug AS category_slug,u.username AS author FROM posts p JOIN categories c ON c.id=p.category_id LEFT JOIN users u ON u.id=p.user_id WHERE ' . $where . ' ORDER BY p.published_at DESC,p.id DESC LIMIT 6 OFFSET ' . $offset, $parameters);
$categories = blog_rows("SELECT c.*,COUNT(p.id) AS total FROM categories c JOIN posts p ON p.category_id=c.id AND p.status='published' AND p.published_at<=UTC_TIMESTAMP() AND p.image IS NOT NULL AND p.image<>'' AND p.image_alt<>'' WHERE c.disabled=0 GROUP BY c.id ORDER BY c.category");
require __DIR__ . '/views/listing.php';
