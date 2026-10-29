const GROUPS = [
  {
    category: "usage",
    defaultExitCode: 2,
    remediationId: "fix-command-invocation",
    codes: [
      "SELF_HOST_OWNER_BOOTSTRAP_STDIN_REQUIRED",
      "SELF_HOST_OWNER_RECOVERY_STDIN_REQUIRED",
      "SELF_HOST_USAGE_INVALID",
    ],
  },
  {
    category: "configuration",
    defaultExitCode: 3,
    remediationId: "repair-configuration",
    codes: [
      "SELF_HOST_BACKUP_PATH_INVALID",
      "SELF_HOST_BIND_ORIGIN_MISMATCH",
      "SELF_HOST_BUNDLE_INCOMPLETE",
      "SELF_HOST_COMPOSE_CONFIG_INVALID",
      "SELF_HOST_CONFIG_DUPLICATE_KEY",
      "SELF_HOST_CONFIG_IMAGE_INVALID",
      "SELF_HOST_CONFIG_INVALID",
      "SELF_HOST_CONFIG_MUTABLE_IMAGE",
      "SELF_HOST_CONFIG_PATH_UNSAFE",
      "SELF_HOST_CONFIG_PERMISSIONS_INSECURE",
      "SELF_HOST_CONFIG_SECRET_INVALID",
      "SELF_HOST_CONFIG_SYNTAX_INVALID",
      "SELF_HOST_CONFIG_TOO_LARGE",
      "SELF_HOST_DATA_ROOT_UNSAFE",
      "SELF_HOST_DIAGNOSTICS_PATH_INVALID",
      "SELF_HOST_INSTALL_BUNDLE_INVALID",
      "SELF_HOST_INSTANCE_DIRECTORY_INVALID",
      "SELF_HOST_NOT_INITIALIZED",
      "SELF_HOST_BOOTSTRAP_EMAIL_IN_USE",
      "SELF_HOST_BOOTSTRAP_INPUT_INVALID",
      "SELF_HOST_BOOTSTRAP_PASSWORD_TOO_LARGE",
      "SELF_HOST_BOOTSTRAP_TOKEN_EXPIRED",
      "SELF_HOST_BOOTSTRAP_TOKEN_INVALID",
      "SELF_HOST_OWNER_MISMATCH",
      "SELF_HOST_PUBLIC_HTTP_BLOCKED",
      "SELF_HOST_RECOVERY_PASSWORD_INVALID",
      "SELF_HOST_RECOVERY_PASSWORD_TOO_LARGE",
      "SELF_HOST_SOURCE_BUNDLE_INCOMPLETE",
      "SELF_HOST_UNINSTALL_CONFIRMATION_INVALID",
      "SELF_HOST_UNINSTALL_DATA_ROOT_UNVERIFIED",
      "SELF_HOST_UPGRADE_CONFIG_INVALID",
    ],
  },
  {
    category: "prerequisite",
    defaultExitCode: 4,
    remediationId: "install-host-prerequisites",
    codes: [
      "SELF_HOST_COMPOSE_UNAVAILABLE",
      "SELF_HOST_COSIGN_UNAVAILABLE",
      "SELF_HOST_DOCKER_PLATFORM_UNSUPPORTED",
      "SELF_HOST_DOCKER_UNAVAILABLE",
      "SELF_HOST_HOST_PLATFORM_UNSUPPORTED",
      "SELF_HOST_INSTALL_NODE_UNSUPPORTED",
    ],
  },
  {
    category: "runtime",
    defaultExitCode: 5,
    remediationId: "inspect-runtime-failure",
    codes: [
      "SELF_HOST_DOCKER_INFO_FAILED",
      "SELF_HOST_HTTP_PORT_CHECK_FAILED",
      "SELF_HOST_IMAGE_PULL_FAILED",
      "SELF_HOST_LOGS_FAILED",
      "SELF_HOST_OWNER_BOOTSTRAP_FAILED",
      "SELF_HOST_OWNER_BOOTSTRAP_RESPONSE_INVALID",
      "SELF_HOST_OWNER_RECOVERY_FAILED",
      "SELF_HOST_OWNER_RECOVERY_RESPONSE_INVALID",
      "SELF_HOST_START_FAILED",
      "SELF_HOST_STATUS_FAILED",
      "SELF_HOST_STATUS_INVALID",
      "SELF_HOST_STOP_FAILED",
      "SELF_HOST_UNINSTALL_FAILED",
    ],
  },
  {
    category: "backup",
    defaultExitCode: 5,
    remediationId: "repair-backup-failure",
    codes: [
      "SELF_HOST_BACKUP_AND_RESUME_FAILED",
      "SELF_HOST_BACKUP_DATABASE_DUMP_FAILED",
      "SELF_HOST_BACKUP_DATABASE_DUMP_INVALID",
      "SELF_HOST_BACKUP_DATABASE_INSPECTION_FAILED",
      "SELF_HOST_BACKUP_DATABASE_INSPECTION_INVALID",
      "SELF_HOST_BACKUP_DISK_SPACE_INSUFFICIENT",
      "SELF_HOST_BACKUP_MIGRATION_STATE_INVALID",
      "SELF_HOST_BACKUP_QUIESCE_FAILED",
      "SELF_HOST_BACKUP_REQUIRES_READY_INSTANCE",
      "SELF_HOST_BACKUP_RESUME_FAILED",
      "SELF_HOST_BACKUP_RESUME_NOT_READY",
      "SELF_HOST_BACKUP_SIZE_INVALID",
      "SELF_HOST_BACKUP_UPLOAD_COPY_FAILED",
      "SELF_HOST_BACKUP_UPLOAD_INSPECTION_FAILED",
      "SELF_HOST_BACKUP_UPLOAD_INSPECTION_INVALID",
      "SELF_HOST_BACKUP_VERIFICATION_FAILED",
    ],
  },
  {
    category: "restore",
    defaultExitCode: 5,
    remediationId: "repair-restore-failure",
    codes: [
      "SELF_HOST_RESTORE_DATABASE_FAILED",
      "SELF_HOST_RESTORE_DATABASE_START_FAILED",
      "SELF_HOST_RESTORE_DATABASE_VERIFICATION_FAILED",
      "SELF_HOST_RESTORE_DISK_SPACE_INSUFFICIENT",
      "SELF_HOST_RESTORE_POST_START_VERIFICATION_FAILED",
      "SELF_HOST_RESTORE_SIZE_INVALID",
      "SELF_HOST_RESTORE_SNAPSHOT_FAILED",
      "SELF_HOST_RESTORE_START_FAILED",
      "SELF_HOST_RESTORE_TARGET_NOT_CLEAN",
      "SELF_HOST_RESTORE_UPLOAD_COPY_FAILED",
      "SELF_HOST_RESTORE_VERSION_INCOMPATIBLE",
    ],
  },
  {
    category: "upgrade",
    defaultExitCode: 5,
    remediationId: "repair-upgrade-failure",
    codes: [
      "SELF_HOST_UPGRADE_DISK_SPACE_INSUFFICIENT",
      "SELF_HOST_UPGRADE_IMAGE_PULL_FAILED",
      "SELF_HOST_UPGRADE_IMAGE_VERIFY_FAILED",
      "SELF_HOST_UPGRADE_INCOMPATIBLE",
      "SELF_HOST_UPGRADE_MIGRATION_VERIFICATION_FAILED",
      "SELF_HOST_UPGRADE_RELEASE_INVALID",
      "SELF_HOST_UPGRADE_REQUIRES_READY_INSTANCE",
      "SELF_HOST_UPGRADE_SIGNATURE_INVALID",
      "SELF_HOST_UPGRADE_SIZE_INVALID",
      "SELF_HOST_UPGRADE_START_FAILED",
      "SELF_HOST_UPGRADE_STATE_INVALID",
    ],
  },
  {
    category: "rollback",
    defaultExitCode: 5,
    remediationId: "repair-rollback-failure",
    codes: [
      "SELF_HOST_ROLLBACK_DATABASE_CHANGED",
      "SELF_HOST_ROLLBACK_DATABASE_INCOMPATIBLE",
      "SELF_HOST_ROLLBACK_IMAGE_MISSING",
      "SELF_HOST_ROLLBACK_SOURCE_NOT_FOUND",
      "SELF_HOST_ROLLBACK_START_FAILED",
      "SELF_HOST_ROLLBACK_STATE_INVALID",
      "SELF_HOST_ROLLBACK_UNSUPPORTED",
    ],
  },
  {
    category: "diagnostics",
    defaultExitCode: 5,
    remediationId: "repair-diagnostics-failure",
    codes: ["SELF_HOST_DIAGNOSTICS_SECRET_SCAN_FAILED"],
  },
  {
    category: "state-conflict",
    defaultExitCode: 6,
    remediationId: "resolve-lifecycle-conflict",
    codes: [
      "SELF_HOST_BACKUP_ALREADY_EXISTS",
      "SELF_HOST_DIAGNOSTICS_EXISTS",
      "SELF_HOST_INIT_CONFLICT",
      "SELF_HOST_HTTP_PORT_IN_USE",
      "SELF_HOST_OPERATION_IN_PROGRESS",
      "SELF_HOST_PROJECT_NAME_CONFLICT",
      "SELF_HOST_ALREADY_INITIALIZED",
      "SELF_HOST_RESTORE_INCOMPLETE",
      "SELF_HOST_RESTORE_TARGET_NOT_EMPTY",
      "SELF_HOST_UNINSTALL_DATA_ROOT_CHANGED",
      "SELF_HOST_UPGRADE_INCOMPLETE",
    ],
  },
  {
    category: "filesystem",
    defaultExitCode: 7,
    remediationId: "repair-filesystem-state",
    codes: [
      "SELF_HOST_BACKUP_CLEANUP_FAILED",
      "SELF_HOST_CONFIG_SNAPSHOT_CLEANUP_FAILED",
      "SELF_HOST_CONFIG_SNAPSHOT_FAILED",
      "SELF_HOST_DATA_PATH_UNSAFE",
      "SELF_HOST_DATA_ROOT_MARKER_INVALID",
      "SELF_HOST_DATA_ROOT_NOT_DEDICATED",
      "SELF_HOST_DIAGNOSTICS_CLEANUP_FAILED",
      "SELF_HOST_DIAGNOSTICS_VERIFY_FAILED",
      "SELF_HOST_DIAGNOSTICS_WRITE_FAILED",
      "SELF_HOST_FILESYSTEM_ERROR",
      "SELF_HOST_LIFECYCLE_MARKER_CLEAR_FAILED",
      "SELF_HOST_OPERATION_LOCK_INVALID",
      "SELF_HOST_OPERATION_LOCK_RELEASE_FAILED",
      "SELF_HOST_OPERATION_RECORD_FAILED",
      "SELF_HOST_RELEASE_STATE_INVALID",
      "SELF_HOST_RESTORE_REPORT_FAILED",
      "SELF_HOST_RESTORE_SNAPSHOT_CLEANUP_FAILED",
      "SELF_HOST_UNINSTALL_DATA_DELETE_FAILED",
      "SELF_HOST_UPGRADE_REPORT_FAILED",
    ],
  },
  {
    category: "health",
    defaultExitCode: 8,
    remediationId: "restore-service-health",
    codes: [
      "SELF_HOST_NOT_READY",
      "SELF_HOST_BOOTSTRAP_TOKEN_FILE_MISSING",
      "SELF_HOST_OWNER_MISSING",
      "SELF_HOST_RESTORE_NOT_READY",
      "SELF_HOST_ROLLBACK_NOT_READY",
      "SELF_HOST_STOP_INCOMPLETE",
      "SELF_HOST_UNINSTALL_INCOMPLETE",
      "SELF_HOST_UPGRADE_NOT_READY",
    ],
  },
  {
    category: "doctor",
    defaultExitCode: 8,
    remediationId: "follow-doctor-remediation",
    codes: [
      "SELF_HOST_DOCTOR_CAPABILITY_FAILED",
      "SELF_HOST_DOCTOR_DATABASE_FAILED",
      "SELF_HOST_DOCTOR_DISK_INSUFFICIENT",
      "SELF_HOST_DOCTOR_DNS_FAILED",
      "SELF_HOST_DOCTOR_FAILED",
      "SELF_HOST_DOCTOR_GATEWAY_RESPONSE_INVALID",
      "SELF_HOST_DOCTOR_GATEWAY_UNREACHABLE",
      "SELF_HOST_DOCTOR_HISTORY_LIMIT_EXCEEDED",
      "SELF_HOST_DOCTOR_INODES_INSUFFICIENT",
      "SELF_HOST_DOCTOR_LOCAL_DEM_INVALID",
      "SELF_HOST_DOCTOR_OWNER_MISSING",
      "SELF_HOST_DOCTOR_PROVIDER_UNREACHABLE",
      "SELF_HOST_DOCTOR_TLS_FAILED",
    ],
  },
  {
    category: "warning",
    defaultExitCode: 0,
    remediationId: "review-security-warning",
    codes: ["SELF_HOST_INSECURE_LAN_HTTP", "SELF_HOST_INSECURE_PUBLIC_HTTP"],
  },
  {
    category: "internal",
    defaultExitCode: 10,
    remediationId: "collect-diagnostics-and-report",
    codes: ["SELF_HOST_INTERNAL_ERROR"],
  },
];

