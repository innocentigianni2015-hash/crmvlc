#!/usr/bin/env bash
set -euo pipefail

# Cloudflare Workers Builds ignores wrangler.jsonc custom build commands.
# Run remote migrations from npm's postbuild hook only inside Workers Builds,
# so local builds and tests never mutate the production database.
if [[ "${WORKERS_CI:-}" != "1" ]]; then
  echo "Skipping remote D1 migrations outside Cloudflare Workers Builds."
  exit 0
fi

echo "Applying pending D1 migrations before deployment..."
npx wrangler d1 migrations apply DB --remote
