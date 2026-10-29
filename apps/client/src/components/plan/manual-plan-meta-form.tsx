"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  PLAN_DESCRIPTION_MAX_CHARS,
  planDescriptionToPlainText,
  planDescriptionTextLength,
} from "@/lib/plan-description-limit";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { Minus, Plus } from "lucide-react";
import { useMobileViewport } from "@/hooks/use-mobile";

const DesktopPlanDescription = dynamic(
  () =>
    import("../tiptap/rich-text-editor").then(
      (module) => module.PlanDescription,
    ),
  { ssr: false },
);

export type ManualPlanMetaValues = {
  name: string;
  weeks: number;
  /** 富文本 HTML；空字符串表示未填写 */
  description: string;
};

type ManualPlanMetaFormProps = {
  defaultValues?: Partial<ManualPlanMetaValues>;
  onSubmit: (values: ManualPlanMetaValues) => void;
  submitLabel: string;
  /** 为 true 时不渲染提交按钮（由外层用 `form={id}` 的按钮提交） */
  hideSubmitButton?: boolean;
  id?: string;
};

export function ManualPlanMetaForm({
  defaultValues,
  onSubmit,
  submitLabel,
  hideSubmitButton = false,
  id = "manual-plan-meta-form",
}: ManualPlanMetaFormProps) {
  const t = useTranslations("PlanCreatePage.baseInfo.fields");
  const tv = useTranslations("PlanCreatePage.baseInfo.validation");
  const isMobileViewport = useMobileViewport();

  const schema = React.useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, { message: tv("nameRequired") })
          .max(120, { message: tv("nameTooLong") }),
        weeks: z.coerce
          .number({ invalid_type_error: tv("weeksInvalid") })
          .int({ message: tv("weeksInvalid") })
          .min(1, { message: tv("weeksMin") })
          .max(24, { message: tv("weeksMax") }),
        description: z
          .string()
          .refine(
            (val) =>
              planDescriptionTextLength(val) <= PLAN_DESCRIPTION_MAX_CHARS,
            {
              message: tv("descriptionTooLong", {
                max: PLAN_DESCRIPTION_MAX_CHARS,
              }),
            },
          ),
      }),
    [tv],
  );

  const form = useForm<ManualPlanMetaValues>({
    mode: "onSubmit",
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      weeks: defaultValues?.weeks ?? 4,
      description: defaultValues?.description ?? "",
    },
  });

  React.useEffect(() => {
    form.reset({
      name: defaultValues?.name ?? "",
      weeks: defaultValues?.weeks ?? 4,
      description: defaultValues?.description ?? "",
    });
  }, [
    defaultValues?.name,
    defaultValues?.weeks,
    defaultValues?.description,
    form,
  ]);

  return (
    <Form {...form}>
      <form
        id={id}
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn(
          "flex flex-col gap-6 pc:gap-4",
          hideSubmitButton && "min-h-0 flex-1",
        )}
      >
        <div className="flex shrink-0 flex-col gap-6 pc:flex-row pc:items-start pc:gap-1.5">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="min-w-0 flex-1 pc:max-w-sm">
                <FormLabel className="px-1 text-mobile-caption pc:text-xs font-medium uppercase tracking-wide text-muted-foreground pc:px-0 pc:text-sm pc:normal-case pc:tracking-normal pc:text-foreground">
                  {t("name")}
                </FormLabel>
                <FormControl>
                  <Input
                    autoComplete="off"
                    size="default"
                    className="h-10 w-full rounded-control-lg border-0 bg-neutral-100 px-4 text-[17px] shadow-none focus-visible:ring-0 dark:bg-muted/45 pc:h-9 pc:border pc:bg-background pc:px-3 pc:text-sm pc:focus-visible:ring-1 pc:dark:bg-background"
                    maxLength={120}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="weeks"
            render={({ field }) => (
              <FormItem className="w-full shrink-0 pc:w-[7.25rem]">
                <FormLabel className="px-1 text-mobile-caption pc:text-xs font-medium uppercase tracking-wide text-muted-foreground pc:px-0 pc:text-sm pc:normal-case pc:tracking-normal pc:text-foreground">
                  {t("weeks")}
                </FormLabel>
                <div className="flex h-14 items-center rounded-control-lg bg-neutral-100 px-2 dark:bg-muted/45 pc:hidden">
                  <button
                    type="button"
                    aria-label={t("weeks") + " -"}
                    disabled={Number(field.value) <= 1}
                    onClick={() =>
                      field.onChange(Math.max(1, Number(field.value) - 1))
                    }
                    className="grid size-10 place-items-center rounded-control text-muted-foreground transition-colors active:bg-neutral-100 disabled:opacity-30 dark:active:bg-muted"
                  >
                    <Minus className="size-4" />
                  </button>
                  <div className="min-w-0 flex-1 text-center">
                    <div className="text-xl font-semibold tabular-nums text-foreground">
                      {Number(field.value)}
                    </div>
                    <div className="text-mobile-caption pc:text-[11px] text-muted-foreground">
                      {t("weeks")
                        .replace(/[（）()]/g, " ")
                        .trim()
                        .split(" ")
                        .at(-1)}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={t("weeks") + " +"}
                    disabled={Number(field.value) >= 24}
                    onClick={() =>
                      field.onChange(Math.min(24, Number(field.value) + 1))
                    }
                    className="grid size-10 place-items-center rounded-control text-muted-foreground transition-colors active:bg-neutral-100 disabled:opacity-30 dark:active:bg-muted"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
                <FormControl>
                  <Input
                    type="number"
                    size="default"
                    min={1}
                    max={24}
                    className="hidden bg-background pc:flex"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem className="flex min-h-[10rem] flex-1 flex-col pc:min-h-[12rem]">
              <FormLabel className="px-1 text-mobile-caption pc:text-xs font-medium uppercase tracking-wide text-muted-foreground pc:px-0 pc:text-sm pc:normal-case pc:tracking-normal pc:text-foreground">
                {t("description")}
              </FormLabel>
              <FormControl>
                {isMobileViewport === undefined ? (
                  <div className="min-h-32 flex-1 rounded-control-lg bg-neutral-100 dark:bg-muted/45 pc:min-h-0 pc:border pc:bg-background pc:dark:bg-background" />
                ) : isMobileViewport ? (
                  <Textarea
                    ref={field.ref}
                    name={field.name}
                    value={planDescriptionToPlainText(field.value ?? "")}
                    onBlur={field.onBlur}
                    onChange={field.onChange}
                    maxLength={PLAN_DESCRIPTION_MAX_CHARS}
                    className="min-h-32 flex-1 resize-none rounded-control-lg border-0 bg-neutral-100 px-4 py-3 text-base leading-6 shadow-none focus-visible:ring-0 dark:bg-muted/45"
                  />
                ) : (
                  <DesktopPlanDescription
                    {...field}
                    className="min-h-32 flex-1 rounded-control-lg border-0 bg-neutral-100 dark:bg-muted/45 pc:min-h-0 pc:border pc:bg-background pc:dark:bg-background pc:[&>div:first-child]:!block"
                  />
                )}
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {hideSubmitButton ? null : (
          <div className="flex justify-end pt-1">
            <Button type="submit" className="w-full pc:w-auto">
              {submitLabel}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}
