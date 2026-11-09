<?php

function query(string $query, array $data = [])
{
    try {
        $statement = database_connection()->prepare($query);
        $statement->execute($data);
        if ($statement->columnCount() === 0) {
            return false;
        }
        $result = $statement->fetchAll();
        return $result ?: false;
    } catch (PDOException $exception) {
        error_log('Bed Mesh Blog: database query failed.');
        throw new BlogDatabaseUnavailable('The blog database is unavailable.');
    }
}

function query_row(string $query, array $data = [])
{
    $rows = query($query, $data);
    return $rows ? $rows[0] : false;
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function csrf_valid($token): bool
{
    return is_string($token) && isset($_SESSION['csrf_token'])
        && is_string($_SESSION['csrf_token']) && hash_equals($_SESSION['csrf_token'], $token);
}

function csrf_field(): string
{
    return '<input type="hidden" name="csrf_token" value="' . esc(csrf_token()) . '">';
}

function redirect($page)
{
    header('Location: ' . ROOT . '/' . $page);
    exit;
}

function esc($value): string
{
    return htmlspecialchars(is_scalar($value) ? (string) $value : '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function old_value($key, $default = '')
{
    // Never reflect a password into markup after an unsuccessful submission.
    if (in_array($key, ['password', 'retype_password'], true)) {
        return '';
    }
    return esc($_POST[$key] ?? $default);
}

function old_checked($key, $default = '')
{
    return !empty($_POST[$key]) ? ' checked ' : '';
}

function old_select($key, $value, $default = '')
{
    $current = $_POST[$key] ?? $default;
    return is_scalar($current) && (string) $current === (string) $value ? ' selected ' : '';
}

function authenticate($row)
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_regenerate_id(true);
    }
    unset($row['password']);
    $_SESSION['USER'] = $row;
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

function user($key = '')
{
    $account = $_SESSION['USER'] ?? [];
    return $key === '' ? $account : ($account[$key] ?? '');
}

function logged_in(): bool
{
    return is_array($_SESSION['USER'] ?? null) && !empty($_SESSION['USER']['id']);
}

function is_admin(): bool
{
    return logged_in() && user('role') === 'admin';
}

/** Resolve a file only within the blog public directory. */
function blog_public_file($relative): ?string
{
    if (!is_string($relative) || $relative === '' || strpos($relative, "\0") !== false) {
        return null;
    }
    $root = realpath(BLOG_PUBLIC_PATH);
    $file = realpath(BLOG_PUBLIC_PATH . '/' . $relative);
    if ($root === false || $file === false || !is_file($file)) {
        return null;
    }
    $prefix = str_replace('\\', '/', $root) . '/';
    $normalized = str_replace('\\', '/', $file);
    return strncasecmp($normalized, $prefix, strlen($prefix)) === 0 ? $file : null;
}

function get_image($file)
{
    if (is_string($file) && preg_match('~^(?:uploads|assets/images)/[a-zA-Z0-9_.-]+\.(?:jpe?g|png|webp|gif)$~i', $file)
        && blog_public_file($file)) {
        return esc(ROOT . '/' . $file);
    }
    return esc(ROOT . '/assets/images/no_image.jpg');
}

function delete_uploaded_image($file): void
{
    if (!is_string($file) || !preg_match('~^uploads/[a-zA-Z0-9_.-]+\.(?:jpe?g|png|webp|gif)$~i', $file)) {
        return;
    }
    $resolved = blog_public_file($file);
    $directory = realpath(BLOG_PUBLIC_PATH . '/uploads');
    if ($resolved && $directory && dirname($resolved) === $directory) {
        unlink($resolved);
    }
}

/** Derive the extension from actual image bytes, never the supplied filename/MIME. */
function validated_image_extension(string $filename): string
{
    $size = filesize($filename);
    if ($size === false || $size === 0 || $size > 5 * 1024 * 1024) {
        throw new InvalidArgumentException('Images must be 5 MB or smaller.');
    }
    $image = @getimagesize($filename);
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($filename);
    $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!$image || !isset($allowed[$mime]) || ($image['mime'] ?? '') !== $mime
        || $image[0] < 1 || $image[1] < 1 || $image[0] * $image[1] > 20000000) {
        throw new InvalidArgumentException('Choose a valid JPEG, PNG, or WebP image (up to 20 megapixels).');
    }
    return $allowed[$mime];
}

function image_upload_destination(string $extension): string
{
    $folder = BLOG_PUBLIC_PATH . '/uploads';
    if (!is_dir($folder) && !mkdir($folder, 0755, true) && !is_dir($folder)) {
        throw new InvalidArgumentException('The image could not be saved. Please try again.');
    }
    return 'uploads/' . bin2hex(random_bytes(16)) . '.' . $extension;
}

function save_uploaded_image(array $file): string
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK
        || !is_string($file['tmp_name'] ?? null) || !is_uploaded_file($file['tmp_name'])) {
        throw new InvalidArgumentException('The image upload failed. Please choose the image again.');
    }
    $extension = validated_image_extension($file['tmp_name']);
    $destination = image_upload_destination($extension);
    if (!move_uploaded_file($file['tmp_name'], BLOG_PUBLIC_PATH . '/' . $destination)) {
        throw new InvalidArgumentException('The image could not be saved. Please try again.');
    }
    resize_image(BLOG_PUBLIC_PATH . '/' . $destination);
    return $destination;
}

