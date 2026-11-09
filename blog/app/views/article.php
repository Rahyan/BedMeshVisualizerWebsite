<?php
require_once dirname(__DIR__, 3) . '/php/head.php';
$rendered = blog_content_outline($post['content']);
$hero = blog_article_image($post['image'] ?? null);
$articleMeta = [];
if (!$preview) {
    $articleMeta['schema'] = [
        '@type' => 'BlogPosting',
        'headline' => $post['title'],
        'description' => blog_excerpt($post),
        'author' => $post['author']
            ? ['@type' => 'Person', 'name' => $post['author']]
            : ['@type' => 'Organization', 'name' => 'Bed Mesh'],
        'datePublished' => str_replace(' ', 'T', $post['published_at']) . 'Z',
    ];
    if (!empty($post['updated_at'])) {
        $articleMeta['schema']['dateModified'] = str_replace(' ', 'T', $post['updated_at']) . 'Z';
    }
    if ($hero !== null) {
        $path = parse_url($hero['url'], PHP_URL_PATH);
        if (is_string($path) && str_starts_with($path, '/') && !str_starts_with($path, '//')) {
            $articleMeta['schema']['image'] = site_origin() . $path;
            $articleMeta['card'] = [
                'path' => $path, 'width' => $hero['width'], 'height' => $hero['height'],
                'alt' => (string) $post['image_alt'],
            ];
        }
    }
}
blog_head($post['title'], blog_excerpt($post), $preview, blog_url('post/' . $post['slug']), [], $articleMeta);
?>
<main class="blog-shell" id="blog-main">
    <nav class="blog-breadcrumbs" aria-label="Breadcrumb"><a href="/">Bed Mesh</a><span aria-hidden="true">/</span><a href="<?= esc(blog_url()) ?>">Journal</a><span aria-hidden="true">/</span><span aria-current="page"><?= esc($post['category'] ?: 'Article') ?></span></nav>
    <?php if ($preview): ?><div class="blog-notice"><strong>Private preview.</strong> <?= $post['status'] === 'draft' ? 'This draft is visible only to a signed-in administrator.' : 'You are viewing the current saved article.' ?> <a href="<?= esc(blog_url('admin/posts/edit/' . $post['id'])) ?>">Return to editor →</a></div><?php endif; ?>
    <header class="blog-article-header"><a class="blog-eyebrow" href="<?= esc(blog_url('category/' . $post['category_slug'])) ?>"><?= esc($post['category'] ?: 'Journal') ?></a><h1><?= esc($post['title']) ?></h1><?php if ($post['excerpt']): ?><p class="blog-article-deck"><?= esc($post['excerpt']) ?></p><?php endif; ?><div class="blog-article-byline"><span class="blog-author-mark" aria-hidden="true"><?= esc(mb_substr($post['author'] ?: 'B', 0, 1)) ?></span><span><strong><?= esc($post['author'] ?: 'Bed Mesh') ?></strong><span><?php if ($post['published_at']): ?><time datetime="<?= esc(substr($post['published_at'], 0, 10)) ?>"><?= esc(blog_date($post['published_at'])) ?></time><span aria-hidden="true"> · </span><?php else: ?>Unpublished draft <span aria-hidden="true">· </span><?php endif; ?><?= blog_reading_time($post['content']) ?> min read</span></span></div></header>
    <?php if ($hero): ?><figure class="blog-hero-image"><img src="<?= esc($hero['url']) ?>" alt="<?= esc($post['image_alt']) ?>" width="<?= (int) $hero['width'] ?>" height="<?= (int) $hero['height'] ?>"><figcaption><?php if ($post['image_caption']): ?><span><?= esc($post['image_caption']) ?></span><?php endif; ?><?php if ($post['image_credit']): ?><span class="blog-image-credit"><?php if ($post['image_credit_url'] && blog_credit_url_valid($post['image_credit_url'])): ?><a href="<?= esc($post['image_credit_url']) ?>"><?= esc($post['image_credit']) ?></a><?php else: ?><?= esc($post['image_credit']) ?><?php endif; ?></span><?php endif; ?><a class="blog-image-full" href="<?= esc($hero['url']) ?>">View full-size image <span aria-hidden="true">↗</span></a></figcaption></figure><?php endif; ?>
    <div class="blog-reading-layout">
        <aside class="blog-reading-aside"><?php if ($rendered['headings']): ?><nav class="blog-article-toc" aria-label="In this article" data-reading-nav><h2>In this article</h2><ol><?php foreach ($rendered['headings'] as $heading): ?><li><a href="#<?= esc($heading['id']) ?>"><?= esc($heading['text']) ?></a></li><?php endforeach; ?></ol></nav><?php endif; ?><a href="<?= esc(blog_url()) ?>">← All articles</a></aside>
        <article class="blog-prose" aria-label="<?= esc($post['title']) ?>"><?= $rendered['html'] ?><footer class="blog-prose-end"><p>Bring the idea back to your own measurements.</p><a href="/#visualizer">Open the visualizer <span aria-hidden="true">↗</span></a></footer></article>
    </div>
    <?php if ($related): ?><nav class="blog-related" aria-label="More articles"><h2>Keep reading</h2><?php foreach ($related as $item): ?><a href="<?= esc(blog_url('post/' . $item['slug'])) ?>"><span><small><?= esc($item['category']) ?></small><?= esc($item['title']) ?></span><span aria-hidden="true">↗</span></a><?php endforeach; ?></nav><?php endif; ?>
</main>
<?php if ($rendered['headings']): ?><script type="module" src="<?= esc(site_asset_url('/js/reading.js')) ?>"></script><?php endif; ?>
<?php blog_foot(); ?>
