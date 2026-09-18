param(
    [switch]$VerifyOnly,
    [string]$ApkPath
)

$ErrorActionPreference = 'Stop'

$ExpectedPackage = 'com.hanwool.delivery'
$ExpectedCertificateSha256 = 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c'
$MobileRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$AppConfigPath = Join-Path $MobileRoot 'app.json'
$AndroidRoot = Join-Path $MobileRoot 'android'
$GradleConfigPath = Join-Path $AndroidRoot 'app\build.gradle'
$ProjectKeystorePath = Join-Path $AndroidRoot 'app\debug.keystore'
$BackupKeystorePath = Join-Path $env:USERPROFILE '.android\hanwool-release.keystore'

$appConfig = Get-Content -Raw $AppConfigPath | ConvertFrom-Json
$expectedVersion = [string]$appConfig.expo.version
$expectedVersionCode = [int]$appConfig.expo.android.versionCode
$expectedPackage = [string]$appConfig.expo.android.package

if ($expectedPackage -ne $ExpectedPackage) {
    throw "Unexpected Android package: $expectedPackage"
}

if (-not $ApkPath) {
    $ApkPath = Join-Path $AndroidRoot 'app\build\outputs\apk\release\app-release.apk'
}

if (-not $VerifyOnly) {
    if (-not (Test-Path $BackupKeystorePath)) {
        throw "Signing key not found: $BackupKeystorePath"
    }
    if (-not (Test-Path $GradleConfigPath)) {
        throw 'Android project is missing. Run: npx expo prebuild --platform android --no-install'
    }
    if (-not (Test-Path (Join-Path $MobileRoot 'node_modules\prop-types\lib\ReactPropTypesSecret.js'))) {
        throw 'Mobile dependencies are incomplete. Run npm ci in mobile/ first.'
    }

    Copy-Item -LiteralPath $BackupKeystorePath -Destination $ProjectKeystorePath -Force

    $gradleConfig = Get-Content -Raw $GradleConfigPath
    $gradleConfig = [regex]::Replace($gradleConfig, 'versionCode\s+\d+', "versionCode $expectedVersionCode", 1)
    $gradleConfig = [regex]::Replace($gradleConfig, 'versionName\s+"[^"]+"', "versionName `"$expectedVersion`"", 1)
    [System.IO.File]::WriteAllText($GradleConfigPath, $gradleConfig, [System.Text.UTF8Encoding]::new($false))

    if (-not $env:ANDROID_HOME) {
        $env:ANDROID_HOME = 'C:\Android\Sdk'
    }
    $env:NODE_ENV = 'production'

    Push-Location $AndroidRoot
    try {
        & '.\gradlew.bat' assembleRelease --no-daemon '-PreactNativeArchitectures=arm64-v8a,armeabi-v7a'
        if ($LASTEXITCODE -ne 0) {
            throw "Gradle build failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }
}

if (-not (Test-Path $ApkPath)) {
    throw "APK not found: $ApkPath"
}

$sdkRoot = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { 'C:\Android\Sdk' }
$buildTools = Get-ChildItem (Join-Path $sdkRoot 'build-tools') -Directory |
    Where-Object { $_.Name -match '^\d+(\.\d+)+$' } |
    Sort-Object { [version]$_.Name } -Descending |
    Select-Object -First 1

if (-not $buildTools) {
    throw "Android build-tools not found under $sdkRoot"
}

$apkSigner = Join-Path $buildTools.FullName 'apksigner.bat'
$aapt = Join-Path $buildTools.FullName 'aapt.exe'
$signatureOutput = & $apkSigner verify --verbose --print-certs $ApkPath 2>&1
if ($LASTEXITCODE -ne 0) {
    throw 'APK signature verification failed.'
}

$certificateLine = $signatureOutput | Select-String 'Signer #1 certificate SHA-256 digest:' | Select-Object -First 1
if (-not $certificateLine) {
    throw 'APK signer certificate fingerprint was not found.'
}
$certificateSha256 = (($certificateLine.Line -split ':', 2)[1] -replace '[^0-9A-Fa-f]', '').ToLowerInvariant()
if ($certificateSha256 -ne $ExpectedCertificateSha256) {
    throw "Wrong APK signing certificate: $certificateSha256"
}

$packageLine = (& $aapt dump badging $ApkPath | Select-String '^package:' | Select-Object -First 1).Line
if ($packageLine -notmatch "name='$([regex]::Escape($ExpectedPackage))'") {
    throw "Wrong Android package: $packageLine"
}
if ($packageLine -notmatch "versionCode='$expectedVersionCode'") {
    throw "Wrong versionCode: $packageLine"
}
if ($packageLine -notmatch "versionName='$([regex]::Escape($expectedVersion))'") {
    throw "Wrong versionName: $packageLine"
}

$apkHash = (Get-FileHash $ApkPath -Algorithm SHA256).Hash.ToLowerInvariant()
$apkSize = (Get-Item $ApkPath).Length
Write-Output "APK verification passed"
Write-Output "package=$ExpectedPackage version=$expectedVersion versionCode=$expectedVersionCode"
Write-Output "certificateSha256=$certificateSha256"
Write-Output "apkSha256=$apkHash size=$apkSize"
