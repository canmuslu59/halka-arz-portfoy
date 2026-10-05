param(
  [Parameter(Mandatory=$true)][string]$ProjectId,
  [Parameter(Mandatory=$true)][string]$AccessToken,
  [Parameter(Mandatory=$true)][string]$ResultsBucket,
  [Parameter(Mandatory=$true)][ValidateSet('smoke','physical','full')][string]$Profile,
  [Parameter(Mandatory=$true)][ValidateSet('crawl','resilience','permissions','instrumentation')][string]$Scenario,
  [Parameter(Mandatory=$true)][string]$Timeout,
  [Parameter(Mandatory=$true)][string]$Locale,
  [Parameter(Mandatory=$true)][string]$AppApk,
  [Parameter(Mandatory=$true)][string]$TestApk
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

if (-not (Test-Path $AppApk)) { throw "App APK missing: $AppApk" }
if ($Scenario -eq 'instrumentation' -and -not (Test-Path $TestApk)) { throw "Test APK missing: $TestApk" }
if ([string]::IsNullOrWhiteSpace($AccessToken)) { throw 'Google OAuth access token is empty' }

New-Item -ItemType Directory -Force testlab | Out-Null

$headers = @{ Authorization = "Bearer $AccessToken" }
$bucket = $ResultsBucket -replace '^gs://',''
if ([string]::IsNullOrWhiteSpace($bucket)) { throw 'Results bucket is invalid' }

function Invoke-GoogleJson {
  param(
    [Parameter(Mandatory=$true)][ValidateSet('GET','POST')][string]$Method,
    [Parameter(Mandatory=$true)][string]$Uri,
    [object]$Body = $null
  )
  try {
    if ($null -eq $Body) {
      return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers
    }
    $json = $Body | ConvertTo-Json -Depth 40 -Compress
    return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $json
  } catch {
    $detail = $_.Exception.Message
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $detail += " | " + $_.ErrorDetails.Message }
    throw "Google API request failed: $Method $Uri :: $detail"
  }
}

function Upload-GcsObject {
  param(
    [Parameter(Mandatory=$true)][string]$Path,
    [Parameter(Mandatory=$true)][string]$ObjectName,
    [Parameter(Mandatory=$true)][string]$ContentType
  )
  $encodedName = [Uri]::EscapeDataString($ObjectName)
  $uri = "https://storage.googleapis.com/upload/storage/v1/b/$bucket/o?uploadType=media&name=$encodedName"
  try {
    Invoke-RestMethod -Method POST -Uri $uri -Headers $headers -ContentType $ContentType -InFile $Path | Out-Null
  } catch {
    $detail = $_.Exception.Message
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $detail += " | " + $_.ErrorDetails.Message }
    throw "GCS upload failed for $ObjectName :: $detail"
  }
  return "gs://$bucket/$ObjectName"
}

function Get-LatestSupportedVersion {
  param([object]$Model, [hashtable]$VersionById)

  $candidateIds = @()
  if ($Model.perVersionInfo) {
    $candidateIds = @(
      $Model.perVersionInfo |
        Where-Object { $_.deviceCapacity -ne 'DEVICE_CAPACITY_NONE' } |
        ForEach-Object { $_.versionId }
    )
  }
  if ($candidateIds.Count -eq 0) { $candidateIds = @($Model.supportedVersionIds) }

  $candidates = @()
  foreach ($id in $candidateIds) {
    if ($VersionById.ContainsKey([string]$id)) {
      $v = $VersionById[[string]$id]
      $tags = @($v.tags)
      if ($tags -contains 'deprecated') { continue }
      $candidates += $v
    }
  }
  return $candidates | Sort-Object @{Expression={[int]$_.apiLevel};Descending=$true} | Select-Object -First 1
}

function New-DeviceSelection {
  param([object[]]$Models, [hashtable]$VersionById, [string]$WantedLocale)

  $runtimeLocales = @($catalog.androidDeviceCatalog.runtimeConfiguration.locales)
  $resolvedLocale = $runtimeLocales |
    Where-Object { $_.id -eq $WantedLocale -or $_.id.StartsWith($WantedLocale + '_') } |
    Select-Object -First 1
  if ($null -eq $resolvedLocale) {
    $resolvedLocale = $runtimeLocales | Where-Object { @($_.tags) -contains 'default' } | Select-Object -First 1
  }
  if ($null -eq $resolvedLocale) { throw "No usable Test Lab locale found for '$WantedLocale'" }

  $items = @()
  foreach ($model in $Models) {
    $v = Get-LatestSupportedVersion -Model $model -VersionById $VersionById
    if ($null -eq $v) { continue }
    $items += [ordered]@{
      androidModelId = [string]$model.id
      androidVersionId = [string]$v.id
      locale = [string]$resolvedLocale.id
      orientation = 'portrait'
    }
  }
  return @($items)
}

