"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { PersonalProvider } from "@shared/personal-integrations";
import { personalRequest } from "@/api/personal-integrations";
import { ApiFetchError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Tool = {
  name: string;
  inputSchema: {
    properties?: Record<
      string,
      {
        type?: string;
        enum?: Array<string | number>;
        default?: unknown;
        format?: string;
      }
    >;
    required?: string[];
  };
};
const writeTools = new Set([
  "createSingleWorkout",
  "updateWorkoutDetails",
  "scheduleWorkout",
  "createScheduledWorkout",
  "updateScheduledWorkout",
  "createTrainingPlan",
  "updateTrainingPlan",
  "uploadRouteFile",
]);

/** Optional expert tools expose the full vendor contract without inventing data. */
export function PersonalProviderExplorer({
  provider,
  allowWrites,
  onChanged,
}: {
  provider: PersonalProvider;
  allowWrites: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("PersonalIntegrations");
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<unknown>();
  const [preview, setPreview] = useState<{
    operationId: string;
    hash: string;
  }>();
  const [sensitiveConfirmed, setSensitiveConfirmed] = useState(false);
  const query = useQuery({
    queryKey: ["personal-tools", provider],
    enabled: expanded,
    queryFn: () =>
      personalRequest<
        Array<Tool & { sensitive?: boolean; activity?: boolean }>
      >(
        provider,
        provider === "coros" ? "/tools" : "/resources",
        undefined,
        "GET",
      ),
  });
  const tool = query.data?.find((item) => item.name === selected);
  const isWrite = provider === "coros" && writeTools.has(selected);
  const properties =
    provider === "coros"
      ? (tool?.inputSchema.properties ?? {})
      : tool?.activity
        ? { activityId: { type: "string" } }
        : {
            date: { type: "string", format: "date" },
            startDate: { type: "string", format: "date" },
            endDate: { type: "string", format: "date" },
          };
  const args = () => {
    const data: Record<string, unknown> = {};
    Object.entries(values).forEach(([key, value]) => {
      if (!value.trim()) return;
      const definition = properties[key];
      if (definition?.type === "integer" || definition?.type === "number")
        data[key] = Number(value);
      else if (["object", "array", "boolean"].includes(definition?.type ?? ""))
        data[key] = JSON.parse(value);
      else data[key] = value;
    });
    if (provider === "garmin" && tool?.sensitive)
      data.sensitiveConfirmed = sensitiveConfirmed;
    return data;
  };
  const execute = async (confirm = false) => {
    setBusy(true);
    setError("");
    try {
      if (confirm && preview) {
        setResult(
          await personalRequest(
            provider,
            `/operations/${preview.operationId}/confirm`,
            { hash: preview.hash, confirmed: true },
          ),
        );
        setPreview(undefined);
        onChanged();
      } else if (isWrite) {
        const response = await personalRequest<{
          operationId: string;
          hash: string;
        }>(provider, "/operations/preview", {
          tool: selected,
          args: args(),
          requestId: crypto.randomUUID(),
        });
        setPreview(response);
        setResult({ tool: selected, args: args() });
      } else {
        const response = await personalRequest<{ data: unknown }>(
          provider,
          `/read/${encodeURIComponent(selected)}`,
          args(),
        );
        setResult(response.data);
      }
    } catch (cause) {
      const code = cause instanceof ApiFetchError ? cause.errorCode : "";
      setError(
        t.has(`errors.${code}`)
          ? t(`errors.${code}` as never)
          : t(cause instanceof SyntaxError ? "invalidJson" : "requestFailed"),
      );
    } finally {
      setBusy(false);
    }
  };
  const select = (name: string) => {
    setSelected(name);
    setValues({});
    setResult(undefined);
    setPreview(undefined);
    setError("");
    setSensitiveConfirmed(false);
  };
  return (
    <details
      className="border-t border-border pt-4"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="cursor-pointer font-medium">{t("advanced")}</summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-muted-foreground">{t("advancedHint")}</p>
        {query.isPending && <p role="status">{t("loading")}</p>}
        {query.isError && (
          <p role="alert" className="text-destructive">
            {t("requestFailed")}
          </p>
        )}
        <Label htmlFor={`${provider}-resource`}>{t("resource")}</Label>
        <select
          id={`${provider}-resource`}
          className="h-9 w-full rounded-md border border-input bg-background px-2"
          value={selected}
          onChange={(event) => select(event.target.value)}
        >
          <option value="">{t("chooseResource")}</option>
          {query.data
            ?.filter(
              (item) =>
                item.name !== "queryActivityFitFileDownloadUrls" &&
                (allowWrites || !writeTools.has(item.name)),
            )
            .map((item) => (
              <option key={item.name} value={item.name}>
                {t.has(`tools.${item.name}`)
                  ? t(`tools.${item.name}` as never)
                  : item.name}
              </option>
            ))}
        </select>
        {selected &&
          Object.entries(properties).map(([key, definition]) => {
            const id = `${provider}-arg-${key}`;
            const isJson = ["object", "array"].includes(definition.type ?? "");
            return (
              <div className="space-y-1" key={key}>
                <Label htmlFor={id}>
                  {t.has(`fields.${key}`) ? t(`fields.${key}` as never) : key}
                  {tool?.inputSchema?.required?.includes(key) ? " *" : ""}
                </Label>
                {definition.enum ? (
                  <select
                    id={id}
                    value={values[key] ?? ""}
                    onChange={(e) => {
                      setValues({ ...values, [key]: e.target.value });
                      setPreview(undefined);
                    }}
                    className="h-9 w-full rounded-md border border-input bg-background px-2"
                  >
                    <option value="" />
                    {definition.enum.map((value) => (
                      <option key={String(value)} value={value}>
                        {String(value)}
                      </option>
                    ))}
                  </select>
                ) : isJson || key === "fileContent" ? (
                  <Textarea
                    id={id}
                    className="min-h-28 font-mono text-xs"
                    value={values[key] ?? ""}
                    onChange={(e) => {
                      setValues({ ...values, [key]: e.target.value });
                      setPreview(undefined);
                    }}
                  />
                ) : (
                  <Input
                    id={id}
                    type={
                      definition.format === "date"
                        ? "date"
                        : ["integer", "number"].includes(definition.type ?? "")
                          ? "number"
                          : "text"
                    }
                    value={values[key] ?? ""}
                    onChange={(e) => {
                      setValues({ ...values, [key]: e.target.value });
                      setPreview(undefined);
                    }}
                  />
                )}
                {isJson && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">
                      {t("vendorSchema")}
                    </summary>
                    <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(definition, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            );
          })}
        {tool?.sensitive && (
          <Label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={sensitiveConfirmed}
              onChange={(e) => setSensitiveConfirmed(e.target.checked)}
            />
            {t("sensitiveConfirm")}
          </Label>
        )}
        {isWrite && (
          <p className="text-xs text-muted-foreground">{t("writeHint")}</p>
        )}
        {selected && (
          <Button
            variant="outline"
            disabled={busy || Boolean(tool?.sensitive && !sensitiveConfirmed)}
            onClick={() => void execute()}
          >
            {busy ? t("working") : t(isWrite ? "preview" : "read")}
          </Button>
        )}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {result !== undefined && (
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
        {preview && (
          <div className="space-y-2">
            <p>{t("writeConfirm")}</p>
            <Button disabled={busy} onClick={() => void execute(true)}>
              {t("confirmSend")}
            </Button>
          </div>
        )}
      </div>
    </details>
  );
}
