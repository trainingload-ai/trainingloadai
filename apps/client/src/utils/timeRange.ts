import { TimeRangeOption } from "@/components/TimeRangeFilter";

export interface TimeRangeParams {
  start?: string;
  end?: string;
}

/**
 * Convert TimeRangeOption to API required parameter format
 */
export function convertTimeRangeToParams(timeRange: TimeRangeOption): TimeRangeParams {
  const now = new Date();
  const endDate = now.toISOString();
  
  switch (timeRange) {
    case "all-time":
      return {}; // No time range, get all data
    
    case "past-7-days": {
      const startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return {
        start: startDate.toISOString(),
        end: endDate
      };
    }
    
    case "past-1-month": {
      const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return {
        start: startDate.toISOString(),
        end: endDate
      };
    }
    
    case "past-6-months": {
      const startDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      return {
        start: startDate.toISOString(),
        end: endDate
      };
    }
    
    case "past-1-year": {
      const startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      return {
        start: startDate.toISOString(),
        end: endDate
      };
    }
    
    default:
      return {}; // No time range, get all data
  }
}

/**
 * Format time range display text
 */
export function formatTimeRangeText(timeRange: TimeRangeOption): string {
  switch (timeRange) {
    case "all-time":
      return "All Time";
    case "past-7-days":
      return "Past 7 Days";
    case "past-1-month":
      return "Past 1 Month";
    case "past-6-months":
      return "Past 6 Months";
    case "past-1-year":
      return "Past 1 Year";
    default:
      return "All Time";
  }
}