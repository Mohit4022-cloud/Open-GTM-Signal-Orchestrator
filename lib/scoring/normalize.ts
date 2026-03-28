import type {
  EntityScoreBreakdownContract,
  ScoreComponentBreakdownContract,
  ScoreComponentKey,
  ScoreContributorContract,
  ScoreExplanationContract,
  ScoreReasonCode,
  ScoreReasonDetailContract,
} from "@/lib/contracts/scoring";

import { DEFAULT_SCORING_CONFIG } from "./config";
import {
  getScoreReasonDetail,
  parseScoreReasonCodes,
  scoreReasonCodeSet,
} from "./reason-codes";

const scoreComponentLabelMap: Record<ScoreComponentKey, string> = {
  fit: "Fit",
  intent: "Intent",
  engagement: "Engagement",
  recency: "Recency",
  productUsage: "Product usage",
  manualPriority: "Manual priority",
};

const scoreComponentOrder = Object.keys(scoreComponentLabelMap) as ScoreComponentKey[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isScoreComponentKey(value: unknown): value is ScoreComponentKey {
  return typeof value === "string" && scoreComponentOrder.includes(value as ScoreComponentKey);
}

function getComponentSortIndex(key: ScoreComponentKey) {
  return scoreComponentOrder.indexOf(key);
}

function getComponentCap(
  key: ScoreComponentKey,
  persistedMaxScore: number | null | undefined,
) {
  if (typeof persistedMaxScore === "number" && Number.isFinite(persistedMaxScore)) {
    return persistedMaxScore;
  }

  return DEFAULT_SCORING_CONFIG.componentCaps[key];
}

export function getScoreComponentLabel(key: ScoreComponentKey) {
  return scoreComponentLabelMap[key];
}

export function parseScoreContributor(value: unknown): ScoreContributorContract | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.reasonCode !== "string" ||
    !scoreReasonCodeSet.has(value.reasonCode as ScoreReasonCode) ||
    typeof value.label !== "string" ||
    typeof value.description !== "string" ||
    typeof value.points !== "number" ||
    (value.direction !== "positive" && value.direction !== "negative")
  ) {
    return null;
  }

  return {
    reasonCode: value.reasonCode as ScoreReasonCode,
    label: value.label,
    description: value.description,
    points: value.points,
    direction: value.direction,
  };
}

function uniqueScoreReasonCodes(reasonCodes: ScoreReasonCode[]) {
  return [...new Set(reasonCodes)];
}

function buildEmptyComponent(key: ScoreComponentKey): ScoreComponentBreakdownContract {
  return {
    key,
    label: getScoreComponentLabel(key),
    score: 0,
    maxScore: DEFAULT_SCORING_CONFIG.componentCaps[key],
    reasonCodes: [],
    contributors: [],
  };
}

export function normalizeScoreComponentBreakdown(
  value: unknown,
): ScoreComponentBreakdownContract[] {
  const parsedComponents = new Map<ScoreComponentKey, ScoreComponentBreakdownContract>();

  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isRecord(item) || !isScoreComponentKey(item.key)) {
        continue;
      }

      const contributors = Array.isArray(item.contributors)
        ? item.contributors
            .map((contributor) => parseScoreContributor(contributor))
            .filter(
              (
                contributor,
              ): contributor is ScoreContributorContract => contributor !== null,
            )
        : [];
      const contributorReasonCodes = contributors.map((contributor) => contributor.reasonCode);
      const reasonCodes = parseScoreReasonCodes(item.reasonCodes);
      const normalizedReasonCodes = uniqueScoreReasonCodes(
        contributorReasonCodes.length > 0 ? contributorReasonCodes : reasonCodes,
      );
      const componentScore =
        typeof item.score === "number"
          ? item.score
          : contributors.reduce((sum, contributor) => sum + contributor.points, 0);

      parsedComponents.set(item.key, {
        key: item.key,
        label:
          typeof item.label === "string" ? item.label : getScoreComponentLabel(item.key),
        score: componentScore,
        maxScore: getComponentCap(
          item.key,
          typeof item.maxScore === "number" ? item.maxScore : null,
        ),
        reasonCodes: normalizedReasonCodes,
        contributors,
      });
    }
  }

  return scoreComponentOrder.map((key) => parsedComponents.get(key) ?? buildEmptyComponent(key));
}