const RETRYABLE = new Set([
  "SELF_HOST_BACKUP_RESUME_FAILED",
  "SELF_HOST_BACKUP_RESUME_NOT_READY",
  "SELF_HOST_COMPOSE_UNAVAILABLE",
  "SELF_HOST_DOCKER_PLATFORM_UNSUPPORTED",
  "SELF_HOST_DOCKER_UNAVAILABLE",
  "SELF_HOST_INIT_CONFLICT",
  "SELF_HOST_HTTP_PORT_IN_USE",
  "SELF_HOST_IMAGE_PULL_FAILED",
  "SELF_HOST_NOT_READY",
  "SELF_HOST_OPERATION_IN_PROGRESS",
  "SELF_HOST_RESTORE_DATABASE_START_FAILED",
  "SELF_HOST_RESTORE_NOT_READY",
  "SELF_HOST_RESTORE_START_FAILED",
  "SELF_HOST_ROLLBACK_NOT_READY",
  "SELF_HOST_ROLLBACK_START_FAILED",
  "SELF_HOST_START_FAILED",
  "SELF_HOST_STOP_FAILED",
  "SELF_HOST_UNINSTALL_FAILED",
  "SELF_HOST_UPGRADE_NOT_READY",
  "SELF_HOST_UPGRADE_START_FAILED",
]);

