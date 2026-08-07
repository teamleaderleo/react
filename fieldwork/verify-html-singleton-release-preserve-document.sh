#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

patch_file="fieldwork/html-singleton-release-preserve-document.patch"

git apply --check "$patch_file"
git apply "$patch_file"

yarn test --dev ReactDOMSingletonComponents-test
yarn test --prod ReactDOMSingletonComponents-test
yarn linc
