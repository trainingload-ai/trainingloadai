import { Injectable, Logger } from '@nestjs/common';
import { find } from 'geo-tz';

/**
 * 服务端根据经纬度推断 IANA 时区（geo-tz）；失败返回 null，由调用方决定是否写入。
 */
@Injectable()
export class TimezoneInferenceService {
  private readonly logger = new Logger(TimezoneInferenceService.name);

  findIanaTimezone(lat: number, lng: number): string | null {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    try {
      const zones = find(lat, lng);
      if (!zones?.length) return null;
      const first = zones[0];
      this.logger.debug(`geo-tz 成功: ${first}, ${zones.join(', ')}`);
      return typeof first === 'string' && first.trim() ? first.trim() : null;
    } catch (e) {
      this.logger.debug(`geo-tz 失败: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }
}
