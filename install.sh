#!/usr/bin/env sh
set -eu

release_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$release_directory/scripts/selfhost/install.mjs" "$@"
