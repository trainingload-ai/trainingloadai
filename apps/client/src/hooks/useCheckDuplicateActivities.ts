import { useMutation } from "@tanstack/react-query";
import { checkDuplicateActivities, CheckDuplicateActivitiesResponse } from "@/api/activities";

interface UseCheckDuplicateActivitiesOptions {
  onSuccess?: (data: CheckDuplicateActivitiesResponse, files: File[]) => void;
  onError?: (error: Error) => void;
}

export function useCheckDuplicateActivities(options: UseCheckDuplicateActivitiesOptions = {}) {
  return useMutation({
    mutationFn: checkDuplicateActivities,
    onSuccess: (data, files) => {
      // Call custom success callback
      options.onSuccess?.(data, files);
    },
    onError: (error) => {
      // Call custom error callback
      options.onError?.(error instanceof Error ? error : new Error("Unknown error"));
    },
  });
}