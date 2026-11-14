import type { CoachUpstreamProvider } from '@/api/ai/core/coach-upstream.adapter';

/** AI data consent state, separate from setting categories and task skip reasons. */
export enum AiDataConsentState {
  /** No AI provider is configured; this does not indicate refusal or an upstream outage. */
  UNAVAILABLE = 'UNAVAILABLE',
  /** A provider is configured, but no valid user decision has been recorded. */
  UNDECIDED = 'UNDECIDED',
  /** Consent matches the current version/provider; Self-host uses Owner configuration. */
  GRANTED = 'GRANTED',
  /** The user explicitly declined AI data processing; do not prompt again automatically. */
  DECLINED = 'DECLINED',
  /** A previous grant no longer matches the consent version or configured provider. */
  RECONSENT_REQUIRED = 'RECONSENT_REQUIRED',
}

export type AiDataConsentStatus = {
  /** Current consent decision or the reason a valid grant is unavailable. */
  state: AiDataConsentState;
  /** Whether processing is permitted for the current provider and consent version. */
  granted: boolean;
  /** True only for UNDECIDED and RECONSENT_REQUIRED. */
  promptRequired: boolean;
  /** @deprecated Use promptRequired. Kept temporarily for older clients. */
  required: boolean;
  /** Consent version currently required by the application. */
  version: string;
  /** Configured AI provider, or null when none is configured. */
  provider: CoachUpstreamProvider | null;
  /** Human-readable name of the data recipient disclosed to the user. */
  recipient: string;
  /** Last decision in ISO format; null for absent decisions or instance-level configuration. */
  decidedAt: string | null;
};
