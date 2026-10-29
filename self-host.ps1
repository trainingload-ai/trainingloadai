$ErrorActionPreference = "Stop"

$ReleaseDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
& node (Join-Path $ReleaseDirectory "scripts/selfhost/cli.mjs") @args
exit $LASTEXITCODE
