#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/cloud-run.sh"

restore() {
  local prior="$1" tag="${2:-}" failed=0 target
  for app in api web; do
    target="$(jq -ec --arg app "$app" '.[$app]' "$prior" | allocation)" || return 1
    set_allocation "$app" "$target" || failed=1
  done
  if (( failed == 0 )) && [[ -n "$tag" ]]; then
    for app in api web; do remove_release_tag "$app" "$tag" || failed=1; done
  fi
  assert_preserved_tags "$prior" || failed=1
  production_health || failed=1
  snapshot > final-traffic.json || failed=1
  return "$failed"
}

case "${1:-}" in
  restore)
    if restore "$2" "${3:-}"; then
      printf 'Success\n' > rollback-result.txt
    else
      printf 'Failed\n' > rollback-result.txt
      exit 1
    fi
    ;;
  manual)
    receipt="$2" schema="$3" prior="$4"
    schema_compatible "$(jq -er '.schema' "$receipt")" "$schema"
    for app in api web; do
      revision="$(jq -er --arg app "$app" '.[$app].revision' "$receipt")"
      image="$(jq -er --arg app "$app" '.[$app].image' "$receipt")"
      ready_revision "$app" "$revision" "$image"
      if [[ "$app" == web ]]; then assert_configured_api revision "$revision"; fi
    done
    production_health
    recover() {
      local status=$?
      trap - EXIT
      if ((status != 0)); then bash ops/rollback.sh restore "$prior" || true; fi
      exit "$status"
    }
    trap recover EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    for app in api web; do
      revision="$(jq -er --arg app "$app" '.[$app].revision' "$receipt")"
      set_allocation "$app" "$(target_allocation "$revision")"
    done
    production_health
    assert_preserved_tags "$prior"
    snapshot > final-traffic.json
    printf 'Not required\n' > rollback-result.txt
    ;;
  *) echo 'Expected restore or manual' >&2; exit 2 ;;
esac
