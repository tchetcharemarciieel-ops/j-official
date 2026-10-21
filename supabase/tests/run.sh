#!/usr/bin/env bash
# Teste la migration et la RLS sur un PostgreSQL local jetable.
# Usage : PGHOST=... PGPORT=... PGUSER=postgres ./supabase/tests/run.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
DB="minisoft_test_$$"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$DIR/stub-supabase.sql"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$DIR/../migrations/0001_init.sql"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$DIR/rls.sql"
