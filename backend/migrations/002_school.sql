-- Modulul School data: anii școlari, săptămâna de schi pe județe, calendarul examenelor.
-- Fiecare document e JSON (aceeași formă ca în aplicație), cu o versiune care crește la fiecare modificare.
CREATE TABLE school_documents (
    kind        text NOT NULL CHECK (kind IN ('year', 'counties', 'exams')),
    key         text NOT NULL,
    data        jsonb NOT NULL,
    version     integer NOT NULL DEFAULT 1,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  uuid,
    PRIMARY KEY (kind, key)
);
