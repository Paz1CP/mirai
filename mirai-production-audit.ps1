# Mirai - read-only production inventory. Windows PowerShell 5.1 / PowerShell 7.
# No deploy, migration, secret access, account switch, API enablement, or cloud writes.
# The only file written is the local sanitized JSON report.
[CmdletBinding()]
param(
    [string]$Project = 'mirai-514723',
    [string]$Region = 'us-east4',
    [string]$ReportPath = (Join-Path (Get-Location) 'mirai-production-audit.json')
)
$ErrorActionPreference = 'Stop'
$env:CLOUDSDK_CORE_DISABLE_PROMPTS = '1'
$env:CLOUDSDK_COMPONENT_MANAGER_DISABLE_UPDATE_CHECK = '1'
$gcloud = Get-Command gcloud -ErrorAction Stop
$errors = New-Object 'System.Collections.Generic.List[object]'
function Read-Gcloud {
    param([string]$Label, [string[]]$Arguments)
    Write-Host "Reading $Label ..."
    try {
        # Capture stdout, do not echo raw CLI errors or service configuration.
        $raw = & $gcloud.Source @Arguments '--quiet' '--format=json' 2>$null
        if ($LASTEXITCODE -ne 0) { throw 'CLI returned nonzero exit status' }
        if (-not $raw) { return $null }
        return (($raw -join "`n") | ConvertFrom-Json)
    } catch {
        $errors.Add([ordered]@{ check = $Label; result = 'unavailable'; reason = 'Permission, API, CLI support, or resource not found; inspect locally if needed.' })
        return $null
    }
}
function Safe-Origin([string]$Value) {
    try { $u = [uri]$Value; if ($u.IsAbsoluteUri -and $u.Scheme -in @('http','https')) { return $u.GetLeftPart([System.UriPartial]::Authority) } } catch {}
    return '[redacted or invalid URL]'
}
function Safe-Env($Variables) {
    $publicKeys = @('WEB_ORIGIN','API_URL','NEXT_PUBLIC_API_ORIGIN','NEON_AUTH_BASE_URL','AWS_ENDPOINT_URL_S3')
    $enumKeys = @('NODE_ENV','PORT','GOOGLE_CLOUD_PROJECT','GOOGLE_CLOUD_LOCATION','GOOGLE_ADK_AGENT_ENGINE','GOOGLE_ADK_SESSION_TTL','GOOGLE_ADK_MODEL','GOOGLE_GENAI_MODEL','GOOGLE_GENAI_FALLBACK_MODEL','AWS_REGION','NEON_STORAGE_BUCKET','BILLING_ENVIRONMENT')
    foreach ($e in @($Variables)) {
        if (-not $e -or -not $e.name) { continue }
        $ref = $e.valueFrom.secretKeyRef
        if (-not $ref) { $ref = $e.valueSource.secretKeyRef }
        $entry = [ordered]@{ name = $e.name; source = $(if ($ref) { 'secret_manager' } elseif ($null -ne $e.value) { 'literal' } else { 'other' }); configured = [bool]($ref -or $e.value) }
        if (-not $ref -and $e.value) {
            if ($e.name -in $publicKeys) { $entry['value'] = Safe-Origin $e.value }
            elseif ($e.name -in $enumKeys -and $e.value -match '^[A-Za-z0-9._/-]{1,200}$') { $entry['value'] = $e.value }
            elseif ($e.name -in @('DATABASE_URL','DATABASE_URL_UNPOOLED','DATABASE_URL_DIRECT')) {
                # Do not print database host, password, user, URI, or query parameters.
                try { $u = [uri]$e.value; $entry['poolerHostname'] = ($u.Host -match '-pooler\.') } catch {}
            }
        }
        [pscustomobject]$entry
    }
}
function Safe-Service($s) {
    if (-not $s) { return $null }
    $t = $s.spec.template
    $a = $t.metadata.annotations
    $containers = @($t.spec.containers | ForEach-Object {
        [ordered]@{ image = $_.image; resources = $_.resources; ports = @($_.ports | ForEach-Object { [ordered]@{ name=$_.name; containerPort=$_.containerPort } }); env = @(Safe-Env $_.env); startupProbe = [bool]$_.startupProbe; livenessProbe = [bool]$_.livenessProbe }
    })
    [ordered]@{
        name = $s.metadata.name
        url = $s.status.url
        ingress = $s.metadata.annotations.'run.googleapis.com/ingress'
        invokerIamDisabled = $s.metadata.annotations.'run.googleapis.com/invoker-iam-disabled'
        defaultUrlDisabled = $s.metadata.annotations.'run.googleapis.com/default-url-disabled'
        serviceAccount = $t.spec.serviceAccountName
        timeoutSeconds = $t.spec.timeoutSeconds
        concurrency = $t.spec.containerConcurrency
        minScale = $a.'autoscaling.knative.dev/minScale'
        maxScale = $a.'autoscaling.knative.dev/maxScale'
        serviceMinScale = $s.metadata.annotations.'run.googleapis.com/minScale'
        serviceMaxScale = $s.metadata.annotations.'run.googleapis.com/maxScale'
        cpuThrottling = $a.'run.googleapis.com/cpu-throttling'
        executionEnvironment = $a.'run.googleapis.com/execution-environment'
        sessionAffinity = $a.'run.googleapis.com/sessionAffinity'
        latestCreated = $s.status.latestCreatedRevisionName
        latestReady = $s.status.latestReadyRevisionName
        traffic = @($s.status.traffic | ForEach-Object { [ordered]@{ revision=$_.revisionName; percent=$_.percent; tag=$_.tag; latestRevision=$_.latestRevision } })
        conditions = @($s.status.conditions | ForEach-Object { [ordered]@{ type=$_.type; status=$_.status; reason=$_.reason } })
        containers = $containers
    }
}
function Read-HttpStatus([string]$Url) {
    if (-not $Url) { return $null }
    try {
        $r = Invoke-WebRequest -Uri $Url -Method Get -UseBasicParsing -TimeoutSec 20 -MaximumRedirection 0
        return [ordered]@{ url=$Url; status=[int]$r.StatusCode; apiHealthOk=($r.Content -match '"status"\s*:\s*"ok"'); webApiConnected=($r.Content -match 'API: (?:<!-- -->)?connected') }
    } catch {
        $status = $null
        try { if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode } } catch {}
        return [ordered]@{ url=$Url; status=$status; result='not_confirmed' }
    }
}
$p = Read-Gcloud 'project' @('projects','describe',$Project)
$billing = Read-Gcloud 'billing link' @('billing','projects','describe',$Project)
$apis = Read-Gcloud 'enabled APIs' @('services','list','--enabled',"--project=$Project")
$registry = Read-Gcloud 'Artifact Registry' @('artifacts','repositories','list',"--location=$Region", "--project=$Project")
$images = Read-Gcloud 'Mirai container images' @('artifacts','docker','images','list',"$Region-docker.pkg.dev/$Project/mirai",'--include-tags',"--project=$Project",'--limit=30')
$builds = Read-Gcloud 'recent builds' @('builds','list',"--project=$Project",'--limit=10')
$triggers = Read-Gcloud 'build triggers' @('builds','triggers','list',"--project=$Project")
$regionalBuilds = Read-Gcloud 'regional builds' @('builds','list',"--project=$Project", "--region=$Region",'--limit=10')
$secretMetadata = Read-Gcloud 'Secret Manager metadata' @('secrets','list',"--project=$Project")
$maps = Read-Gcloud 'Cloud Run domain mappings' @('beta','run','domain-mappings','list',"--project=$Project", "--region=$Region")
$loadBalancers = Read-Gcloud 'global forwarding rules' @('compute','forwarding-rules','list','--global',"--project=$Project")
$iam = Read-Gcloud 'project IAM' @('projects','get-iam-policy',$Project)
$services = @()
$runtimeAccounts = @()
foreach ($name in @('mirai-api','mirai-web')) {
    $s = Read-Gcloud "Cloud Run $name" @('run','services','describe',$name,"--region=$Region", "--project=$Project")
    if (-not $s) { continue }
    $safe = Safe-Service $s
    $runtimeAccounts += $safe.serviceAccount
    $policy = Read-Gcloud "invoker IAM $name" @('run','services','get-iam-policy',$name,"--region=$Region", "--project=$Project")
    $safe['publicInvoker'] = [bool](@($policy.bindings | Where-Object { $_.role -eq 'roles/run.invoker' -and $_.members -contains 'allUsers' }).Count)
    $safe['invokerPolicyReadable'] = [bool]$policy
    $revisions = Read-Gcloud "revisions $name" @('run','revisions','list',"--service=$name", "--region=$Region", "--project=$Project",'--limit=8')
    $safe['revisions'] = @($revisions | Where-Object { $_ } | ForEach-Object { [ordered]@{ name=$_.metadata.name; created=$_.metadata.creationTimestamp; image=$_.spec.containers[0].image; ready=@($_.status.conditions | Where-Object {$_.type -eq 'Ready'} | ForEach-Object {$_.status}) } })
    if ($safe.url) { $safe['health'] = Read-HttpStatus ($safe.url.TrimEnd('/') + '/health') }
    $services += $safe
}
$runtimeRoles = @(foreach ($account in @($runtimeAccounts | Where-Object { $_ } | Select-Object -Unique)) {
    $roles = @($iam.bindings | Where-Object { $_.members -contains "serviceAccount:$account" } | ForEach-Object { [ordered]@{ role=$_.role; conditional=[bool]$_.condition } })
    [ordered]@{ serviceAccount=$account; projectRoles=$roles }
})
$engineRefs = @($services | ForEach-Object { $_.containers } | ForEach-Object { $_.env } | Where-Object { $_.name -eq 'GOOGLE_ADK_AGENT_ENGINE' -and $_.value -match '^projects/[^/]+/locations/[^/]+/reasoningEngines/\d+$' } | ForEach-Object { $_.value } | Select-Object -Unique)
$engines = @(foreach ($ref in $engineRefs) {
    $r = $ref.Split('/'); $loc = $r[3]; $engineProject = $r[1]
    Write-Host 'Reading configured Agent Engine metadata ...'
    try {
        # Token remains in memory; only a GET request is sent to the official Google API.
        $token = (& $gcloud.Source 'auth' 'print-access-token' '--quiet' 2>$null) -join ''
        if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Token unavailable' }
        $hostName = if ($loc -eq 'global') { 'aiplatform.googleapis.com' } else { "$loc-aiplatform.googleapis.com" }
        $engine = Invoke-RestMethod -Method Get -Uri "https://$hostName/v1/$ref" -Headers @{Authorization="Bearer $token"} -TimeoutSec 30
        [ordered]@{ resource=$engine.name; displayName=$engine.displayName; createTime=$engine.createTime; updateTime=$engine.updateTime; reachable=$true; project=$engineProject }
    } catch { [ordered]@{ resource=$ref; reachable=$false; result='not_confirmed' } }
    finally { Remove-Variable token -ErrorAction SilentlyContinue }
})
$report = [ordered]@{
    generatedAt = [DateTimeOffset]::UtcNow.ToString('o')
    project = [ordered]@{ id=$Project; number=$p.projectNumber; state=$p.lifecycleState; billingEnabled=$billing.billingEnabled }
    region = $Region
    enabledApis = @($apis | Where-Object { $_ } | ForEach-Object { $_.config.name })
    services = $services
    runtimeProjectIam = $runtimeRoles
    projectIamReadable = [bool]$iam
    artifactRepositories = @($registry | Where-Object { $_ } | ForEach-Object { [ordered]@{ name=$_.name; format=$_.format; mode=$_.mode } })
    images = @($images | Where-Object { $_ } | ForEach-Object { [ordered]@{ package=$_.package; version=$_.version; tags=$_.tags; updateTime=$_.updateTime } })
    builds = @(@($builds)+@($regionalBuilds) | Where-Object { $_ } | ForEach-Object { [ordered]@{ id=$_.id; status=$_.status; created=$_.createTime; finished=$_.finishTime } })
    buildTriggers = @($triggers | Where-Object { $_ } | ForEach-Object { [ordered]@{ id=$_.id; name=$_.name; disabled=$_.disabled } })
    secrets = @($secretMetadata | Where-Object { $_ } | ForEach-Object { [ordered]@{ name=$_.name; createTime=$_.createTime } })
    domains = @($maps | Where-Object { $_ } | ForEach-Object { [ordered]@{ domain=$_.metadata.name; service=$_.spec.routeName; conditions=@($_.status.conditions | ForEach-Object { [ordered]@{ type=$_.type; status=$_.status; reason=$_.reason } }) } })
    globalForwardingRules = @($loadBalancers | Where-Object { $_ } | ForEach-Object { [ordered]@{ name=$_.name; scheme=$_.loadBalancingScheme; protocol=$_.IPProtocol; portRange=$_.portRange } })
    agentEngines = $engines
    unavailableChecks = @($errors.ToArray())
}
$report | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $ReportPath -Encoding UTF8
Write-Host "Done. Sanitized report: $ReportPath"
Write-Host 'Review it before sharing. It contains infrastructure identifiers, but not secret values or user records.'