const entries = GROUPS.flatMap((group) =>
  group.codes.map((code) => ({
    code,
    category: group.category,
    defaultExitCode: group.defaultExitCode,
    retryable: RETRYABLE.has(code),
    remediationId: group.remediationId,
    documentation: `docs/self-hosting/error-catalog.zh.md#${group.category}`,
  })),
).sort((left, right) => left.code.localeCompare(right.code));

if (new Set(entries.map((entry) => entry.code)).size !== entries.length) {
  throw new Error("self-host error catalog contains duplicate codes");
}

export const SELF_HOST_ERROR_CATALOG = Object.freeze(
  entries.map((entry) => Object.freeze(entry)),
);

const BY_CODE = new Map(
  SELF_HOST_ERROR_CATALOG.map((entry) => [entry.code, entry]),
);

export function selfHostErrorDefinition(code) {
  return BY_CODE.get(code) ?? null;
}

export function isCatalogedSelfHostError(code) {
  return BY_CODE.has(code);
}

const CATEGORY_TITLES = Object.freeze({
  usage: "usage",
  configuration: "configuration",
  prerequisite: "prerequisite",
  runtime: "runtime",
  backup: "backup",
  restore: "restore",
  upgrade: "upgrade",
  rollback: "rollback",
  diagnostics: "diagnostics",
  "state-conflict": "state-conflict",
  filesystem: "filesystem",
  health: "health",
  doctor: "doctor",
  warning: "warning",
  internal: "internal",
});

