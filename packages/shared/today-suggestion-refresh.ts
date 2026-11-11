/** Shared Web/App scheduling; normal advice refreshes on expiry, transient states retry at most five times. */
export function createTodaySuggestionRefetchInterval() {
  let generation = "";
  let updatedAt = 0;
  let deliveries = 0;
  return (query: {
    state: { data?: unknown; dataUpdatedAt: number; status?: string };
  }): number | false => {
    if (query.state.status === "error") return false;
    const data = query.state.data as
      | {
          suggestionId?: string;
          validUntil?: string;
          delivery?: { state?: string; reasonCode?: string };
          evidence?: Array<{ code: string }>;
        }
      | undefined;
    if (!data?.suggestionId || !data.validUntil) return false;
    if (data.suggestionId !== generation) {
      generation = data.suggestionId;
      updatedAt = 0;
      deliveries = 0;
    }
    if (query.state.dataUpdatedAt !== updatedAt) {
      updatedAt = query.state.dataUpdatedAt;
      deliveries += 1;
    }
    const transient =
      data.delivery?.state === "FACT_FALLBACK" ||
      data.delivery?.reasonCode === "AI_NOT_CONFIGURED" ||
      data.evidence?.some((item) =>
        ["ACTIVITY_PROCESSING_PENDING", "WAITING_FOR_DATA"].includes(item.code),
      );
    if (transient && deliveries >= 5) return false;
    const expiry = Date.parse(data.validUntil);
    return Number.isFinite(expiry)
      ? Math.max(1_000, expiry - Date.now())
      : false;
  };
}