export function normalizeScoreExplanation(value: unknown): ScoreExplanationContract {
  if (!isRecord(value)) {
    return {
      summary: "Score explanation unavailable.",
      drivers: [],
      cautions: [],
    };
  }

  return {
    summary:
      typeof value.summary === "string"
        ? value.summary
        : "Score explanation unavailable.",
    drivers: Array.isArray(value.drivers)
      ? value.drivers.filter((item): item is string => typeof item === "string")
      : [],
    cautions: Array.isArray(value.cautions)
      ? value.cautions.filter((item): item is string => typeof item === "string")
      : [],
  };
}

export function buildScoreReasonCodes(
  componentBreakdown: ScoreComponentBreakdownContract[],
  fallbackReasonCodes: unknown = [],
) {
  const derivedReasonCodes = uniqueScoreReasonCodes(
    componentBreakdown.flatMap((component) => component.reasonCodes),
  );

  if (derivedReasonCodes.length > 0) {
    return derivedReasonCodes;
  }

  return uniqueScoreReasonCodes(parseScoreReasonCodes(fallbackReasonCodes));
}

function sortReasonDetails(
  left: ScoreReasonDetailContract,
  right: ScoreReasonDetailContract,
) {
  const pointDelta = Math.abs(right.points) - Math.abs(left.points);
  if (pointDelta !== 0) {
    return pointDelta;
  }

  const componentDelta =
    getComponentSortIndex(left.componentKey) - getComponentSortIndex(right.componentKey);
  if (componentDelta !== 0) {
    return componentDelta;
  }

  return left.label.localeCompare(right.label);
}

export function buildScoreReasonDetails(
  componentBreakdown: ScoreComponentBreakdownContract[],
  limit = 5,
) {
  const detailsByCode = new Map<ScoreReasonCode, ScoreReasonDetailContract>();

  for (const component of componentBreakdown) {
    for (const contributor of component.contributors) {
      if (!detailsByCode.has(contributor.reasonCode)) {
        detailsByCode.set(
          contributor.reasonCode,
          getScoreReasonDetail(
            contributor.reasonCode,
            component.key,
            component.label,
            contributor.points,
          ),
        );
      }
    }
  }

  return [...detailsByCode.values()].sort(sortReasonDetails).slice(0, limit);
}

export function buildTopScoreContributors(
  componentBreakdown: ScoreComponentBreakdownContract[],
  limit = 5,
) {
  const componentKeyByReasonCode = new Map<ScoreReasonCode, ScoreComponentKey>();

  for (const component of componentBreakdown) {
    for (const contributor of component.contributors) {
      if (!componentKeyByReasonCode.has(contributor.reasonCode)) {
        componentKeyByReasonCode.set(contributor.reasonCode, component.key);
      }
    }
  }

  return componentBreakdown
    .flatMap((component) => component.contributors)
    .sort((left, right) => {
      const pointDelta = Math.abs(right.points) - Math.abs(left.points);
      if (pointDelta !== 0) {
        return pointDelta;
      }

      const componentDelta =
        getComponentSortIndex(
          componentKeyByReasonCode.get(left.reasonCode) ?? "manualPriority",
        ) -
        getComponentSortIndex(
          componentKeyByReasonCode.get(right.reasonCode) ?? "manualPriority",
        );

      if (componentDelta !== 0) {
        return componentDelta;
      }

      return left.label.localeCompare(right.label);
    })
    .slice(0, limit);
}

export function normalizeEntityScoreBreakdown(input: {
  totalScore: number;
  temperature: EntityScoreBreakdownContract["temperature"];
  componentBreakdown: unknown;
  topReasonCodes?: unknown;
  explanation: unknown;
  lastUpdatedAtIso?: string | null;
  scoringVersion: string;
}): EntityScoreBreakdownContract {
  const componentBreakdown = normalizeScoreComponentBreakdown(input.componentBreakdown);
  const reasonDetails = buildScoreReasonDetails(componentBreakdown);
  const topContributors = buildTopScoreContributors(componentBreakdown);

  return {
    totalScore: input.totalScore,
    temperature: input.temperature,
    componentBreakdown,
    topReasonCodes:
      reasonDetails.length > 0
        ? reasonDetails.map((detail) => detail.code)
        : buildScoreReasonCodes(componentBreakdown, input.topReasonCodes).slice(0, 5),
    reasonDetails,
    topContributors,
    explanation: normalizeScoreExplanation(input.explanation),
    lastUpdatedAtIso: input.lastUpdatedAtIso ?? null,
    scoringVersion: input.scoringVersion,
  };
}
