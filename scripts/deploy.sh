#!/bin/sh
set -eu

# cPanel's Git executable may not be on cron's default PATH.
PATH="/usr/local/cpanel/3rdparty/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"
export PATH
export GIT_TERMINAL_PROMPT=0

main() {
  mode=${1:-local}
  case "$mode" in
    local|--pull) ;;
    *) echo "Usage: deploy.sh [--pull]" >&2; exit 1 ;;
  esac

  repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
  cd "$repo"
  destination=${DEPLOYPATH:-/home/bbbgv5z3ysnm/public_html}
  if [ ! -d "$destination" ]; then
    echo "Deployment directory does not exist: $destination" >&2
    exit 1
  fi
  destination=$(CDPATH= cd -- "$destination" && pwd -P)
  if [ "$destination" = "$repo" ]; then
    echo "The deployment directory must be separate from the repository." >&2
    exit 1
  fi

  git_dir=$(git rev-parse --absolute-git-dir)
  marker="$git_dir/coolzone-last-deployed"
  # Both cron and manual cPanel deployments use the same lock.
  command -v flock >/dev/null 2>&1 || {
    echo "The server needs flock to prevent overlapping deployments." >&2
    exit 1
  }
  exec 9>"$git_dir/coolzone-deploy.lock"
  flock -n 9 || exit 0

  if [ "$(git branch --show-current)" != main ]; then
    echo "Deployment requires the main branch to be checked out." >&2
    exit 1
  fi
  if [ -n "$(git status --porcelain)" ]; then
    echo "Repository has uncommitted changes; deployment stopped." >&2
    exit 1
  fi

  if [ "$mode" = --pull ]; then
    # Refuse divergent history and never overwrite local edits or commits.
    git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=30 fetch --quiet origin main
    git merge --ff-only --quiet FETCH_HEAD
    if [ "$(git rev-parse HEAD)" != "$(git rev-parse FETCH_HEAD)" ]; then
      echo "The server branch differs from GitHub main; deployment stopped." >&2
      exit 1
    fi
  fi

  commit=$(git rev-parse HEAD)
  if [ "$mode" = --pull ] && [ -f "$marker" ] && [ "$(cat "$marker")" = "$commit" ] && [ -f "$destination/index.html" ] && [ -f "$destination/gallery.html" ] && [ -f "$destination/brochure.html" ]; then
    exit 0
  fi
  test -f index.html
  test -f gallery.html
  test -f brochure.html
  test -d assets

  # Publish assets first and replace the entry page only after they are copied.
  # Other hosting files (including .htaccess) are left in place.
  cp -R assets "$destination/"
  for page in brochure.html gallery.html index.html; do
    temporary_page=$(mktemp "$destination/.coolzone-page.XXXXXX")
    trap 'rm -f -- "$temporary_page"' EXIT HUP INT TERM
    cp "$page" "$temporary_page"
    chmod 644 "$temporary_page"
    mv -fT "$temporary_page" "$destination/$page"
    trap - EXIT HUP INT TERM
  done

  # A failed deployment never advances this marker and will be retried.
  printf '%s\n' "$commit" > "$marker"
  printf 'Deployed %s to %s\n' "$commit" "$destination"
}

# Read the function before pulling: the pull may update this script itself.
main "$@"
