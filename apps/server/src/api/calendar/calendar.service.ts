import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PlanQueryService } from '@/api/plan/application/plan-query.service';
import { CompetitionQueryService } from '@/api/competition/application/competition-query.service';
import { CalendarSubscriptionRepository } from './persistence/calendar-subscription.repository';

type CalendarSubscriptionResponse = {
  feedUrl: string;
  webcalUrl: string;
  scope: string;
  createdAt: Date;
  updatedAt: Date;
};

const TRAINING_CALENDAR_SCOPE = 'TRAINING_CALENDAR';
const ACTIVE_PLAN_SCOPE = 'ACTIVE_PLAN';

function stripQuotes(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function calendarApiBaseUrl() {
  const configured =
    process.env.CALENDAR_FEED_PUBLIC_URL || process.env.NEXT_PUBLIC_API_URL;
  if (configured?.trim()) return stripQuotes(configured).replace(/\/+$/, '');

  return `http://127.0.0.1:${process.env.PORT || '3001'}`;
}

function toWebcalUrl(feedUrl: string) {
  return feedUrl.replace(/^https?:\/\//i, 'webcal://');
}

function buildUrls(token: string) {
  const feedUrl = `${calendarApiBaseUrl()}/calendar/${encodeURIComponent(token)}.ics`;
  return {
    feedUrl,
    webcalUrl: toWebcalUrl(feedUrl),
  };
}

function generateToken() {
  return randomBytes(32).toString('base64url');
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function formatUtcTimestamp(date: Date) {
  return [
    date.getUTCFullYear(),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate()),
    'T',
    pad2(date.getUTCHours()),
    pad2(date.getUTCMinutes()),
    pad2(date.getUTCSeconds()),
    'Z',
  ].join('');
}

function formatAllDayDate(date: Date) {
  return [
    date.getUTCFullYear(),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate()),
  ].join('');
}

function formatLocalDateTime(date: Date, minuteOfDay: number) {
  return `${formatAllDayDate(date)}T${pad2(Math.floor(minuteOfDay / 60))}${pad2(minuteOfDay % 60)}00`;
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function foldLine(line: string) {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const chunks: string[] = [];
  let current = '';
  let limit = 75;
  for (const character of line) {
    if (Buffer.byteLength(current + character, 'utf8') > limit) {
      chunks.push(current);
      current = ` ${character}`;
      limit = 75;
    } else {
      current += character;
    }
  }
  if (current) chunks.push(current);
  return chunks.join('\r\n');
}

function icsLine(name: string, value: string) {
  return foldLine(`${name}:${escapeIcsText(value)}`);
}

function firstNonEmptyLine(value?: string | null) {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

function sportLabel(sportType?: string | null) {
  switch (sportType) {
    case 'RUN':
      return 'Run';
    case 'CYCLING':
      return 'Ride';
    case 'SWIM':
      return 'Swim';
    case 'STRETCHING':
      return 'Stretching';
    default:
      return 'Workout';
  }
}

function importanceLabel(importance: string) {
  switch (importance) {
    case 'CRITICAL':
      return 'Critical';
    case 'HIGH':
      return 'High';
    case 'MEDIUM':
      return 'Medium';
    default:
      return 'Low';
  }
}

@Injectable()
export class CalendarService {
  constructor(
    private readonly planQuery: PlanQueryService,
    private readonly subscriptions: CalendarSubscriptionRepository,
    private readonly competitions: CompetitionQueryService,
  ) {}

  async getOrCreateSubscription(
    userId: string,
  ): Promise<CalendarSubscriptionResponse> {
    let subscription = await this.subscriptions.findFirst({
      where: { userId, scope: TRAINING_CALENDAR_SCOPE, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      subscription = await this.subscriptions.create({
        data: {
          userId,
          token: generateToken(),
          scope: TRAINING_CALENDAR_SCOPE,
        },
      });
    }

    return {
      ...buildUrls(subscription.token),
      scope: subscription.scope,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
    };
  }

  async resetSubscription(
    userId: string,
  ): Promise<CalendarSubscriptionResponse> {
    await this.subscriptions.updateMany({
      where: { userId, scope: TRAINING_CALENDAR_SCOPE, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const subscription = await this.subscriptions.create({
      data: {
        userId,
        token: generateToken(),
        scope: TRAINING_CALENDAR_SCOPE,
      },
    });

    return {
      ...buildUrls(subscription.token),
      scope: subscription.scope,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
    };
  }

  async buildTrainingPlanFeed(token: string) {
    const subscription = await this.subscriptions.findUnique({
      where: { token },
      select: { id: true, userId: true, scope: true, revokedAt: true },
    });

    if (!subscription || subscription.revokedAt) {
      throw new NotFoundException('Calendar subscription not found');
    }

    await this.subscriptions.update({
      where: { id: subscription.id },
      data: { lastAccessedAt: new Date() },
    });

    const plans = await this.planQuery.findCalendarFeedPlans(
      subscription.userId,
    );
    const competitionEvents =
      subscription.scope === ACTIVE_PLAN_SCOPE
        ? []
        : await this.competitions.findCalendarFeedEvents(subscription.userId);

    const now = new Date();
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TrainingLoad.ai//Training Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${subscription.scope === ACTIVE_PLAN_SCOPE ? 'TrainingLoad.ai Training Plan' : 'TrainingLoad.ai Training Calendar'}`,
      'X-PUBLISHED-TTL:PT1H',
      'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    ];

    for (const plan of plans) {
      for (const workout of plan.workouts) {
        if (!workout.scheduledDate) continue;
        const title =
          workout.name?.trim() || firstNonEmptyLine(workout.text) || 'Workout';
        const summary = `${sportLabel(workout.sportType)} - ${title}`;
        const description = [
          `Plan: ${plan.title}`,
          workout.text?.trim() ? `Workout: ${workout.text.trim()}` : null,
          workout.notes?.trim() ? `Notes: ${workout.notes.trim()}` : null,
          `Status: ${workout.status}`,
        ]
          .filter(Boolean)
          .join('\n\n');

        lines.push(
          'BEGIN:VEVENT',
          icsLine('UID', `plan-workout-${workout.id}@trainingload.ai`),
          `DTSTAMP:${formatUtcTimestamp(now)}`,
          `LAST-MODIFIED:${formatUtcTimestamp(workout.updatedAt ?? plan.updatedAt)}`,
          `SEQUENCE:${Math.max(0, Math.floor((workout.updatedAt ?? plan.updatedAt).getTime() / 1000))}`,
          icsLine('SUMMARY', summary),
          icsLine('DESCRIPTION', description),
          `DTSTART;VALUE=DATE:${formatAllDayDate(workout.scheduledDate)}`,
          `DTEND;VALUE=DATE:${formatAllDayDate(addUtcDays(workout.scheduledDate, 1))}`,
          'STATUS:CONFIRMED',
          'TRANSP:TRANSPARENT',
          'END:VEVENT',
        );
      }
    }

    for (const event of competitionEvents) {
      const eventEndDate = addUtcDays(event.endDate ?? event.startDate, 1);
      const distance = event.distanceMeters
        ? `${(event.distanceMeters / 1000).toFixed(event.distanceMeters % 1000 ? 1 : 0)} km`
        : null;
      const target = event.targetTimeSeconds
        ? `${Math.floor(event.targetTimeSeconds / 3600)}:${pad2(Math.floor((event.targetTimeSeconds % 3600) / 60))}`
        : null;
      const description = [
        `Sport: ${sportLabel(event.sportType)}`,
        distance ? `Distance: ${distance}` : null,
        `Importance: ${importanceLabel(event.importance)}`,
        `Goal: ${event.goalType}`,
        target ? `Target time: ${target}` : null,
        event.location?.trim() ? `Location: ${event.location.trim()}` : null,
        event.notes?.trim() ? `Notes: ${event.notes.trim()}` : null,
      ]
        .filter(Boolean)
        .join('\n\n');

      lines.push(
        'BEGIN:VEVENT',
        icsLine('UID', `competition-event-${event.id}@trainingload.ai`),
        `DTSTAMP:${formatUtcTimestamp(now)}`,
        `LAST-MODIFIED:${formatUtcTimestamp(event.updatedAt)}`,
        `SEQUENCE:${event.version}`,
        icsLine('SUMMARY', `Race - ${event.title}`),
        icsLine('DESCRIPTION', description),
        ...(event.location?.trim()
          ? [icsLine('LOCATION', event.location.trim())]
          : []),
        ...(event.startTimeMinute != null && event.timezone
          ? [
              `DTSTART;TZID=${event.timezone}:${formatLocalDateTime(event.startDate, event.startTimeMinute)}`,
              `DTEND;TZID=${event.timezone}:${formatLocalDateTime(eventEndDate, event.startTimeMinute)}`,
            ]
          : [
              `DTSTART;VALUE=DATE:${formatAllDayDate(event.startDate)}`,
              `DTEND;VALUE=DATE:${formatAllDayDate(eventEndDate)}`,
            ]),
        'STATUS:CONFIRMED',
        'TRANSP:TRANSPARENT',
        'CATEGORIES:COMPETITION',
        'END:VEVENT',
      );
    }

    lines.push('END:VCALENDAR');
    return `${lines.join('\r\n')}\r\n`;
  }

  deleteAllForUser(userId: string) {
    return this.subscriptions.deleteMany({ where: { userId } });
  }
}
