import { formatDistanceStrict } from "date-fns";

const utcDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const utcPointFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});

export type DashboardResolvedWindow = {
  referenceDate: Date;
  start: Date;
  endExclusive: Date;
  startDate: string;
  endDate: string;
  pointDates: Date[];
};

export function getUtcDayStart(value: Date) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export function getUtcDayEndExclusive(value: Date) {
  return addUtcDays(getUtcDayStart(value), 1);
}

export function addUtcDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

export function toUtcIsoDate(value: Date) {
  return getUtcDayStart(value).toISOString().slice(0, 10);
}

export function parseUtcIsoDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatUtcDateLabel(value: Date) {
  return utcDateFormatter.format(value);
}

export function formatDashboardPointLabel(value: Date) {
  return utcPointFormatter.format(value);
}

export function formatRelativeFromReference(
  value: Date | string,
  referenceDate: Date,
) {
  return formatDistanceStrict(new Date(value), referenceDate, {
    addSuffix: true,
  });
}

export function createDashboardWindow(params: {
  referenceDate: Date;
  startDate?: string;
  endDate?: string;
}): DashboardResolvedWindow {
  const referenceDate = new Date(params.referenceDate);
  const inferredDate = toUtcIsoDate(referenceDate);
  const startDate = params.startDate ?? params.endDate ?? inferredDate;
  const endDate = params.endDate ?? params.startDate ?? inferredDate;
  const hasExplicitRange = Boolean(params.startDate || params.endDate);
  const start = hasExplicitRange
    ? parseUtcIsoDate(startDate)
    : addUtcDays(getUtcDayStart(referenceDate), -13);
  const endInclusive = hasExplicitRange
    ? parseUtcIsoDate(endDate)
    : getUtcDayStart(referenceDate);
  const endExclusive = addUtcDays(endInclusive, 1);
  const pointDates: Date[] = [];

  for (
    let cursor = new Date(start);
    cursor.getTime() < endExclusive.getTime();
    cursor = addUtcDays(cursor, 1)
  ) {
    pointDates.push(cursor);
  }

  return {
    referenceDate,
    start,
    endExclusive,
    startDate: toUtcIsoDate(start),
    endDate: toUtcIsoDate(addUtcDays(endExclusive, -1)),
    pointDates,
  };
}
