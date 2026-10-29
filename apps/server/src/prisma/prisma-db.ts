import type { Prisma } from '@prisma/client';
import type { PrismaService } from './prisma.service';

/** `$transaction` 回调里的客户端 */
export type PrismaTx = Prisma.TransactionClient;

/**
 * 只取用到的 model。兼容：
 * - 完整 PrismaService
 * - `$transaction` 的 TransactionClient
 * - 生产里传入的 `Pick<PrismaService, 'storageObjectGarbage'>` 切片
 *
 * 返回值收成单一 Pick，避免 `PrismaService | TransactionClient` 并集把
 * findMany 泛型拆烂，从而又退回 `any`。
 */
export type PrismaModelClient<K extends keyof PrismaService> = Pick<
  PrismaService,
  K
>;

export type PrismaClientSlice<K extends keyof PrismaService> =
  | PrismaModelClient<K>
  | PrismaTx;

export function prismaModel<K extends keyof PrismaService>(
  prisma: PrismaService,
  tx?: PrismaClientSlice<K>,
): PrismaModelClient<K> {
  return (tx ?? prisma) as PrismaModelClient<K>;
}
