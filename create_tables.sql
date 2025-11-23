-- Create all tables in the correct order (respecting foreign key dependencies)

CREATE TABLE IF NOT EXISTS "user" (
    id SERIAL PRIMARY KEY,
    name VARCHAR,
    username VARCHAR UNIQUE,
    email VARCHAR NOT NULL,
    password_hash VARCHAR NOT NULL,
    bio VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_user_username ON "user"(username);
CREATE INDEX IF NOT EXISTS ix_user_email ON "user"(email);

CREATE TABLE IF NOT EXISTS book (
    id SERIAL PRIMARY KEY,
    title VARCHAR NOT NULL,
    author VARCHAR,
    isbn VARCHAR,
    cover_url VARCHAR,
    tags VARCHAR,
    description VARCHAR,
    total_pages INTEGER,
    publisher VARCHAR,
    published_date VARCHAR,
    format VARCHAR,
    pages_source VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS userbook (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    book_id INTEGER NOT NULL REFERENCES book(id) ON DELETE CASCADE,
    status VARCHAR DEFAULT 'to-read',
    current_page INTEGER,
    rating INTEGER,
    private_notes VARCHAR,
    format VARCHAR DEFAULT 'hardcover',
    ownership_status VARCHAR DEFAULT 'owned',
    borrowed_from VARCHAR,
    loaned_to VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_userbook_user_id ON userbook(user_id);
CREATE INDEX IF NOT EXISTS ix_userbook_book_id ON userbook(book_id);

CREATE TABLE IF NOT EXISTS note (
    id SERIAL PRIMARY KEY,
    userbook_id INTEGER REFERENCES userbook(id) ON DELETE SET NULL,
    user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    text VARCHAR,
    emotion VARCHAR,
    page_number INTEGER,
    chapter VARCHAR,
    image_url VARCHAR,
    quote VARCHAR,
    is_public BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_note_userbook_id ON note(userbook_id);
CREATE INDEX IF NOT EXISTS ix_note_user_id ON note(user_id);

CREATE TABLE IF NOT EXISTS journal (
    id SERIAL PRIMARY KEY,
    entry_id INTEGER NOT NULL REFERENCES userbook(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    timestamp TIMESTAMP,
    feeling VARCHAR,
    text VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS follow (
    id SERIAL PRIMARY KEY,
    follower_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    followed_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_follow_follower_id ON follow(follower_id);
CREATE INDEX IF NOT EXISTS ix_follow_followed_id ON follow(followed_id);

CREATE TABLE IF NOT EXISTS "like" (
    id SERIAL PRIMARY KEY,
    note_id INTEGER NOT NULL REFERENCES note(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_like_note_id ON "like"(note_id);
CREATE INDEX IF NOT EXISTS ix_like_user_id ON "like"(user_id);

CREATE TABLE IF NOT EXISTS comment (
    id SERIAL PRIMARY KEY,
    note_id INTEGER NOT NULL REFERENCES note(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    text VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_comment_note_id ON comment(note_id);
CREATE INDEX IF NOT EXISTS ix_comment_user_id ON comment(user_id);
