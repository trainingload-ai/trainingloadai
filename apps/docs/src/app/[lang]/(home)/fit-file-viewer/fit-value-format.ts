const SEMICIRCLES_PER_DEGREE = 2 ** 31 / 180;

export function semicirclesToDegrees(value: number) {
  return value / SEMICIRCLES_PER_DEGREE;
}

export function formatSemicircleCoordinate(value: number, lang: string) {
  return `${new Intl.NumberFormat(lang, {
    minimumFractionDigits: 5,
    maximumFractionDigits: 7,
  }).format(semicirclesToDegrees(value))}°`;
}

export function fitDisplayUnits(units: string | null, type: string | null) {
  if (!units || type === "dateTime" || type === "localDateTime") return null;
  return units
    .split(" / ")
    .map((unit) => {
      if (unit.toLocaleLowerCase() === "semicircles") return "°";
      if (unit === "watts") return "W";
      if (unit === "C") return "°C";
      return unit;
    })
    .join(" / ");
}

export function metersPerSecondToKilometersPerHour(value: number) {
  return value * 3.6;
}

export function metersPerSecondToPaceSecondsPerKilometer(value: number) {
  return value > 0 ? 1_000 / value : undefined;
}
