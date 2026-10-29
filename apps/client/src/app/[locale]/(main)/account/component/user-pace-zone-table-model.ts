const ZONE_NAMES: Record<string, string> = {
  "Z1 Recovery": "recovery",
  "Z2 Aerobic": "aerobic",
  "Z3 Tempo": "tempo",
  "Z4 SubThreshold": "subThreshold",
  "Z5a SuperThreshold": "superThreshold",
  "Z5b AerobicCapacity": "aerobicCapacity",
  "Z5c AnaerobicCapacity": "anaerobicCapacity",
  Easy: "easyIntensity",
  Moderate: "moderateIntensity",
  Threshold: "thresholdIntensity",
  Interval: "intervalIntensity",
  Repetition: "repetitionIntensity",
  "Recovery/Walking": "recoveryWalking",
  Endurance: "endurance",
  Tempo: "tempo",
  "High Intensity": "highIntensity",
  VO2: "vo2",
  "Anaerobic Capacity": "anaerobicCapacity",
  "Active Recovery": "activeRecovery",
  "VO2 Max": "vo2",
  Anaerobic: "anaerobic",
  Neuromuscular: "neuromuscular",
  "Z1 Easy (E)": "easy",
  "Z2 Marathon (M)": "marathon",
  "Z3 Threshold (T)": "threshold",
  "Z4 Interval (I)": "interval",
  "Z5 Repetition (R)": "repetition",
  "Z1 Super Oxygen Run": "superOxygen",
  "Z2 Slow Run": "slow",
  "Z3 Moderate Run": "moderate",
  "Z4 Fast Run": "fast",
  "Z5 Competition/Sprint": "sprint",
};

export function getZoneNameKey(name: string) {
  return Object.prototype.hasOwnProperty.call(ZONE_NAMES, name)
    ? ZONE_NAMES[name]
    : undefined;
}

/** Resolved API bounds are seconds per meter, ordered fastest to slowest. */
export function formatZonePaceRange(
  zone: { min?: number; max?: number },
  sport: "RUN" | "SWIM",
) {
  const format = (value?: number) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
      return null;
    const seconds = Math.round(value * (sport === "SWIM" ? 100 : 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  };
  const fast = format(zone.min);
  const slow = format(zone.max);
  if (fast && slow) return `${fast}–${slow}`;
  if (fast) return `≥ ${fast}`;
  if (slow) return `≤ ${slow}`;
  return "—";
}

/** Heart rate and power are absolute bpm / watts; zero is a valid bound. */
export function formatNumericZoneRange(zone: { min?: number; max?: number }) {
  const format = (value?: number) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? String(Math.round(value))
      : null;
  const min = format(zone.min);
  const max = format(zone.max);
  if (min !== null && max !== null) return `${min}–${max}`;
  if (min !== null) return `≥ ${min}`;
  if (max !== null) return `≤ ${max}`;
  return "—";
}
