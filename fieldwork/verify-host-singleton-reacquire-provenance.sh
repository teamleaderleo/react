#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

patch_file="fieldwork/host-singleton-reacquire-provenance.patch"

git apply --check "$patch_file"
git apply "$patch_file"

yarn test ReactDOMSingletonComponents-test
yarn linc
