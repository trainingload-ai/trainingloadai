// Slope Zone Definition
export const SLOPE_ZONES = [
  {
    name: "Steep Downhill",
    description: "Steep Downhill",
    minSlope: -15,
    maxSlope: -6,
    color: "#0ea5e9",
  },
  {
    name: "Downhill",
    description: "Gentle Downhill",
    minSlope: -6,
    maxSlope: -2,
    color: "#06b6d4",
  },
  {
    name: "Flat",
    description: "Flat or Gentle Slope",
    minSlope: -2,
    maxSlope: 2,
    color: "#10b981",
  },
  {
    name: "Uphill",
    description: "Gentle Uphill",
    minSlope: 2,
    maxSlope: 6,
    color: "#f59e0b",
  },
  {
    name: "Steep Uphill",
    description: "Steep Uphill",
    minSlope: 6,
    maxSlope: 15,
    color: "#f97316",
  },
];

/**
 * Format slope value
 * @param slope Slope value (percentage)
 * @returns Formatted slope string
 */
export function formatSlope(slope: number): string {
  if (!Number.isFinite(slope)) {
    return "--";
  }
  
  const absSlope = Math.abs(slope);
  const sign = slope >= 0 ? "+" : "-";
  
  if (absSlope < 0.1) {
    return "0.0%";
  }
  
  return `${sign}${absSlope.toFixed(1)}%`;
}

/**
 * Get corresponding zone info based on slope value
 * @param slope Slope value (percentage)
 * @returns Slope zone info
 */
export function getSlopeZone(slope: number) {
  return SLOPE_ZONES.find(
    (zone) => slope >= zone.minSlope && slope < zone.maxSlope
  );
}

/**
 * Calculate slope statistics
 * @param slopes Array of slope values
 * @returns Slope statistics
 */
export function calculateSlopeStats(slopes: number[]) {
  const validSlopes = slopes.filter((slope) => Number.isFinite(slope));
  
  if (validSlopes.length === 0) {
    return {
      avg: 0,
      max: 0,
      min: 0,
      std: 0,
    };
  }
  
  const avg = validSlopes.reduce((sum, slope) => sum + slope, 0) / validSlopes.length;
  const max = Math.max(...validSlopes);
  const min = Math.min(...validSlopes);
  
  // Calculate standard deviation
  const variance = validSlopes.reduce((sum, slope) => sum + Math.pow(slope - avg, 2), 0) / validSlopes.length;
  const std = Math.sqrt(variance);
  
  return {
    avg,
    max,
    min,
    std,
  };
}