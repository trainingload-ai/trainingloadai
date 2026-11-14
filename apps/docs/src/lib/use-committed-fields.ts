"use client";

import { useState } from "react";

/** Keep calculation live while validating only the value the user committed. */
export function useCommittedFields() {
  const [values, setValues] = useState<Record<string, string>>({});
  return {
    commit: (field: string, value: string) =>
      setValues((current) => ({ ...current, [field]: value })),
    isCommitted: (field: string, value: string) => values[field] === value,
    hasCommitted: Object.keys(values).length > 0,
  };
}
