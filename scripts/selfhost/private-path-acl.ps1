[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("inspect", "harden")]
  [string]$Action,

  [Parameter(Mandatory = $true)]
  [string]$LiteralPath,

  [Parameter(Mandatory = $true)]
  [ValidateSet("file", "directory")]
  [string]$Kind
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$currentIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$currentSid = $currentIdentity.User.Value
$systemSid = "S-1-5-18"
$administratorsSid = "S-1-5-32-544"
$trustedSids = @($currentSid, $systemSid, $administratorsSid)

function Get-RuleSid([System.Security.AccessControl.FileSystemAccessRule]$Rule) {
  try {
    return $Rule.IdentityReference.Translate(
      [System.Security.Principal.SecurityIdentifier]
    ).Value
  }
  catch {
    return $Rule.IdentityReference.Value
  }
}

function Add-PrivateRule(
  [System.Security.AccessControl.FileSystemSecurity]$Acl,
  [string]$Sid,
  [string]$TargetKind
) {
  $identity = New-Object System.Security.Principal.SecurityIdentifier($Sid)
  if ($TargetKind -eq "directory") {
    $inheritance = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor `
      [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
  }
  else {
    $inheritance = [System.Security.AccessControl.InheritanceFlags]::None
  }
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    $identity,
    [System.Security.AccessControl.FileSystemRights]::FullControl,
    $inheritance,
    [System.Security.AccessControl.PropagationFlags]::None,
    [System.Security.AccessControl.AccessControlType]::Allow
  )
  [void]$Acl.AddAccessRule($rule)
}

if ($Action -eq "harden") {
  $acl = Get-Acl -LiteralPath $LiteralPath
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($rule in @($acl.Access)) {
    [void]$acl.RemoveAccessRuleSpecific($rule)
  }
  foreach ($sid in $trustedSids) {
    Add-PrivateRule -Acl $acl -Sid $sid -TargetKind $Kind
  }
  Set-Acl -LiteralPath $LiteralPath -AclObject $acl
}

$finalAcl = Get-Acl -LiteralPath $LiteralPath
$violations = [System.Collections.Generic.List[string]]::new()
if (-not $finalAcl.AreAccessRulesProtected) {
  $violations.Add("inheritance-enabled")
}

$currentUserHasFullControl = $false
foreach ($rule in @($finalAcl.Access)) {
  $ruleSid = Get-RuleSid -Rule $rule
  if ($rule.IsInherited) {
    $violations.Add("inherited-rule")
  }
  if (
    $rule.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow -and
    $trustedSids -notcontains $ruleSid
  ) {
    $violations.Add("untrusted-allow:$ruleSid")
  }
  if (
    $ruleSid -eq $currentSid -and
    $rule.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow -and
    (($rule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -eq
      [System.Security.AccessControl.FileSystemRights]::FullControl)
  ) {
    $currentUserHasFullControl = $true
  }
}
if (-not $currentUserHasFullControl) {
  $violations.Add("current-user-full-control-missing")
}

$report = [ordered]@{
  secure = $violations.Count -eq 0
  mechanism = "windows-acl"
  protected = $finalAcl.AreAccessRulesProtected
  currentUserSid = $currentSid
  owner = $finalAcl.Owner
  kind = $Kind
  violations = @($violations)
}
$report | ConvertTo-Json -Compress
if (-not $report.secure) {
  exit 4
}
