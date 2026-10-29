import { FileType } from 'trackswap';
import { getBounds, getCenter, getDistance } from 'geolib';

// 定义自己的坐标类型
interface CoordinatePoint {
  latitude: number;
  longitude: number;
}

export interface LocationBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface ProcessedLocationData {
  bounds: LocationBounds;
  center: [number, number];
  totalPoints: number;
  segments: [number, number][][]; // 经过简化和采样处理的分段轨迹
  distance?: number;
}

export class LocationProcessor {
  /**
   * 从 SportFile 提取坐标点
   */
  static extractCoordinates(activityFile: FileType): [number, number][][] {
    const segments: [number, number][][] = [];

    // 处理轨迹数据 - 正确的 FileType 结构
    if (activityFile.activities && activityFile.activities.length > 0) {
      for (const activity of activityFile.activities) {
        // 访问正确的 trackseg 属性
        if (activity.laps && activity.laps.length > 0) {
          for (const segment of activity.laps) {
            // 访问正确的 points 属性
            if (segment.records && segment.records.length > 0) {
              const segmentCoordinates: [number, number][] = [];
              for (const record of segment.records) {
                if (
                  record.positionLong !== undefined &&
                  record.positionLat !== undefined
                ) {
                  segmentCoordinates.push([
                    record.positionLong,
                    record.positionLat,
                  ]);
                }
              }
              // 只添加有效的段（至少有一个点）
              if (segmentCoordinates.length > 0) {
                segments.push(segmentCoordinates);
              }
            }
          }
        }
      }
    }

    return segments;
  }

  /**
   * 将多段坐标扁平化为单个数组
   */
  static flattenSegments(segments: [number, number][][]): [number, number][] {
    return segments.flat();
  }

  /**
   * 将坐标转换为 geolib 格式
   */
  static toGeolibFormat(coordinates: [number, number][]): CoordinatePoint[] {
    return coordinates.map(([lon, lat]) => ({
      latitude: lat,
      longitude: lon,
    }));
  }

  /**
   * 使用 Douglas-Peucker 算法简化轨迹
   */
  static simplifyTrack(
    coordinates: [number, number][],
    tolerance: number = 0.0001,
  ): [number, number][] {
    if (coordinates.length <= 2) return coordinates;

    const getPerpendicularDistance = (
      point: [number, number],
      line: [[number, number], [number, number]],
    ): number => {
      const [x0, y0] = point;
      const [[x1, y1], [x2, y2]] = line;

      const A = x2 - x1;
      const B = y2 - y1;
      const C = x1 - x0;
      const D = y1 - y0;

      const dot = A * C + B * D;
      const lenSq = A * A + B * B;

      if (lenSq === 0) return Math.sqrt(C * C + D * D);

      const param = dot / lenSq;
      const xx = param < 0 ? x1 : param > 1 ? x2 : x1 + param * A;
      const yy = param < 0 ? y1 : param > 1 ? y2 : y1 + param * B;

      const dx = x0 - xx;
      const dy = y0 - yy;
      return Math.sqrt(dx * dx + dy * dy);
    };

    // 使用迭代实现，避免递归栈溢出
    const simplifyIterative = (
      points: [number, number][],
      tolerance: number,
    ): [number, number][] => {
      if (points.length <= 2) return points;

      const marked = new Set<number>();
      const segments: [number, number][] = [[0, points.length - 1]];

      // 标记起点和终点
      marked.add(0);
      marked.add(points.length - 1);

      // 使用栈来模拟递归
      while (segments.length > 0) {
        const [start, end] = segments.pop()!;

        if (end - start <= 1) continue;

        let maxDistance = 0;
        let maxIndex = start;

        // 找到距离最远的点
        for (let i = start + 1; i < end; i++) {
          const distance = getPerpendicularDistance(points[i], [
            points[start],
            points[end],
          ]);
          if (distance > maxDistance) {
            maxDistance = distance;
            maxIndex = i;
          }
        }

        // 如果最大距离超过容差，则分割线段
        if (maxDistance > tolerance && maxIndex !== start && maxIndex !== end) {
          marked.add(maxIndex);
          segments.push([start, maxIndex]);
          segments.push([maxIndex, end]);
        }
      }

      // 按顺序收集标记的点
      const result: [number, number][] = [];
      for (let i = 0; i < points.length; i++) {
        if (marked.has(i)) {
          result.push(points[i]);
        }
      }

      return result;
    };

    return simplifyIterative(coordinates, tolerance);
  }

