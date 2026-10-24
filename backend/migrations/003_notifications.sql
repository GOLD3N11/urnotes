-- Modulul Notifications: abonamentele push, setările amintirii și amintirile gata scrise pe zile.
CREATE TABLE notif_subscriptions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL,
    endpoint    text UNIQUE NOT NULL,
    p256dh      text NOT NULL,
    auth        text NOT NULL,
    user_agent  text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now(),
    last_ok_at  timestamptz,
    failures    integer NOT NULL DEFAULT 0
);
CREATE INDEX notif_subscriptions_user ON notif_subscriptions(user_id);

CREATE TABLE notif_settings (
    user_id    uuid PRIMARY KEY,
    enabled    boolean NOT NULL DEFAULT false,
    time       text NOT NULL DEFAULT '19:00' CHECK (time ~ '^[0-2][0-9]:[0-5][0-9]$'),
    timezone   text NOT NULL DEFAULT 'Europe/Bucharest',
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Aplicația scrie amintirea fiecărei zile (următoarele 7 zile) din datele elevului; serverul doar o trimite.
CREATE TABLE notif_digests (
    user_id  uuid NOT NULL,
    day      date NOT NULL,
    title    text NOT NULL,
    body     text NOT NULL,
    PRIMARY KEY (user_id, day)
);

-- O singură amintire pe zi: trimisă de server sau deja văzută în aplicație.
CREATE TABLE notif_delivered (
    user_id  uuid NOT NULL,
    day      date NOT NULL,
    via      text NOT NULL CHECK (via IN ('push', 'app')),
    at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, day)
);
