#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

patch_file="fieldwork/host-singleton-content-reset-head.patch"

git apply --check "$patch_file"
git apply "$patch_file"

yarn test --dev ReactDOMSingletonComponents-test
yarn test --prod ReactDOMSingletonComponents-test
