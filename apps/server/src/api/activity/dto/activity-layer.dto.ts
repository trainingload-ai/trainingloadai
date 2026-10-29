export interface ActivityLayerDto {
  // Bounding box [SouthWest, NorthEast] - [[lat, lng], [lat, lng]]
  bounds?: [[number, number], [number, number]];
  // Center point [lng, lat]
  center?: [number, number];

  maps: Array<{
    hashId: string;
    polyline: string;
    /**
     * 活动开始时间（用于地图按时间新旧着色）
     * - 以 ISO 字符串返回，前端可直接 Date.parse
     */
    startTime?: string;
  }>;
}
