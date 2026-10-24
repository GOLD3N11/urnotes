-- Modulul Accounts: utilizatori, roluri, legături părinte/profesor ↔ elev, integrări (Adservio).
CREATE TABLE accounts_users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firebase_uid  text UNIQUE NOT NULL,
    email         text NOT NULL DEFAULT '',
    name          text NOT NULL DEFAULT '',
    role          text NOT NULL CHECK (role IN ('student', 'parent', 'teacher')),
    is_admin      boolean NOT NULL DEFAULT false,
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- Cine poate vedea datele unui elev (doar citire).
CREATE TABLE accounts_links (
    student_id  uuid NOT NULL REFERENCES accounts_users(id) ON DELETE CASCADE,
    viewer_id   uuid NOT NULL REFERENCES accounts_users(id) ON DELETE CASCADE,
    relation    text NOT NULL CHECK (relation IN ('parent', 'teacher')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (student_id, viewer_id),
    CHECK (student_id <> viewer_id)
);
CREATE INDEX accounts_links_viewer ON accounts_links(viewer_id);

-- Coduri de o singură folosință, create de elev pentru un părinte sau un profesor.
CREATE TABLE accounts_invites (
    code        text PRIMARY KEY,
    student_id  uuid NOT NULL REFERENCES accounts_users(id) ON DELETE CASCADE,
    relation    text NOT NULL CHECK (relation IN ('parent', 'teacher')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL,
    used_at     timestamptz,
    used_by     uuid REFERENCES accounts_users(id) ON DELETE SET NULL
);

-- Integrări care pot scrie date (de ex. importul de note din Adservio). Cheia se păstrează doar ca hash.
CREATE TABLE accounts_integrations (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    kind        text NOT NULL CHECK (kind IN ('adservio')),
    key_hash    text UNIQUE NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    revoked_at  timestamptz
);

-- Pentru ce elevi are voie o integrare să scrie (elevul o permite și o poate retrage).
CREATE TABLE accounts_integration_grants (
    integration_id  uuid NOT NULL REFERENCES accounts_integrations(id) ON DELETE CASCADE,
    student_id      uuid NOT NULL REFERENCES accounts_users(id) ON DELETE CASCADE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (integration_id, student_id)
);
