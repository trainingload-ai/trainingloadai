"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  Check,
} from "lucide-react";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
} from "@/components/ui/adaptive-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { fetchActivities, Activity, ActivityFilters } from "@/api/activities";
import { queryKeys } from "@/lib/query-keys";
import { calibrateVo2max } from "@/api/settings";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { getSportDisplayName, useSportCatalog } from "@/api/sports";
import { getLocalizedActivityTitle } from "@/lib/activity-title";

interface ActivitySelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (factor: number) => void;
}

export function ActivitySelectorModal({
  open,
  onOpenChange,
  onSuccess,
}: ActivitySelectorModalProps) {
  const t = useTranslations("UserProfile");
  const tSports = useTranslations("SportCatalog");
  const tActivityTitle = useTranslations("ActivityTitle");
  const isMobile = useIsMobile();
  const [page, setPage] = useState(1);
  const [calibratingId, setCalibratingId] = useState<string | null>(null);
  const [sportTypeOpen, setSportTypeOpen] = useState(false);
  const { data: sportCatalog = [] } = useSportCatalog();

  const [tempFilters, setTempFilters] = useState<ActivityFilters>({
    sportType: "RUN",
    startDate: "",
    endDate: "",
    search: "",
    minDuration: undefined,
    maxDuration: undefined,
    minDistance: undefined,
    maxDistance: undefined,
    forcePagination: true,
  });

  const [filters, setFilters] = useState<ActivityFilters>(tempFilters);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.calibration.activitySelector(page, filters),
    queryFn: () => fetchActivities(page, filters, "startTime", "desc"),
    enabled: open,
  });

  const handleSearch = () => {
    setFilters(tempFilters);
    setPage(1);
  };

  const handleTempFilterChange = <K extends keyof ActivityFilters>(
    key: K,
    value: ActivityFilters[K],
  ) => {
    setTempFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleCalibrate = async (activity: Activity) => {
    if (!activity.hashId) return;
    try {
      setCalibratingId(activity.hashId);
      const newFactor = await calibrateVo2max(activity.hashId);
      toast.success(t("calibrateSuccess"));
      onSuccess(newFactor ?? 1);
      onOpenChange(false);
    } catch (error) {
      console.error("Calibration failed:", error);
      toast.error(t("calibrateError"));
    } finally {
      setCalibratingId(null);
    }
  };

  const activities = data?.activities || [];

  const sportTypeValue = tempFilters.sportType || "all";
  const sportTypeLabel =
    sportTypeValue === "RUN"
      ? t("activitySelector.filters.sportTypeOptions.run")
      : sportTypeValue === "CYCLING"
        ? t("activitySelector.filters.sportTypeOptions.cycling")
        : t("activitySelector.filters.sportTypeOptions.all");

  return (
    <AdaptiveDialog open={open} onOpenChange={onOpenChange}>
      <AdaptiveDialogContent
        className="max-h-[85vh] flex flex-col"
        desktopClassName="sm:max-w-3xl"
      >
        <AdaptiveDialogHeader>
          <AdaptiveDialogTitle>{t("calibrateModal.title")}</AdaptiveDialogTitle>
          <AdaptiveDialogDescription>
            {t("calibrateModal.description")}
          </AdaptiveDialogDescription>
        </AdaptiveDialogHeader>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-4 rounded-md bg-muted/25 p-3">
          {/* Sport Type */}
          <div className="space-y-1 w-[140px]">
            <Label>{t("activitySelector.filters.sportType")}</Label>
            {isMobile ? (
              <AdaptiveDialog
                open={sportTypeOpen}
                onOpenChange={setSportTypeOpen}
              >
                <Button
                  type="button"
                  variant="outline"
                  size="default"
                  className="w-full justify-between"
                  onClick={() => setSportTypeOpen(true)}
                >
                  <span className="truncate">{sportTypeLabel}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Button>
                <AdaptiveDialogContent>
                  <AdaptiveDialogHeader>
                    <AdaptiveDialogTitle>
                      {t("activitySelector.filters.sportType")}
                    </AdaptiveDialogTitle>
                  </AdaptiveDialogHeader>
                  <div className="p-4 pt-0">
                    <Command>
                      <CommandList>
                        <CommandGroup>
                          {[
                            {
                              value: "RUN",
                              label: t(
                                "activitySelector.filters.sportTypeOptions.run",
                              ),
                            },
                            {
                              value: "CYCLING",
                              label: t(
                                "activitySelector.filters.sportTypeOptions.cycling",
                              ),
                            },
                            {
                              value: "all",
                              label: t(
                                "activitySelector.filters.sportTypeOptions.all",
                              ),
                            },
                          ].map((item) => (
                            <CommandItem
                              key={item.value}
                              value={item.value}
                              onSelect={() => {
                                handleTempFilterChange(
                                  "sportType",
                                  item.value === "all" ? "" : item.value,
                                );
                                setSportTypeOpen(false);
                              }}
                              className="flex items-center justify-between"
                            >
                              <span>{item.label}</span>
                              {sportTypeValue === item.value && (
                                <Check className="h-4 w-4" />
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </div>
                </AdaptiveDialogContent>
              </AdaptiveDialog>
            ) : (
              <Select
                value={sportTypeValue}
                onValueChange={(val) =>
                  handleTempFilterChange("sportType", val === "all" ? "" : val)
                }
              >
                <SelectTrigger size="default" className="bg-background">
                  <SelectValue
                    placeholder={t("activitySelector.filters.sportType")}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RUN">
                    {t("activitySelector.filters.sportTypeOptions.run")}
                  </SelectItem>
                  <SelectItem value="CYCLING">
                    {t("activitySelector.filters.sportTypeOptions.cycling")}
                  </SelectItem>
                  <SelectItem value="all">
                    {t("activitySelector.filters.sportTypeOptions.all")}
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Duration */}
          <div className="space-y-1">
            <Label>{t("activitySelector.filters.duration")}</Label>
            <div className="flex gap-2 w-[230px]">
              <Input
                type="number"
                placeholder={t("activitySelector.filters.placeholders.min")}
                min={0}
                className="bg-background"
                value={
                  tempFilters.minDuration ? tempFilters.minDuration / 60 : ""
                }
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (val < 0) return;
                  handleTempFilterChange(
                    "minDuration",
                    e.target.value ? val * 60 : undefined,
                  );
                }}
              />
              <Input
                type="number"
                placeholder={t("activitySelector.filters.placeholders.max")}
                min={0}
                className="bg-background"
                value={
                  tempFilters.maxDuration ? tempFilters.maxDuration / 60 : ""
                }
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (val < 0) return;
                  handleTempFilterChange(
                    "maxDuration",
                    e.target.value ? val * 60 : undefined,
                  );
                }}
              />
            </div>
          </div>

          {/* Distance */}
          <div className="space-y-1">
            <Label>{t("activitySelector.filters.distance")}</Label>
            <div className="flex gap-2 w-[230px]">
              <Input
                type="number"
                placeholder={t("activitySelector.filters.placeholders.min")}
                min={0}
                className="h-8 bg-background"
                value={
                  tempFilters.minDistance ? tempFilters.minDistance / 1000 : ""
                }
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (val < 0) return;
                  handleTempFilterChange(
                    "minDistance",
                    e.target.value ? val * 1000 : undefined,
                  );
                }}
              />
              <Input
                type="number"
                placeholder={t("activitySelector.filters.placeholders.max")}
                min={0}
                className="h-8 bg-background"
                value={
                  tempFilters.maxDistance ? tempFilters.maxDistance / 1000 : ""
                }
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (val < 0) return;
                  handleTempFilterChange(
                    "maxDistance",
                    e.target.value ? val * 1000 : undefined,
                  );
                }}
              />
            </div>
          </div>

          {/* Date Range */}
          <div className="space-y-1 w-[240px]">
            <Label>{t("activitySelector.filters.dateRange")}</Label>
            <DatePickerWithRange
              date={{
                from: tempFilters.startDate
                  ? new Date(tempFilters.startDate)
                  : undefined,
                to: tempFilters.endDate
                  ? new Date(tempFilters.endDate)
                  : undefined,
              }}
              size="sm"
              onDateChange={(range) => {
                setTempFilters((prev) => ({
                  ...prev,
                  startDate: range?.from
                    ? format(range.from, "yyyy-MM-dd")
                    : "",
                  endDate: range?.to ? format(range.to, "yyyy-MM-dd") : "",
                }));
              }}
            />
          </div>

          <Button onClick={handleSearch} size="sm">
            <Search className="w-4 h-4" />
          </Button>
        </div>

        <div className="relative h-[400px] overflow-y-auto rounded-md border bg-background">
          {isLoading ? (
            <div className="flex justify-center items-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : activities.length === 0 ? (
            <div className="flex justify-center items-center h-full text-muted-foreground">
              {t("calibrateModal.noActivities")}
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="h-8">
                    {t("activitySelector.columns.date")}
                  </TableHead>
                  <TableHead className="h-8">
                    {t("activitySelector.columns.name")}
                  </TableHead>
                  <TableHead className="h-8">
                    {t("activitySelector.columns.sportType")}
                  </TableHead>
                  <TableHead className="h-8">
                    {t("activitySelector.columns.distance")}
                  </TableHead>
                  <TableHead className="h-8">
                    {t("activitySelector.columns.duration")}
                  </TableHead>
                  <TableHead className="h-8">
                    {t("activitySelector.columns.vo2max")}
                  </TableHead>
                  <TableHead className="text-right h-8">
                    {t("activitySelector.actions.confirm")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activities.map((activity) => (
                  <TableRow key={activity.hashId}>
                    <TableCell className="py-1">
                      {activity.startTime
                        ? format(new Date(activity.startTime), "yyyy-MM-dd")
                        : "-"}
                    </TableCell>
                    <TableCell className="font-medium py-1">
                      {getLocalizedActivityTitle(activity, tActivityTitle)}
                    </TableCell>
                    <TableCell className="py-1">
                      {getSportDisplayName(sportCatalog, activity, tSports)}
                    </TableCell>
                    <TableCell className="py-1">
                      {activity.distance
                        ? (activity.distance / 1000).toFixed(2) + " km"
                        : "-"}
                    </TableCell>
                    <TableCell className="py-1">
                      {activity.elapsedTime
                        ? (activity.elapsedTime / 60).toFixed(0) + " min"
                        : "-"}
                    </TableCell>
                    <TableCell className="py-1">
                      {activity.vo2maxVdotByRace && activity.vo2maxVdotByHr ? (
                        <div className="flex flex-row text-mobile-caption pc:text-xs gap-2">
                          <span className="font-bold text-primary">
                            Ratio:
                            {(
                              activity.vo2maxVdotByRace /
                              activity.vo2maxVdotByHr
                            ).toFixed(2)}
                          </span>
                        </div>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-right py-1">
                      <Button
                        size="compact"
                        variant="secondary"
                        disabled={
                          calibratingId === activity.hashId ||
                          !activity.vo2maxVdotByRace ||
                          !activity.vo2maxVdotByHr
                        }
                        onClick={() => handleCalibrate(activity)}
                      >
                        {calibratingId === activity.hashId ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          t("activitySelector.actions.confirm")
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-end gap-2 p-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || isLoading}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {Math.ceil((data?.total || 0) / 20)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= Math.ceil((data?.total || 0) / 20) || isLoading}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