  /**
   * 处理 SportFile 数据，提取地理信息
   */
  static processActivityFile(
    activityFile: FileType,
    options: {
      simplify?: boolean;
      simplificationTolerance?: number;
      samplingPercentage?: number; // 采样百分比 0-100，默认100%
    } = {},
  ): ProcessedLocationData {
    const {
      simplify = true,
      simplificationTolerance = 0.0001,
      samplingPercentage = 100, // 默认100%保留所有简化后的点
    } = options;
    // 1. 提取坐标点（分段）
    const segments = this.extractCoordinates(activityFile);
    if (segments.length === 0) {
      // 没有有效的GPS坐标数据，抛出异常
      throw new Error('文件中没有有效的GPS轨迹数据');
    }

    // 扁平化所有段用于统计计算
    const originalCoordinates = this.flattenSegments(segments);
    // 2. 转换为 geolib 格式
    const geolibPoints = this.toGeolibFormat(originalCoordinates);
    // 3. 计算边界框
    const bounds = getBounds(geolibPoints);

    const locationBounds: LocationBounds = {
      north: bounds.maxLat,
      south: bounds.minLat,
      east: bounds.maxLng,
      west: bounds.minLng,
    };

    // 4. 计算中心点
    const centerPoint = getCenter(geolibPoints);

    const center: [number, number] = [
      centerPoint && typeof centerPoint === 'object'
        ? centerPoint.longitude
        : 0,
      centerPoint && typeof centerPoint === 'object' ? centerPoint.latitude : 0,
    ];

    // 5. 对每个段分别进行简化和采样处理
    const processedSegments: [number, number][][] = [];
    for (const segment of segments) {
      if (segment.length === 0) continue;

      let processedSegment = segment;

      // 简化处理
      if (simplify && segment.length > 2) {
        // 根据数据量动态调整容差
        let adaptiveTolerance = simplificationTolerance;
        if (segment.length > 10000) {
          adaptiveTolerance = 0.001; // 约110米，适用于大数据量
        } else if (segment.length > 5000) {
          adaptiveTolerance = 0.0005; // 约55米，适用于中等数据量
        }

        processedSegment = this.simplifyTrack(segment, adaptiveTolerance);
        const compressionRate =
          ((segment.length - processedSegment.length) / segment.length) * 100;

        // 如果压缩率太低，尝试更大的容差
        if (compressionRate < 10 && segment.length > 1000) {
          const largerTolerance = adaptiveTolerance * 5;
          const retrySegment = this.simplifyTrack(segment, largerTolerance);
          const retryRate =
            ((segment.length - retrySegment.length) / segment.length) * 100;

          if (retryRate > compressionRate) {
            processedSegment = retrySegment;
          }
        }

        // 根据百分比进行采样（如果不是100%）
        if (samplingPercentage < 100 && samplingPercentage > 0) {
          const targetCount = Math.max(
            2, // 至少保留起点和终点
            Math.round((processedSegment.length * samplingPercentage) / 100),
          );

          if (targetCount < processedSegment.length) {
            const sampled: [number, number][] = [];

            // 计算采样步长
            const step = processedSegment.length / targetCount;

            for (let i = 0; i < targetCount; i++) {
              const index = Math.round(i * step);
              // 确保索引在有效范围内
              const safeIndex = Math.min(index, processedSegment.length - 1);
              sampled.push(processedSegment[safeIndex]);
            }

            // 确保起点和终点总是被包含
            if (sampled[0] !== processedSegment[0]) {
              sampled[0] = processedSegment[0];
            }
            if (
              sampled[sampled.length - 1] !==
              processedSegment[processedSegment.length - 1]
            ) {
              sampled[sampled.length - 1] =
                processedSegment[processedSegment.length - 1];
            }

            processedSegment = sampled;
          }
        }
      }
      processedSegments.push(processedSegment);
    }

    return {
      bounds: locationBounds,
      center,
      totalPoints: originalCoordinates.length,
      segments: processedSegments, // 经过简化和采样处理的分段轨迹
      distance: 0,
    };
  }

  /**
   * 预设的采样配置
   */
  static readonly SAMPLING_PRESETS = {
    FULL: 100, // 完整数据，适用于详细分析
    HIGH: 80, // 高精度，适用于详细地图显示
    MEDIUM: 50, // 中等精度，适用于一般地图显示
    LOW: 20, // 低精度，适用于概览地图
    MINIMAL: 10, // 最小数据，适用于列表预览
  } as const;

  /**
   * 快速处理方法，使用预设配置
   */
  static processForMapDisplay(
    activityFile: FileType,
    preset: 'FULL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'MINIMAL' = 'HIGH',
  ): ProcessedLocationData {
    return this.processActivityFile(activityFile, {
      simplify: true,
      simplificationTolerance: 0.0001,
      samplingPercentage: this.SAMPLING_PRESETS[preset],
    });
  }

  /**
   * 为概览地图优化的处理方法
   */
  static processForOverview(activityFile: FileType): ProcessedLocationData {
    return this.processForMapDisplay(activityFile, 'LOW');
  }

  /**
   * 为详细地图优化的处理方法
   */
  static processForDetails(activityFile: FileType): ProcessedLocationData {
    return this.processForMapDisplay(activityFile, 'HIGH');
  }
}
