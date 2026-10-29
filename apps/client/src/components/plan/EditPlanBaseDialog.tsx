"use client";

import React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePlanStore } from "@/lib/plan-store";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { PlanDescription } from "../tiptap/rich-text-editor";
import { useTranslations } from "next-intl";

interface CreatePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
}

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  weeks: z.coerce
    .number()
    .int()
    .min(1, "Weeks must be at least 1")
    .max(52, "Weeks must be at most 52"),
  description: z.string().trim().optional(),
});

type FormValues = z.infer<typeof schema>;

export const EditPlanBaseDialog: React.FC<CreatePlanDialogProps> = ({
  open,
  onOpenChange,
  onSave,
}) => {
  const t = useTranslations("PlanEditorBase");
  const initCurrent = usePlanStore((s) => s.initCurrent);

  const form = useForm<FormValues>({
    mode: "onSubmit",
    resolver: zodResolver(schema),
    defaultValues: { name: "", weeks: 1, description: "" },
  });

  React.useEffect(() => {
    if (open) {
      form.reset({ name: "", weeks: 1, description: "" });
    }
  }, [form, open]);

  const onSubmit = (values: FormValues) => {
    initCurrent(values.name, values.weeks, values.description || "");
    onSave?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[100vw] md:w-[50vw] max-w-none sm:max-w-none h-auto grid grid-rows-[auto_1fr] p-4">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-4 py-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="grid grid-cols-4 items-center gap-4">
                    <FormLabel className="text-right">{t("fields.name.label")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("fields.name.placeholder")}
                        className="col-span-3"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="col-start-2 col-span-3" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="weeks"
                render={({ field }) => (
                  <FormItem className="grid grid-cols-4 items-center gap-4">
                    <FormLabel className="text-right">{t("fields.weeks.label")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={52}
                        className="col-span-3"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="col-start-2 col-span-3" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="grid grid-cols-4 items-center gap-4">
                    <FormLabel className="text-right">{t("fields.description.label")}</FormLabel>
                    <FormControl>
                      <div className="col-span-3 h-[200px] overflow-hidden rounded-md md:h-[400px]">
                        <PlanDescription {...field} className="h-full" />
                      </div>
                    </FormControl>
                    <FormMessage className="col-start-2 col-span-3" />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="submit">{t("buttons.continue")}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
