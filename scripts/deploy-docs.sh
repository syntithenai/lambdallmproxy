#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/deploy-docs.sh [options]

Commit the docs/ folder and push to GitHub.

Options:
  -m, --message <msg>   Commit message to append (optional)
  -r, --remote <name>   Git remote name (default: origin)
  -b, --branch <name>   Branch to push (default: current branch)
      --build           Run ./build-docs.sh before committing
      --skip-verify     Skip git hooks (adds --no-verify to commit)
  -h, --help            Show this help

Examples:
  scripts/deploy-docs.sh --build -m "Update docs"
  scripts/deploy-docs.sh -r origin -b agent -m "docs refresh"
USAGE
}

commit_msg_suffix=""
remote_name="origin"
branch_name=""
run_build="false"
no_verify="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--message)
      commit_msg_suffix="$2"
      shift 2
      ;;
    -r|--remote)
      remote_name="$2"
      shift 2
      ;;
    -b|--branch)
      branch_name="$2"
      shift 2
      ;;
    --build)
      run_build="true"
      shift 1
      ;;
    --skip-verify)
      no_verify="true"
      shift 1
      ;;
    -h|--help)
      usage; exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage; exit 2
      ;;
  esac
done

# Ensure we're in a git repo
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "❌ Not inside a git repository" >&2
  exit 1
fi

# Determine branch
if [[ -z "$branch_name" ]]; then
  branch_name=$(git rev-parse --abbrev-ref HEAD)
  if [[ "$branch_name" == "HEAD" ]]; then
    echo "❌ Detached HEAD. Please specify a branch via --branch" >&2
    exit 1
  fi
fi

# Check remote exists
if ! git remote get-url "$remote_name" >/dev/null 2>&1; then
  echo "❌ Remote '$remote_name' not found. Use --remote to specify a valid remote." >&2
  echo "Available remotes:" >&2
  git remote -v >&2 || true
  exit 1
fi

# Optionally build docs
if [[ "$run_build" == "true" ]]; then
  if [[ -x ./build-docs.sh ]]; then
    echo "📚 Building docs..."
    ./build-docs.sh
  else
    echo "⚠️  ./build-docs.sh not found or not executable; skipping build" >&2
  fi
fi

# Stage docs folder
echo "➕ Staging docs/ changes..."
git add -A docs/

# If nothing staged, exit gracefully
if git diff --cached --quiet -- docs/; then
  echo "ℹ️  No changes in docs/ to commit. Nothing to do."
  exit 0
fi

# Commit
timestamp=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
base_msg="docs: update built site ($timestamp)"
if [[ -n "$commit_msg_suffix" ]]; then
  commit_msg="$base_msg - $commit_msg_suffix"
else
  commit_msg="$base_msg"
fi

echo "💬 Committing: $commit_msg"
commit_flags=()
if [[ "$no_verify" == "true" ]]; then
  commit_flags+=("--no-verify")
fi
git commit -m "$commit_msg" "${commit_flags[@]}"

# Push
echo "⏫ Pushing to $remote_name $branch_name..."
git push "$remote_name" "$branch_name"

echo "✅ Docs deployed successfully."