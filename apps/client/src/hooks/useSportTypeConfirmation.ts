import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ActivitySportTypeItem,
  setActivitiesSportType,
  SetActivitiesSportTypeRequest,
} from "@/api/activities";
import { queryKeys } from "@/lib/query-keys";

interface UseSportTypeConfirmationOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function useSportTypeConfirmation(
  options: UseSportTypeConfirmationOptions = {}
) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [pendingActivities, setPendingActivities] = useState<
    ActivitySportTypeItem[]
  >([]);
  const queryClient = useQueryClient();

  // Mutation for setting sport type
  const setSportTypeMutation = useMutation({
    mutationFn: (request: SetActivitiesSportTypeRequest) =>
      setActivitiesSportType(request),
    onSuccess: () => {
      // toast.success("Sport type set successfully");
      queryClient.invalidateQueries({ queryKey: queryKeys.root.activities });
      setIsDialogOpen(false);
      setPendingActivities([]);
      options.onSuccess?.();
    },
    onError: (error: Error) => {
      // toast.error("Failed to set sport type: " + error.message);
      options.onError?.(error);
    },
  });

  // Handle sport type confirmation after upload success
  const handleUploadSuccess = useCallback(
    (uploadResults: ActivitySportTypeItem[]) => {
      // Check if there are sport types that need confirmation (UNKNOWN type)
      const hasUnknownTypes = uploadResults.some(
        (activity) => activity.sportType === "UNKNOWN"
      );
      if (hasUnknownTypes) {
        // Unknown type exists, show confirmation dialog
        setPendingActivities(uploadResults);
        setIsDialogOpen(true);
      }
    },
    []
  );

  // Confirm setting sport types
  const handleConfirmSportTypes = useCallback(
    (activities: ActivitySportTypeItem[]) => {
      setSportTypeMutation.mutate({
        activities,
        enableSmartInfer: true,
      });
    },
    [setSportTypeMutation]
  );

  // Skip setting sport types
  const handleSkipSportTypes = useCallback(() => {
    setIsDialogOpen(false);
    setPendingActivities([]);
    options.onSuccess?.();
  }, [options]);

  // Close dialog
  const handleCloseDialog = useCallback(() => {
    setIsDialogOpen(false);
    setPendingActivities([]);
  }, []);

  return {
    // State
    isDialogOpen,
    pendingActivities,
    isLoading: setSportTypeMutation.isPending,

    // Methods
    handleUploadSuccess,
    handleConfirmSportTypes,
    handleSkipSportTypes,
    handleCloseDialog,
  };
}
