import { Temperature } from "@prisma/client";

import type { ScoringConfigContract } from "@/lib/contracts/scoring";

export function clampTotalScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function deriveTemperature(
  score: number,
  thresholds: ScoringConfigContract["thresholds"],
): Temperature {
  const clampedScore = clampTotalScore(score);

  if (clampedScore >= thresholds.urgentMin) {
    return Temperature.URGENT;
  }

  if (clampedScore > thresholds.warmMax) {
    return Temperature.HOT;
  }

  if (clampedScore > thresholds.coldMax) {
    return Temperature.WARM;
  }

  return Temperature.COLD;
}

export function getTemperatureBucket(score: number, thresholds: ScoringConfigContract["thresholds"]) {
  const temperature = deriveTemperature(score, thresholds);

  switch (temperature) {
    case Temperature.URGENT:
      return "urgent";
    case Temperature.HOT:
      return "hot";
    case Temperature.WARM:
      return "warm";
    case Temperature.COLD:
      return "cold";
  }
}
