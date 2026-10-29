import { SensorRecord } from '../sensor/sensor-data.service';

/**
 * Grade calculation utilities
 */

/**
 * Method 1: Dual Threshold Method
 *
 * Principle:
 * GPS altitude data usually contains noise. Calculating grade directly from adjacent points leads to drastic fluctuations.
 * The threshold method sets a minimum distance threshold (e.g., 20m) and a minimum elevation change threshold (e.g., 2m).
 * Only when both cumulative distance and elevation change meet the conditions (or max search distance is reached),
 * the grade is calculated as the ratio of elevation difference to distance for that segment.
 * @version 0.0.1
 * @param records Array of sensor records
 * @param thresholdDistance Distance threshold in meters, default is 20m
 * @param thresholdElevation Elevation threshold in meters, default is 3m. If elevation difference is less than this, it's considered flat (0%) or search continues.
 * @returns Grade array (percentage, e.g., 5.5 means 5.5%)
 */
export function calculateGradeByDualThreshold(
  records: SensorRecord[],
  thresholdDistance: number = 20,
  thresholdElevation: number = 3,
): number[] {
  const length = records.length;
  if (length === 0) {
    return [];
  }

  // Extract arrays for calculation
  const distances = records.map((r) => r.distance ?? 0);
  const altitudes = records.map((r) => r.enhancedAltitude ?? r.altitude ?? 0);

  const grades = new Array(length).fill(0);
  const maxSearchDistance = 200; // Prevent infinite window expansion on flat terrain

  // Simple sliding window strategy:
  // Expand window until: distance >= thresholdDistance AND abs(altDelta) >= thresholdElevation
  // If maxSearchDistance is exceeded without meeting elevation threshold, consider it flat (grade=0)

  for (let i = 0; i < length; i++) {
    let start = i;
    let end = i;

    // Helper: get current window metrics
    const getWindowMetrics = (s: number, e: number) => ({
      dist: distances[e] - distances[s],
      altDiff: Math.abs(altitudes[e] - altitudes[s]),
    });

    // 1. Basic expansion: satisfy minimum distance threshold first (center expansion)
    while (
      end < length - 1 &&
      distances[end] - distances[i] < thresholdDistance / 2
    ) {
      end++;
    }
    while (
      start > 0 &&
      distances[i] - distances[start] < thresholdDistance / 2
    ) {
      start--;
    }
    // Fill up distance
    while (
      end < length - 1 &&
      distances[end] - distances[start] < thresholdDistance
    ) {
      end++;
    }
    while (start > 0 && distances[end] - distances[start] < thresholdDistance) {
      start--;
    }

    // 2. Advanced expansion: if elevation difference is insufficient, keep searching until threshold met or max distance exceeded
    while (start > 0 || end < length - 1) {
      const { dist, altDiff } = getWindowMetrics(start, end);

      if (altDiff >= thresholdElevation) break; // Elevation threshold met
      if (dist >= maxSearchDistance) break; // Max search distance exceeded, stop

      // Prefer searching forward
      if (end < length - 1) {
        end++;
      } else if (start > 0) {
        start--;
      }
    }

    const distDelta = distances[end] - distances[start];
    const altDelta = altitudes[end] - altitudes[start];

    // Calculate grade only if elevation difference meets threshold, otherwise consider noise/flat
    if (distDelta > 0 && Math.abs(altDelta) >= thresholdElevation) {
      grades[i] = (altDelta / distDelta) * 100;
    } else {
      grades[i] = 0;
    }
  }

  return grades;
}

/**
 * Method 2: Douglas-Peucker Algorithm
 *
 * Principle:
 * This is a curve simplification algorithm. It recursively finds the point furthest from the current line segment.
 * If that distance exceeds a threshold (epsilon), it keeps that key point and splits the curve into two segments for recursion.
 *
 * Application in grade calculation:
 * 1. Treat (distance, altitude) as a 2D curve.
 * 2. Use Douglas-Peucker algorithm to simplify this curve, obtaining a series of key inflection points.
 * 3. The segments between key points are the simplified grade segments, and their slope is the grade.
 * 4. Added post-processing: merge adjacent segments with grade difference < 1% to reduce fragmentation.
 * 5. For all original points between two key points, assign the grade of that segment.
 *
 * This method excellently preserves terrain features (like long climbs, flats, descent inflection points) while removing minor noise fluctuations.
 * @version 0.0.1
 * @param records Array of sensor records
 * @param epsilon Elevation error threshold in meters, default is 1.5m
 * @returns Grade array (percentage)
 */
