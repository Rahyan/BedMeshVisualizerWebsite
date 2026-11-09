<?php
/** Database-backed editorial helpers; no public request changes the schema. */
class BlogSlugConflict extends RuntimeException {}
function blog_url(string $path = '', array $query = []): string
{
    return ROOT . ($path === '' ? '/' : '/' . ltrim($path, '/')) . ($query ? '?' . http_build_query($query) : '');
}
function blog_record(string $sql, array $data = []): ?array
{
    return query_row($sql, $data) ?: null;
}
function blog_rows(string $sql, array $data = []): array
{
    return query($sql, $data) ?: [];
}
function blog_write(string $sql, array $data = []): int
{
    try {
        $statement = database_connection()->prepare($sql);
        $statement->execute($data);
        return $statement->rowCount();
    } catch (PDOException $exception) {
        if ((int) ($exception->errorInfo[1] ?? 0) === 1062) throw new BlogSlugConflict('The article URL was taken by another save.');
        error_log('Bed Mesh Blog: database write failed.');
        throw new BlogDatabaseUnavailable('The blog database is unavailable.');
    }
}
function blog_schema_ready(): void
{
    $columns = array_column(blog_rows('SHOW COLUMNS FROM posts'), 'Field');
    if (array_diff(['status', 'excerpt', 'published_at', 'updated_at', 'image_alt', 'image_caption', 'image_credit', 'image_credit_url', 'edit_version'], $columns)) {
        throw new BlogDatabaseUnavailable('The blog database needs its explicit migration.');
    }
}
function blog_flash(string $message): void { $_SESSION['blog_flash'] = $message; }
function blog_redirect(string $path = ''): void { header('Location: ' . blog_url($path), true, 303); exit; }
function blog_admin(): bool
{
    if (!is_admin()) return false;
    $account = blog_record("SELECT id,username,email,role FROM users WHERE id=:id AND role='admin' LIMIT 1", ['id' => (int) user('id')]);
    if (!$account) { unset($_SESSION['USER']); return false; }
    $_SESSION['USER'] = $account;
    return true;
}
function blog_date(?string $date): string
{
    if (!$date) return '';
    $value = strtotime($date . ' UTC');
    return $value === false ? '' : gmdate('j M Y', $value);
}
function blog_reading_time(string $html): int
{
    return max(1, (int) ceil(str_word_count(strip_tags($html)) / 220));
}
function blog_excerpt(array $post): string
{
    $text = trim((string) ($post['excerpt'] ?? ''));
    if ($text === '') $text = preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags($post['content'] ?? ''), ENT_QUOTES, 'UTF-8'));
    return mb_strlen($text) > 240 ? mb_substr($text, 0, 237) . '…' : $text;
}
function blog_unique_slug(string $title, string $table, int $except = 0): string
{
    if (!in_array($table, ['posts', 'categories'], true)) throw new InvalidArgumentException();
    $base = mb_substr(str_to_url($title), 0, 80) ?: 'article';
    $slug = $base;
    for ($suffix = 2; $suffix < 10000; $suffix++) {
        if (!blog_record('SELECT id FROM ' . $table . ' WHERE slug=:slug AND id<>:id LIMIT 1', ['slug' => $slug, 'id' => $except])) return $slug;
        $slug = $base . '-' . $suffix;
    }
    throw new InvalidArgumentException('Choose a different title or slug.');
}
function blog_safe_link(string $url): bool
{
    $url = trim(preg_replace('/[\x00-\x20\x7f]/', '', $url));
    if ($url === '') return false;
    if ($url[0] === '#') return true;
    if ($url[0] === '/' && !str_starts_with($url, '//') && !str_contains($url, '\\')) return true;
    return (bool) preg_match('~^https?://[^\s/]+~i', $url);
}
/** Allow semantic article HTML, never scripts, styles, handlers, or arbitrary embeds. */
function blog_clean_html(string $html): string
{
    $previous = libxml_use_internal_errors(true);
    $document = new DOMDocument('1.0', 'UTF-8');
    $document->loadHTML('<!doctype html><html><head><meta charset="utf-8"></head><body>' . $html . '</body></html>', LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
    $body = $document->getElementsByTagName('body')->item(0);
    if (!$body) { libxml_clear_errors(); libxml_use_internal_errors($previous); return ''; }
    $allowed = ['p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'blockquote', 'a', 'code', 'pre', 'br', 'hr', 'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td'];
    $discard = ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'option', 'svg', 'math', 'link', 'meta', 'base'];
    $walk = static function (DOMNode $parent) use (&$walk, $allowed, $discard) {
        foreach (iterator_to_array($parent->childNodes) as $node) {
            if ($node instanceof DOMComment) { $parent->removeChild($node); continue; }
            if (!$node instanceof DOMElement) continue;
            $tag = strtolower($node->tagName);
            if (in_array($tag, $discard, true)) { $parent->removeChild($node); continue; }
            $walk($node);
            if (!in_array($tag, $allowed, true)) {
                while ($node->firstChild) $parent->insertBefore($node->firstChild, $node);
                $parent->removeChild($node);
                continue;
            }
            $attributes = $tag === 'a' ? ['href', 'title'] : ($tag === 'img' ? ['src', 'alt', 'width', 'height'] : ($tag === 'th' ? ['scope'] : []));
            foreach (iterator_to_array($node->attributes) as $attribute) {
                if (!in_array(strtolower($attribute->name), $attributes, true)) $node->removeAttribute($attribute->name);
            }
            if ($tag === 'a' && !blog_safe_link($node->getAttribute('href'))) $node->removeAttribute('href');
            if ($tag === 'img') {
                $source = $node->getAttribute('src');
                if (str_starts_with($source, ROOT . '/')) $source = substr($source, strlen(ROOT) + 1);
                $image = blog_article_image($source);
                if (!$image) { $parent->removeChild($node); continue; }
                $node->setAttribute('src', $image['url']);
                // Reserve the verified image's aspect ratio before lazy loading.
                foreach (['width', 'height'] as $dimension) $node->setAttribute($dimension, (string) $image[$dimension]);
                $node->setAttribute('loading', 'lazy');
                $node->setAttribute('decoding', 'async');
            }
        }
    };
    $walk($body);
    $result = '';
    foreach ($body->childNodes as $node) $result .= $document->saveHTML($node);
    libxml_clear_errors();
    libxml_use_internal_errors($previous);
    return trim($result);
}
function blog_post_errors(array $data): array
{
    $errors = [];
    if (trim($data['title'] ?? '') === '' || mb_strlen($data['title'] ?? '') > 100) $errors['title'] = 'Use a title between 1 and 100 characters.';
    if (mb_strlen($data['excerpt'] ?? '') > 300) $errors['excerpt'] = 'Keep the summary to 300 characters or fewer.';
    if (strlen($data['content'] ?? '') > 200000 || trim(strip_tags($data['content'] ?? '')) === '') $errors['content'] = 'Add article text, up to 200,000 bytes.';
    if (!in_array($data['status'] ?? '', ['draft', 'published'], true)) $errors['status'] = 'Choose Draft or Published.';
    if (!preg_match('/^[1-9]\d*$/', (string) ($data['category_id'] ?? ''))) $errors['category_id'] = 'Choose a category.';
    return $errors;
}
function blog_form_value(array $record, string $key, string $default = ''): string
{
    return esc($_POST[$key] ?? $record[$key] ?? $default);
}
function blog_head(string $title, string $description = '', bool $private = false, ?string $path = null, array $styles = [], array $article = []): void
{
    require_once dirname(__DIR__, 3) . '/php/head.php';
    if ($path !== null && preg_match('~^https?://~i', $path)) {
        $query = parse_url($path, PHP_URL_QUERY);
        $path = (parse_url($path, PHP_URL_PATH) ?: '/') . ($query ? '?' . $query : '');
    }
    ?><!doctype html><html lang="en"><head><?php
    render_site_head(['title' => $title . ' — Bed Mesh', 'description' => $description ?: 'Field notes, practical mesh analysis, and updates from the Bed Mesh project.',
        'path' => $private ? false : ($path ?? false), 'type' => str_contains($path ?? '', '/post/') ? 'article' : 'website', 'noindex' => $private]
        + ($private ? [] : $article));
    ?><link rel="stylesheet" href="<?= esc(site_asset_url('/css/blog.css')) ?>"><?php foreach ($styles as $style): ?><link rel="stylesheet" href="<?= esc(site_asset_url($style)) ?>"><?php endforeach; ?></head><body><a class="skip-link" href="#blog-main">Skip to blog content</a><?php
    require dirname(__DIR__, 3) . '/php/menu.php';
}
function blog_foot(): void
{
    require dirname(__DIR__, 3) . '/php/footer.php';
    echo '</body></html>';
}
function blog_error_page(int $status, string $title, string $description): void
{
    http_response_code($status);
    blog_head($title, $description, true);
    ?><main class="blog-shell blog-message-page" id="blog-main"><p class="blog-eyebrow"><?= $status === 503 ? 'A little maintenance' : esc((string) $status) ?></p><h1><?= esc($title) ?></h1><p><?= esc($description) ?></p><div class="blog-actions"><a class="button" href="<?= esc(blog_url()) ?>">Back to the journal</a><a href="/#visualizer">Open the visualizer ↗</a></div></main><?php
    blog_foot();
}
function blog_admin_navigation(string $active): void
{
    ?><nav class="blog-admin-nav" aria-label="Publishing tools"><a href="<?= esc(blog_url('admin')) ?>"<?= $active === 'posts' ? ' aria-current="page"' : '' ?>>Articles</a><a href="<?= esc(blog_url('admin/categories')) ?>"<?= $active === 'categories' ? ' aria-current="page"' : '' ?>>Categories</a><a href="<?= esc(blog_url()) ?>">View journal ↗</a><form method="post" action="<?= esc(blog_url('logout')) ?>"><?= csrf_field() ?><button type="submit">Sign out</button></form></nav><?php
}
function blog_pagination(int $page, int $pages, string $route = '', array $parameters = []): void
{
    if ($pages < 2) return;
    ?><nav class="blog-pagination" aria-label="Article pages"><?php if ($page > 1): ?><a href="<?= esc(blog_url($route, array_merge($parameters, ['page' => $page - 1]))) ?>">← Newer</a><?php else: ?><span></span><?php endif; ?><span>Page <?= $page ?> of <?= $pages ?></span><?php if ($page < $pages): ?><a href="<?= esc(blog_url($route, array_merge($parameters, ['page' => $page + 1]))) ?>">Older →</a><?php else: ?><span></span><?php endif; ?></nav><?php
}

function blog_content_outline(string $html): array
{
    $clean = blog_clean_html($html);
    $document = new DOMDocument('1.0', 'UTF-8');
    $previous = libxml_use_internal_errors(true);
    $document->loadHTML('<!doctype html><html><head><meta charset="utf-8"></head><body>' . $clean . '</body></html>', LIBXML_NONET);
    $headings = [];
    foreach ($document->getElementsByTagName('h2') as $heading) {
        $id = 'article-section-' . (count($headings) + 1);
        $heading->setAttribute('id', $id);
        $headings[] = ['id' => $id, 'text' => $heading->textContent];
    }
    $body = $document->getElementsByTagName('body')->item(0);
    $output = '';
    foreach ($body->childNodes as $node) $output .= $document->saveHTML($node);
    libxml_clear_errors(); libxml_use_internal_errors($previous);
    return ['html' => $output, 'headings' => $headings];
}

/** The unique index is the final guard; a simultaneous save gets a fresh suffix. */
function blog_insert_post(array $data): int
{
    $data += ['image_alt' => '', 'image_caption' => '', 'image_credit' => '', 'image_credit_url' => ''];
    $base = mb_substr(str_to_url($data['title']), 0, 80) ?: 'article';
    $candidate = blog_unique_slug($data['title'], 'posts');
    for ($attempt = 0; $attempt < 32; $attempt++) {
        $data['slug'] = $candidate;
        try {
            blog_write('INSERT INTO posts (title,excerpt,content,slug,image,image_alt,image_caption,image_credit,image_credit_url,category_id,status,published_at,user_id,updated_at) VALUES (:title,:excerpt,:content,:slug,:image,:image_alt,:image_caption,:image_credit,:image_credit_url,:category_id,:status,:published_at,:user_id,UTC_TIMESTAMP())', $data);
            return (int) database_connection()->lastInsertId();
        } catch (BlogSlugConflict $exception) {
            // A transaction's repeatable-read snapshot may not see the winner.
            // Allocate a fresh candidate without reusing that stale SELECT result.
            $candidate = $base . '-' . bin2hex(random_bytes(5));
        }
    }
    throw new BlogDatabaseUnavailable('The article could not be saved because of concurrent URL changes.');
}
function blog_insert_category(string $name, int $disabled = 0): int
{
    $base = mb_substr(str_to_url($name), 0, 80) ?: 'category';
    $slug = blog_unique_slug($name, 'categories');
    for ($attempt = 0; $attempt < 32; $attempt++) {
        try {
            blog_write('INSERT INTO categories (category,slug,disabled) VALUES (:category,:slug,:disabled)', ['category' => $name, 'slug' => $slug, 'disabled' => $disabled]);
            return (int) database_connection()->lastInsertId();
        } catch (BlogSlugConflict $exception) { $slug = $base . '-' . bin2hex(random_bytes(5)); }
    }
    throw new BlogDatabaseUnavailable('The category could not be saved because of concurrent URL changes.');
}

require_once __DIR__ . '/publishing.php';
