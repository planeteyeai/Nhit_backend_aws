#!/bin/sh
# Pull real GLB binaries (Railway Docker often has no .git in build context).
set -e

MODEL_DIR="upload/model_3d"
REPO="${GIT_REPO_URL:-https://github.com/vishalbhor-45/nhit-backend.git}"
BRANCH="${GIT_BRANCH:-main}"

mkdir -p "$MODEL_DIR"

pull_in_dir() {
  git lfs install
  git lfs pull --include="upload/model_3d/*.glb"
}

if [ -d .git ]; then
  echo "[glb] Using .git — git lfs pull"
  pull_in_dir
else
  echo "[glb] No .git in build context — cloning ${REPO} (${BRANCH}) with LFS"
  rm -rf /tmp/bms-glb-clone
  git clone --depth 1 --branch "$BRANCH" "$REPO" /tmp/bms-glb-clone
  (cd /tmp/bms-glb-clone && pull_in_dir)
  cp -a /tmp/bms-glb-clone/upload/model_3d/. "$MODEL_DIR/"
  rm -rf /tmp/bms-glb-clone
fi

echo "[glb] Files in $MODEL_DIR:"
ls -la "$MODEL_DIR" || true
