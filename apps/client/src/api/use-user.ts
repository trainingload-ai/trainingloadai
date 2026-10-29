import { apiFetch } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";

export type ChangeNewUserStatusResponse = {
  isNewUser: boolean;
  [deploymentField: string]: unknown;
};

export const getIsNewUser = async () => {
  const url = "/users/is-new-user";
  const result = await apiFetch<boolean>(url);
  if (typeof result !== "boolean") {
    throw new Error("INVALID_IS_NEW_USER_RESPONSE");
  }
  return result;
};

const fetchChangeIsNewUser = async (isNewUser: boolean) => {
  const url = "/users/set-new-user-status";
  return apiFetch<ChangeNewUserStatusResponse>(url, {
    method: "POST",
    body: JSON.stringify({ isNewUser }),
  });
};

export const useIsNewUser = (enabled = true) => {
  return useQuery({
    queryKey: queryKeys.user.isNewUser(),
    queryFn: () => getIsNewUser(),
    enabled,
  });
};

export const useChangeIsNewUser = (isNewUser: boolean) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["changeIsNewUser"],
    mutationFn: () => fetchChangeIsNewUser(isNewUser),
    onSuccess: () => {
      // Refetch isNewUser after successful update
      queryClient.invalidateQueries({ queryKey: queryKeys.user.isNewUser() });
    },
  });
};
