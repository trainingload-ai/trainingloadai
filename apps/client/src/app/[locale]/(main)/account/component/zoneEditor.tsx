"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslations } from "next-intl";
import { resolveLthrForCalculation } from "@shared/lthr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ZoneSetting, UserProfile } from "@/api/settings";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useUserZone, useUpdateUserZone } from "@/hooks/useUserZones";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { ConfirmDialog } from "@/components/ui/confirmDialog";
import { SportType } from "@/api/activities";
import { useIsMobile } from "@/hooks/use-mobile";
import { BenchmarkType } from "./zoneSettings";
import {
  calculateZoneAbsoluteValue,
  findValidBenchmark,
  getZoneEditorSportOptions,
  getZoneUnit,
  isZoneListDirty,
  mapLoadedZones,
} from "./zone-editor-model";
import { ZoneEditorTable } from "./ZoneEditorTable";
import { ZoneEditorToolbar } from "./ZoneEditorToolbar";
import {
  KNOWN_METRIC_SOURCE_LABEL_KEYS,
  metricSourceLabelKey,
} from "./user-profile-metric-model";

export enum ZONE_TYPES {
  POWER = "POWER",
  HEART_RATE = "HEART_RATE",
  PACE = "PACE",
}

export interface ExtendedZoneSetting extends ZoneSetting {
  id?: string; // For key
}

export interface Benchmark {
  label: string;
  value: BenchmarkType;
  getValue: (p?: UserProfile) => number | undefined;
  disabled?: boolean;
  isDisabled?: (p?: UserProfile) => boolean;
  disabledReason?: string;
}

interface ZoneEditorProps {
  zoneType: string;
  defaultSport: string;
  benchmarks: Benchmark[];
  onDirtyChange?: (isDirty: boolean) => void;
  onSportChange?: (sport: SportType) => void;
}