Write-Host "TESTLAB_REST_PROJECT=$ProjectId"
$catalogUri = "https://testing.googleapis.com/v1/testEnvironmentCatalog/android?projectId=$([Uri]::EscapeDataString($ProjectId))"
$catalog = Invoke-GoogleJson -Method GET -Uri $catalogUri
$catalog | ConvertTo-Json -Depth 50 | Set-Content -Encoding utf8 testlab/device-catalog.json

$versionById = @{}
foreach ($v in @($catalog.androidDeviceCatalog.versions)) { $versionById[[string]$v.id] = $v }

$models = @($catalog.androidDeviceCatalog.models) |
  Where-Object {
    $_.formFactor -eq 'PHONE' -and
    -not (@($_.tags) -contains 'deprecated')
  }

$virtualModels = @(
  $models |
    Where-Object { $_.form -eq 'VIRTUAL' -or $_.form -eq 'EMULATOR' } |
    Sort-Object @{Expression={ if ($_.brand -eq 'Google' -or $_.manufacturer -eq 'Google') {0} else {1} }}, name
)
$physicalModels = @(
  $models |
    Where-Object { $_.form -eq 'PHYSICAL' } |
    Sort-Object @{Expression={
      if ($_.brand -eq 'Samsung' -or $_.manufacturer -eq 'Samsung') {0}
      elseif ($_.brand -eq 'Google' -or $_.manufacturer -eq 'Google') {1}
      else {2}
    }}, name
)

switch ($Profile) {
  'smoke' { $chosenModels = @($virtualModels | Select-Object -First 3) }
  'physical' { $chosenModels = @($physicalModels | Select-Object -First 5) }
  'full' {
    $chosenModels = @(
      @($physicalModels | Select-Object -First 5) +
      @($virtualModels | Select-Object -First 5)
    )
  }
}
if ($chosenModels.Count -eq 0) { throw "No Test Lab devices available for profile '$Profile'" }

$devices = New-DeviceSelection -Models $chosenModels -VersionById $versionById -WantedLocale $Locale
if ($devices.Count -eq 0) { throw 'No valid model/version combinations could be selected' }

$devices | ConvertTo-Json -Depth 10 | Set-Content -Encoding utf8 testlab/selected-devices.json
$devices | ForEach-Object { "$($_.androidModelId)/$($_.androidVersionId) $($_.locale) $($_.orientation)" } |
  Set-Content -Encoding utf8 testlab/selected-devices.txt
Write-Host "TESTLAB_SELECTED_DEVICES=$($devices.Count)"
Get-Content testlab/selected-devices.txt | ForEach-Object { Write-Host "  $_" }

$runId = if ($env:GITHUB_RUN_ID) { $env:GITHUB_RUN_ID } else { [guid]::NewGuid().ToString('N') }
$prefix = "ci/$runId/$Scenario"
$appGcs = Upload-GcsObject -Path $AppApk -ObjectName "$prefix/app-debug.apk" -ContentType 'application/vnd.android.package-archive'

$testGcs = $null
if ($Scenario -eq 'instrumentation') {
  $testGcs = Upload-GcsObject -Path $TestApk -ObjectName "$prefix/app-debug-androidTest.apk" -ContentType 'application/vnd.android.package-archive'
}

$roboScriptGcs = $null
if ($Scenario -eq 'resilience') {
  $roboScriptGcs = Upload-GcsObject -Path 'testlab/robo-resilience.json' -ObjectName "$prefix/robo-resilience.json" -ContentType 'application/json'
}
if ($Scenario -eq 'permissions') {
  $roboScriptGcs = Upload-GcsObject -Path 'testlab/robo-permissions.json' -ObjectName "$prefix/robo-permissions.json" -ContentType 'application/json'
}

$timeoutSeconds = switch -Regex ($Timeout) {
  '^(\d+)m$' { [int]$Matches[1] * 60; break }
  '^(\d+)s$' { [int]$Matches[1]; break }
  default { throw "Unsupported timeout value: $Timeout" }
}

$testSpecification = [ordered]@{
  testTimeout = "$($timeoutSeconds)s"
  disableVideoRecording = $false
  disablePerformanceMetrics = $false
  testSetup = [ordered]@{
    account = [ordered]@{ googleAuto = @{} }
  }
}

