"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type {
  BodyMetricType,
  UserFitnessMetricType,
  UserProfile,
} from "@/api/settings";
import {
  BodyMetricTypes,
  type DefaultVdotSource,
  type HeartRateZoneModel,
  type PaceZoneModel,
  type PowerZoneModel,
} from "@/api/settings";
import { HeartRateZoneHelpDialog } from "@/components/HeartRateZoneHelpDialog";
import { UserProfileLoadSourcesField } from "./UserProfileLoadSourcesField";
import { UserProfileSelectTileField } from "./UserProfileSelectTileField";
import { UserProfileNumberTileField } from "./UserProfileNumberTileField";
import { UserPaceZoneTable } from "./UserPaceZoneTable";
import { UserZonePreviewTable } from "./UserZonePreviewTable";
import {
  formatBaseMetricValue,
  getBaseMetricLabel,
  getCurrentHeartRateZoneModel,
  getCurrentDefaultVdotSource,
  getCurrentPaceZoneModel,
  getCurrentPowerZoneModel,
  getHeartRateZoneModelOptions,
  getDefaultVdotSourceOptions,
  getLoadSourceOptions,
  getPaceUnitLabel,
  getPaceZoneModelOptions,
  getPowerZoneModelOptions,
  type LoadSource,
  type UserProfileSport,
} from "./user-profile-sport-fields-model";

type BaseMetricFieldComponent = (props: {
  type: BodyMetricType;
  label: string;
  displayValue: string;
}) => ReactNode;

type FitnessMetricFieldComponent = (props: {
  label: string;
  type: UserFitnessMetricType;
  value: number | undefined;
}) => ReactNode;

const BASE_METRIC_TYPES: BodyMetricType[] = [
  BodyMetricTypes.WEIGHT,
  BodyMetricTypes.HEIGHT,
  BodyMetricTypes.BIRTHDAY,
  BodyMetricTypes.GENDER,
  BodyMetricTypes.TIMEZONE,
];

