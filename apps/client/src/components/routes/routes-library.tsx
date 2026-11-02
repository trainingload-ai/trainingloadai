"use client";
import { useMemo, useId, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  ROUTE_SPORT_CODES,
  type RouteSportCode,
  type SavedRouteDetail,
} from "@shared/routes";
import {
  useSavedRoutes,
  useSavedRoute,
  importSavedRoute,
  removeSavedRoute,
  downloadSavedRoute,
} from "@/api/routes";
import { getLocalizedSportDefinitionName } from "@/api/sports";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { RouteDeliveryActions } from "@deployment/managed-ui";
import { savedRouteMapLayer } from "./route-map-layer";
const MapPreview = dynamic(() => import("@/components/MapBoxMap/MapBoxMap"), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse bg-muted" />,
});
function RoutePreview({ route }: { route: SavedRouteDetail }) {
  const layer = useMemo(
      () => savedRouteMapLayer(route.geometry),
      [route.geometry],
    ),
    id = useId().replaceAll(":", "");
  return (
    <MapPreview
      activityLayer={layer}
      containerId={`route-${id}`}
      fitBoundsPadding={32}
      className="h-72 min-h-0 aspect-auto lg:min-h-0"
    />
  );
}
export function RoutesLibrary() {
  const t = useTranslations("RoutesPage"),
    sportT = useTranslations("SportCatalog"),
    locale = useLocale();
  useSetPageTitle(t("title"));
  const list = useSavedRoutes(),
    queryClient = useQueryClient(),
    [selected, setSelected] = useState<string | null>(null),
    detail = useSavedRoute(selected);
  const [editing, setEditing] = useState(false),
    [target, setTarget] = useState<SavedRouteDetail | null>(null),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [sportCode, setSportCode] = useState<RouteSportCode>("ROAD_RUNNING"),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [removing, setRemoving] = useState(false);
  const request = useRef(""),
    formId = useId(),
    rows = list.data?.pages.flatMap((page) => page.items) ?? [];
  const label = (code: string) =>
    getLocalizedSportDefinitionName({ code, displayName: code }, sportT);
  const distance = (meters: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
      meters / 1000,
    ) + " km";
  const height = (meters: number | null) =>
    meters == null
      ? t("missingElevation")
      : new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
          meters,
        ) + " m";
  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["saved-routes"] }),
      queryClient.invalidateQueries({ queryKey: ["saved-route"] }),
    ]);
  }
  function begin(route: SavedRouteDetail | null) {
    setTarget(route);
    setName(route?.name ?? "");
    setDescription(route?.description ?? "");
    setSportCode(route?.sportCode ?? "ROAD_RUNNING");
    setFile(null);
    setEditing(true);
    setError("");
    setNotice("");
    request.current = crypto.randomUUID();
  }
  function failed(cause: unknown) {
    const code = cause instanceof Error ? cause.message : "";
    setError(
      code.includes("REVISION")
        ? t("changed")
        : code.includes("ROUTE_")
          ? t("invalidFile")
          : t("failed"),
    );
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const route = await importSavedRoute({
        name,
        description,
        sportCode,
        file,
        requestId: request.current,
        ...(target
          ? { routeId: target.id, expectedRevision: target.revision }
          : {}),
      });
      setSelected(route.id);
      setEditing(false);
      await refresh();
    } catch (cause) {
      failed(cause);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!detail.data) return;
    setBusy(true);
    setError("");
    try {
      const result = await removeSavedRoute(
        detail.data.id,
        detail.data.revision,
      );
      setNotice(result?.pendingDeliveries ? t("pendingDelete") : t("deleted"));
      setSelected(null);
      setRemoving(false);
      await refresh();
    } catch (cause) {
      setRemoving(false);
      failed(cause);
    } finally {
      setBusy(false);
    }
  }
  const route = detail.data;
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 pb-24 pc:p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <Button onClick={() => begin(null)} disabled={busy}>
          {t("import")}
        </Button>
      </header>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      {editing && (
        <form
          onSubmit={save}
          className="flex flex-col gap-4 rounded-md border border-border p-4"
        >
          <h2 className="text-sm font-semibold">
            {target ? t("newVersion") : t("import")}
          </h2>
          <FieldGroup className="gap-4 pc:grid pc:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`${formId}-name`}>{t("name")}</FieldLabel>
              <Input
                id={`${formId}-name`}
                value={name}
                maxLength={100}
                required
                disabled={busy}
                onChange={(e) => {
                  setName(e.target.value);
                  request.current = crypto.randomUUID();
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${formId}-sport`}>{t("sport")}</FieldLabel>
              <Select
                value={sportCode}
                disabled={busy}
                onValueChange={(value) => {
                  setSportCode(value as RouteSportCode);
                  request.current = crypto.randomUUID();
                }}
              >
                <SelectTrigger id={`${formId}-sport`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {ROUTE_SPORT_CODES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {label(code)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field className="pc:col-span-2">
              <FieldLabel htmlFor={`${formId}-description`}>
                {t("notes")}
              </FieldLabel>
              <Textarea
                id={`${formId}-description`}
                value={description}
                maxLength={2000}
                disabled={busy}
                onChange={(e) => {
                  setDescription(e.target.value);
                  request.current = crypto.randomUUID();
                }}
              />
            </Field>
            <Field className="pc:col-span-2">
              <FieldLabel htmlFor={`${formId}-file`}>GPX</FieldLabel>
              <Input
                id={`${formId}-file`}
                type="file"
                accept=".gpx,application/gpx+xml"
                required
                disabled={busy}
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  request.current = crypto.randomUUID();
                }}
              />
              <p className="text-xs text-muted-foreground">{t("fileHint")}</p>
            </Field>
          </FieldGroup>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              {t("cancel")}
            </Button>
            <Button disabled={busy || !file || !name.trim()}>
              {busy ? t("saving") : t("save")}
            </Button>
          </div>
        </form>
      )}
      <div className="grid min-w-0 gap-5 pc:grid-cols-[minmax(220px,1fr)_minmax(0,2fr)]">
        <section
          aria-label={t("title")}
          className="flex min-w-0 flex-col gap-2"
        >
          {list.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t("loading")}
            </p>
          ) : list.isError ? (
            <Button variant="outline" onClick={() => list.refetch()}>
              {t("retry")}
            </Button>
          ) : !rows.length ? (
            <p className="py-8 text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            rows.map((row) => (
              <button
                key={row.id}
                type="button"
                aria-pressed={selected === row.id}
                onClick={() => {
                  setSelected(row.id);
                  setError("");
                }}
                className="flex w-full min-w-0 flex-col gap-1 rounded-md border border-border p-3 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-muted"
              >
                <span className="break-words text-sm font-medium">
                  {row.name}
                  {row.deletedAt ? " · " + t("pendingDelete") : ""}
                </span>
                <span className="text-xs text-muted-foreground">
                  {label(row.sportCode)} · {distance(row.distanceMeters)} ·{" "}
                  {height(row.elevationGainMeters)}
                </span>
              </button>
            ))
          )}
          {list.hasNextPage && (
            <Button
              variant="outline"
              disabled={list.isFetchingNextPage}
              onClick={() => list.fetchNextPage()}
            >
              {t("more")}
            </Button>
          )}
        </section>
        <section className="min-w-0">
          {detail.isFetching && selected ? (
            <p role="status">{t("loading")}</p>
          ) : detail.isError ? (
            <Button variant="outline" onClick={() => detail.refetch()}>
              {t("retry")}
            </Button>
          ) : route ? (
            <div className="flex flex-col gap-4">
              <div className="overflow-hidden rounded-md border border-border">
                <RoutePreview route={route} />
              </div>
              <div>
                <h2 className="break-words text-base font-semibold">
                  {route.name}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {label(route.sportCode)} · {distance(route.distanceMeters)} ·{" "}
                  {t("ascent")}: {height(route.elevationGainMeters)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("geometry", {
                    points: route.pointCount,
                    segments: route.segmentCount,
                    revision: route.revision,
                  })}
                </p>
                {route.description && (
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm">
                    {route.description}
                  </p>
                )}
              </div>
              {!route.deletedAt && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        await downloadSavedRoute(route.id);
                      } catch (cause) {
                        failed(cause);
                      }
                    }}
                  >
                    {t("download")}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => begin(route)}
                  >
                    {t("newVersion")}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => setRemoving(true)}
                  >
                    {t("delete")}
                  </Button>
                </div>
              )}
              <RouteDeliveryActions route={route} />
              {route.deliveries.length > 0 && (
                <ul className="flex flex-col gap-2 border-t border-border pt-3 text-sm">
                  {route.deliveries.map((delivery) => (
                    <li
                      key={delivery.id}
                      className="flex flex-wrap justify-between gap-2"
                    >
                      <span>{delivery.provider}</span>
                      <span className="text-muted-foreground">
                        {t(`state.${delivery.state}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="py-8 text-sm text-muted-foreground">{t("select")}</p>
          )}
        </section>
      </div>
      <AlertDialog
        open={removing}
        onOpenChange={(value) => {
          if (!busy) setRemoving(value);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteHint")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("cancel")}</AlertDialogCancel>
            <Button variant="destructive" disabled={busy} onClick={remove}>
              {t("delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
