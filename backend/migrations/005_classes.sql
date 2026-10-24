-- Modulul Classes: clasa unui profesor, elevii ei și testele puse de profesor (faza 6).
-- Un test al clasei ajunge în calendarul fiecărui elev ca eveniment „class-<id>” (elevul îl bifează și îi pune nota).
CREATE TABLE class_groups (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id  uuid NOT NULL,
    name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
    subject     text NOT NULL DEFAULT '',
    join_code   text UNIQUE NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX class_groups_teacher ON class_groups(teacher_id);

CREATE TABLE class_members (
    class_id    uuid NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
    student_id  uuid NOT NULL,
    joined_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (class_id, student_id)
);
CREATE INDEX class_members_student ON class_members(student_id);

CREATE TABLE class_events (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id    uuid NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
    date        date NOT NULL,
    time        text NOT NULL DEFAULT '' CHECK (time = '' OR time ~ '^[0-2][0-9]:[0-5][0-9]$'),
    type        text NOT NULL CHECK (type IN ('Test', 'Examen', 'Temă', 'Proiect', 'Prezentare')),
    title       text NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
    subject     text NOT NULL DEFAULT '',
    description text NOT NULL DEFAULT '',
    updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX class_events_class ON class_events(class_id, date);