export function calculateGradeByDouglasPeucker(
  records: SensorRecord[],
  epsilon: number = 3,
): number[] {
  if (!records || records.length === 0) {
    return [];
  }

  const length = records.length;
  const grades = new Array(length).fill(0);

  // 1. Extract points (x: distance, y: altitude, index: original index)
  // Filter out invalid points, but keep index mapping for backfilling
  interface Point {
    x: number;
    y: number;
    index: number;
  }

  const points: Point[] = [];
  for (let i = 0; i < length; i++) {
    const r = records[i];
    // Prefer enhancedAltitude and enhancedSpeed/distance (if needed)
    // Here focusing on distance and altitude
    // Note: some records might miss distance or altitude, treated as invalid and skipped
    const dist = r.distance;
    const alt = r.enhancedAltitude ?? r.altitude;

    if (typeof dist === 'number' && typeof alt === 'number') {
      points.push({ x: dist, y: alt, index: i });
    }
  }

  if (points.length < 2) {
    return grades;
  }

  // 2. Recursive simplification
  // Result contains kept key points
  let keepPoints = douglasPeucker(points, epsilon);

  // 2.1 Post-processing: Merge similar grade segments
  // If grade difference between two adjacent segments is < 1%, treat as same grade, remove intermediate point
  keepPoints = mergeSegments(keepPoints, 1.0);

  // Ensure start and end points are kept (DP algorithm property, but for safety)

  // 3. Calculate grade and backfill
  for (let i = 0; i < keepPoints.length - 1; i++) {
    const p1 = keepPoints[i];
    const p2 = keepPoints[i + 1];

    const distDelta = p2.x - p1.x;
    const altDelta = p2.y - p1.y;

    let grade = 0;
    if (distDelta > 0) {
      grade = (altDelta / distDelta) * 100;
    }

    // Apply this grade to all points between p1.index and p2.index
    // Note: p2.index itself might be the start of the next segment.
    // Here we define: points within this segment have the average grade of the segment.
    // Including p1, excluding p2 (p2 will be determined by next segment, or as end point)
    // Last point's grade is usually set to 0 or same as previous segment.

    for (let k = p1.index; k < p2.index; k++) {
      grades[k] = grade;
    }
  }

  // Handle the last point, use previous segment's grade
  if (keepPoints.length > 1) {
    const lastPointIndex = keepPoints[keepPoints.length - 1].index;
    // Actually the loop above filled up to lastPointIndex - 1
    // Set lastPointIndex grade same as lastPointIndex - 1
    if (lastPointIndex > 0) {
      grades[lastPointIndex] = grades[lastPointIndex - 1];
    }
  }

  return grades;
}

/**
 * Ramer-Douglas-Peucker Algorithm Implementation
 */
function douglasPeucker(
  points: { x: number; y: number; index: number }[],
  epsilon: number,
): { x: number; y: number; index: number }[] {
  if (points.length <= 2) {
    return points;
  }

  let dmax = 0;
  let index = 0;
  const end = points.length - 1;

  // Find the point furthest from the line (points[0] - points[end])
  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  // If max distance is greater than epsilon, recurse
  if (dmax > epsilon) {
    const recResults1 = douglasPeucker(points.slice(0, index + 1), epsilon);
    const recResults2 = douglasPeucker(points.slice(index), epsilon);

    // Merge results, note recResults1's last point and recResults2's first point are duplicates (points[index])
    return recResults1.slice(0, recResults1.length - 1).concat(recResults2);
  } else {
    return [points[0], points[end]];
  }
}

/**
 * Calculate perpendicular distance from point p to line (p1, p2)
 */
function perpendicularDistance(
  p: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
): number {
  if (p1.x === p2.x && p1.y === p2.y) {
    // p1 and p2 coincide, distance is point-to-point distance
    return Math.sqrt(Math.pow(p.x - p1.x, 2) + Math.pow(p.y - p1.y, 2));
  }

  // Line equation: Ax + By + C = 0
  // (y1 - y2)x + (x2 - x1)y + x1y2 - x2y1 = 0

  const A = p1.y - p2.y;
  const B = p2.x - p1.x;
  const C = p1.x * p2.y - p2.x * p1.y;

  return Math.abs(A * p.x + B * p.y + C) / Math.sqrt(A * A + B * B);
}

/**
 * Merge segments with similar grades
 * @param points
 * @param gradeDiffThreshold Grade difference threshold (%)
 */
function mergeSegments(
  points: { x: number; y: number; index: number }[],
  gradeDiffThreshold: number = 1.0,
): { x: number; y: number; index: number }[] {
  if (points.length < 3) return points;

  const merged: typeof points = [points[0]];

  for (let i = 1; i < points.length - 1; i++) {
    const pPrev = merged[merged.length - 1];
    const pCurr = points[i];
    const pNext = points[i + 1];

    // Calculate slope of prev segment (pPrev -> pCurr)
    const dist1 = pCurr.x - pPrev.x;
    const grade1 = dist1 > 0 ? ((pCurr.y - pPrev.y) / dist1) * 100 : 0;

    // Calculate slope of next segment (pCurr -> pNext)
    const dist2 = pNext.x - pCurr.x;
    const grade2 = dist2 > 0 ? ((pNext.y - pCurr.y) / dist2) * 100 : 0;

    // If difference is small, skip pCurr (effectively merging pPrev->pCurr and pCurr->pNext into pPrev->pNext)
    if (Math.abs(grade1 - grade2) < gradeDiffThreshold) {
      // Skip pCurr
      continue;
    } else {
      merged.push(pCurr);
    }
  }

  merged.push(points[points.length - 1]);
  return merged;
}
