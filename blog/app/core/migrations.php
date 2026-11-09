<?php
/** Explicit, additive migrations. Never called by public requests. */
class BlogMigrationBlocked extends RuntimeException {}
function migrate_blog_database(): array
{
    // Publishing transactions and row locks require transactional tables. Check
    // existing storage before create_tables(), because DDL cannot be rolled back.
    $managed = ['users', 'categories', 'posts', 'blog_login_attempts', 'post_revisions', 'post_recoveries'];
    $placeholders = implode(',', array_fill(0, count($managed), '?'));
    $statement = database_connection()->prepare('SELECT TABLE_NAME AS table_name, ENGINE AS storage_engine, TABLE_TYPE AS table_type FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND LOWER(TABLE_NAME) IN (' . $placeholders . ')');
    $statement->execute($managed);
    foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $table) {
        if (!in_array($table['table_name'], $managed, true)) {
            throw new BlogMigrationBlocked('Migration stopped: journal table ' . $table['table_name'] . ' differs in letter case from the expected lowercase name. Back up the database and pause publishing before an operator reviews and explicitly renames it, then rerun. No migration changes were applied.');
        }
        if ($table['table_type'] !== 'BASE TABLE' || strcasecmp((string) $table['storage_engine'], 'InnoDB') !== 0) {
            throw new BlogMigrationBlocked('Migration stopped: existing journal table ' . $table['table_name'] . ' must use InnoDB for transactional publishing. Back up the database and pause publishing before an operator converts incompatible tables, then rerun. No migration changes were applied.');
        }
    }
    create_tables();
    $changes = [];
    // Never silently rename legacy public URLs. Stop for a deliberate data review.
    foreach (['posts', 'categories'] as $table) {
        $duplicate = database_connection()->query('SELECT slug FROM ' . $table . ' GROUP BY slug HAVING COUNT(*)>1 LIMIT 1')->fetchColumn();
        if ($duplicate !== false) {
            throw new BlogMigrationBlocked('Migration stopped: ' . $table . ' contains duplicate slugs. Review those records and assign unique slugs in your database before rerunning. No records were removed or renamed.');
        }
    }
    foreach (['posts', 'categories'] as $table) {
        $indexes = database_connection()->query('SHOW INDEX FROM ' . $table)->fetchAll(PDO::FETCH_ASSOC);
        $unique = [];
        foreach ($indexes as $index) {
            if ((int) $index['Non_unique'] === 0) $unique[$index['Key_name']][] = $index['Column_name'];
        }
        $hasSlugConstraint = false;
        foreach ($unique as $columns) if ($columns === ['slug']) $hasSlugConstraint = true;
        if (!$hasSlugConstraint) {
            try { database_connection()->exec('ALTER TABLE ' . $table . ' ADD UNIQUE KEY slug_unique (slug)'); }
            catch (PDOException $exception) {
                if ((int) ($exception->errorInfo[1] ?? 0) === 1062) throw new BlogMigrationBlocked('Migration stopped because duplicate slugs appeared during the check. Pause publishing, review duplicate URLs, and rerun. No records were removed or renamed.');
                throw $exception;
            }
            $changes[] = $table . ' unique slugs';
        }
    }
    $columns = database_connection()->query('SHOW COLUMNS FROM posts')->fetchAll(PDO::FETCH_COLUMN);
    $additions = [
        'excerpt' => "VARCHAR(300) NOT NULL DEFAULT ''",
        'status' => "VARCHAR(12) NOT NULL DEFAULT 'draft'",
        'published_at' => 'DATETIME NULL',
        'updated_at' => 'DATETIME NULL',
        'image_alt' => "VARCHAR(250) NOT NULL DEFAULT ''",
        'image_caption' => "VARCHAR(500) NOT NULL DEFAULT ''",
        'image_credit' => "VARCHAR(150) NOT NULL DEFAULT ''",
        'image_credit_url' => "VARCHAR(500) NOT NULL DEFAULT ''",
        'edit_version' => 'INT UNSIGNED NOT NULL DEFAULT 0',
    ];
    foreach ($additions as $name => $definition) {
        if (!in_array($name, $columns, true)) {
            database_connection()->exec('ALTER TABLE posts ADD COLUMN ' . $name . ' ' . $definition);
            $changes[] = $name;
        }
    }
    $contentColumn = database_connection()->query("SHOW COLUMNS FROM posts WHERE Field='content'")->fetch(PDO::FETCH_ASSOC);
    if ($contentColumn && strtolower($contentColumn['Type']) === 'text') {
        database_connection()->exec('ALTER TABLE posts MODIFY content MEDIUMTEXT NULL');
        $changes[] = 'content capacity';
    }
    $indexes = database_connection()->query('SHOW INDEX FROM posts')->fetchAll(PDO::FETCH_ASSOC);
    if (!in_array('published_lookup', array_column($indexes, 'Key_name'), true)) {
        database_connection()->exec('ALTER TABLE posts ADD INDEX published_lookup (status, published_at)');
        $changes[] = 'published_lookup';
    }
    return $changes;
}
