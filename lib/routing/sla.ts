import { SignalCategory, SignalType, Temperature } from "@prisma/client";

import type { RoutingReasonCode } from "@/lib/contracts/routing";

import type { ActiveRoutingConfig } from "./config";

export type RoutingSlaInput = {
  entityType: "lead" | "account";
  inboundType: string | null;
  temperature: Temperature | null;
  triggerSignal:
    | {
        eventType: SignalType;
        eventCategory: SignalCategory;
        receivedAt: Date;
      }
    | null;
  referenceTime: Date;
};

export type RoutingSlaResult = {
  targetMinutes: number | null;
  dueAt: Date | null;
  reasonCodes: RoutingReasonCode[];
};

export function resolveRoutingSla(
  config: ActiveRoutingConfig,
  input: RoutingSlaInput,
): RoutingSlaResult {
  const dueAtBase = input.triggerSignal?.receivedAt ?? input.referenceTime;

  if (
    input.entityType === "lead" &&
    input.inboundType === "Inbound" &&
    (input.temperature === Temperature.HOT || input.temperature === Temperature.URGENT)
  ) {
    return {
      targetMinutes: config.slaPolicy.hotInboundLeadMinutes,
      dueAt: new Date(
        dueAtBase.getTime() + config.slaPolicy.hotInboundLeadMinutes * 60 * 1000,
      ),
      reasonCodes: ["sla_hot_inbound_15m"],
    };
  }

  if (
    input.entityType === "lead" &&
    input.inboundType === "Inbound" &&
    input.temperature === Temperature.WARM
  ) {
    return {
      targetMinutes: config.slaPolicy.warmInboundLeadMinutes,
      dueAt: new Date(
        dueAtBase.getTime() + config.slaPolicy.warmInboundLeadMinutes * 60 * 1000,
      ),
      reasonCodes: ["sla_warm_inbound_120m"],
    };
  }

  if (
    input.inboundType === "Product-led" ||
    input.triggerSignal?.eventCategory === SignalCategory.PRODUCT
  ) {
    return {
      targetMinutes: config.slaPolicy.productQualifiedMinutes,
      dueAt: new Date(
        dueAtBase.getTime() + config.slaPolicy.productQualifiedMinutes * 60 * 1000,
      ),
      reasonCodes: ["sla_product_qualified_240m"],
    };
  }

  if (input.triggerSignal?.eventType === SignalType.FORM_FILL) {
    return {
      targetMinutes: config.slaPolicy.generalFormFillMinutes,
      dueAt: new Date(
        dueAtBase.getTime() + config.slaPolicy.generalFormFillMinutes * 60 * 1000,
      ),
      reasonCodes: ["sla_general_form_fill_1440m"],
    };
  }

  return {
    targetMinutes: null,
    dueAt: null,
    reasonCodes: [],
  };
}
