import { SetMetadata } from '@nestjs/common';

export const SESSION_ONLY_METADATA = 'SESSION_ONLY';

/** Require a real Better Auth browser session and never fall back to OAuth bearer auth. */
export const SessionOnly = () => SetMetadata(SESSION_ONLY_METADATA, true);
