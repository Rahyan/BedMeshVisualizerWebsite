-- Empty Bed Mesh Blog schema. No accounts, credentials, or production content.
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    image VARCHAR(1024) NULL,
    date DATETIME DEFAULT CURRENT_TIMESTAMP,
    role VARCHAR(10) NOT NULL DEFAULT 'user',
    KEY username (username), KEY email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    category VARCHAR(50) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    disabled TINYINT DEFAULT 0,
    UNIQUE KEY slug_unique (slug), KEY category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS posts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    category_id INT,
    title VARCHAR(100) NOT NULL,
    content MEDIUMTEXT NULL,
    excerpt VARCHAR(300) NOT NULL DEFAULT '',
    image VARCHAR(1024) NULL,
    image_alt VARCHAR(250) NOT NULL DEFAULT '',
    image_caption VARCHAR(500) NOT NULL DEFAULT '',
    image_credit VARCHAR(150) NOT NULL DEFAULT '',
    image_credit_url VARCHAR(500) NOT NULL DEFAULT '',
    edit_version INT UNSIGNED NOT NULL DEFAULT 0,
    date DATETIME DEFAULT CURRENT_TIMESTAMP,
    slug VARCHAR(100) NOT NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'draft',
    published_at DATETIME NULL,
    updated_at DATETIME NULL,
    KEY user_id (user_id), KEY category_id (category_id),
    KEY title (title), UNIQUE KEY slug_unique (slug), KEY date (date),
    KEY published_lookup (status, published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Bounded login throttling. Only a digest of the request identity is stored.
CREATE TABLE IF NOT EXISTS blog_login_attempts (
    attempt_key CHAR(64) PRIMARY KEY,
    attempts INT NOT NULL DEFAULT 0,
    window_started DATETIME NOT NULL,
    KEY window_started (window_started)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Private editorial history and per-administrator recovery, separate from publication.
CREATE TABLE IF NOT EXISTS post_revisions (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    post_id INT NOT NULL,
    user_id INT NOT NULL,
    snapshot_json MEDIUMTEXT NOT NULL,
    source_revision_id BIGINT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY post_history (post_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS post_recoveries (
    user_id INT NOT NULL,
    post_id INT NOT NULL DEFAULT 0,
    payload_json MEDIUMTEXT NOT NULL,
    base_version INT UNSIGNED NOT NULL DEFAULT 0,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id,post_id),
    KEY recovery_age (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
