"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { UserFitnessMetricType, UserProfile } from "@/api/settings";
import { useUpdateUserProfile, useUserProfile } from "@/hooks/useUserProfile";
import { UserProfileSportFields } from "./UserProfileSportFields";
import {
  UserBaseMetricField,
  UserFitnessMetricField,
} from "./UserProfileMetricFields";
import type { SportType } from "@/api/activities";
import { Skeleton } from "@/components/ui/skeleton";

type LoadSource = NonNullable<UserProfile["loadSources"]>[number];
type ProfileSportTab = "DEFAULT" | "RUN" | "CYCLING" | "SWIM";

const PROFILE_SKELETON_METRIC_COUNTS: Record<ProfileSportTab, number> = {
  DEFAULT: 7,
  RUN: 13,
  CYCLING: 10,
  SWIM: 8,
};

function UserProfileTileSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex min-h-[74px] w-full flex-col justify-between rounded-md bg-background px-3 py-3"
    >
      <Skeleton className="h-3 w-14 bg-neutral-200/80 dark:bg-background/35" />
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-4 w-20 bg-neutral-200/80 dark:bg-background/35" />
        <Skeleton className="h-3 w-7 bg-neutral-200/80 dark:bg-background/35" />
      </div>
    </div>
  );
}

function UserProfileFieldsSkeleton({ sport }: { sport: ProfileSportTab }) {
  const metricCount =
    PROFILE_SKELETON_METRIC_COUNTS[sport] ??
    PROFILE_SKELETON_METRIC_COUNTS.DEFAULT;

  return (
    <div className="space-y-4" aria-hidden="true">
      {sport === "DEFAULT" ? (
        <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <UserProfileTileSkeleton key={`base-${index}`} />
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
        {Array.from({ length: metricCount }).map((_, index) => (
          <UserProfileTileSkeleton key={`metric-${index}`} />
        ))}
      </div>
    </div>
  );
}

export function UserProfileComponent() {
  const t = useTranslations("UserProfile");
  const [activeSport, setActiveSport] = useState<ProfileSportTab>("DEFAULT");
  const [profile, setProfile] = useState<UserProfile>({});
  const profileQuerySport =
    activeSport === "DEFAULT" ? undefined : (activeSport as SportType);
  const metricActiveSport: "DEFAULT" | SportType =
    activeSport === "DEFAULT" ? "DEFAULT" : (activeSport as SportType);

  const { data: serverProfile, isLoading } = useUserProfile(profileQuerySport);

  const updateProfileMutation = useUpdateUserProfile();
  const FitnessMetricField = ({
    label,
    type,
    value,
  }: {
    label: string;
    type: UserFitnessMetricType;
    value: number | undefined;
  }) => (
    <UserFitnessMetricField
      label={label}
      type={type}
      value={value}
      activeSport={metricActiveSport}
      profileType={profile.type}
    />
  );

  useEffect(() => {
    if (serverProfile) {
      setProfile(serverProfile);
    }
  }, [serverProfile]);

  const handleInputChange = (
    field: keyof UserProfile,
    value: string | number,
  ) => {
    setProfile((prev) => {
      let v: string | number | undefined = value;
      if (typeof value === "string") {
        v = value === "" ? undefined : value;
      } else if (typeof value === "number") {
        v = Number.isNaN(value) ? undefined : value;
      }
      return {
        ...prev,
        [field]: v,
      };
    });
  };

  const handleAutoSave = (field: keyof UserProfile, value: string | number) => {
    handleInputChange(field, value);
    updateProfileMutation.mutate({ [field]: value });
  };

  const commitLoadSources = (value: LoadSource[]) => {
    setProfile((prev) => ({ ...prev, loadSources: value }));
    updateProfileMutation.mutate({ loadSources: value });
  };

  const renderProfileFields = (
    sport: "DEFAULT" | "RUN" | "CYCLING" | "SWIM",
  ) => (
    <UserProfileSportFields
      sport={sport}
      profile={profile}
      commitLoadSources={commitLoadSources}
      onAutoSave={handleAutoSave}
      BaseMetricField={UserBaseMetricField}
      FitnessMetricField={FitnessMetricField}
    />
  );

  return (
    <section>
      <div className="mb-2 px-1">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <div className="rounded-md bg-neutral-100 p-3 dark:bg-muted/45">
        <div className="space-y-4">
          <Tabs
            value={activeSport}
            onValueChange={(value) => setActiveSport(value as ProfileSportTab)}
          >
            <TabsList className="gap-2 bg-neutral-200/70 dark:bg-muted">
              <TabsTrigger value="DEFAULT">{t("tabs.default")}</TabsTrigger>
              <TabsTrigger value="RUN">{t("tabs.run")}</TabsTrigger>
              <TabsTrigger value="CYCLING">{t("tabs.cycling")}</TabsTrigger>
              <TabsTrigger value="SWIM">{t("tabs.swim")}</TabsTrigger>
            </TabsList>
            {isLoading ? (
              <TabsContent value={activeSport} className="mt-2" aria-busy>
                <UserProfileFieldsSkeleton sport={activeSport} />
              </TabsContent>
            ) : (
              <>
                <TabsContent value="DEFAULT">
                  {renderProfileFields("DEFAULT")}
                </TabsContent>
                <TabsContent value="RUN">
                  {renderProfileFields("RUN")}
                </TabsContent>
                <TabsContent value="CYCLING">
                  {renderProfileFields("CYCLING")}
                </TabsContent>
                <TabsContent value="SWIM">
                  {renderProfileFields("SWIM")}
                </TabsContent>
              </>
            )}
          </Tabs>
        </div>
      </div>
    </section>
  );
}
