#!/usr/bin/env bash
set -euo pipefail

run() { gcloud run "$@" --project="$PROJECT" --region="$REGION" --quiet; }
service() {
  case "$1" in
    api) printf '%s\n' "$API_SERVICE" ;;
    web) printf '%s\n' "$WEB_SERVICE" ;;
    *) return 1 ;;
  esac
}
origin() {
  case "$1" in
    api) printf '%s\n' "$API_ORIGIN" ;;
    web) printf '%s\n' "$WEB_ORIGIN" ;;
    *) return 1 ;;
  esac
}
describe() { run services describe "$(service "$1")" --format=json; }
traffic() {
  describe "$1" | jq -ce '
    [.status.traffic[] | {revision: .revisionName, percent: (.percent // 0), tag: (.tag // "")}]
    | sort_by(.revision, .tag, .percent)
    | select((map(.percent) | add) == 100 and all(.[]; .revision != null))'
}
allocation() {
  jq -ce '[.[] | select(.percent > 0)] | group_by(.revision)
    | map({revision: .[0].revision, percent: (map(.percent) | add)}) | sort_by(.revision)'
}
tag_assignments() {
  jq -ce '[.[] | select(.tag != "") | {tag, revision}] | sort_by(.tag)'
}
runtime_fingerprint() {
  jq -cS '.spec.template.spec | del(.containers[].image)' | sha256sum | cut -d ' ' -f 1
}
snapshot() {
  local api web
  api="$(traffic api)" || return 1
  web="$(traffic web)" || return 1
  jq -n --argjson api "$api" --argjson web "$web" '{api:$api,web:$web}'
}
ready_revision() {
  local app="$1" revision="$2" image="$3" metadata
  [[ "$revision" == "$(service "$app")-"* ]] || return 1
  metadata="$(run revisions describe "$revision" --format=json)" || return 1
  jq -e --arg svc "$(service "$app")" --arg image "$image" '
    .metadata.labels["serving.knative.dev/service"] == $svc
    and any(.status.conditions[]; .type == "Ready" and .status == "True")
    and .status.imageDigest == $image' <<< "$metadata" >/dev/null
}
health() {
  local app="$1" url="$2" file status
  [[ "$url" == https://* ]] || return 1
  file="$(mktemp)"
  for _ in {1..10}; do
    status="$(curl --silent --show-error --connect-timeout 8 --max-time 20 \
      --output "$file" --write-out '%{http_code}' "${url%/}/health")" || status=0
    if [[ "$status" == 200 ]]; then
      if [[ "$app" == api ]] && jq -e '.status == "ok"' "$file" >/dev/null; then
        rm -f "$file"; printf 'API health passed (%s)\n' "$url"; return
      fi
      if [[ "$app" == web ]] && sed -E 's/<[^>]*>//g' "$file" | grep -E 'API:[[:space:]]*connected' >/dev/null; then
        rm -f "$file"; printf 'Web → API health passed (%s)\n' "$url"; return
      fi
    fi
    sleep 5
  done
  rm -f "$file"
  printf 'Health check failed: %s (%s)\n' "$app" "$url" >&2
  return 1
}
production_health() { health api "$API_ORIGIN" && health web "$WEB_ORIGIN"; }
assert_configured_api() {
  local kind="$1" revision="${2:-}"
  if [[ "$kind" == revision ]]; then
    run revisions describe "$revision" --format=json | jq -e --arg origin "$API_ORIGIN" '
      any(.spec.containers[].env[]; .name == "API_URL" and (.value | rtrimstr("/")) == $origin)' >/dev/null
  else
    describe web | jq -e --arg origin "$API_ORIGIN" '
      any(.spec.template.spec.containers[].env[]; .name == "API_URL" and (.value | rtrimstr("/")) == $origin)' >/dev/null
  fi
}
set_allocation() {
  local app="$1" target="$2" current assignments
  current="$(traffic "$app" | allocation)" || return 1
  if [[ "$current" != "$target" ]]; then
    assignments="$(jq -er 'map(.revision + "=" + (.percent | tostring)) | join(",")' <<< "$target")" || return 1
    run services update-traffic "$(service "$app")" --to-revisions="$assignments" --format=none || return 1
  fi
  [[ "$(traffic "$app" | allocation)" == "$target" ]]
}
target_allocation() { jq -cn --arg revision "$1" '[{revision:$revision,percent:100}]'; }
remove_release_tag() {
  local app="$1" tag="$2" live
  [[ "$tag" =~ ^r-[0-9]+-[0-9]+$ ]] || return 1
  live="$(traffic "$app")" || return 1
  if jq -e --arg tag "$tag" 'any(.[]; .tag == $tag)' <<< "$live" >/dev/null; then
    run services update-traffic "$(service "$app")" --remove-tags="$tag" --format=none || return 1
  fi
}
assert_preserved_tags() {
  local prior="$1"
  for app in api web; do
    [[ "$(traffic "$app" | tag_assignments)" == "$(jq -c --arg app "$app" '.[$app]' "$prior" | tag_assignments)" ]] || return 1
  done
}
schema_compatible() {
  local reviewed="$1" current="$2"
  jq -e --arg reviewed "$reviewed" --arg current "$current" '
    if $reviewed == $current then true
    else . as $policy | reduce range(0; (.compatibleMigrations | length)) as $_
      ([$reviewed]; . as $seen | ($seen + [$policy.compatibleMigrations[]
        | select(.from as $from | $seen | index($from)) | .to]) | unique)
      | index($current) != null
    end' ops/release-policy.json >/dev/null
}
