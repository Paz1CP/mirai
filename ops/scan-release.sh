#!/usr/bin/env bash
set -euo pipefail

image="$1"
[[ "$image" =~ @sha256:[0-9a-f]{64}$ ]]
version=0.76.2
bundle="$RUNNER_TEMP/trivy.tar.gz"
curl --fail --silent --show-error --location --retry 3 --max-time 120 \
  "https://github.com/aquasecurity/trivy/releases/download/v$version/trivy_${version}_Linux-64bit.tar.gz" -o "$bundle"
echo "bc0fc726e017b8927a62b2d3531d7a84ee01769daf5c99ed866dced54089fdbf  $bundle" | sha256sum --check
tar -xzf "$bundle" -C "$RUNNER_TEMP" trivy
gcloud auth configure-docker "${image%%/*}" --quiet
"$RUNNER_TEMP/trivy" image --image-src remote --scanners vuln --pkg-types os,library \
  --quiet --timeout 10m --format json --output trivy.json "$image"
"$RUNNER_TEMP/trivy" convert --format sarif --output trivy.sarif trivy.json

counts="$(jq -ce '
  [.Results[]?.Vulnerabilities[]?] as $all
  | {total:($all|length), unfixed:([$all[] | select((.FixedVersion // "") == "")]|length),
     blocking:([$all[] | select((.Severity == "HIGH" or .Severity == "CRITICAL")
        and (.FixedVersion // "") != "")]|length)}' trivy.json)"
jq -en --arg image "$image" --argjson counts "$counts" '$counts + {image:$image}' > scan-result.json
{
  printf '### Trivy: \`%s\`\n\n' "$image"
  jq -r '"Total: \(.total); without a fix: \(.unfixed); high/critical with a fix: \(.blocking)"' scan-result.json
  jq -r '.Results[]? | . as $result | .Vulnerabilities[]?
    | select(.Severity == "HIGH" or .Severity == "CRITICAL")
    | "- \(.Severity) \(.VulnerabilityID) — \(.PkgName) \(.InstalledVersion), fix: \(.FixedVersion // "none" | if . == "" then "none" else . end) [\($result.Type)]"' trivy.json
} >> "$GITHUB_STEP_SUMMARY"
