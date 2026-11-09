<?php
/** Private publishing history/recovery and trusted local article imagery. */
class BlogEditConflict extends RuntimeException {}
const BLOG_REVISION_LIMIT = 50;

function blog_article_image($source): ?array
{
    if (!is_string($source) || $source === '') return null;
    if (str_starts_with($source, ROOT . '/uploads/')) $source = substr($source, strlen(ROOT) + 1);
    if (str_starts_with($source, '/assets/articles/')) $source = substr($source, 1);
    $file = null; $url = '';
    if (preg_match('~^uploads/[a-zA-Z0-9_.-]+\.(?:jpe?g|png|webp)$~i', $source)) {
        $file = blog_public_file($source); $url = ROOT . '/' . $source;
    } elseif (preg_match('~^assets/articles/[a-zA-Z0-9][a-zA-Z0-9_.-]*\.(?:jpe?g|png|webp)$~i', $source)) {
        $root = dirname(__DIR__, 3);
        $directory = realpath($root . '/assets/articles');
        $candidate = realpath($root . '/' . $source);
        if ($directory && $candidate && is_file($candidate) && dirname($candidate) === $directory) $file = $candidate;
        $url = '/' . $source;
    }
    if (!$file) return null;
    $dimensions = @getimagesize($file);
    if (!$dimensions || !in_array($dimensions['mime'] ?? '', ['image/png', 'image/jpeg', 'image/webp'], true)) return null;
    return ['path' => $source, 'url' => $url, 'file' => $file, 'width' => $dimensions[0], 'height' => $dimensions[1]];
}
function blog_article_asset_choices(): array
{
    $root = dirname(__DIR__, 3);
    $choices = [];
    foreach (glob($root . '/assets/articles/*') ?: [] as $path) {
        $relative = 'assets/articles/' . basename($path);
        if (blog_article_image($relative)) $choices[] = $relative;
    }
    sort($choices);
    return $choices;
}
function blog_credit_url_valid(string $url): bool
{
    if ($url === '') return true;
    if (strlen($url) > 500 || preg_match('/[\x00-\x20\x7f]/', $url) || !filter_var($url, FILTER_VALIDATE_URL)) return false;
    $parts = parse_url($url);
    return is_array($parts) && in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true)
        && !empty($parts['host']) && !isset($parts['user']) && !isset($parts['pass']);
}
function blog_image_errors(array $data): array
{
    $errors = [];
    foreach (['image_alt' => 250, 'image_caption' => 500, 'image_credit' => 150, 'image_credit_url' => 500] as $field => $limit) {
        if (mb_strlen($data[$field] ?? '') > $limit) $errors[$field] = 'The image ' . str_replace(['image_', '_'], ['', ' '], $field) . ' is too long.';
    }
    if (!blog_credit_url_valid($data['image_credit_url'] ?? '')) $errors['image_credit_url'] = 'Use a complete http or https credit URL without login details, or leave it empty.';
    $image = blog_article_image($data['image'] ?? null);
    if (!empty($data['image']) && !$image) $errors['image'] = 'Choose an available local article image or upload a valid image.';
    if ($image && trim($data['image_alt'] ?? '') === '') $errors['image_alt'] = 'Describe the featured image for readers who cannot see it.';
    if (($data['status'] ?? '') === 'published' && !$image) $errors['image'] = 'Add a relevant featured image before publishing. An unfinished draft can be saved without one.';
    return $errors;
}
function blog_snapshot_fields(array $post): array
{
    $snapshot = [];
    foreach (['title', 'excerpt', 'content', 'slug', 'image', 'image_alt', 'image_caption', 'image_credit', 'image_credit_url', 'category_id', 'status', 'published_at', 'user_id', 'edit_version'] as $field) {
        $snapshot[$field] = $post[$field] ?? (in_array($field, ['image', 'published_at', 'category_id'], true) ? null : '');
    }
    return $snapshot;
}
function blog_add_revision(array $post, int $actor, ?int $source = null): void
{
    $payload = json_encode(blog_snapshot_fields($post), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    blog_write('INSERT INTO post_revisions (post_id,user_id,snapshot_json,source_revision_id) VALUES (:post,:user,:snapshot,:source)',
        ['post' => (int) $post['id'], 'user' => $actor, 'snapshot' => $payload, 'source' => $source]);
    $cutoff = blog_record('SELECT id FROM post_revisions WHERE post_id=:post ORDER BY id DESC LIMIT 1 OFFSET ' . (BLOG_REVISION_LIMIT - 1), ['post' => (int) $post['id']]);
    if ($cutoff) blog_write('DELETE FROM post_revisions WHERE post_id=:post AND id<:cutoff', ['post' => (int) $post['id'], 'cutoff' => (int) $cutoff['id']]);
}
function blog_atomic(callable $operation)
{
    $connection = database_connection();
    try {
        $connection->beginTransaction();
        $result = $operation();
        $connection->commit();
        return $result;
    } catch (Throwable $exception) {
        if ($connection->inTransaction()) $connection->rollBack();
        if ($exception instanceof PDOException) {
            error_log('Bed Mesh Blog: publishing transaction failed.');
            throw new BlogDatabaseUnavailable('The publishing transaction could not be completed.');
        }
        throw $exception;
    }
}
function blog_save_article(array $data, int $id, int $expectedVersion, int $actor): int
{
    return blog_atomic(static function () use ($data, $id, $expectedVersion, $actor) {
        if ($id) {
            $current = blog_record('SELECT * FROM posts WHERE id=:id FOR UPDATE', ['id' => $id]);
            if (!$current || (int) $current['edit_version'] !== $expectedVersion) throw new BlogEditConflict('This article changed in another editor. Your submitted work is still in this form. Reload the saved article before applying it.');
            if (!blog_record('SELECT id FROM post_revisions WHERE post_id=:post LIMIT 1', ['post' => $id])) blog_add_revision($current, $actor);
            $data['id'] = $id;
            blog_write('UPDATE posts SET title=:title,excerpt=:excerpt,content=:content,slug=:slug,image=:image,image_alt=:image_alt,image_caption=:image_caption,image_credit=:image_credit,image_credit_url=:image_credit_url,category_id=:category_id,status=:status,published_at=:published_at,edit_version=edit_version+1,updated_at=UTC_TIMESTAMP() WHERE id=:id', $data);
        } else {
            $data['user_id'] = $actor;
            $id = blog_insert_post($data);
        }
        $saved = blog_record('SELECT * FROM posts WHERE id=:id', ['id' => $id]);
        blog_add_revision($saved, $actor);
        return $id;
    });
}
function blog_restore_revision(int $postId, int $revisionId, int $expectedVersion, int $actor): void
{
    blog_atomic(static function () use ($postId, $revisionId, $expectedVersion, $actor) {
        $current = blog_record('SELECT * FROM posts WHERE id=:id FOR UPDATE', ['id' => $postId]);
        $revision = blog_record('SELECT * FROM post_revisions WHERE id=:revision AND post_id=:post', ['revision' => $revisionId, 'post' => $postId]);
        if (!$current || !$revision) throw new InvalidArgumentException('That revision is not available for this article.');
        if ((int) $current['edit_version'] !== $expectedVersion) throw new BlogEditConflict('This article changed while you were reviewing its history. Reload the history before restoring.');
        $snapshot = json_decode($revision['snapshot_json'], true, 32, JSON_THROW_ON_ERROR);
        $data = [];
        foreach (['title', 'excerpt', 'content', 'image_alt', 'image_caption', 'image_credit', 'image_credit_url'] as $field) $data[$field] = (string) ($snapshot[$field] ?? '');
        $data['content'] = blog_clean_html($data['content']);
        if (!blog_credit_url_valid($data['image_credit_url'])) $data['image_credit_url'] = '';
        $data['image'] = blog_article_image($snapshot['image'] ?? null) ? $snapshot['image'] : null;
        $category = (int) ($snapshot['category_id'] ?? 0);
        $data['category_id'] = blog_record('SELECT id FROM categories WHERE id=:id', ['id' => $category]) ? $category : null;
        $data['id'] = $postId;
        blog_write("UPDATE posts SET title=:title,excerpt=:excerpt,content=:content,image=:image,image_alt=:image_alt,image_caption=:image_caption,image_credit=:image_credit,image_credit_url=:image_credit_url,category_id=:category_id,status='draft',published_at=NULL,edit_version=edit_version+1,updated_at=UTC_TIMESTAMP() WHERE id=:id", $data);
        blog_add_revision(blog_record('SELECT * FROM posts WHERE id=:id', ['id' => $postId]), $actor, $revisionId);
    });
}
function blog_recovery_payload(array $data): array
{
    $payload = [];
    foreach (['title' => 100, 'excerpt' => 300, 'content' => 200000, 'category_id' => 12, 'status' => 12, 'image_alt' => 250, 'image_caption' => 500, 'image_credit' => 150, 'image_credit_url' => 500, 'remove_image' => 1, 'existing_image' => 200] as $field => $limit) {
        $value = $data[$field] ?? '';
        if (!is_string($value) || ($field === 'content' ? strlen($value) : mb_strlen($value)) > $limit) throw new InvalidArgumentException('The recovery contains an invalid or oversized field.');
        $payload[$field] = $value;
    }
    if (!in_array($payload['status'], ['draft', 'published', ''], true) || !in_array($payload['remove_image'], ['', '1'], true)) throw new InvalidArgumentException('The recovery contains invalid display values.');
    return $payload;
}
function blog_recovery_state(int $postId, int $actor, int $currentVersion): array
{
    $row = blog_record('SELECT * FROM post_recoveries WHERE user_id=:user AND post_id=:post', ['user' => $actor, 'post' => $postId]);
    $payload = $row ? json_decode($row['payload_json'], true, 32, JSON_THROW_ON_ERROR) : null;
    return ['ok' => true, 'csrf_token' => csrf_token(), 'available' => is_array($payload), 'version' => $row ? (int) $row['version'] : 0,
        'current_version' => $currentVersion, 'base_version' => $row ? (int) $row['base_version'] : $currentVersion,
        'updated_at' => $row ? gmdate('Y-m-d\TH:i:s\Z', strtotime($row['updated_at'] . ' UTC')) : null, 'payload' => $payload];
}
function blog_json(array $data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, private');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_HEX_TAG | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
}
function blog_recovery_endpoint(int $postId, bool $isPost): void
{
    $post = $postId ? blog_record('SELECT id,edit_version FROM posts WHERE id=:id', ['id' => $postId]) : ['edit_version' => 0];
    if (!$post) { blog_json(['ok' => false, 'error' => 'not_found'], 404); return; }
    $actor = (int) user('id');
    blog_write("UPDATE post_recoveries SET payload_json='null',version=version+1,updated_at=UTC_TIMESTAMP() WHERE user_id=:user AND updated_at<=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 14 DAY) AND payload_json<>'null'", ['user' => $actor]);
    if (!$isPost) { blog_json(blog_recovery_state($postId, $actor, (int) $post['edit_version'])); return; }
    $expected = filter_var($_POST['expected_version'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
    $base = filter_var($_POST['base_version'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
    $action = $_POST['action'] ?? '';
    if ($expected === false || $base === false || !in_array($action, ['save', 'discard'], true)) { blog_json(['ok' => false, 'error' => 'invalid_request'], 422); return; }
    try {
        if ($action === 'save') {
            $payload = json_encode(blog_recovery_payload($_POST), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            if ($expected === 0) {
                blog_write('INSERT INTO post_recoveries (user_id,post_id,payload_json,base_version,version) VALUES (:user,:post,:payload,:base,1)', ['user' => $actor, 'post' => $postId, 'payload' => $payload, 'base' => $base]);
                $changed = true;
            } else $changed = blog_write('UPDATE post_recoveries SET payload_json=:payload,base_version=:base,version=version+1,updated_at=UTC_TIMESTAMP() WHERE user_id=:user AND post_id=:post AND version=:version', ['payload' => $payload, 'base' => $base, 'user' => $actor, 'post' => $postId, 'version' => $expected]) > 0;
        } else {
            $changed = blog_write("UPDATE post_recoveries SET payload_json='null',version=version+1,updated_at=UTC_TIMESTAMP() WHERE user_id=:user AND post_id=:post AND version=:version", ['user' => $actor, 'post' => $postId, 'version' => $expected]) > 0;
            if (!$changed && !blog_record('SELECT user_id FROM post_recoveries WHERE user_id=:user AND post_id=:post', ['user' => $actor, 'post' => $postId])) $changed = true;
        }
        if (!$changed) { blog_json(array_merge(blog_recovery_state($postId, $actor, (int) $post['edit_version']), ['ok' => false, 'error' => 'recovery_conflict']), 409); return; }
        blog_json(blog_recovery_state($postId, $actor, (int) $post['edit_version']));
    } catch (BlogSlugConflict $exception) {
        blog_json(array_merge(blog_recovery_state($postId, $actor, (int) $post['edit_version']), ['ok' => false, 'error' => 'recovery_conflict']), 409);
    } catch (InvalidArgumentException | JsonException $exception) { blog_json(['ok' => false, 'error' => 'invalid_payload'], 422); }
}