export function UserProfileSportFields({
  sport,
  profile,
  commitLoadSources,
  onAutoSave,
  BaseMetricField,
  FitnessMetricField,
}: {
  sport: UserProfileSport;
  profile: UserProfile;
  commitLoadSources: (value: LoadSource[]) => void;
  onAutoSave: (field: keyof UserProfile, value: string | number) => void;
  BaseMetricField: BaseMetricFieldComponent;
  FitnessMetricField: FitnessMetricFieldComponent;
}) {
  const t = useTranslations("UserProfile");

  const showBase = sport === "DEFAULT";
  const showHeartRate = true;
  const showPower = sport === "RUN" || sport === "CYCLING";
  const showPace = sport === "RUN" || sport === "SWIM";
  const showPowerZoneModel = showBase || showPower;
  const showPaceZoneModel = showBase || showPace;
  const paceUnit = getPaceUnitLabel(sport);

  const loadSourceOptions = getLoadSourceOptions(t);
  const heartRateZoneModelOptions = getHeartRateZoneModelOptions(t);
  const powerZoneModelOptions = getPowerZoneModelOptions(t);
  const paceZoneModelOptions = getPaceZoneModelOptions(t);
  const defaultVdotSourceOptions = getDefaultVdotSourceOptions(t);

  const currentHeartRateZoneModel = getCurrentHeartRateZoneModel(
    profile.heartRateZoneModel,
  );
  const currentPowerZoneModel = getCurrentPowerZoneModel(
    profile.powerZoneModel,
  );
  const currentPaceZoneModel = getCurrentPaceZoneModel(profile.paceZoneModel);
  const currentDefaultVdotSource = getCurrentDefaultVdotSource(
    profile.defaultVdotSource,
  );
  const currentCorrectionFactor = (
    typeof profile.vo2maxCorrectionFactor === "number"
      ? profile.vo2maxCorrectionFactor
      : 1
  ).toFixed(2);

  return (
    <div className="space-y-4">
      {showBase ? (
        <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
          {BASE_METRIC_TYPES.map((type) => (
            <BaseMetricField
              key={type}
              type={type}
              label={getBaseMetricLabel({ t, type })}
              displayValue={formatBaseMetricValue({ profile, t, type })}
            />
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
        {showHeartRate ? (
          <>
            <FitnessMetricField
              label={t("fields.maxHeartRate.label")}
              type="MAX_HR"
              value={profile.maxHeartRate}
            />
            <FitnessMetricField
              label={t("fields.restingHeartRate.label")}
              type="RESTING_HR"
              value={profile.restingHeartRate}
            />
            <FitnessMetricField
              label={t("fields.lactateThresholdHeartRate.label")}
              type="LTHR"
              value={profile.lthr}
            />
          </>
        ) : null}

        <UserProfileSelectTileField<HeartRateZoneModel>
          content={(draft) => (
            <UserZonePreviewTable
              sport={sport === "DEFAULT" ? "UNKNOWN" : sport}
              zoneType="HEART_RATE"
              model={draft}
            />
          )}
          cancelLabel={t("common.cancel")}
          currentValue={currentHeartRateZoneModel}
          headerAccessory={(draft) => (
            <HeartRateZoneHelpDialog currentModel={draft} />
          )}
          onSave={(value) => onAutoSave("heartRateZoneModel", value)}
          options={heartRateZoneModelOptions}
          saveLabel={t("save")}
          title={t("fields.heartRateZoneModel.label")}
        />

        {showPowerZoneModel ? (
          <UserProfileSelectTileField<PowerZoneModel>
            content={(draft) => (
              <UserZonePreviewTable
                sport={sport === "DEFAULT" ? "UNKNOWN" : sport}
                zoneType="POWER"
                model={draft}
              />
            )}
            cancelLabel={t("common.cancel")}
            currentValue={currentPowerZoneModel}
            onSave={(value) => onAutoSave("powerZoneModel", value)}
            options={powerZoneModelOptions}
            saveLabel={t("save")}
            title={t("fields.powerZoneModel.label")}
          />
        ) : null}

        {showPaceZoneModel ? (
          <UserProfileSelectTileField<PaceZoneModel>
            content={
              sport === "RUN" || sport === "SWIM"
                ? (draft) => <UserPaceZoneTable sport={sport} model={draft} />
                : undefined
            }
            cancelLabel={t("common.cancel")}
            currentValue={currentPaceZoneModel}
            onSave={(value) => onAutoSave("paceZoneModel", value)}
            options={paceZoneModelOptions}
            saveLabel={t("save")}
            title={t("fields.paceZoneModel.label")}
          />
        ) : null}

        {sport === "RUN" ? (
          <>
            <UserProfileSelectTileField<DefaultVdotSource>
              cancelLabel={t("common.cancel")}
              currentValue={currentDefaultVdotSource}
              description={t("fields.defaultVdotSource.description")}
              onSave={(value) => onAutoSave("defaultVdotSource", value)}
              options={defaultVdotSourceOptions}
              saveLabel={t("save")}
              title={t("fields.defaultVdotSource.label")}
            />
            <UserProfileNumberTileField
              cancelLabel={t("common.cancel")}
              description={t("fields.vo2maxCorrectionFactor.description")}
              invalidMessage={t("fields.vo2maxCorrectionFactor.invalid")}
              max={1.2}
              min={0.01}
              onSave={(value) => onAutoSave("vo2maxCorrectionFactor", value)}
              saveLabel={t("save")}
              step={0.01}
              suffix="×"
              title={t("fields.vo2maxCorrectionFactor.label")}
              value={Number(currentCorrectionFactor)}
            />
          </>
        ) : null}

        <UserProfileLoadSourcesField
          cancelLabel={t("common.cancel")}
          description={t("fields.loadSources.description")}
          onSave={commitLoadSources}
          options={loadSourceOptions}
          placeholder={t("fields.loadSources.placeholder")}
          saveLabel={t("save")}
          title={t("fields.loadSources.label")}
          value={profile.loadSources}
        />

        {showPower ? (
          <>
            <FitnessMetricField
              label={t("fields.ftp.label")}
              type="FTP"
              value={profile.ftp}
            />
            <FitnessMetricField
              label={t("fields.cp.label")}
              type="CP"
              value={profile.cp}
            />
            <FitnessMetricField
              label={t("fields.wPrime.label")}
              type="W_PRIME"
              value={profile.wPrime}
            />
            <FitnessMetricField
              label={t("fields.PMax.label")}
              type="P_MAX"
              value={profile.Pmax}
            />
          </>
        ) : null}

        {showPace ? (
          <>
            <FitnessMetricField
              label={`${t("fields.cs.label")} ${paceUnit}`}
              type="CS"
              value={profile.cs}
            />
            <FitnessMetricField
              label={`${t("fields.tp.label")} ${paceUnit}`}
              type="TP"
              value={profile.tp}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
