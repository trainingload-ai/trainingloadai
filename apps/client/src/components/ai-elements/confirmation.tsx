"use client";

// Adapted from AI Elements Confirmation, Apache-2.0. See NOTICE.
// The domain ledger still owns authorization; this is presentation only.
import type { ToolUIPart } from "ai";
import {
  createContext,
  useContext,
  useMemo,
  type ComponentProps,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Approval = { id: string; approved?: boolean };
type ConfirmationState = { approval: Approval; state: ToolUIPart["state"] };
const ConfirmationContext = createContext<ConfirmationState | null>(null);
function useConfirmation() {
  const context = useContext(ConfirmationContext);
  if (!context) throw new Error("Confirmation children require Confirmation");
  return context;
}
export function Confirmation({
  approval,
  state,
  className,
  ...props
}: ComponentProps<"div"> & ConfirmationState) {
  const value = useMemo(() => ({ approval, state }), [approval, state]);
  if (state === "input-streaming" || state === "input-available") return null;
  return (
    <ConfirmationContext.Provider value={value}>
      <div
        role="group"
        className={cn(
          "flex flex-col gap-3 rounded-md bg-neutral-100 p-4 text-sm dark:bg-muted/45",
          className,
        )}
        {...props}
      />
    </ConfirmationContext.Provider>
  );
}
export function ConfirmationRequest({ children }: { children: ReactNode }) {
  return useConfirmation().state === "approval-requested" ? children : null;
}
export function ConfirmationAccepted({ children }: { children: ReactNode }) {
  const { approval, state } = useConfirmation();
  return approval.approved === true &&
    ["approval-responded", "output-available"].includes(state)
    ? children
    : null;
}
export function ConfirmationRejected({ children }: { children: ReactNode }) {
  const { approval, state } = useConfirmation();
  return approval.approved === false &&
    ["approval-responded", "output-denied"].includes(state)
    ? children
    : null;
}
export function ConfirmationActions({
  className,
  ...props
}: ComponentProps<"div">) {
  if (useConfirmation().state !== "approval-requested") return null;
  return (
    <div
      className={cn("flex flex-wrap items-center justify-end gap-2", className)}
      {...props}
    />
  );
}
export function ConfirmationAction(props: ComponentProps<typeof Button>) {
  return <Button type="button" size="sm" {...props} />;
}
