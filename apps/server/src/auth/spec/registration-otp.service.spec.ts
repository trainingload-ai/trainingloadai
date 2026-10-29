import { describe, expect, it, jest } from '@jest/globals';
import { RegistrationOtpService } from '../registration-otp.service';

function harness(value: string | null) {
  const verification = value
    ? {
        id: 'verification-1',
        identifier: 'email-verification-otp-runner@example.com',
        value,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    : null;
  const tx = {
    $queryRaw: jest
      .fn<() => Promise<Array<{ lockAcquired: boolean }>>>()
      .mockResolvedValue([{ lockAcquired: true }]),
    t_user_verifications: {
      findFirst: jest
        .fn<() => Promise<typeof verification>>()
        .mockResolvedValue(verification),
      deleteMany: jest
        .fn<() => Promise<{ count: number }>>()
        .mockResolvedValue({ count: 1 }),
      update: jest
        .fn<() => Promise<typeof verification>>()
        .mockResolvedValue(verification),
    },
  };
  const prisma = {
    $transaction: jest.fn((callback: (value: typeof tx) => unknown) => callback(tx)),
  };
  return { service: new RegistrationOtpService(prisma as never), tx };
}

describe('RegistrationOtpService', () => {
  it('第一次错误原子递增，保留 OTP', async () => {
    const { service, tx } = harness('123456:0');
    await expect(service.consume('runner@example.com', '000000')).resolves.toBe(
      'invalid',
    );
    expect(tx.t_user_verifications.update).toHaveBeenCalledWith({
      where: { id: 'verification-1' },
      data: { value: '123456:1' },
    });
  });

  it('第三次错误立即删除 OTP', async () => {
    const { service, tx } = harness('123456:2');
    await expect(service.consume('runner@example.com', '000000')).resolves.toBe(
      'exhausted',
    );
    expect(tx.t_user_verifications.deleteMany).toHaveBeenCalled();
    expect(tx.t_user_verifications.update).not.toHaveBeenCalled();
  });

  it('正确 OTP 在返回成功前被一次性删除', async () => {
    const { service, tx } = harness('123456:1');
    await expect(service.consume('runner@example.com', '123456')).resolves.toBe(
      'valid',
    );
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.t_user_verifications.deleteMany).toHaveBeenCalled();
  });

  it('不存在或已消费 OTP 时失败', async () => {
    const { service } = harness(null);
    await expect(service.consume('runner@example.com', '123456')).resolves.toBe(
      'missing',
    );
  });
});
