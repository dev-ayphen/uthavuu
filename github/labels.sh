#!/usr/bin/env bash
#
# labels.sh — create the standard GitHub label taxonomy for a new project.
#
# Usage:
#   1. Install the GitHub CLI:  brew install gh && gh auth login
#   2. From the repo root, run:  bash github/labels.sh
#
# Idempotent: uses `--force` so re-running updates existing labels instead of erroring.
# Optionally target a specific repo by setting REPO, e.g.:
#   REPO=owner/name bash github/labels.sh

set -euo pipefail

REPO_FLAG=()
if [[ -n "${REPO:-}" ]]; then
  REPO_FLAG=(--repo "$REPO")
fi

create() {
  # $1 = name, $2 = color (hex, no #), $3 = description
  # ${arr[@]+"${arr[@]}"} avoids "unbound variable" on an empty array under
  # `set -u` in bash 3.2 (macOS's stock /bin/bash) — plain "${REPO_FLAG[@]}" fails there.
  gh label create "$1" --color "$2" --description "$3" --force "${REPO_FLAG[@]+"${REPO_FLAG[@]}"}"
}

# ── type: what kind of work ────────────────────────────────────────────────
create "type:bug"      "d73a4a" "Something is broken"
create "type:feature"  "0e8a16" "New feature or capability"
create "type:chore"    "fbca04" "Maintenance, refactor, tooling, deps"
create "type:docs"     "0075ca" "Documentation only"
create "type:question" "cc317c" "Needs discussion or clarification"

# ── area: which part of the system ─────────────────────────────────────────
create "area:api"    "1d76db" "NestJS backend / API"
create "area:web"    "5319e7" "Next.js main web app"
create "area:mobile" "b60205" "Expo React Native app"
create "area:admin"  "006b75" "Admin dashboard"
create "area:infra"  "5a5a5a" "Deployment, CI/CD, infrastructure"
create "area:docs"   "0075ca" "Documentation area"

# ── phase: roadmap phase ───────────────────────────────────────────────────
create "phase:1" "c2e0c6" "Phase 1"
create "phase:2" "bfdadc" "Phase 2"

# ── priority: urgency ──────────────────────────────────────────────────────
create "priority:P1" "b60205" "Critical — drop everything"
create "priority:P2" "d93f0b" "High — next up"
create "priority:P3" "fbca04" "Medium — normal queue"
create "priority:P4" "c5def5" "Low — nice to have"

echo "Labels created/updated."
