$ErrorActionPreference = "Stop"

& node (Join-Path $PSScriptRoot "cli.mjs") @args
exit $LASTEXITCODE
