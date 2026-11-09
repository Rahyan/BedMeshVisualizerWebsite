<?php
$title = $page === 'search' ? 'Search the journal' : ($category['category'] ?? 'The Bed Mesh journal');
$description = $category ? 'Published notes about ' . $category['category'] . ', mesh analysis, and 3D printing.' : 'Field notes on mesh analysis, better comparisons, and building a more useful Bed Mesh.';
$canonical = $page === 'search' ? null : blog_url($category ? 'category/' . $category['slug'] : '', $pageNumber > 1 ? ['page' => $pageNumber] : []);
blog_head($title, $description, $page === 'search', $canonical);
?>
<main class="blog-shell" id="blog-main">
    <nav class="blog-breadcrumbs" aria-label="Breadcrumb"><a href="/">Bed Mesh</a><span aria-hidden="true">/</span><?php if ($category || $page === 'search'): ?><a href="<?= esc(blog_url()) ?>">Journal</a><span aria-hidden="true">/</span><?php endif; ?><span aria-current="page"><?= $category ? esc($category['category']) : ($page === 'search' ? 'Search' : 'Journal') ?></span></nav>
    <header class="blog-intro"><p class="blog-eyebrow">Field notes &amp; project updates</p><h1><?= esc($title) ?></h1><p><?= $category ? 'A closer look at ' . esc(mb_strtolower($category['category'])) . '.' : 'Measurements, observations, and a better understanding of your print bed.' ?></p></header>
    <div class="blog-editorial-layout">
        <div class="blog-article-list">
            <?php if ($page === 'search'): ?><p class="blog-results"><?= $search === '' ? 'Enter a word or phrase to search published articles.' : $total . ' ' . ($total === 1 ? 'article' : 'articles') . ' found for “' . esc($search) . '”.' ?></p><?php endif; ?>
            <?php if (!$posts): ?>
                <section class="blog-empty"><span class="blog-empty-mark" aria-hidden="true">✳</span><h2><?= $page === 'search' ? 'No matching stories yet.' : 'A little space for the next idea.' ?></h2><p><?= $page === 'search' ? 'Try a different word, or browse every published article.' : 'There are no published articles here yet. The practical guides are ready whenever you need a hand.' ?></p><a href="<?= $page === 'search' ? esc(blog_url()) : '/guides/' ?>"><?= $page === 'search' ? 'Browse the journal' : 'Explore the guides' ?> <span aria-hidden="true">↗</span></a></section>
            <?php endif; ?>
            <?php foreach ($posts as $index => $item): ?>
                <article class="blog-list-item<?= $index === 0 && $page === 'home' && $pageNumber === 1 ? ' blog-list-item--lead' : '' ?>">
                    <div class="blog-post-meta"><a href="<?= esc(blog_url('category/' . $item['category_slug'])) ?>"><?= esc($item['category']) ?></a><span aria-hidden="true">·</span><time datetime="<?= esc(substr($item['published_at'], 0, 10)) ?>"><?= esc(blog_date($item['published_at'])) ?></time></div>
                    <h2><a href="<?= esc(blog_url('post/' . $item['slug'])) ?>"><?= esc($item['title']) ?></a></h2>
                    <p><?= esc(blog_excerpt($item)) ?></p>
                    <?php $listImage = blog_article_image($item['image'] ?? null); if ($listImage): ?><a class="blog-list-image" href="<?= esc(blog_url('post/' . $item['slug'])) ?>" tabindex="-1" aria-hidden="true"><img src="<?= esc($listImage['url']) ?>" alt="" loading="lazy" width="800" height="440"></a><?php endif; ?>
                    <div class="blog-list-bottom"><span><?= esc($item['author'] ?: 'Bed Mesh') ?> <span aria-hidden="true">·</span> <?= blog_reading_time($item['content']) ?> min read</span><a href="<?= esc(blog_url('post/' . $item['slug'])) ?>">Read article <span class="screen-reader-text"><?= esc($item['title']) ?></span><span aria-hidden="true">↗</span></a></div>
                </article>
            <?php endforeach; ?>
            <?php blog_pagination($pageNumber, $pages, $page === 'search' ? 'search' : ($category ? 'category/' . $category['slug'] : ''), $search !== '' ? ['find' => $search] : []); ?>
        </div>
        <aside class="blog-sidebar">
            <form class="blog-search" action="<?= esc(blog_url('search')) ?>" method="get" role="search"><label for="journal-search">Search the journal</label><div><input id="journal-search" name="find" type="search" maxlength="100" value="<?= esc($search) ?>" placeholder="Find a topic…"><button type="submit" aria-label="Search articles">→</button></div></form>
            <?php if ($categories): ?><nav class="blog-topics" aria-label="Journal topics"><h2>Topics</h2><a href="<?= esc(blog_url()) ?>"<?= !$category && $page !== 'search' ? ' aria-current="page"' : '' ?>>All articles <span aria-hidden="true">↗</span></a><?php foreach ($categories as $item): ?><a href="<?= esc(blog_url('category/' . $item['slug'])) ?>"<?= $category && $category['id'] === $item['id'] ? ' aria-current="page"' : '' ?>><?= esc($item['category']) ?><span><?= (int) $item['total'] ?></span></a><?php endforeach; ?></nav><?php endif; ?>
            <div class="blog-sidebar-note"><p class="blog-eyebrow">Have measurements ready?</p><p>Turn a console grid into a surface you can explore.</p><a href="/#visualizer">Open the visualizer <span aria-hidden="true">↗</span></a></div>
            <div class="blog-sidebar-note blog-sidebar-note--plain"><h2>Practical guides</h2><p>Start with the basics of getting, reading, and comparing your mesh.</p><a href="/guides/">Browse the guides <span aria-hidden="true">↗</span></a></div>
            <a class="blog-editor-link" href="<?= esc(blog_url(is_admin() ? 'admin' : 'login')) ?>">Publishing access</a>
        </aside>
    </div>
</main>
<?php blog_foot(); ?>
