"use client";

import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth";
import { queryKeys } from "@/lib/query-keys";
import { usePublicDemo } from "@/public-demo/public-demo-provider";

export type AuthAccount = {
  id: string;
  providerId: string;
  provider?: string;
  createdAt: Date;
  updatedAt: Date;
  accountId: string;
  scopes: string[];
};

/**
 * 获取用户已绑定的第三方账号列表
 * @returns {AuthAccount[]} 用户已绑定的第三方账号列表
 * @description 用户已绑定的第三方账号列表
 * @example
 * const { data: accounts } = useAuthAccounts();
 * console.log(accounts);
 */
export function useAuthAccounts(enabled = true) {
  const publicDemo = usePublicDemo();
  return useQuery({
    queryKey: queryKeys.me.accounts(),
    queryFn: async () => {
      if (publicDemo.active) return [];
      const res = await authClient.listAccounts();
      const rows = (res?.data ?? []) as Array<
        Partial<AuthAccount> & Record<string, unknown>
      >;
      return rows.map((row) => {
        const providerId =
          typeof row.providerId === "string" && row.providerId
            ? row.providerId
            : typeof row.provider === "string"
              ? row.provider
              : "";
        return {
          ...(row as AuthAccount),
          providerId,
        };
      });
    },
    enabled: enabled && !publicDemo.loading,
  });
}
