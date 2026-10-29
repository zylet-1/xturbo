$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$androidRoot = Join-Path $repoRoot 'android'
$previousNodeEnv = $env:NODE_ENV
$env:NODE_ENV = 'production'
Push-Location $repoRoot
try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Scratch editor production build failed with exit code $LASTEXITCODE."
    }
} finally {
    Pop-Location
    $env:NODE_ENV = $previousNodeEnv
}

$sdkCandidates = @(
    $env:ANDROID_SDK_ROOT,
    $env:ANDROID_HOME,
    (Join-Path $env:LOCALAPPDATA 'Android\Sdk'),
    (Join-Path $env:USERPROFILE 'AppData\Local\Android\Sdk')
) | Where-Object { $_ } | Select-Object -Unique
$sdkPath = $sdkCandidates | Where-Object {
    Test-Path (Join-Path $_ 'platforms\android-35')
} | Select-Object -First 1
if (-not $sdkPath) {
    throw "Android SDK API 35 was not found. Install Android Studio and Android SDK Platform 35, then set ANDROID_SDK_ROOT. Checked: $($sdkCandidates -join ', ')"
}

if (-not $env:JAVA_HOME -or -not (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
    $javaCandidates = @(
        (Join-Path $repoRoot '.tools\jdk-21.0.12.1+1'),
        (Join-Path $env:ProgramFiles 'Android\Android Studio\jbr'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Android Studio\jbr'),
        (Join-Path $env:ProgramFiles 'Java\jdk-21'),
        (Join-Path $env:ProgramFiles 'Java\jdk-17'),
        (Join-Path $env:ProgramFiles 'Microsoft\jdk-21')
    )
    $env:JAVA_HOME = $javaCandidates | Where-Object {
        Test-Path (Join-Path $_ 'bin\java.exe')
    } | Select-Object -First 1
}
if (-not $env:JAVA_HOME) {
    throw 'A JDK is required. Install JDK 17 or 21, or set JAVA_HOME before building the Android app.'
}

$env:ANDROID_SDK_ROOT = $sdkPath
$env:ANDROID_HOME = $sdkPath
$wrapper = Join-Path $androidRoot 'gradlew.bat'
if (-not (Test-Path $wrapper)) {
    throw 'Gradle wrapper is missing. Open the android folder in Android Studio once, or run the documented Gradle wrapper setup command.'
}

Push-Location $androidRoot
try {
    & $wrapper --no-daemon assembleDebug
    if ($LASTEXITCODE -ne 0) {
        throw "Android build failed with exit code $LASTEXITCODE."
    }
} finally {
    Pop-Location
}

$apk = Join-Path $androidRoot 'app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path $apk)) {
    throw "Gradle completed but the debug APK was not found at '$apk'."
}

$outputDirectory = Join-Path (Split-Path $repoRoot -Parent) 'outputs'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$outputApk = Join-Path $outputDirectory 'ScratchMod-android-debug.apk'
Copy-Item -LiteralPath $apk -Destination $outputApk -Force
Write-Output "Android app created: $outputApk"
