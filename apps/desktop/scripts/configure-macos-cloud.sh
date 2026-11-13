#!/bin/bash
set -euo pipefail

if [[ ! -t 0 ]]; then
  echo "Run this setup yourself in a local terminal. Never send passwords through chat."
  exit 1
fi
certificate=${1:?Pass the exported encrypted Developer ID Application .p12 path}
repository=${2:-trainingload-ai/trainingloadai}
script_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
node "$script_directory/configure-macos-cloud.mjs" preflight "$repository"
[[ -f "$certificate" ]] || { echo "Certificate file not found"; exit 1; }

IFS= read -r -p "Apple developer account email: " DESKTOP_MAC_APPLE_ID
IFS= read -r -s -p "Exported .p12 password (hidden): " DESKTOP_MAC_P12_PASSWORD
printf '\n'
IFS= read -r -s -p "Apple app-specific password for cloud notarization (hidden): " DESKTOP_MAC_APP_PASSWORD
printf '\n'
export DESKTOP_MAC_APPLE_ID DESKTOP_MAC_P12_PASSWORD DESKTOP_MAC_APP_PASSWORD
trap 'unset DESKTOP_MAC_APPLE_ID DESKTOP_MAC_P12_PASSWORD DESKTOP_MAC_APP_PASSWORD DESKTOP_CLOUD_CONFIRM_UPLOAD' EXIT
node "$script_directory/configure-macos-cloud.mjs" inspect "$repository" "$certificate"
printf 'Destination: https://github.com/%s/settings/environments\n' "$repository"
printf 'Environment: desktop-macos-release, restricted to main.\n'
printf 'This uploads the encrypted signing identity, its password, Apple account and notarization authorization as five encrypted GitHub Environment Secrets. Existing values with these five names will be replaced.\n'
IFS= read -r -p "Type yes to upload, or anything else to stop: " confirmation
[[ "$confirmation" == yes ]] || exit 1
export DESKTOP_CLOUD_CONFIRM_UPLOAD="$repository/desktop-macos-release"
node "$script_directory/configure-macos-cloud.mjs" upload "$repository" "$certificate"