function remove_images_from_content($content, $folder = 'uploads/')
{
    // Ignore editor filenames and caller-supplied folders: both used to permit traversal.
    return preg_replace_callback('~<img\b[^>]*>~i', function ($match) {
        $image = $match[0];
        if (!preg_match('~\bsrc\s*=\s*([\'"])(.*?)\1~is', $image, $source)
            || stripos($source[2], 'data:') !== 0) {
            return $image;
        }
        if (strlen($source[2]) > 7 * 1024 * 1024
            || !preg_match('~^data:image/(?:jpeg|png|webp);base64,([a-zA-Z0-9+/\r\n]+={0,2})$~i', $source[2], $data)) {
            return '';
        }
        $bytes = base64_decode($data[1], true);
        if ($bytes === false || strlen($bytes) > 5 * 1024 * 1024) {
            return '';
        }
        $temporary = tempnam(sys_get_temp_dir(), 'bedmesh-image-');
        if ($temporary === false) {
            return '';
        }
        try {
            if (file_put_contents($temporary, $bytes) !== strlen($bytes)) {
                return '';
            }
            $extension = validated_image_extension($temporary);
            $destination = image_upload_destination($extension);
            if (!copy($temporary, BLOG_PUBLIC_PATH . '/' . $destination)) {
                return '';
            }
            resize_image(BLOG_PUBLIC_PATH . '/' . $destination);
            return str_replace($source[0], 'src="' . esc($destination) . '"', $image);
        } catch (InvalidArgumentException $exception) {
            return '';
        } finally {
            unlink($temporary);
        }
    }, (string) $content);
}

function add_root_to_images($content)
{
    return preg_replace_callback('~(<img\b[^>]*\bsrc\s*=\s*)([\'"])(/?uploads/[^\'"<>]+)\2~i', function ($match) {
        return $match[1] . $match[2] . esc(ROOT . '/' . ltrim($match[3], '/')) . $match[2];
    }, (string) $content);
}

function remove_root_from_content($content)
{
    return str_replace(ROOT . '/uploads/', 'uploads/', (string) $content);
}

function resize_image($filename, $max_size = 1000)
{
    // GD is optional on development machines; validated files retain their safe extension.
    if (!function_exists('imagecreatetruecolor') || !is_file($filename)) {
        return;
    }
    $mime = mime_content_type($filename);
    $readers = ['image/jpeg' => 'imagecreatefromjpeg', 'image/png' => 'imagecreatefrompng', 'image/webp' => 'imagecreatefromwebp'];
    if (!isset($readers[$mime]) || !function_exists($readers[$mime])) {
        return;
    }
    $source = @$readers[$mime]($filename);
    if (!$source) {
        return;
    }
    $width = imagesx($source);
    $height = imagesy($source);
    $scale = min(1, $max_size / max($width, $height));
    $target = imagecreatetruecolor(max(1, (int) round($width * $scale)), max(1, (int) round($height * $scale)));
    imagealphablending($target, false);
    imagesavealpha($target, true);
    imagecopyresampled($target, $source, 0, 0, 0, 0, imagesx($target), imagesy($target), $width, $height);
    if ($mime === 'image/jpeg') {
        imagejpeg($target, $filename, 90);
    } elseif ($mime === 'image/png') {
        imagepng($target, $filename, 8);
    } elseif ($mime === 'image/webp') {
        imagewebp($target, $filename, 90);
    }
    imagedestroy($source);
    imagedestroy($target);
}

function str_to_url($url)
{

   $url = str_replace("'", "", $url);
   $url = preg_replace('~[^\\pL0-9_]+~u', '-', $url);
   $url = trim($url, "-");
   $url = iconv("utf-8", "us-ascii//TRANSLIT", $url);
   $url = strtolower($url);
   $url = preg_replace('~[^-a-z0-9_]+~', '', $url);

   return $url;
}

function get_pagination_vars()
{
    $page = $_GET['page'] ?? 1;
    $page = is_scalar($page) ? max(1, (int) $page) : 1;
    $route = $_GET['url'] ?? 'home';
    $route = is_string($route) && preg_match('~^[a-zA-Z0-9_/-]+$~', $route) ? $route : 'home';
    $parameters = [];
    foreach ($_GET as $key => $value) {
        if ($key !== 'url' && is_string($key) && is_string($value)) {
            $parameters[$key] = $value;
        }
    }
    $link = function ($number) use ($parameters, $route) {
        $parameters['page'] = $number;
        return esc(ROOT . '/' . $route . '?' . http_build_query($parameters));
    };
    return [
        'current_link' => $link($page),
        'next_link' => $link($page + 1),
        'prev_link' => $link(max(1, $page - 1)),
        'first_link' => $link(1),
        'page_number' => $page,
    ];
}

/** Explicit setup helper: create tables in an already configured empty database. */
function create_tables()
{
    $schema = file_get_contents(dirname(__DIR__, 2) . '/database/schema.sql');
    $schema = preg_replace('/^--.*$/m', '', $schema);
    foreach (explode(';', $schema) as $statement) {
        if (trim($statement) !== '') {
            query($statement);
        }
    }
}