if ($Scenario -eq 'instrumentation') {
  $testSpecification.androidInstrumentationTest = [ordered]@{
    appApk = [ordered]@{ gcsPath = $appGcs }
    testApk = [ordered]@{ gcsPath = $testGcs }
    appPackageId = 'com.innative.halkaarz.test'
    testRunnerClass = 'androidx.test.runner.AndroidJUnitRunner'
    orchestratorOption = 'DO_NOT_USE_ORCHESTRATOR'
  }
} else {
  $robo = [ordered]@{
    appApk = [ordered]@{ gcsPath = $appGcs }
    appPackageId = 'com.innative.halkaarz.test'
    roboMode = 'ROBO_VERSION_2'
  }
  if ($roboScriptGcs) { $robo.roboScript = [ordered]@{ gcsPath = $roboScriptGcs } }
  $testSpecification.androidRoboTest = $robo
}

$resultsPath = "gs://$bucket/results/$runId/$Scenario/"
$matrixBody = [ordered]@{
  clientInfo = [ordered]@{
    name = 'github-actions-rest'
    clientInfoDetails = @(
      [ordered]@{ key = 'matrixLabel'; value = "Hisse-Portfoyum-$Profile-$Scenario-$env:GITHUB_RUN_NUMBER" },
      [ordered]@{ key = 'GitHub Run'; value = [string]$runId }
    )
  }
  testSpecification = $testSpecification
  environmentMatrix = [ordered]@{
    androidDeviceList = [ordered]@{ androidDevices = @($devices) }
  }
  resultStorage = [ordered]@{
    googleCloudStorage = [ordered]@{ gcsPath = $resultsPath }
  }
  flakyTestAttempts = 0
  failFast = $false
}

$requestId = [guid]::NewGuid().ToString()
$createUri = "https://testing.googleapis.com/v1/projects/$ProjectId/testMatrices?requestId=$requestId"
$created = Invoke-GoogleJson -Method POST -Uri $createUri -Body $matrixBody
$created | ConvertTo-Json -Depth 50 | Set-Content -Encoding utf8 testlab/matrix-created.json

$matrixId = [string]$created.testMatrixId
if ([string]::IsNullOrWhiteSpace($matrixId)) {
  throw "Test Lab did not return a matrix id. state=$($created.state) invalid=$($created.invalidMatrixDetails)"
}
Write-Host "TESTLAB_MATRIX_ID=$matrixId"
Write-Host "TESTLAB_INITIAL_STATE=$($created.state)"

$getUri = "https://testing.googleapis.com/v1/projects/$ProjectId/testMatrices/$matrixId"
$matrix = $created
$deadline = [DateTime]::UtcNow.AddMinutes(20)
while ([DateTime]::UtcNow -lt $deadline) {
  $state = [string]$matrix.state
  if ($state -notin @('VALIDATING','PENDING','RUNNING')) { break }
  Start-Sleep -Seconds 15
  $matrix = Invoke-GoogleJson -Method GET -Uri $getUri
  Write-Host "TESTLAB_STATE=$($matrix.state)"
}

$matrix | ConvertTo-Json -Depth 50 | Set-Content -Encoding utf8 testlab/matrix-final.json

$summary = @(
  "matrixId=$matrixId",
  "state=$($matrix.state)",
  "outcomeSummary=$($matrix.outcomeSummary)",
  "invalidMatrixDetails=$($matrix.invalidMatrixDetails)",
  "resultsUrl=$($matrix.resultStorage.resultsUrl)",
  "resultsPath=$resultsPath",
  "profile=$Profile",
  "scenario=$Scenario",
  "devices=$($devices.Count)"
)
$summary | Set-Content -Encoding utf8 testlab/test-run.txt
$summary | ForEach-Object { Write-Host $_ }

if ([DateTime]::UtcNow -ge $deadline -and $matrix.state -in @('VALIDATING','PENDING','RUNNING')) {
  throw "Test Lab matrix timed out while waiting: $matrixId state=$($matrix.state)"
}
if ($matrix.state -ne 'FINISHED') {
  $details = @($matrix.extendedInvalidMatrixDetails | ForEach-Object { "$($_.reason):$($_.message)" }) -join '; '
  throw "Test Lab matrix did not finish successfully: state=$($matrix.state) invalid=$($matrix.invalidMatrixDetails) details=$details"
}
if ($matrix.outcomeSummary -ne 'SUCCESS') {
  $executionErrors = @(
    $matrix.testExecutions |
      ForEach-Object { $_.testDetails.errorMessage } |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  ) -join '; '
  throw "Test Lab matrix outcome=$($matrix.outcomeSummary). $executionErrors"
}

Write-Host 'TESTLAB_MATRIX=PASS'