export function renderErrorCatalogMarkdown() {
  const lines = [
    "# Self-host 稳定错误码目录",
    "",
    "> 此文件由 `scripts/selfhost/error-catalog.mjs` 的机器目录生成。错误码是自动化契约；英文 message 只用于人工阅读，不能作为判断条件。",
    "",
    "结构化调用方应读取 `ok`、`exitCode`、`error.code` 与 `doctor.checks[].errorCode`。先按 remediation ID 查阅排障步骤；需要提交问题时运行 `self-host diagnostics`，人工检查工件后再上传。",
    "",
  ];
  for (const group of GROUPS) {
    lines.push(`## ${CATEGORY_TITLES[group.category]}`, "");
    lines.push(
      "<!-- prettier-ignore -->",
      "| code | 默认 exit | 可直接重试 | remediation ID |",
      "| --- | ---: | :---: | --- |",
    );
    for (const code of group.codes) {
      const entry = BY_CODE.get(code);
      lines.push(
        `| \`${code}\` | ${entry.defaultExitCode} | ${entry.retryable ? "是" : "否"} | \`${entry.remediationId}\` |`,
      );
    }
    lines.push("");
  }
  lines.push(
    "## 使用约束",
    "",
    "- `defaultExitCode` 是该错误的默认分类；最终调用以结果 envelope 中的 `exitCode` 为准。",
    "- `retryable=true` 只表示在修复同一外部条件后可重跑同一命令，不授权扩大操作范围、覆盖数据或跳过验证。",
    "- `warning` 不会单独令 CLI 失败，但必须在公网暴露、备份或升级前处理。",
    "- `SELF_HOST_INTERNAL_ERROR` 表示未分类缺陷；不要盲目循环重试，应生成 diagnostics 并报告。",
    "- 新增任何可返回的错误码时，必须先加入机器目录；测试会拒绝未登记的 management error/warning。",
    "",
  );
  return lines.join("\n");
}
