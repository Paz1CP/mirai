#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/cloud-run.sh"

case "${1:-}" in
  capture)
    jq -n --arg commit "$GITHUB_SHA" --arg run "$GITHUB_RUN_ID" \
      --arg tag "r-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" \
      --arg schema "$SCHEMA" --arg api "$API_IMAGE" --arg web "$WEB_IMAGE" \
      --arg apiBuild "$API_BUILD" --arg webBuild "$WEB_BUILD" \
      --arg apiConfig "$(describe api | runtime_fingerprint)" \
      --arg webConfig "$(describe web | runtime_fingerprint)" \
      --argjson traffic "$(snapshot)" \
      '$traffic + {commit:$commit,run:$run,tag:$tag,schema:$schema,
        images:{api:$api,web:$web},builds:{api:$apiBuild,web:$web},
        configuration:{api:$apiConfig,web:$web}}' > previous.json
    assert_configured_api service
    ;;
  stage)
    prior="$2"
    tag="$(jq -er '.tag' "$prior")"
    suffix="${tag#r-}"
    stage_cleanup() {
      local status=$?
      trap - EXIT
      if (( status != 0 )); then
        for app in api web; do remove_release_tag "$app" "$tag" || true; done
      fi
      exit "$status"
    }
    trap stage_cleanup EXIT
    for app in api web; do
      svc="$(service "$app")"
      image="$(jq -er --arg app "$app" '.images[$app]' "$prior")"
      [[ "$image" == "$REGISTRY/mirai-$app@"* && "${image##*@}" =~ ^sha256:[0-9a-f]{64}$ ]]
      revision="$svc-$suffix"
      run services update "$svc" --image="$image" --revision-suffix="$suffix" \
        --no-traffic --tag="$tag" --format=none
      ready_revision "$app" "$revision" "$image"
      [[ "$(traffic "$app" | allocation)" == "$(jq -c --arg app "$app" '.[$app]' "$prior" | allocation)" ]]
      [[ "$(describe "$app" | runtime_fingerprint)" == "$(jq -er --arg app "$app" '.configuration[$app]' "$prior")" ]]
      candidate_url="$(describe "$app" | jq -er --arg tag "$tag" --arg revision "$revision" \
        '.status.traffic[] | select(.tag == $tag and .revisionName == $revision and (.percent // 0) == 0) | .url')"
      jq -n --arg revision "$revision" --arg image "$image" --arg url "$candidate_url" \
        '{revision:$revision,image:$image,url:$url}' > "$app.json"
    done
    assert_configured_api revision "$(jq -er '.revision' web.json)"
    jq -n --slurpfile prior "$prior" --slurpfile api api.json --slurpfile web web.json \
      '$prior[0] | {commit,run,tag,schema,builds,api:$api[0],web:$web[0]}' > candidates.json
    ;;
  check)
    candidates="$2"
    for app in api web; do
      revision="$(jq -er --arg app "$app" '.[$app].revision' "$candidates")"
      image="$(jq -er --arg app "$app" '.[$app].image' "$candidates")"
      url="$(jq -er --arg app "$app" '.[$app].url' "$candidates")"
      ready_revision "$app" "$revision" "$image"
      health "$app" "$url"
    done
    ;;
  discard)
    tag="$(jq -er '.tag' "$2")"
    for app in api web; do remove_release_tag "$app" "$tag"; done
    ;;
  promote)
    prior="$2" candidates="$3"
    tag="$(jq -er '.tag' "$candidates")"
    for app in api web; do
      [[ "$(traffic "$app" | allocation)" == "$(jq -c --arg app "$app" '.[$app]' "$prior" | allocation)" ]]
    done
    recover() {
      local status=$?
      trap - EXIT
      if (( status != 0 )); then bash ops/rollback.sh restore "$prior" "$tag" || true; fi
      exit "$status"
    }
    trap recover EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    for app in api web; do
      revision="$(jq -er --arg app "$app" '.[$app].revision' "$candidates")"
      set_allocation "$app" "$(target_allocation "$revision")"
    done
    production_health
    for app in api web; do remove_release_tag "$app" "$tag"; done
    assert_preserved_tags "$prior"
    snapshot > final-traffic.json
    for app in api web; do
      revision="$(jq -er --arg app "$app" '.[$app].revision' "$candidates")"
      [[ "$(jq -c --arg app "$app" '.[$app]' final-traffic.json | allocation)" == "$(target_allocation "$revision")" ]]
    done
    jq 'del(.tag, .api.url, .web.url)' "$candidates" > release.json
    printf 'Not required\n' > rollback-result.txt
    ;;
  *) echo 'Expected capture, stage, check, discard, or promote' >&2; exit 2 ;;
esac
