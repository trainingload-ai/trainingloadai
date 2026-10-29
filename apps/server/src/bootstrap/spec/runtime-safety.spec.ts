import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from '@jest/globals';
import { IsInt, IsString } from 'class-validator';

import { createGlobalValidationPipe } from '../runtime-safety';

class RequestDto {
  @IsString()
  name: string;

  @IsInt()
  count: number;
}

const metadata = {
  type: 'body' as const,
  metatype: RequestDto,
  data: '',
};

describe('global validation pipe', () => {
  it('transforms a valid payload into its DTO class', async () => {
    const result = await createGlobalValidationPipe().transform(
      { name: 'run', count: 2 },
      metadata,
    );

    expect(result).toBeInstanceOf(RequestDto);
  });

  it('rejects invalid payloads before they reach a controller', async () => {
    await expect(
      createGlobalValidationPipe().transform(
        { name: 123, count: 'not-an-integer' },
        metadata,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
