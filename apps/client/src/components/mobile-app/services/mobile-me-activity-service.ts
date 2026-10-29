import { deleteActivity } from "@/api/activity";
import type { V2ActivityListItem } from "@/api/v2-activities";

export async function deleteMobileMeActivity(
  activity: V2ActivityListItem,
) {
  const deleted = await deleteActivity(
    activity.hashId || String(activity.id),
  );
  if (!deleted) {
    throw new Error("Activity deletion was not confirmed");
  }
}
