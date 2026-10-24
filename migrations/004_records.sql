-- Modulul Student data: datele elevului, înregistrare cu înregistrare (faza 4).
--   subject/<nume>   materia (fără note)
--   grade/<id>       o notă (id-urile „adservio:…” vin din importul Adservio)
--   event/<id>       un eveniment din calendar (id-urile „class-…” vin de la clasa elevului)
--   doc/<cheie>      restul: settings, timetable, purtare, plan, exams, pal, archive, …
-- Fiecare scriere primește un număr nou (rev); aplicația cere „ce s-a schimbat după rev N”.
CREATE SEQUENCE data_rev_seq;

CREATE TABLE data_records (
    student_id  uuid NOT NULL,
    collection  text NOT NULL CHECK (collection IN ('subject', 'grade', 'event', 'doc')),
    record_id   text NOT NULL CHECK (length(record_id) BETWEEN 1 AND 120),
    data        jsonb,
    deleted     boolean NOT NULL DEFAULT false,
    rev         bigint NOT NULL DEFAULT nextval('data_rev_seq'),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  text NOT NULL DEFAULT '',
    PRIMARY KEY (student_id, collection, record_id)
);
CREATE INDEX data_records_since ON data_records(student_id, rev);
