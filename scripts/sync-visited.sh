#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
git add public/data/visited.json
git commit -m "Update visited.json"
git push
