import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';

import type {
  AiOperation,
  AiOperationLedger,
} from './ai-operation-ledger.port';
import { AiOperationsController } from './ai-operations.controller';

describe('AiOperationsController', () => {
  it('returns a neutral operation result', async () => {
    const operation = {
      id: 'operation-1',
      userId: 'user-1',
      idempotencyKey: 'request-1',
      kind: 'COACH_CHAT',
      status: 'COMPLETED',
      purpose: 'DEFAULT',
      actualPurposes: ['DEFAULT'],
      completedAt: new Date('2026-10-22T00:00:00.000Z'),
      resultRef: { messageId: 'message-1' },
      errorCode: null,
      metadata: null,
      heartbeatAt: new Date('2026-10-22T00:00:00.000Z'),
      expiresAt: new Date('2026-10-23T00:00:00.000Z'),
    } as AiOperation;
    const operations = {
      get: jest
        .fn<AiOperationLedger['get']>()
        .mockResolvedValue(operation),
    } as unknown as AiOperationLedger;

    await expect(
      new AiOperationsController(operations).operation('user-1', 'operation-1'),
    ).resolves.toEqual({
      operationId: 'operation-1',
      status: 'COMPLETED',
      purpose: 'DEFAULT',
      replayed: false,
      pending: false,
      recovery: { messageId: 'message-1' },
      completedAt: '2026-10-22T00:00:00.000Z',
      errorCode: null,
    });
    expect(operations.get).toHaveBeenCalledWith('user-1', 'operation-1');
  });

  it('does not leak whether another user owns an operation', async () => {
    const operations = {
      get: jest.fn<AiOperationLedger['get']>().mockResolvedValue(null),
    } as unknown as AiOperationLedger;

    await expect(
      new AiOperationsController(operations).operation('user-2', 'operation-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
