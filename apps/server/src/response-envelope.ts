import { SetMetadata } from '@nestjs/common';

export const RAW_RESPONSE_METADATA = Symbol('raw-response');

export const RawResponse = () => SetMetadata(RAW_RESPONSE_METADATA, true);