export function ZoneEditor({
  zoneType,
  defaultSport,
  benchmarks,
  onDirtyChange,
  onSportChange,
}: ZoneEditorProps) {
  const t = useTranslations("ZoneSettings.editor");
  const profileT = useTranslations("UserProfile");
  const isMobile = useIsMobile();
  const [sportType, setSportType] = useState(defaultSport);
  const [sportPickerOpen, setSportPickerOpen] = useState(false);
  const [benchmarkPickerOpen, setBenchmarkPickerOpen] = useState(false);

  // Notify parent of sport change
  useEffect(() => {
    onSportChange?.(sportType as SportType);
  }, [sportType, onSportChange]);

  // Fetch profile when sport changes using React Query
  const { data: localProfile, isLoading: isProfileLoading } = useUserProfile(
    sportType as SportType,
  );

  const { data: userZoneSetting, isLoading: isZonesLoading } = useUserZone(
    sportType,
    zoneType,
  );
  const updateZoneMutation = useUpdateUserZone();

  const [selectedBenchmark, setSelectedBenchmark] = useState<BenchmarkType>(
    benchmarks[0]?.value || BenchmarkType.CUSTOM,
  );
  const [zones, setZones] = useState<ExtendedZoneSetting[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Confirmation dialog state for internal changes
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingChange, setPendingChange] = useState<{
    type: "sport" | "benchmark";
    value: BenchmarkType | SportType;
  } | null>(null);

  const initialLoadDone = useRef(false);
  const lastLoadedKey = useRef<string>("");
  const originalZonesRef = useRef<string>("");

  const zoneSourceLabel = (() => {
    if (!userZoneSetting) return null;
    const key = metricSourceLabelKey({
      changeSource: userZoneSetting.changeSource,
      originProvider: userZoneSetting.originProvider,
      originExternalId: userZoneSetting.originExternalId,
      originSyncedAt: userZoneSetting.originSyncedAt,
    });
    if (KNOWN_METRIC_SOURCE_LABEL_KEYS.has(key)) {
      return profileT(`historyTable.sourceLabels.${key}`);
    }
    return key || profileT("historyTable.sourceLabels.unknown");
  })();
  const isDirtyRef = useRef(false);

  const nameCounts = useMemo(() => {
    return zones.reduce(
      (acc, z) => {
        const name = z.name.toLowerCase();
        acc[name] = (acc[name] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
  }, [zones]);

  const duplicateError = useMemo(
    () => Object.values(nameCounts).some((count: number) => count > 1),
    [nameCounts],
  );

  useEffect(() => {
    const cacheKey = `${sportType}-${zoneType}`;

    if (isZonesLoading) return;

    let loadedZones: ExtendedZoneSetting[] = [];
    let loadedBenchmark = benchmarks[0]?.value;

    if (userZoneSetting) {
      if (Array.isArray(userZoneSetting.zones)) {
        loadedZones = mapLoadedZones(userZoneSetting.zones);
      }

      const benchmarkExists = benchmarks.find(
        (b) => b.value === userZoneSetting.benchmark,
      );
      if (benchmarkExists) {
        loadedBenchmark = userZoneSetting.benchmark;
      } else {
        loadedBenchmark = BenchmarkType.CUSTOM;
      }
    } else {
      loadedZones = mapLoadedZones(undefined);
    }

    const loadedZonesStr = JSON.stringify(loadedZones);

    // Prevent re-loading if we are already on this key and initial load is done
    // Unless server data changed and user hasn't modified anything
    if (lastLoadedKey.current === cacheKey && initialLoadDone.current) {
      if (isDirtyRef.current) return;
      if (loadedZonesStr === originalZonesRef.current) return;
    }

    setZones(loadedZones);
    const validBenchmark = findValidBenchmark({
      benchmarks,
      desired: loadedBenchmark,
      profile: localProfile,
    });
    setSelectedBenchmark(validBenchmark);

    originalZonesRef.current = loadedZonesStr;
    lastLoadedKey.current = cacheKey;
    initialLoadDone.current = true;
    // Reset dirty state since we just loaded fresh data
    isDirtyRef.current = false;
  }, [
    sportType,
    zoneType,
    benchmarks,
    userZoneSetting,
    isZonesLoading,
    localProfile,
  ]);

  useEffect(() => {
    if (isProfileLoading) return;
    const valid = findValidBenchmark({
      benchmarks,
      desired: selectedBenchmark,
      profile: localProfile,
    });
    if (valid !== selectedBenchmark) {
      setSelectedBenchmark(valid);
    }
  }, [
    localProfile,
    isProfileLoading,
    benchmarks,
    selectedBenchmark,
  ]);

  useEffect(() => {
    if (!initialLoadDone.current || isZonesLoading) return;
    const currentZonesStr = JSON.stringify(zones);
    const isDirty = currentZonesStr !== originalZonesRef.current;
    onDirtyChange?.(isDirty);
  }, [zones, isZonesLoading, onDirtyChange]);

  const checkDirty = () => {
    return isZoneListDirty(zones, originalZonesRef.current);
  };

  const handleSportChange = (val: SportType) => {
    if (checkDirty()) {
      setPendingChange({ type: "sport", value: val });
      setShowConfirmDialog(true);
    } else {
      setSportType(val);
    }
  };

  const handleBenchmarkChange = (val: BenchmarkType) => {
    if (checkDirty()) {
      setPendingChange({ type: "benchmark", value: val });
      setShowConfirmDialog(true);
    } else {
      setSelectedBenchmark(val);
    }
  };

  const handleConfirmChange = () => {
    if (pendingChange) {
      if (pendingChange.type === "sport") {
        setSportType(pendingChange.value);
      } else {
        if (originalZonesRef.current) {
          setZones(JSON.parse(originalZonesRef.current));
        }
        setSelectedBenchmark(pendingChange.value as BenchmarkType);
      }
      setPendingChange(null);
      setShowConfirmDialog(false);
    }
  };

  const handleSave = async () => {
    // Validate duplicates before saving
    if (duplicateError) {
      toast.error(t("duplicateError"));
      return;
    }

    setIsSaving(true);
    const cleanZones: ZoneSetting[] = zones.map((z) => {
      const copy = { ...z };
      delete copy.id;
      return copy;
    });

    try {
      await updateZoneMutation.mutateAsync({
        sportType,
        zoneType,
        benchmark: selectedBenchmark,
        zones: cleanZones,
      });

      originalZonesRef.current = JSON.stringify(zones);
      onDirtyChange?.(false);
      toast.success(t("saveSuccess"));
    } catch (error) {
      console.error(error);
      toast.error(t("saveError") || "Error saving zones");
    } finally {
      setIsSaving(false);
    }
  };

  const addZone = () => {
    const lastMax = zones.length > 0 ? zones[zones.length - 1].max : 0;
    setZones([
      ...zones,
      {
        name: `Z${zones.length + 1}`,
        min: lastMax,
        max: lastMax + 10,
        id: Date.now().toString(),
      },
    ]);
  };

  const removeZone = (index: number) => {
    const newZones = [...zones];
    newZones.splice(index, 1);
    setZones(newZones);
  };

  const updateZone = (
    index: number,
    field: keyof ExtendedZoneSetting,
    value: string | number,
  ) => {
    const newZones = [...zones];
    newZones[index] = { ...newZones[index], [field]: value };
    setZones(newZones);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setZones((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const currentBenchmarkVal =
    benchmarks
      .find((b) => b.value === selectedBenchmark)
      ?.getValue(localProfile) || 0;
  const isCustom = selectedBenchmark === BenchmarkType.CUSTOM;
  const usesEstimatedLthr =
    selectedBenchmark === BenchmarkType.LTHR &&
    !localProfile?.lthr &&
    resolveLthrForCalculation({
      maxHeartRate: localProfile?.maxHeartRate,
    })?.source === "ESTIMATED_MAX_HR";
  const zoneUnit = getZoneUnit({ isCustom, sportType, zoneType });
  const sportOptions = getZoneEditorSportOptions(zoneType);

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        title={useTranslations("ZoneSettings.unsavedChanges")("title")}
        description={useTranslations("ZoneSettings.unsavedChanges")(
          "description",
        )}
        confirmText={useTranslations("ZoneSettings.unsavedChanges")("discard")}
        cancelText={useTranslations("ZoneSettings.unsavedChanges")("keep")}
        confirmButtonVariant="destructive"
        onConfirm={handleConfirmChange}
        onCancel={() => {
          setShowConfirmDialog(false);
          setPendingChange(null);
        }}
      />
      <ZoneEditorToolbar
        benchmarks={benchmarks.map((benchmark) => ({
          label:
            benchmark.value === BenchmarkType.LTHR && usesEstimatedLthr
              ? `${benchmark.label} · ${profileT("estimatedLabel")}`
              : benchmark.label,
          value: benchmark.value,
          disabled: benchmark.isDisabled
            ? benchmark.isDisabled(localProfile)
            : false,
          disabledReason: benchmark.disabledReason,
        }))}
        benchmarkPickerOpen={benchmarkPickerOpen}
        currentBenchmarkLabel={(() => {
          const label = benchmarks.find(
            (b) => b.value === userZoneSetting?.benchmark,
          )?.label;
          return label && usesEstimatedLthr
            ? `${label} · ${profileT("estimatedLabel")}`
            : label;
        })()}
        currentBenchmarkVal={currentBenchmarkVal}
        isCustom={isCustom}
        isMobile={isMobile}
        onBenchmarkChange={handleBenchmarkChange}
        onSportChange={handleSportChange}
        selectedBenchmark={selectedBenchmark}
        sportOptions={sportOptions}
        sportPickerOpen={sportPickerOpen}
        setBenchmarkPickerOpen={setBenchmarkPickerOpen}
        setSportPickerOpen={setSportPickerOpen}
        sportType={sportType}
        t={t}
        userZoneBenchmark={userZoneSetting?.benchmark}
      />

      {zoneSourceLabel ? (
        <div className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-mobile-caption pc:text-xs text-muted-foreground">
          <span>{profileT("historyTable.columns.source")}</span>
          <Badge variant="outline">{zoneSourceLabel}</Badge>
        </div>
      ) : null}

      {isZonesLoading ? (
        <div className="flex justify-center items-center p-8 min-h-[220px]">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          <ZoneEditorTable
            duplicateByName={(zoneName) =>
              zones.filter(
                (zone) => zone.name.toLowerCase() === zoneName.toLowerCase(),
              ).length > 1
            }
            getAbs={(pct) =>
              calculateZoneAbsoluteValue({
                pct,
                benchmarkVal: currentBenchmarkVal,
                zoneType,
                sportType,
                isCustom,
              })
            }
            isCustom={isCustom}
            onDragEnd={handleDragEnd}
            removeZone={removeZone}
            sensors={sensors}
            t={t}
            updateZone={(index, field, value) =>
              updateZone(index, field as keyof ExtendedZoneSetting, value)
            }
            zoneUnit={zoneUnit}
            zones={zones}
          />

          <div className="flex justify-between items-center">
            <div className="text-sm text-destructive font-medium h-5">
              {duplicateError && t("duplicateError")}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={addZone}>
                <Plus className="mr-2 h-4 w-4" /> {t("addZone")}
              </Button>
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={isSaving || duplicateError}
                size="sm"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("saving")}
                  </>
                ) : (
                  t("saveChanges")
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
