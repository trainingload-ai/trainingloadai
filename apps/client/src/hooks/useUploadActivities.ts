import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadActivities, ImportBatchSummary } from "@/api/activities";

interface UseUploadActivitiesOptions {
  onSuccess?: (data: ImportBatchSummary, files: File[]) => void;
  onError?: (error: Error) => void;
}

export function useUploadActivities(options: UseUploadActivitiesOptions = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: uploadActivities,
    onSuccess: (data, files) => {
      queryClient.setQueryData(["import-batch", data.id], data);
      options.onSuccess?.(data, files);
    },
    onError: (error) => {
      options.onError?.(
        error instanceof Error ? error : new Error("Unknown error"),
      );
    },
  });
}
