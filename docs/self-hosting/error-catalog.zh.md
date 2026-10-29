# Self-host 稳定错误码目录

> 此文件由 `scripts/selfhost/error-catalog.mjs` 的机器目录生成。错误码是自动化契约；英文 message 只用于人工阅读，不能作为判断条件。

结构化调用方应读取 `ok`、`exitCode`、`error.code` 与 `doctor.checks[].errorCode`。先按 remediation ID 查阅排障步骤；需要提交问题时运行 `self-host diagnostics`，人工检查工件后再上传。

## usage

<!-- prettier-ignore -->
| code | 默认 exit | 可直接重试 | remediation ID |
| --- | ---: | :---: | --- |
| `SELF_HOST_OWNER_BOOTSTRAP_STDIN_REQUIRED` | 2 | 否 | `fix-command-invocation` |
| `SELF_HOST_OWNER_RECOVERY_STDIN_REQUIRED` | 2 | 否 | `fix-command-invocation` |
| `SELF_HOST_USAGE_INVALID` | 2 | 否 | `fix-command-invocation` |

## configuration

<!-- prettier-ignore -->
| code | 默认 exit | 可直接重试 | remediation ID |
| --- | ---: | :---: | --- |
| `SELF_HOST_BACKUP_PATH_INVALID` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_BIND_ORIGIN_MISMATCH` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_BUNDLE_INCOMPLETE` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_COMPOSE_CONFIG_INVALID` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_CONFIG_DUPLICATE_KEY` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_CONFIG_IMAGE_INVALID` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_CONFIG_INVALID` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_CONFIG_MUTABLE_IMAGE` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_CONFIG_PATH_UNSAFE` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_CONFIG_PERMISSIONS_INSECURE` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_CONFIG_SECRET_INVALID` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_CONFIG_SYNTAX_INVALID` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_CONFIG_TOO_LARGE` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_DATA_ROOT_UNSAFE` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_DIAGNOSTICS_PATH_INVALID` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_INSTALL_BUNDLE_INVALID` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_INSTANCE_DIRECTORY_INVALID` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_NOT_INITIALIZED` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_BOOTSTRAP_EMAIL_IN_USE` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_BOOTSTRAP_INPUT_INVALID` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_BOOTSTRAP_PASSWORD_TOO_LARGE` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_BOOTSTRAP_TOKEN_EXPIRED` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_BOOTSTRAP_TOKEN_INVALID` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_OWNER_MISMATCH` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_PUBLIC_HTTP_BLOCKED` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_RECOVERY_PASSWORD_INVALID` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_RECOVERY_PASSWORD_TOO_LARGE` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_SOURCE_BUNDLE_INCOMPLETE` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_UNINSTALL_CONFIRMATION_INVALID` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_UNINSTALL_DATA_ROOT_UNVERIFIED` | 3 | 否 | `repair-configuration` |
| `SELF_HOST_UPGRADE_CONFIG_INVALID` | 3 | 否 | `repair-configuration` |

## prerequisite

<!-- prettier-ignore -->
| code | 默认 exit | 可直接重试 | remediation ID |
| --- | ---: | :---: | --- |
| `SELF_HOST_COMPOSE_UNAVAILABLE` | 4 | 是 | `install-host-prerequisites` |
| `SELF_HOST_COSIGN_UNAVAILABLE` | 4 | 否 | `install-host-prerequisites` |
| `SELF_HOST_DOCKER_PLATFORM_UNSUPPORTED` | 4 | 是 | `install-host-prerequisites` |
| `SELF_HOST_DOCKER_UNAVAILABLE` | 4 | 是 | `install-host-prerequisites` |
| `SELF_HOST_HOST_PLATFORM_UNSUPPORTED` | 4 | 否 | `install-host-prerequisites` |
| `SELF_HOST_INSTALL_NODE_UNSUPPORTED` | 4 | 否 | `install-host-prerequisites` |

## runtime

<!-- prettier-ignore -->
| code | 默认 exit | 可直接重试 | remediation ID |
| --- | ---: | :---: | --- |
| `SELF_HOST_DOCKER_INFO_FAILED` | 5 | 否 | `inspect-runtime-failure` |
| `SELF_HOST_LOGS_FAILED` | 5 | 否 | `inspect-runtime-failure` |
| `SELF_HOST_OWNER_BOOTSTRAP_FAILED` | 5 | 否 | `inspect-runtime-failure` |
| `SELF_HOST_OWNER_BOOTSTRAP_RESPONSE_INVALID` | 5 | 否 | `inspect-runtime-failure` |
| `SELF_HOST_OWNER_RECOVERY_FAILED` | 5 | 否 | `inspect-runtime-failure` |
| `SELF_HOST_OWNER_RECOVERY_RESPONSE_INVALID` | 5 | 否 | `inspect-runtime-failure` |
| `SELF_HOST_START_FAILED` | 5 | 是 | `inspect-runtime-failure` |
| `SELF_HOST_STATUS_FAILED` | 5 | 否 | `inspect-runtime-failure` |
| `SELF_HOST_STATUS_INVALID` | 5 | 否 | `inspect-runtime-failure` |
| `SELF_HOST_STOP_FAILED` | 5 | 是 | `inspect-runtime-failure` |
| `SELF_HOST_UNINSTALL_FAILED` | 5 | 是 | `inspect-runtime-failure` |

## backup

<!-- prettier-ignore -->
| code | 默认 exit | 可直接重试 | remediation ID |
| --- | ---: | :---: | --- |
| `SELF_HOST_BACKUP_AND_RESUME_FAILED` | 5 | 否 | `repair-backup-failure` |
| `SELF_HOST_BACKUP_DATABASE_DUMP_FAILED` | 5 | 否 | `repair-backup-failure` |
| `SELF_HOST_BACKUP_DATABASE_DUMP_INVALID` | 5 | 否 | `repair-backup-failure` |
| `SELF_HOST_BACKUP_DATABASE_INSPECTION_FAILED` | 5 | 否 | `repair-backup-failure` |
| `SELF_HOST_BACKUP_DATABASE_INSPECTION_INVALID` | 5 | 否 | `repair-backup-failure` |
| `SELF_HOST_BACKUP_DISK_SPACE_INSUFFICIENT` | 5 | 否 | `repair-backup-failure` |
| `SELF_HOST_BACKUP_MIGRATION_STATE_INVALID` | 5 | 否 | `repair-backup-failure` |
| `SELF_HOST_BACKUP_QUIESCE_FAILED` | 5 | 否 | `repair-backup-failure` |
| `SELF_HOST_BACKUP_REQUIRES_READY_INSTANCE` | 5 | 否 | `repair-backup-failure` |
| `SELF_HOST_BACKUP_RESUME_FAILED` | 5 | 是 | `repair-backup-failure` |
| `SELF_HOST_BACKUP_RESUME_NOT_READY` | 5 | 是 | `repair-backup-failure` |
| `SELF_HOST_BACKUP_SIZE_INVALID` | 5 | 否 | `repair-backup-failure` |
| `SELF_HOST_BACKUP_UPLOAD_COPY_FAILED` | 5 | 否 | `repair-backup-failure` |
| `SELF_HOST_BACKUP_UPLOAD_INSPECTION_FAILED` | 5 | 否 | `repair-backup-failure` |
| `SELF_HOST_BACKUP_UPLOAD_INSPECTION_INVALID` | 5 | 否 | `repair-backup-failure` |
| `SELF_HOST_BACKUP_VERIFICATION_FAILED` | 5 | 否 | `repair-backup-failure` |

## restore

<!-- prettier-ignore -->
| code | 默认 exit | 可直接重试 | remediation ID |
| --- | ---: | :---: | --- |
| `SELF_HOST_RESTORE_DATABASE_FAILED` | 5 | 否 | `repair-restore-failure` |
| `SELF_HOST_RESTORE_DATABASE_START_FAILED` | 5 | 是 | `repair-restore-failure` |
| `SELF_HOST_RESTORE_DATABASE_VERIFICATION_FAILED` | 5 | 否 | `repair-restore-failure` |
| `SELF_HOST_RESTORE_DISK_SPACE_INSUFFICIENT` | 5 | 否 | `repair-restore-failure` |
| `SELF_HOST_RESTORE_POST_START_VERIFICATION_FAILED` | 5 | 否 | `repair-restore-failure` |
| `SELF_HOST_RESTORE_SIZE_INVALID` | 5 | 否 | `repair-restore-failure` |
| `SELF_HOST_RESTORE_SNAPSHOT_FAILED` | 5 | 否 | `repair-restore-failure` |
| `SELF_HOST_RESTORE_START_FAILED` | 5 | 是 | `repair-restore-failure` |
| `SELF_HOST_RESTORE_TARGET_NOT_CLEAN` | 5 | 否 | `repair-restore-failure` |
| `SELF_HOST_RESTORE_UPLOAD_COPY_FAILED` | 5 | 否 | `repair-restore-failure` |
| `SELF_HOST_RESTORE_VERSION_INCOMPATIBLE` | 5 | 否 | `repair-restore-failure` |

## upgrade

<!-- prettier-ignore -->
| code | 默认 exit | 可直接重试 | remediation ID |
| --- | ---: | :---: | --- |
| `SELF_HOST_UPGRADE_DISK_SPACE_INSUFFICIENT` | 5 | 否 | `repair-upgrade-failure` |
| `SELF_HOST_UPGRADE_IMAGE_PULL_FAILED` | 5 | 否 | `repair-upgrade-failure` |
| `SELF_HOST_UPGRADE_IMAGE_VERIFY_FAILED` | 5 | 否 | `repair-upgrade-failure` |
| `SELF_HOST_UPGRADE_INCOMPATIBLE` | 5 | 否 | `repair-upgrade-failure` |
| `SELF_HOST_UPGRADE_MIGRATION_VERIFICATION_FAILED` | 5 | 否 | `repair-upgrade-failure` |
| `SELF_HOST_UPGRADE_RELEASE_INVALID` | 5 | 否 | `repair-upgrade-failure` |
| `SELF_HOST_UPGRADE_REQUIRES_READY_INSTANCE` | 5 | 否 | `repair-upgrade-failure` |
| `SELF_HOST_UPGRADE_SIGNATURE_INVALID` | 5 | 否 | `repair-upgrade-failure` |
| `SELF_HOST_UPGRADE_SIZE_INVALID` | 5 | 否 | `repair-upgrade-failure` |
| `SELF_HOST_UPGRADE_START_FAILED` | 5 | 是 | `repair-upgrade-failure` |
| `SELF_HOST_UPGRADE_STATE_INVALID` | 5 | 否 | `repair-upgrade-failure` |

## rollback

<!-- prettier-ignore -->
| code | 默认 exit | 可直接重试 | remediation ID |
| --- | ---: | :---: | --- |
| `SELF_HOST_ROLLBACK_DATABASE_CHANGED` | 5 | 否 | `repair-rollback-failure` |
| `SELF_HOST_ROLLBACK_DATABASE_INCOMPATIBLE` | 5 | 否 | `repair-rollback-failure` |
| `SELF_HOST_ROLLBACK_IMAGE_MISSING` | 5 | 否 | `repair-rollback-failure` |
| `SELF_HOST_ROLLBACK_SOURCE_NOT_FOUND` | 5 | 否 | `repair-rollback-failure` |
| `SELF_HOST_ROLLBACK_START_FAILED` | 5 | 是 | `repair-rollback-failure` |
| `SELF_HOST_ROLLBACK_STATE_INVALID` | 5 | 否 | `repair-rollback-failure` |
| `SELF_HOST_ROLLBACK_UNSUPPORTED` | 5 | 否 | `repair-rollback-failure` |

## diagnostics

<!-- prettier-ignore -->
| code | 默认 exit | 可直接重试 | remediation ID |
| --- | ---: | :---: | --- |
| `SELF_HOST_DIAGNOSTICS_SECRET_SCAN_FAILED` | 5 | 否 | `repair-diagnostics-failure` |

## state-conflict

<!-- prettier-ignore -->
| code | 默认 exit | 可直接重试 | remediation ID |
| --- | ---: | :---: | --- |
| `SELF_HOST_BACKUP_ALREADY_EXISTS` | 6 | 否 | `resolve-lifecycle-conflict` |
| `SELF_HOST_DIAGNOSTICS_EXISTS` | 6 | 否 | `resolve-lifecycle-conflict` |
| `SELF_HOST_INIT_CONFLICT` | 6 | 是 | `resolve-lifecycle-conflict` |
| `SELF_HOST_OPERATION_IN_PROGRESS` | 6 | 是 | `resolve-lifecycle-conflict` |
| `SELF_HOST_ALREADY_INITIALIZED` | 6 | 否 | `resolve-lifecycle-conflict` |
| `SELF_HOST_RESTORE_INCOMPLETE` | 6 | 否 | `resolve-lifecycle-conflict` |
| `SELF_HOST_RESTORE_TARGET_NOT_EMPTY` | 6 | 否 | `resolve-lifecycle-conflict` |
| `SELF_HOST_UNINSTALL_DATA_ROOT_CHANGED` | 6 | 否 | `resolve-lifecycle-conflict` |
| `SELF_HOST_UPGRADE_INCOMPLETE` | 6 | 否 | `resolve-lifecycle-conflict` |

## filesystem

<!-- prettier-ignore -->
| code | 默认 exit | 可直接重试 | remediation ID |
| --- | ---: | :---: | --- |
| `SELF_HOST_BACKUP_CLEANUP_FAILED` | 7 | 否 | `repair-filesystem-state` |
| `SELF_HOST_CONFIG_SNAPSHOT_CLEANUP_FAILED` | 7 | 否 | `repair-filesystem-state` |
| `SELF_HOST_CONFIG_SNAPSHOT_FAILED` | 7 | 否 | `repair-filesystem-state` |
| `SELF_HOST_DATA_PATH_UNSAFE` | 7 | 否 | `repair-filesystem-state` |
| `SELF_HOST_DATA_ROOT_MARKER_INVALID` | 7 | 否 | `repair-filesystem-state` |
| `SELF_HOST_DATA_ROOT_NOT_DEDICATED` | 7 | 否 | `repair-filesystem-state` |
| `SELF_HOST_DIAGNOSTICS_CLEANUP_FAILED` | 7 | 否 | `repair-filesystem-state` |
| `SELF_HOST_DIAGNOSTICS_VERIFY_FAILED` | 7 | 否 | `repair-filesystem-state` |
| `SELF_HOST_DIAGNOSTICS_WRITE_FAILED` | 7 | 否 | `repair-filesystem-state` |
| `SELF_HOST_FILESYSTEM_ERROR` | 7 | 否 | `repair-filesystem-state` |
| `SELF_HOST_LIFECYCLE_MARKER_CLEAR_FAILED` | 7 | 否 | `repair-filesystem-state` |
| `SELF_HOST_OPERATION_LOCK_INVALID` | 7 | 否 | `repair-filesystem-state` |
| `SELF_HOST_OPERATION_LOCK_RELEASE_FAILED` | 7 | 否 | `repair-filesystem-state` |
| `SELF_HOST_OPERATION_RECORD_FAILED` | 7 | 否 | `repair-filesystem-state` |
| `SELF_HOST_RELEASE_STATE_INVALID` | 7 | 否 | `repair-filesystem-state` |
| `SELF_HOST_RESTORE_REPORT_FAILED` | 7 | 否 | `repair-filesystem-state` |
| `SELF_HOST_RESTORE_SNAPSHOT_CLEANUP_FAILED` | 7 | 否 | `repair-filesystem-state` |
| `SELF_HOST_UNINSTALL_DATA_DELETE_FAILED` | 7 | 否 | `repair-filesystem-state` |
| `SELF_HOST_UPGRADE_REPORT_FAILED` | 7 | 否 | `repair-filesystem-state` |

## health

<!-- prettier-ignore -->
| code | 默认 exit | 可直接重试 | remediation ID |
| --- | ---: | :---: | --- |
| `SELF_HOST_NOT_READY` | 8 | 是 | `restore-service-health` |
| `SELF_HOST_BOOTSTRAP_TOKEN_FILE_MISSING` | 8 | 否 | `restore-service-health` |
| `SELF_HOST_OWNER_MISSING` | 8 | 否 | `restore-service-health` |
| `SELF_HOST_RESTORE_NOT_READY` | 8 | 是 | `restore-service-health` |
| `SELF_HOST_ROLLBACK_NOT_READY` | 8 | 是 | `restore-service-health` |
| `SELF_HOST_STOP_INCOMPLETE` | 8 | 否 | `restore-service-health` |
| `SELF_HOST_UNINSTALL_INCOMPLETE` | 8 | 否 | `restore-service-health` |
| `SELF_HOST_UPGRADE_NOT_READY` | 8 | 是 | `restore-service-health` |

## doctor

<!-- prettier-ignore -->
| code | 默认 exit | 可直接重试 | remediation ID |
| --- | ---: | :---: | --- |
| `SELF_HOST_DOCTOR_CAPABILITY_FAILED` | 8 | 否 | `follow-doctor-remediation` |
| `SELF_HOST_DOCTOR_DATABASE_FAILED` | 8 | 否 | `follow-doctor-remediation` |
| `SELF_HOST_DOCTOR_DISK_INSUFFICIENT` | 8 | 否 | `follow-doctor-remediation` |
| `SELF_HOST_DOCTOR_DNS_FAILED` | 8 | 否 | `follow-doctor-remediation` |
| `SELF_HOST_DOCTOR_FAILED` | 8 | 否 | `follow-doctor-remediation` |
| `SELF_HOST_DOCTOR_GATEWAY_RESPONSE_INVALID` | 8 | 否 | `follow-doctor-remediation` |
| `SELF_HOST_DOCTOR_GATEWAY_UNREACHABLE` | 8 | 否 | `follow-doctor-remediation` |
| `SELF_HOST_DOCTOR_HISTORY_LIMIT_EXCEEDED` | 8 | 否 | `follow-doctor-remediation` |
| `SELF_HOST_DOCTOR_INODES_INSUFFICIENT` | 8 | 否 | `follow-doctor-remediation` |
| `SELF_HOST_DOCTOR_LOCAL_DEM_INVALID` | 8 | 否 | `follow-doctor-remediation` |
| `SELF_HOST_DOCTOR_OWNER_MISSING` | 8 | 否 | `follow-doctor-remediation` |
| `SELF_HOST_DOCTOR_PROVIDER_UNREACHABLE` | 8 | 否 | `follow-doctor-remediation` |
| `SELF_HOST_DOCTOR_TLS_FAILED` | 8 | 否 | `follow-doctor-remediation` |

## warning

<!-- prettier-ignore -->
| code | 默认 exit | 可直接重试 | remediation ID |
| --- | ---: | :---: | --- |
| `SELF_HOST_INSECURE_LAN_HTTP` | 0 | 否 | `review-security-warning` |
| `SELF_HOST_INSECURE_PUBLIC_HTTP` | 0 | 否 | `review-security-warning` |

## internal

<!-- prettier-ignore -->
| code | 默认 exit | 可直接重试 | remediation ID |
| --- | ---: | :---: | --- |
| `SELF_HOST_INTERNAL_ERROR` | 10 | 否 | `collect-diagnostics-and-report` |

## 使用约束

- `defaultExitCode` 是该错误的默认分类；最终调用以结果 envelope 中的 `exitCode` 为准。
- `retryable=true` 只表示在修复同一外部条件后可重跑同一命令，不授权扩大操作范围、覆盖数据或跳过验证。
- `warning` 不会单独令 CLI 失败，但必须在公网暴露、备份或升级前处理。
- `SELF_HOST_INTERNAL_ERROR` 表示未分类缺陷；不要盲目循环重试，应生成 diagnostics 并报告。
- 新增任何可返回的错误码时，必须先加入机器目录；测试会拒绝未登记的 management error/warning。
