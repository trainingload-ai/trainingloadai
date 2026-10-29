"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Bot, KeyRound, Loader2, Save, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { ApiFetchError } from "@/lib/api";
import {
  type AiDataConsentStatus,
  fetchAiDataConsentStatus,
} from "@/api/ai-data-consent";
import {
  type SelfHostAiConfiguration,
  type SelfHostAiProvider,
  useSelfHostAiConfiguration,
  useUpdateSelfHostAiConfiguration,
} from "@/api/self-host-ai-configuration";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  AdaptiveDialogTrigger,
} from "@/components/ui/adaptive-dialog";
import { useRuntimeCapabilities } from "@/api/runtime-capabilities";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  SELF_HOST_AI_PROVIDER_CATALOG,
  getSelfHostAiModelPreset,
  getSelfHostAiProviderPreset,
  type SelfHostAiModelPreset,
} from "@shared/self-host-ai-catalog";

const CUSTOM_MODEL_VALUE = "__custom_model__";

const CONFIGURATION_FIELD_CLASS_NAME =
  "gap-2 sm:grid sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)] sm:items-start";

type FormState = {
  provider: SelfHostAiProvider;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  defaultModelContextTokens: number | null;
  reasoningModel: string;
  reasoningModelContextTokens: number | null;
  webSearchEnabled: boolean;
};

const EMPTY_FORM: FormState = {
  provider: "none",
  apiKey: "",
  baseUrl: "",
  defaultModel: "",
  defaultModelContextTokens: null,
  reasoningModel: "",
  reasoningModelContextTokens: null,
  webSearchEnabled: false,
};

function contextForModel(
  provider: SelfHostAiProvider,
  model: string | null,
  configured: number | null,
) {
  return (
    getSelfHostAiModelPreset(provider, model)?.contextWindowTokens ?? configured
  );
}

function formFromConfiguration(
  configuration: SelfHostAiConfiguration,
): FormState {
  return {
    provider: configuration.provider,
    apiKey: "",
    baseUrl: configuration.baseUrl ?? "",
    defaultModel: configuration.defaultModel ?? "",
    defaultModelContextTokens: contextForModel(
      configuration.provider,
      configuration.defaultModel,
      configuration.defaultModelContextTokens,
    ),
    reasoningModel: configuration.reasoningModel ?? "",
    reasoningModelContextTokens: contextForModel(
      configuration.provider,
      configuration.reasoningModel,
      configuration.reasoningModelContextTokens,
    ),
    webSearchEnabled: configuration.webSearchEnabled,
  };
}

function modelSelectionValue(
  models: readonly SelfHostAiModelPreset[],
  model: string,
) {
  return models.some((preset) => preset.id === model)
    ? model
    : CUSTOM_MODEL_VALUE;
}

export type SelfHostAiConfigurationResult = {
  enabled: boolean;
  provider: SelfHostAiProvider;
  consent: AiDataConsentStatus;
};

type SelfHostAiSettingsProps = {
  surface?: "settings" | "onboarding" | "account";
  onConfigured?: (
    result: SelfHostAiConfigurationResult,
  ) => void | Promise<void>;
  onPendingChange?: (pending: boolean) => void;
  renderActions?: (state: { busy: boolean; canSubmit: boolean }) => ReactNode;
};

type ConfigurationFieldLabelProps = {
  htmlFor: string;
  label: string;
  indicator?: "required" | "optional";
  indicatorText?: string;
};

function ConfigurationFieldLabel({
  htmlFor,
  label,
  indicator,
  indicatorText,
}: ConfigurationFieldLabelProps) {
  return (
    <FieldLabel htmlFor={htmlFor} className="gap-1 sm:pt-2">
      {label}
      {indicator === "required" ? (
        <>
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
          <span className="sr-only">{indicatorText}</span>
        </>
      ) : indicator === "optional" ? (
        <span className="text-mobile-unit font-normal text-muted-foreground pc:text-[11px]">
          {indicatorText}
        </span>
      ) : null}
    </FieldLabel>
  );
}

