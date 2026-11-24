#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Read `pg_restore --list` on stdin. Write SQL that drops public relations and
# foreign keys the archive does not contain. pg_restore --clean only drops
# objects in the archive, so a foreign key added by a newer portal (pages,
# navigation_settings) blocks DROP CONSTRAINT on user_pkey.
set -eu
cat <<'SQL'
CREATE TEMP TABLE archive_objects (
  kind text NOT NULL,
  table_name text,
  name text NOT NULL
);
SQL
awk '
function sql_quote(value, out) {
  out = value
  gsub(/\047/, "\047\047", out)
  return "\047" out "\047"
}
function add(kind, table, name) {
  count++
  kinds[count] = kind
  tables[count] = table
  names[count] = name
}
/^[0-9]+;/ {
  line = $0
  sub(/^[0-9]+; [0-9]+ [0-9]+ /, "", line)
  n = split(line, f, " ")
  if (n < 3) next
  if (line ~ /^TABLE DATA /) next
  if (line ~ /^SEQUENCE SET / || line ~ /^SEQUENCE OWNED BY /) next
  if (line ~ /^TABLE / && f[2] == "public") add("table", "", f[3])
  else if (line ~ /^VIEW / && f[2] == "public") add("view", "", f[3])
  else if (line ~ /^MATERIALIZED VIEW / && f[3] == "public") add("view", "", f[4])
  else if (line ~ /^SEQUENCE / && f[2] == "public") add("sequence", "", f[3])
  else if (line ~ /^FK CONSTRAINT / && f[3] == "public" && n >= 5) add("fk", f[4], f[5])
}
END {
  if (count == 0) {
    print "INSERT INTO archive_objects (kind, table_name, name) SELECT \047table\047, NULL, \047unused\047 WHERE false;"
  } else {
    print "INSERT INTO archive_objects (kind, table_name, name) VALUES"
    for (i = 1; i <= count; i++) {
      table_sql = (tables[i] == "" ? "NULL" : sql_quote(tables[i]))
      comma = (i < count ? "," : ";")
      printf "  (%s, %s, %s)%s\n", sql_quote(kinds[i]), table_sql, sql_quote(names[i]), comma
    }
  }
}
'
cat <<'SQL'
DO $$
DECLARE r record;
BEGIN
  -- Newer foreign keys are not in an older archive. Drop them before
  -- pg_restore tries to drop the primary key they reference.
  FOR r IN
    SELECT c.relname AS table_name, con.conname
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.contype = 'f'
      AND n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM archive_objects a
        WHERE a.kind = 'fk'
          AND a.name = con.conname
          AND a.table_name = c.relname
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
      r.table_name,
      r.conname
    );
  END LOOP;

  -- Drop relations the archive will not recreate, so a rolled-back database
  -- matches the backup and the next upgrade can create them again.
  FOR r IN
    SELECT c.relkind::text AS relkind, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('v', 'm', 'r', 'p', 'S')
      AND NOT EXISTS (
        SELECT 1 FROM archive_objects a
        WHERE a.name = c.relname
          AND a.kind = CASE
            WHEN c.relkind IN ('v', 'm') THEN 'view'
            WHEN c.relkind = 'S' THEN 'sequence'
            ELSE 'table'
          END
      )
    ORDER BY CASE c.relkind WHEN 'v' THEN 0 WHEN 'm' THEN 1 WHEN 'r' THEN 2 WHEN 'p' THEN 3 ELSE 4 END
  LOOP
    EXECUTE format(
      'DROP %s IF EXISTS public.%I CASCADE',
      CASE r.relkind
        WHEN 'v' THEN 'VIEW'
        WHEN 'm' THEN 'MATERIALIZED VIEW'
        WHEN 'S' THEN 'SEQUENCE'
        ELSE 'TABLE'
      END,
      r.relname
    );
  END LOOP;
END $$;
SQL
