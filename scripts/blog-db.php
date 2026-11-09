<?php
/** Explicit blog database setup. Passwords come from process environment, never CLI arguments. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$root = dirname(__DIR__);
$action = $argv[1] ?? '';
$local = in_array('--local', $argv, true);
try {
    if (!in_array($action, ['migrate', 'admin', 'seed'], true)) {
        fwrite(STDERR, "Usage: php scripts/blog-db.php migrate|admin|seed [--local]\n"); exit(1);
    }
    if ($local) {
        $path = $root . '/.work/blog-local.json';
        if (!is_file($path)) { fwrite(STDERR, "Start the isolated database with php scripts/blog-local.php start first.\n"); exit(1); }
        $config = json_decode(file_get_contents($path), true, 16, JSON_THROW_ON_ERROR);
        if (($config['version'] ?? null) !== 1 || ($config['environment']['BEDMESH_DB_HOST'] ?? '') !== '127.0.0.1' || str_replace('\\', '/', $config['server']['datadir'] ?? '') !== str_replace('\\', '/', $root) . '/.work/blog-local/data') throw new RuntimeException();
        foreach (['HOST', 'PORT', 'NAME', 'USER', 'PASS'] as $field) {
            $key = 'BEDMESH_DB_' . $field;
            if (!is_string($config['environment'][$key] ?? null)) throw new RuntimeException();
            putenv($key . '=' . $config['environment'][$key]);
        }
        putenv('BEDMESH_BLOG_URL=/blog/public');
    }
    require $root . '/blog/app/core/init.php';
    require $root . '/blog/app/core/editorial.php';
    require $root . '/blog/app/core/migrations.php';
    if ($local) {
        $actual = str_replace('\\', '/', (string) database_connection()->query('SELECT @@datadir')->fetchColumn());
        if (strtolower(rtrim($actual, '/')) !== strtolower(rtrim(str_replace('\\', '/', $config['server']['datadir']), '/'))) throw new RuntimeException();
    }
    if ($action === 'migrate') {
        $changes = migrate_blog_database();
        echo 'Blog schema ready. ' . count($changes) . " additive migration changes applied. Existing articles remain drafts until explicitly published.\n";
    } elseif ($action === 'admin') {
        blog_schema_ready();
        $email = trim(getenv('BEDMESH_ADMIN_EMAIL') ?: '');
        $name = trim(getenv('BEDMESH_ADMIN_NAME') ?: '');
        $password = getenv('BEDMESH_ADMIN_PASSWORD') ?: '';
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 100 || $name === '' || mb_strlen($name) > 50 || strlen($password) < 12 || strlen($password) > 72) {
            fwrite(STDERR, "Set BEDMESH_ADMIN_EMAIL, BEDMESH_ADMIN_NAME, and BEDMESH_ADMIN_PASSWORD in this process. Use a password between 12 and 72 bytes. Values will not be printed.\n"); exit(1);
        }
        $existing = blog_record('SELECT id FROM users WHERE email=:email LIMIT 1', ['email' => $email]);
        $data = ['email' => $email, 'username' => $name, 'password' => password_hash($password, PASSWORD_DEFAULT)];
        if ($existing) {
            $data['id'] = (int) $existing['id'];
            blog_write("UPDATE users SET username=:username,email=:email,password=:password,role='admin' WHERE id=:id", $data);
        } else blog_write("INSERT INTO users (username,email,password,role) VALUES (:username,:email,:password,'admin')", $data);
        echo "Administrator saved. Credentials were not printed or written to the repository.\n";
    } else {
        if (!$local) { fwrite(STDERR, "Curated preview articles can only be seeded into the isolated --local database.\n"); exit(1); }
        blog_schema_ready();
        $author = blog_record("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1");
        if (!$author) { fwrite(STDERR, "Create an administrator first with the admin command.\n"); exit(1); }
        $content = require $root . '/blog/database/development-content.php';
        $added = 0;
        foreach ($content as $article) {
            $category = blog_record('SELECT id FROM categories WHERE slug=:slug LIMIT 1', ['slug' => $article['category_slug']]);
            if (!$category) {
                blog_write('INSERT INTO categories (category,slug,disabled) VALUES (:category,:slug,0)', ['category' => $article['category'], 'slug' => $article['category_slug']]);
                $category = ['id' => (int) database_connection()->lastInsertId()];
            }
            if (blog_record('SELECT id FROM posts WHERE slug=:slug LIMIT 1', ['slug' => $article['slug']])) continue;
            $images = ['image' => $article['image'] ?? null, 'image_alt' => $article['image_alt'] ?? '', 'image_caption' => $article['image_caption'] ?? '', 'image_credit' => $article['image_credit'] ?? '', 'image_credit_url' => $article['image_credit_url'] ?? ''];
            if (blog_image_errors(array_merge($images, ['status' => 'published']))) throw new RuntimeException('Curated articles require available relevant images and descriptions.');
            blog_write("INSERT INTO posts (user_id,category_id,title,slug,excerpt,content,image,image_alt,image_caption,image_credit,image_credit_url,status,published_at,updated_at) VALUES (:author,:category,:title,:slug,:excerpt,:content,:image,:image_alt,:image_caption,:image_credit,:image_credit_url,'published',:published,UTC_TIMESTAMP())", array_merge([
                'author' => (int) $author['id'], 'category' => (int) $category['id'], 'title' => $article['title'], 'slug' => $article['slug'],
                'excerpt' => $article['excerpt'], 'content' => blog_clean_html($article['content']), 'published' => gmdate('Y-m-d H:i:s', time() - $added * 86400),
            ], $images));
            $added++;
        }
        echo $added . " curated articles added to the isolated local database. Existing articles were left unchanged.\n";
    }
} catch (BlogMigrationBlocked $exception) {
    fwrite(STDERR, $exception->getMessage() . PHP_EOL);
    exit(1);
} catch (Throwable $exception) {
    fwrite(STDERR, "The blog database operation could not be completed. Check the configured database and local server; connection details have not been printed.\n");
    exit(1);
}
