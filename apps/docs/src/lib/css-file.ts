import type { CssSwim } from "./css";

export type SwimFileEffort = CssSwim & {
  kind: "lap" | "lengths" | "activity";
  timing: "timer" | "elapsed";
  index: number;
};

type FitRow = Record<string, unknown>;
const positive = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;

/** FIT distances are decoded in metres, including sessions recorded in a yard pool. */
export function fitSwimEfforts(
  messages: Record<string, FitRow[]>,
): SwimFileEffort[] {
  const sessions = messages.sessionMesgs ?? [];
  if (
    sessions.length &&
    sessions.some(
      (row) => row.sport != null && row.sport !== "swimming" && row.sport !== 5,
    )
  ) {
    throw new Error("sport");
  }
  const lengths = messages.lengthMesgs ?? [];
  const pool = positive(sessions[0]?.poolLength);
  // Rest lengths delimit continuous pool efforts. Never add a rest into an effort.
  if (
    pool &&
    lengths.some((row) => row.lengthType === "idle" || row.lengthType === 0)
  ) {
    const efforts: SwimFileEffort[] = [];
    let distance = 0;
    let timeSec = 0;
    const flush = () => {
      if (distance > 0 && timeSec > 0)
        efforts.push({
          distance,
          timeSec,
          kind: "lengths",
          timing: "timer",
          index: efforts.length + 1,
        });
      distance = 0;
      timeSec = 0;
    };
    for (const row of lengths) {
      const duration = positive(row.totalTimerTime);
      if ((row.lengthType === "active" || row.lengthType === 1) && duration) {
        distance += pool;
        timeSec += duration;
      } else flush();
    }
    flush();
    if (efforts.length) return efforts;
  }
  const laps = messages.lapMesgs ?? [];
  const rows = laps.length ? laps : sessions;
  return rows.flatMap((row, index) => {
    const distance = positive(row.totalDistance);
    const timer = positive(row.totalTimerTime);
    const timeSec = timer ?? positive(row.totalElapsedTime);
    return distance && timeSec
      ? [
          {
            distance,
            timeSec,
            kind: laps.length ? ("lap" as const) : ("activity" as const),
            timing: timer ? ("timer" as const) : ("elapsed" as const),
            index: index + 1,
          },
        ]
      : [];
  });
}

const elements = (root: Document | Element, name: string) =>
  Array.from(root.getElementsByTagNameNS("*", name));
const value = (root: Element, name: string) =>
  elements(root, name)[0]?.textContent?.trim();
const number = (root: Element, name: string) => {
  const text = value(root, name);
  return text ? positive(Number(text)) : null;
};

function trackDistance(points: Element[]) {
  const distances = points.map((point) => {
    const text = value(point, "distance");
    const n = text == null || text === "" ? NaN : Number(text);
    return Number.isFinite(n) && n >= 0 ? n : null;
  });
  if (distances.every((distance) => distance != null)) {
    if (distances.some((distance, i) => i > 0 && distance! < distances[i - 1]!))
      return null;
    return distances.at(-1)! - distances[0]!;
  }
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const coords = [points[i - 1], points[i]].map((point) => [
      point.getAttribute("lat"),
      point.getAttribute("lon"),
    ]);
    if (
      coords
        .flat()
        .some(
          (n) => n == null || n.trim() === "" || !Number.isFinite(Number(n)),
        )
    )
      return null;
    const [[lat1, lon1], [lat2, lon2]] = coords.map((pair) =>
      pair.map((n) => (Number(n) * Math.PI) / 180),
    );
    if (
      Math.abs(lat1) > Math.PI / 2 ||
      Math.abs(lat2) > Math.PI / 2 ||
      Math.abs(lon1) > Math.PI ||
      Math.abs(lon2) > Math.PI
    )
      return null;
    const a =
      Math.sin((lat2 - lat1) / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
    total +=
      6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  }
  return total;
}

export async function readSwimFile(file: File): Promise<SwimFileEffort[]> {
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error("size");
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  let efforts: SwimFileEffort[] = [];
  if (extension === "fit") {
    const { Decoder, Stream } = await import("@garmin/fitsdk");
    const decoder = new Decoder(
      Stream.fromArrayBuffer(await file.arrayBuffer()),
    );
    const decoded = decoder.read({ convertDateTimesToDates: true });
    if (decoded.errors.length) throw new Error("format");
    efforts = fitSwimEfforts(decoded.messages as Record<string, FitRow[]>);
  } else if (extension === "tcx" || extension === "gpx") {
    const document = new DOMParser().parseFromString(
      await file.text(),
      "application/xml",
    );
    if (elements(document, "parsererror").length) throw new Error("format");
    if (extension === "tcx") {
      if (
        elements(document, "Activity").some((activity) =>
          ["running", "biking"].includes(
            (activity.getAttribute("Sport") ?? "").toLowerCase(),
          ),
        )
      )
        throw new Error("sport");
      efforts = elements(document, "Lap").flatMap((lap, index) => {
        const distance = number(lap, "DistanceMeters");
        const timeSec = number(lap, "TotalTimeSeconds");
        return distance && timeSec
          ? [
              {
                distance,
                timeSec,
                kind: "lap" as const,
                timing: "timer" as const,
                index: index + 1,
              },
            ]
          : [];
      });
    } else {
      efforts = elements(document, "trkseg").flatMap((segment, index) => {
        const points = elements(segment, "trkpt");
        if (points.length < 2) return [];
        const times = points.map((point) =>
          Date.parse(value(point, "time") ?? ""),
        );
        if (
          times.some(
            (time, i) =>
              !Number.isFinite(time) || (i > 0 && time < times[i - 1]),
          )
        )
          return [];
        const timeSec = (times.at(-1)! - times[0]) / 1000;
        const distance = trackDistance(points);
        return distance && distance > 0 && timeSec > 0
          ? [
              {
                distance,
                timeSec,
                kind: "activity" as const,
                timing: "elapsed" as const,
                index: index + 1,
              },
            ]
          : [];
      });
    }
  } else throw new Error("format");
  if (!efforts.length) throw new Error("data");
  return efforts;
}
