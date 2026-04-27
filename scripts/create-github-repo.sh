#!/usr/bin/env bash
# Creates a public GitHub repo from this folder and pushes main.
# Prerequisite (once per machine): gh auth login
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v gh >/dev/null 2>&1; then
  echo "Install GitHub CLI: brew install gh"
  exit 1
fi

if ! gh auth status &>/dev/null; then
  echo "Not logged in to GitHub. Run this in your terminal once:"
  echo "  gh auth login"
  exit 1
fi

REPO_NAME="${1:-notevault}"

if gh repo view "$REPO_NAME" &>/dev/null 2>&1; then
  echo "Repo $REPO_NAME already exists on GitHub."
  git remote remove origin 2>/dev/null || true
  git remote add origin "https://github.com/$(gh api user -q .login)/${REPO_NAME}.git"
  git push -u origin main
  echo "Pushed to https://github.com/$(gh api user -q .login)/${REPO_NAME}"
  exit 0
fi

echo "Creating public repo: $REPO_NAME"
gh repo create "$REPO_NAME" --public --source=. --remote=origin --push
LOGIN="$(gh api user -q .login)"
echo "Done: https://github.com/${LOGIN}/${REPO_NAME}"
