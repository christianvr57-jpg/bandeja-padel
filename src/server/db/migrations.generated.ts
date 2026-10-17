// Generado por scripts/embed-migrations.ts a partir de drizzle/*.sql. No editar a mano.
export const migrations: Array<{ id: string; statements: string[] }> = [
  {
    "id": "0000_init",
    "statements": [
      "CREATE TABLE \"categories\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"tournament_id\" uuid NOT NULL,\n\t\"gender\" text NOT NULL,\n\t\"level\" text NOT NULL,\n\t\"name\" text DEFAULT '' NOT NULL,\n\t\"max_pairs\" integer NOT NULL,\n\t\"format\" text NOT NULL,\n\t\"match_format\" text NOT NULL,\n\t\"group_size\" integer DEFAULT 4 NOT NULL,\n\t\"qualifiers_per_group\" integer DEFAULT 2 NOT NULL,\n\t\"position\" integer DEFAULT 0 NOT NULL,\n\t\"draw_generated_at\" timestamp with time zone,\n\t\"draw_groups\" jsonb,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL\n);",
      "CREATE TABLE \"clubs\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"name\" text NOT NULL,\n\t\"email\" text NOT NULL,\n\t\"password_hash\" text NOT NULL,\n\t\"city\" text DEFAULT '' NOT NULL,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL\n);",
      "CREATE TABLE \"courts\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"tournament_id\" uuid NOT NULL,\n\t\"name\" text NOT NULL,\n\t\"position\" integer DEFAULT 0 NOT NULL\n);",
      "CREATE TABLE \"emails\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"tournament_id\" uuid,\n\t\"to_email\" text NOT NULL,\n\t\"subject\" text NOT NULL,\n\t\"kind\" text NOT NULL,\n\t\"body\" text,\n\t\"status\" text NOT NULL,\n\t\"error\" text,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL\n);",
      "CREATE TABLE \"matches\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"tournament_id\" uuid NOT NULL,\n\t\"category_id\" uuid NOT NULL,\n\t\"key\" text NOT NULL,\n\t\"phase\" text NOT NULL,\n\t\"round\" integer NOT NULL,\n\t\"position\" integer NOT NULL,\n\t\"group_key\" text,\n\t\"source_a\" jsonb NOT NULL,\n\t\"source_b\" jsonb NOT NULL,\n\t\"pair_a_id\" uuid,\n\t\"pair_b_id\" uuid,\n\t\"status\" text DEFAULT 'waiting' NOT NULL,\n\t\"outcome\" text,\n\t\"sets\" jsonb,\n\t\"winner_side\" text,\n\t\"result_at\" timestamp with time zone,\n\t\"court_id\" uuid,\n\t\"scheduled_at\" timestamp with time zone,\n\t\"updated_at\" timestamp with time zone DEFAULT now() NOT NULL\n);",
      "CREATE TABLE \"players\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"registration_id\" uuid NOT NULL,\n\t\"category_id\" uuid NOT NULL,\n\t\"position\" integer NOT NULL,\n\t\"full_name\" text NOT NULL,\n\t\"email\" text,\n\t\"phone\" text,\n\t\"dni\" text,\n\t\"active\" boolean DEFAULT true NOT NULL\n);",
      "CREATE TABLE \"rate_limits\" (\n\t\"key\" text PRIMARY KEY NOT NULL,\n\t\"window_start\" timestamp with time zone NOT NULL,\n\t\"count\" integer NOT NULL\n);",
      "CREATE TABLE \"registrations\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"tournament_id\" uuid NOT NULL,\n\t\"category_id\" uuid NOT NULL,\n\t\"status\" text NOT NULL,\n\t\"paid\" boolean DEFAULT false NOT NULL,\n\t\"seed\" integer,\n\t\"token_hash\" text,\n\t\"consent_at\" timestamp with time zone,\n\t\"consent_version\" text,\n\t\"notes\" text DEFAULT '' NOT NULL,\n\t\"source\" text DEFAULT 'public' NOT NULL,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"updated_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"cancelled_at\" timestamp with time zone\n);",
      "CREATE TABLE \"sessions\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"club_id\" uuid NOT NULL,\n\t\"expires_at\" timestamp with time zone NOT NULL,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL\n);",
      "CREATE TABLE \"tournaments\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"club_id\" uuid NOT NULL,\n\t\"slug\" text NOT NULL,\n\t\"name\" text NOT NULL,\n\t\"description\" text DEFAULT '' NOT NULL,\n\t\"start_date\" date NOT NULL,\n\t\"end_date\" date NOT NULL,\n\t\"venue\" text DEFAULT '' NOT NULL,\n\t\"address\" text DEFAULT '' NOT NULL,\n\t\"timezone\" text DEFAULT 'Europe/Madrid' NOT NULL,\n\t\"price_cents\" integer DEFAULT 0 NOT NULL,\n\t\"registration_deadline\" timestamp with time zone,\n\t\"rules\" text DEFAULT '' NOT NULL,\n\t\"image\" text,\n\t\"match_duration_min\" integer DEFAULT 90 NOT NULL,\n\t\"status\" text DEFAULT 'draft' NOT NULL,\n\t\"registration_open\" boolean DEFAULT true NOT NULL,\n\t\"contact_email\" text DEFAULT '' NOT NULL,\n\t\"contact_phone\" text DEFAULT '' NOT NULL,\n\t\"personal_data_purged_at\" timestamp with time zone,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"updated_at\" timestamp with time zone DEFAULT now() NOT NULL\n);",
      "ALTER TABLE \"categories\" ADD CONSTRAINT \"categories_tournament_id_tournaments_id_fk\" FOREIGN KEY (\"tournament_id\") REFERENCES \"public\".\"tournaments\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "ALTER TABLE \"courts\" ADD CONSTRAINT \"courts_tournament_id_tournaments_id_fk\" FOREIGN KEY (\"tournament_id\") REFERENCES \"public\".\"tournaments\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "ALTER TABLE \"matches\" ADD CONSTRAINT \"matches_tournament_id_tournaments_id_fk\" FOREIGN KEY (\"tournament_id\") REFERENCES \"public\".\"tournaments\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "ALTER TABLE \"matches\" ADD CONSTRAINT \"matches_category_id_categories_id_fk\" FOREIGN KEY (\"category_id\") REFERENCES \"public\".\"categories\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "ALTER TABLE \"matches\" ADD CONSTRAINT \"matches_court_id_courts_id_fk\" FOREIGN KEY (\"court_id\") REFERENCES \"public\".\"courts\"(\"id\") ON DELETE set null ON UPDATE no action;",
      "ALTER TABLE \"players\" ADD CONSTRAINT \"players_registration_id_registrations_id_fk\" FOREIGN KEY (\"registration_id\") REFERENCES \"public\".\"registrations\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "ALTER TABLE \"registrations\" ADD CONSTRAINT \"registrations_tournament_id_tournaments_id_fk\" FOREIGN KEY (\"tournament_id\") REFERENCES \"public\".\"tournaments\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "ALTER TABLE \"registrations\" ADD CONSTRAINT \"registrations_category_id_categories_id_fk\" FOREIGN KEY (\"category_id\") REFERENCES \"public\".\"categories\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "ALTER TABLE \"sessions\" ADD CONSTRAINT \"sessions_club_id_clubs_id_fk\" FOREIGN KEY (\"club_id\") REFERENCES \"public\".\"clubs\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "ALTER TABLE \"tournaments\" ADD CONSTRAINT \"tournaments_club_id_clubs_id_fk\" FOREIGN KEY (\"club_id\") REFERENCES \"public\".\"clubs\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "CREATE INDEX \"categories_tournament_idx\" ON \"categories\" USING btree (\"tournament_id\");",
      "CREATE UNIQUE INDEX \"clubs_email_key\" ON \"clubs\" USING btree (\"email\");",
      "CREATE INDEX \"courts_tournament_idx\" ON \"courts\" USING btree (\"tournament_id\");",
      "CREATE INDEX \"emails_created_idx\" ON \"emails\" USING btree (\"created_at\");",
      "CREATE UNIQUE INDEX \"matches_category_key\" ON \"matches\" USING btree (\"category_id\",\"key\");",
      "CREATE INDEX \"matches_tournament_idx\" ON \"matches\" USING btree (\"tournament_id\");",
      "CREATE INDEX \"players_registration_idx\" ON \"players\" USING btree (\"registration_id\");",
      "CREATE UNIQUE INDEX \"players_category_dni_active_key\" ON \"players\" USING btree (\"category_id\",\"dni\") WHERE \"players\".\"active\" = true;",
      "CREATE UNIQUE INDEX \"registrations_token_key\" ON \"registrations\" USING btree (\"token_hash\");",
      "CREATE INDEX \"registrations_category_idx\" ON \"registrations\" USING btree (\"category_id\",\"status\",\"created_at\");",
      "CREATE INDEX \"registrations_tournament_idx\" ON \"registrations\" USING btree (\"tournament_id\");",
      "CREATE INDEX \"sessions_club_idx\" ON \"sessions\" USING btree (\"club_id\");",
      "CREATE UNIQUE INDEX \"tournaments_slug_key\" ON \"tournaments\" USING btree (\"slug\");",
      "CREATE INDEX \"tournaments_club_idx\" ON \"tournaments\" USING btree (\"club_id\");"
    ]
  }
];