export function SelfHostAiSettings({
  surface = "settings",
  onConfigured,
  onPendingChange,
  renderActions,
}: SelfHostAiSettingsProps = {}) {
  const t = useTranslations("SelfHostAiSettings");
  const capabilities = useRuntimeCapabilities();
  const isSelfHost = capabilities.data?.deployment === "self-host";
  const configuration = useSelfHostAiConfiguration(isSelfHost);
  const update = useUpdateSelfHostAiConfiguration();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isOnboarding = surface === "onboarding";
  const isAccount = surface === "account";
  const providerPreset = getSelfHostAiProviderPreset(form.provider);
  const defaultModelPreset = getSelfHostAiModelPreset(
    form.provider,
    form.defaultModel,
  );
  const reasoningModelPreset = getSelfHostAiModelPreset(
    form.provider,
    form.reasoningModel,
  );
  const webSearchSupported = providerPreset.webSearch !== "unsupported";

  useEffect(() => {
    if (!configuration.data) return;
    setForm(formFromConfiguration(configuration.data));
  }, [configuration.data]);

  const requiresNewKey =
    form.provider !== "none" &&
    providerPreset.apiKeyRequired &&
    (configuration.data?.source === "environment" ||
      !configuration.data?.apiKeyConfigured ||
      configuration.data?.provider !== form.provider);
  const requiresBaseUrl = providerPreset.defaultBaseUrl === null;

  const hasChanges = useMemo(() => {
    const current = configuration.data;
    if (!current) return false;
    const normalizedCurrent = formFromConfiguration(current);
    return (
      form.provider !== normalizedCurrent.provider ||
      form.apiKey.length > 0 ||
      form.baseUrl !== normalizedCurrent.baseUrl ||
      form.defaultModel !== normalizedCurrent.defaultModel ||
      form.defaultModelContextTokens !==
        normalizedCurrent.defaultModelContextTokens ||
      form.reasoningModel !== normalizedCurrent.reasoningModel ||
      form.reasoningModelContextTokens !==
        normalizedCurrent.reasoningModelContextTokens ||
      form.webSearchEnabled !== normalizedCurrent.webSearchEnabled
    );
  }, [configuration.data, form]);

  const providerEnabled = form.provider !== "none";
  const complete =
    !providerEnabled ||
    (Boolean(form.defaultModel.trim()) &&
      Boolean(form.reasoningModel.trim()) &&
      Boolean(form.defaultModelContextTokens) &&
      Boolean(form.reasoningModelContextTokens) &&
      (!requiresBaseUrl || Boolean(form.baseUrl.trim())) &&
      (!requiresNewKey || Boolean(form.apiKey.trim())));
  const canUseCurrentConfiguration =
    isOnboarding && !hasChanges && Boolean(configuration.data);
  const apiKeyRequired = requiresNewKey && !canUseCurrentConfiguration;
  const busy = update.isPending;
  const canSubmit =
    !busy && (canUseCurrentConfiguration || (hasChanges && complete));

  useEffect(() => {
    onPendingChange?.(busy);
  }, [busy, onPendingChange]);

  if (!isSelfHost || capabilities.isLoading || configuration.isLoading) {
    return null;
  }
  if (
    configuration.error instanceof ApiFetchError &&
    [403, 404].includes(configuration.error.status)
  ) {
    return null;
  }

  const setProvider = (value: string) => {
    const provider = SELF_HOST_AI_PROVIDER_CATALOG.find(
      (candidate) => candidate.id === value,
    )?.id;
    if (!provider) return;
    const preset = getSelfHostAiProviderPreset(provider);
    const defaultModel = preset.defaultModel ?? "";
    const reasoningModel = preset.reasoningModel ?? "";
    setForm((current) => ({
      ...current,
      provider,
      apiKey: "",
      baseUrl: preset.defaultBaseUrl ?? "",
      defaultModel,
      defaultModelContextTokens:
        getSelfHostAiModelPreset(provider, defaultModel)?.contextWindowTokens ??
        null,
      reasoningModel,
      reasoningModelContextTokens:
        getSelfHostAiModelPreset(provider, reasoningModel)
          ?.contextWindowTokens ?? null,
      webSearchEnabled: false,
    }));
  };

  const save = async () => {
    try {
      const saved = hasChanges
        ? await update.mutateAsync({
            provider: form.provider,
            ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
            ...(providerEnabled
              ? {
                  baseUrl: form.baseUrl.trim(),
                  defaultModel: form.defaultModel.trim(),
                  defaultModelContextTokens:
                    form.defaultModelContextTokens ?? undefined,
                  reasoningModel: form.reasoningModel.trim(),
                  reasoningModelContextTokens:
                    form.reasoningModelContextTokens ?? undefined,
                  webSearchEnabled: form.webSearchEnabled,
                }
              : {}),
          })
        : configuration.data;
      if (!saved) throw new Error(t("loadFailed"));

      const enabled = saved.provider !== "none";
      const consent = await fetchAiDataConsentStatus();
      if (!consent) throw new Error(t("loadFailed"));
      setForm((current) => ({ ...current, apiKey: "" }));
      if (onConfigured) {
        await onConfigured({ enabled, provider: saved.provider, consent });
      } else {
        toast.success(t("saved"));
      }
      if (!isOnboarding) setSettingsOpen(false);
    } catch (error) {
      console.error("Failed to save self-host AI configuration", error);
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : t("saveFailed"),
      );
    }
  };

  const handleSettingsOpenChange = (open: boolean) => {
    setSettingsOpen(open);
    if (!open && configuration.data) {
      setForm(formFromConfiguration(configuration.data));
    }
  };

  const editor = configuration.isError ? (
    <div className="rounded-md border border-destructive/35 bg-destructive/5 px-3 py-3 text-sm text-destructive">
      <p>{t("loadFailed")}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={() => void configuration.refetch()}
      >
        {t("retry")}
      </Button>
    </div>
  ) : (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) void save();
      }}
      className={cn(
        (isOnboarding || isAccount) &&
          "rounded-md border border-border bg-muted/20 px-3 py-3",
      )}
    >
      <FieldSet className="gap-4">
        <FieldLegend className="sr-only">{t("title")}</FieldLegend>
        <FieldDescription className="text-mobile-caption leading-5 pc:text-xs">
          {t("requirementsHint")}
        </FieldDescription>

        <FieldGroup className="gap-4">
          <Field className={CONFIGURATION_FIELD_CLASS_NAME}>
            <ConfigurationFieldLabel
              htmlFor="self-host-ai-provider"
              label={t("provider")}
            />
            <FieldContent className="min-w-0">
              <Select value={form.provider} onValueChange={setProvider}>
                <SelectTrigger
                  id="self-host-ai-provider"
                  aria-label={t("provider")}
                  className="w-full bg-background shadow-none dark:bg-black/20"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SELF_HOST_AI_PROVIDER_CATALOG.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {t(`providers.${provider.id}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>

          {providerEnabled ? (
            <>
              <Field className={CONFIGURATION_FIELD_CLASS_NAME}>
                <ConfigurationFieldLabel
                  htmlFor="self-host-ai-api-key"
                  label={t("apiKey")}
                  indicator={apiKeyRequired ? "required" : "optional"}
                  indicatorText={t(apiKeyRequired ? "required" : "optional")}
                />
                <FieldContent className="min-w-0 gap-1">
                  <InputGroup className="h-8 bg-background shadow-none dark:bg-black/20">
                    <InputGroupAddon aria-hidden="true">
                      <KeyRound />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="self-host-ai-api-key"
                      type="password"
                      aria-label={t("apiKey")}
                      autoComplete="new-password"
                      spellCheck={false}
                      value={form.apiKey}
                      required={apiKeyRequired}
                      aria-required={apiKeyRequired}
                      aria-describedby="self-host-ai-api-key-help"
                      placeholder={
                        configuration.data?.apiKeyConfigured
                          ? requiresNewKey
                            ? t("apiKeyReenter")
                            : t("apiKeyKeep")
                          : t("apiKeyPlaceholder")
                      }
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          apiKey: event.target.value,
                        }))
                      }
                    />
                  </InputGroup>
                  <FieldDescription
                    id="self-host-ai-api-key-help"
                    className="text-mobile-caption leading-5 pc:text-xs"
                  >
                    {t("apiKeyHelp")}
                  </FieldDescription>
                </FieldContent>
              </Field>

              <Field className={CONFIGURATION_FIELD_CLASS_NAME}>
                <ConfigurationFieldLabel
                  htmlFor="self-host-ai-base-url"
                  label={t("baseUrl")}
                  indicator={requiresBaseUrl ? "required" : "optional"}
                  indicatorText={t(requiresBaseUrl ? "required" : "optional")}
                />
                <FieldContent className="min-w-0 gap-1">
                  <Input
                    id="self-host-ai-base-url"
                    aria-label={t("baseUrl")}
                    inputMode="url"
                    spellCheck={false}
                    className="bg-background shadow-none dark:bg-black/20"
                    value={form.baseUrl}
                    required={requiresBaseUrl}
                    aria-required={requiresBaseUrl}
                    aria-describedby="self-host-ai-base-url-help"
                    placeholder="https://api.provider.tld/v1"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        baseUrl: event.target.value,
                      }))
                    }
                  />
                  <FieldDescription
                    id="self-host-ai-base-url-help"
                    className="text-mobile-caption leading-5 pc:text-xs"
                  >
                    {t(
                      requiresBaseUrl
                        ? "baseUrlHelpRequired"
                        : "baseUrlHelpOptional",
                    )}
                  </FieldDescription>
                </FieldContent>
              </Field>

              <Field className={CONFIGURATION_FIELD_CLASS_NAME}>
                <ConfigurationFieldLabel
                  htmlFor="self-host-ai-default-model"
                  label={t("defaultModel")}
                  indicator="required"
                  indicatorText={t("required")}
                />
                <FieldContent className="min-w-0 gap-2">
                  {providerPreset.models.length > 0 ? (
                    <Select
                      value={modelSelectionValue(
                        providerPreset.models,
                        form.defaultModel,
                      )}
                      onValueChange={(value) => {
                        if (!value) return;
                        const selected = getSelfHostAiModelPreset(
                          form.provider,
                          value,
                        );
                        setForm((current) => ({
                          ...current,
                          defaultModel:
                            value === CUSTOM_MODEL_VALUE ? "" : value,
                          defaultModelContextTokens:
                            selected?.contextWindowTokens ?? null,
                        }));
                      }}
                    >
                      <SelectTrigger
                        id="self-host-ai-default-model"
                        aria-label={t("defaultModel")}
                        aria-required="true"
                        className="bg-background shadow-none dark:bg-black/20"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {providerPreset.models.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.label}
                          </SelectItem>
                        ))}
                        <SelectItem value={CUSTOM_MODEL_VALUE}>
                          {t("customModel")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  ) : null}
                  {providerPreset.models.length === 0 || !defaultModelPreset ? (
                    <Input
                      id={
                        providerPreset.models.length === 0
                          ? "self-host-ai-default-model"
                          : "self-host-ai-default-model-custom"
                      }
                      aria-label={
                        providerPreset.models.length === 0
                          ? t("defaultModel")
                          : t("customDefaultModel")
                      }
                      spellCheck={false}
                      className="bg-background shadow-none dark:bg-black/20"
                      value={form.defaultModel}
                      required
                      aria-required="true"
                      placeholder={t("modelPlaceholder")}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          defaultModel: event.target.value,
                        }))
                      }
                    />
                  ) : null}
                  {!defaultModelPreset ? (
                    <Input
                      type="number"
                      min={16000}
                      max={4000000}
                      step={1000}
                      aria-label={t("defaultModelContext")}
                      className="bg-background shadow-none dark:bg-black/20"
                      value={form.defaultModelContextTokens ?? ""}
                      required
                      aria-required="true"
                      placeholder={t("contextWindowPlaceholder")}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          defaultModelContextTokens: event.target.value
                            ? Number(event.target.value)
                            : null,
                        }))
                      }
                    />
                  ) : null}
                  <FieldDescription className="text-mobile-caption leading-5 pc:text-xs">
                    {form.defaultModelContextTokens
                      ? t("contextWindowValue", {
                          count:
                            form.defaultModelContextTokens.toLocaleString(),
                        })
                      : t("contextWindowRequired")}
                  </FieldDescription>
                </FieldContent>
              </Field>

              <Field className={CONFIGURATION_FIELD_CLASS_NAME}>
                <ConfigurationFieldLabel
                  htmlFor="self-host-ai-reasoning-model"
                  label={t("reasoningModel")}
                  indicator="required"
                  indicatorText={t("required")}
                />
                <FieldContent className="min-w-0 gap-2">
                  {providerPreset.models.length > 0 ? (
                    <Select
                      value={modelSelectionValue(
                        providerPreset.models,
                        form.reasoningModel,
                      )}
                      onValueChange={(value) => {
                        if (!value) return;
                        const selected = getSelfHostAiModelPreset(
                          form.provider,
                          value,
                        );
                        setForm((current) => ({
                          ...current,
                          reasoningModel:
                            value === CUSTOM_MODEL_VALUE ? "" : value,
                          reasoningModelContextTokens:
                            selected?.contextWindowTokens ?? null,
                        }));
                      }}
                    >
                      <SelectTrigger
                        id="self-host-ai-reasoning-model"
                        aria-label={t("reasoningModel")}
                        aria-required="true"
                        className="bg-background shadow-none dark:bg-black/20"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {providerPreset.models.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.label}
                          </SelectItem>
                        ))}
                        <SelectItem value={CUSTOM_MODEL_VALUE}>
                          {t("customModel")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  ) : null}
                  {providerPreset.models.length === 0 ||
                  !reasoningModelPreset ? (
                    <Input
                      id={
                        providerPreset.models.length === 0
                          ? "self-host-ai-reasoning-model"
                          : "self-host-ai-reasoning-model-custom"
                      }
                      aria-label={
                        providerPreset.models.length === 0
                          ? t("reasoningModel")
                          : t("customReasoningModel")
                      }
                      spellCheck={false}
                      className="bg-background shadow-none dark:bg-black/20"
                      value={form.reasoningModel}
                      required
                      aria-required="true"
                      placeholder={t("modelPlaceholder")}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          reasoningModel: event.target.value,
                        }))
                      }
                    />
                  ) : null}
                  {!reasoningModelPreset ? (
                    <Input
                      type="number"
                      min={16000}
                      max={4000000}
                      step={1000}
                      aria-label={t("reasoningModelContext")}
                      className="bg-background shadow-none dark:bg-black/20"
                      value={form.reasoningModelContextTokens ?? ""}
                      required
                      aria-required="true"
                      placeholder={t("contextWindowPlaceholder")}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          reasoningModelContextTokens: event.target.value
                            ? Number(event.target.value)
                            : null,
                        }))
                      }
                    />
                  ) : null}
                  <FieldDescription className="text-mobile-caption leading-5 pc:text-xs">
                    {form.reasoningModelContextTokens
                      ? t("contextWindowValue", {
                          count:
                            form.reasoningModelContextTokens.toLocaleString(),
                        })
                      : t("contextWindowRequired")}
                  </FieldDescription>
                </FieldContent>
              </Field>

              <Field className={CONFIGURATION_FIELD_CLASS_NAME}>
                <ConfigurationFieldLabel
                  htmlFor="self-host-ai-web-search"
                  label={t("webSearch")}
                />
                <FieldContent className="min-w-0 gap-1">
                  <div className="flex h-8 items-center justify-between rounded-md border border-input bg-background px-3 dark:bg-black/20">
                    <span className="text-mobile-caption text-muted-foreground pc:text-xs">
                      {t(
                        webSearchSupported
                          ? form.webSearchEnabled
                            ? "webSearchOn"
                            : "webSearchOff"
                          : "webSearchUnavailable",
                      )}
                    </span>
                    <Switch
                      id="self-host-ai-web-search"
                      aria-label={t("webSearch")}
                      checked={form.webSearchEnabled}
                      disabled={!webSearchSupported}
                      onCheckedChange={(checked) =>
                        setForm((current) => ({
                          ...current,
                          webSearchEnabled: checked,
                        }))
                      }
                    />
                  </div>
                  <FieldDescription className="text-mobile-caption leading-5 pc:text-xs">
                    {t(
                      webSearchSupported
                        ? "webSearchHelpSupported"
                        : "webSearchHelpUnsupported",
                    )}
                  </FieldDescription>
                </FieldContent>
              </Field>
            </>
          ) : null}

          <FieldSeparator />

          <div
            className={cn(
              "flex flex-col gap-2 sm:flex-row sm:items-center",
              !isOnboarding && "sm:justify-between",
            )}
          >
            <FieldDescription className="text-mobile-caption leading-5 pc:text-xs">
              {!providerEnabled
                ? t("sourceDisabled")
                : configuration.data?.source === "owner"
                  ? t("sourceOwner")
                  : t("sourceEnvironment")}
            </FieldDescription>
            {!isOnboarding ? (
              <Button
                type="submit"
                size="sm"
                className="shrink-0"
                disabled={!canSubmit}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {busy ? t("saving") : t("save")}
              </Button>
            ) : null}
          </div>
        </FieldGroup>
      </FieldSet>
      {isOnboarding ? renderActions?.({ busy, canSubmit }) : null}
    </form>
  );

  if (isOnboarding || isAccount) {
    return <section className="min-w-0">{editor}</section>;
  }

  const savedProvider = configuration.data?.provider ?? "none";
  const providerEnabledInConfiguration = savedProvider !== "none";

  return (
    <section className="min-w-0 border-t border-border pt-5">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-foreground dark:bg-muted/45">
          <Bot className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              {t("title")}
            </h2>
            <Badge variant="secondary" className="rounded-md font-medium">
              {t("ownerOnly")}
            </Badge>
          </div>
          <p className="mt-1 text-mobile-caption leading-5 text-muted-foreground pc:text-xs">
            {t("summaryDescription")}
          </p>
        </div>
      </div>

      {configuration.isError ? (
        editor
      ) : (
        <AdaptiveDialog
          open={settingsOpen}
          onOpenChange={handleSettingsOpenChange}
        >
          <div className="flex flex-col gap-3 rounded-md bg-neutral-100 px-3 py-3 dark:bg-muted/45 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">
                  {t(`providers.${savedProvider}`)}
                </span>
                <span className="flex items-center gap-1.5 text-mobile-caption text-muted-foreground pc:text-xs">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      providerEnabledInConfiguration
                        ? "bg-emerald-500"
                        : "bg-muted-foreground/50",
                    )}
                    aria-hidden="true"
                  />
                  {t(
                    providerEnabledInConfiguration
                      ? "statusEnabled"
                      : "statusDisabled",
                  )}
                </span>
              </div>
              <p className="mt-1 truncate text-mobile-caption leading-5 text-muted-foreground pc:text-xs">
                {providerEnabledInConfiguration
                  ? t("modelSummary", {
                      default: configuration.data?.defaultModel ?? "—",
                      reasoning: configuration.data?.reasoningModel ?? "—",
                    })
                  : t("disabledSummary")}
              </p>
            </div>
            <AdaptiveDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
              >
                <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t("manage")}
              </Button>
            </AdaptiveDialogTrigger>
          </div>

          <AdaptiveDialogContent
            className="gap-5 bg-background"
            desktopClassName="sm:max-w-[680px]"
            mobileClassName="max-h-[92dvh] overflow-y-auto"
          >
            <AdaptiveDialogHeader className="pr-10 text-left">
              <AdaptiveDialogTitle>{t("title")}</AdaptiveDialogTitle>
              <AdaptiveDialogDescription className="text-mobile-caption leading-5 pc:text-xs">
                {t("description")}
              </AdaptiveDialogDescription>
            </AdaptiveDialogHeader>
            {editor}
          </AdaptiveDialogContent>
        </AdaptiveDialog>
      )}
    </section>
  );
}
