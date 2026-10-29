import type { ThresholdRecord } from "./threshold-records";

const MAX_BYTES = 20 * 1024 * 1024;
const number = (value: unknown) => {
  if (value == null || value === "") return undefined;
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
};

/** Parse locally and load the FIT SDK only after a FIT file is selected. */
export async function readThresholdFile(
  file: File,
): Promise<ThresholdRecord[]> {
  if (!file.size || file.size > MAX_BYTES) throw new Error("size");
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  let records: ThresholdRecord[];
  if (extension === "fit") {
    const { Decoder, Stream } = await import("@garmin/fitsdk");
    const decoder = new Decoder(
      Stream.fromArrayBuffer(await file.arrayBuffer()),
    );
    if (!decoder.isFIT()) throw new Error("format");
    const { messages, errors } = decoder.read({
      convertDateTimesToDates: true,
    });
    if (errors.length) throw new Error("format");
    records = (messages.recordMesgs ?? []).map((record) => ({
      seconds:
        record.timestamp instanceof Date
          ? record.timestamp.getTime() / 1000
          : NaN,
      heartRate: number(record.heartRate),
      power: number(record.power),
      distance: number(record.distance),
    }));
  } else if (extension === "gpx" || extension === "tcx") {
    const doc = new DOMParser().parseFromString(
      await file.text(),
      "application/xml",
    );
    if (doc.querySelector("parsererror")) throw new Error("format");
    const tag = extension === "gpx" ? "trkpt" : "Trackpoint";
    const points = Array.from(doc.getElementsByTagNameNS("*", tag));
    let distance = 0;
    let previous: { lat: number; lon: number } | null = null;
    records = points.map((point) => {
      const text = (...names: string[]) => {
        for (const name of names) {
          const value = point.getElementsByTagNameNS("*", name)[0]?.textContent;
          if (value != null) return value;
        }
        return undefined;
      };
      const lat = number(point.getAttribute("lat"));
      const lon = number(point.getAttribute("lon"));
      let gpsDistance: number | undefined;
      if (
        lat != null &&
        lon != null &&
        Math.abs(lat) <= 90 &&
        Math.abs(lon) <= 180
      ) {
        if (previous) {
          const rad = Math.PI / 180;
          const a =
            Math.sin(((lat - previous.lat) * rad) / 2) ** 2 +
            Math.cos(lat * rad) *
              Math.cos(previous.lat * rad) *
              Math.sin(((lon - previous.lon) * rad) / 2) ** 2;
          distance += 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
        }
        gpsDistance = distance;
        previous = { lat, lon };
      }
      return {
        seconds: Date.parse(text("time", "Time") ?? "") / 1000,
        heartRate: number(text("hr", "Value")),
        power: number(text("power", "watts", "Watts")),
        distance: number(text("DistanceMeters", "distance")) ?? gpsDistance,
      };
    });
  } else throw new Error("format");
  records = records
    .filter((point) => Number.isFinite(point.seconds))
    .sort((a, b) => a.seconds - b.seconds);
  records = records.filter(
    (point, index) => index === 0 || point.seconds > records[index - 1].seconds,
  );
  if (records.length < 2 || records.at(-1)!.seconds <= records[0].seconds)
    throw new Error("timestamps");
  const first = records[0].seconds;
  return records.map((point) => ({ ...point, seconds: point.seconds - first }));
}
