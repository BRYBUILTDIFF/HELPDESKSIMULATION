param(
  [Parameter(Mandatory=$true)][string]$MaintenanceFile,
  [Parameter(Mandatory=$true)][string]$BackupDestination
)
$ErrorActionPreference = 'Stop'
# All scheduled paths must be absolute; use an encrypted, access-controlled destination.
if (![IO.Path]::IsPathRooted($MaintenanceFile) -or ![IO.Path]::IsPathRooted($BackupDestination)) {
  throw 'Use absolute paths for the maintenance file and backup destination.'
}
if (!(Test-Path -LiteralPath $MaintenanceFile -PathType Leaf)) { throw 'Maintenance file is missing.' }
if (!(Test-Path -LiteralPath $BackupDestination -PathType Container)) { throw 'Create the protected backup destination before scheduling.' }
$serverDirectory = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $serverDirectory
try {
  & node (Join-Path $PSScriptRoot 'backup-cloud.js') --env-file $MaintenanceFile
  if ($LASTEXITCODE -ne 0) { throw 'Cloud backup failed; no backup copied.' }
  $latestBackup = Get-ChildItem -LiteralPath (Join-Path $serverDirectory '.security/backups') -Filter '*.dump.enc' -File |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (!$latestBackup) { throw 'Encrypted backup output was not found.' }
  Copy-Item -LiteralPath $latestBackup.FullName -Destination $BackupDestination -ErrorAction Stop
  Write-Output 'Encrypted cloud backup copied to the configured destination.'
} finally { Pop-Location }
