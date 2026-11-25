#!/usr/bin/env bash
set -euo pipefail

dir="$1"
result() { jq -r --arg job "$1" '.[$job].result // "Unavailable"' <<< "$RESULTS"; }
load() {
  if [[ -f "$dir/$1" ]]; then jq -r "$2" "$dir/$1"; else printf 'Unavailable'; fi
}
table() { printf '| %s | %s |\n' "$1" "$2"; }

{
  printf '## Release \`%s\`\n\n| Field | Result |\n|---|---|\n' "$GITHUB_SHA"
  table CI "$(result ci)"
  table 'Code Coverage' "$(load vitest-coverage/coverage-summary.json '.total | "Lines \(.lines.pct)%, statements \(.statements.pct)%, functions \(.functions.pct)%, branches \(.branches.pct)%"')"
  table 'Code Security' "$(result codeql)"
  table 'Container security job' "$(result scan)"
  for app in api web; do
    table "Trivy $app" "$(load "scan-$app/scan-result.json" '"\(.blocking) blocking; \(.unfixed) without a fix"')"
    table "Cloud Build $app" "$(load "image-$app/image.json" .build)"
    table "Image $app" "$(load "image-$app/image.json" .image)"
    table "Candidate revision $app" "$(load candidates/candidates.json ".$app.revision")"
  done
  table 'Production migrations' "$(result migrate) ($(jq -r '.migrate.outputs.applied // "unavailable"' <<< "$RESULTS") applied)"
  table 'Candidate health checks' "$(result candidate_health)"
  case "$(result promote)" in
    success) table Deployment Success; table 'Production health checks' Success ;;
    failure|cancelled) table Deployment Failed; table 'Production health checks' 'Failed or interrupted' ;;
    *) table Deployment Failed; table 'Production health checks' 'Not reached' ;;
  esac
  rollback=Not\ required
  if [[ -f "$dir/recovery-state/rollback-result.txt" ]]; then
    rollback="$(cat "$dir/recovery-state/rollback-result.txt")"
  elif [[ "$(result candidate_health)" == success && "$(result promote)" =~ ^(failure|cancelled)$ ]]; then
    rollback=Failed
    if [[ -f "$dir/promotion-state/rollback-result.txt" ]]; then
      rollback="$(cat "$dir/promotion-state/rollback-result.txt")"
      if [[ "$rollback" == 'Not required' ]]; then rollback='Failed'; fi
    fi
  fi
  table Rollback "$rollback"
  if [[ -f observed-traffic.json ]]; then
    observed=observed-traffic.json
  elif [[ -f "$dir/recovery-state/final-traffic.json" ]]; then
    observed="$dir/recovery-state/final-traffic.json"
  elif [[ -f "$dir/promotion-state/final-traffic.json" ]]; then
    observed="$dir/promotion-state/final-traffic.json"
  elif [[ -f "$dir/previous-traffic/previous.json" && "$(result promote)" == skipped ]]; then
    observed="$dir/previous-traffic/previous.json"
  else
    observed=
  fi
  for app in api web; do
    if [[ -n "$observed" ]]; then
      current="$(jq -r --arg app "$app" '.[$app] | map(select(.percent > 0) | "\(.revision) \(.percent)%") | join(", ")' "$observed")"
    else
      current='Unavailable (no traffic observation in this run)'
    fi
    table "Final traffic $app" "$current"
  done
  table 'API URL' "$API_ORIGIN"
  table 'Web URL' "$WEB_ORIGIN"
} | tee -a "$GITHUB_STEP_SUMMARY"
