import {
  AccountStatus,
  AccountTier,
  AuditEventType,
  Geography,
  LeadStatus,
  LifecycleStage,
  Prisma,
  PrismaClient,
  Segment,
  SignalType,
  TaskPriority,
  TaskStatus,
  TaskType,
  Temperature,
} from "@prisma/client";

import type { IngestSignalInput } from "../lib/contracts/signals";
import { ingestSignal } from "../lib/data/signals";
import { db } from "../lib/db";
import { sqliteAdapter } from "../lib/prisma-adapter";
import { routeLead } from "../lib/routing";
import {
  recomputeAccountScore,
  recomputeLeadScore,
  setAccountManualPriorityBoost,
  setLeadManualPriorityBoost,
} from "../lib/scoring";

const prisma = new PrismaClient({
  adapter: sqliteAdapter,
});

const baseDate = new Date("2026-03-26T15:00:00.000Z");

const addHours = (date: Date, hours: number) =>
  new Date(date.getTime() + hours * 60 * 60 * 1000);
const addMinutes = (date: Date, minutes: number) =>
  new Date(date.getTime() + minutes * 60 * 1000);
const subDays = (date: Date, days: number) =>
  new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
const subHours = (date: Date, hours: number) =>
  new Date(date.getTime() - hours * 60 * 60 * 1000);
const subMinutes = (date: Date, minutes: number) =>
  new Date(date.getTime() - minutes * 60 * 1000);

type AccountBlueprint = {
  id: string;
  name: string;
  domain: string;
  segment: Segment;
  industry: string;
  geography: Geography;
  employeeCount: number;
  annualRevenueBand: string;
  namedOwnerId: string | null;
  ownerId?: string | null;
  lifecycleStage: LifecycleStage;
  fitScore: number;
  overallScore: number;
  status: AccountStatus;
};

type PersonaProfile = {
  title: string;
  department: string;
  seniority: string;
  personaType: string;
};

type SeededAccount = AccountBlueprint & {
  accountTier: AccountTier;
  createdAt: Date;
  updatedAt: Date;
};

type SeededContact = {
  id: string;
  accountId: string;
  firstName: string;
  lastName: string;
  email: string;
  title: string;
  department: string;
  seniority: string;
  phone: string;
  personaType: string;
  createdAt: Date;
  updatedAt: Date;
};

type SeededLead = {
  id: string;
  accountId: string;
  contactId: string;
  source: string;
  inboundType: string;
  currentOwnerId: string;
  status: LeadStatus;
  score: number;
  temperature: Temperature;
  slaDeadlineAt: Date;
  firstResponseAt: Date | null;
  routedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

const userSeed: Prisma.UserCreateManyInput[] = [
  {
    id: "usr_amelia_ross",
    name: "Amelia Ross",
    email: "amelia.ross@gtmso.local",
    role: "SDR Manager",
    team: "North America East",
    geography: Geography.NA_EAST,
    title: "SDR Manager",
    avatarColor: "#0f766e",
    maxOpenHotLeads: 6,
    maxDailyInboundAssignments: 8,
    maxOpenTasks: 12,
  },
  {
    id: "usr_dante_kim",
    name: "Dante Kim",
    email: "dante.kim@gtmso.local",
    role: "Account Executive",
    team: "North America West",
    geography: Geography.NA_WEST,
    title: "Mid-Market AE",
    avatarColor: "#b66a1d",
    maxOpenHotLeads: 6,
    maxDailyInboundAssignments: 8,
    maxOpenTasks: 12,
  },
  {
    id: "usr_priya_singh",
    name: "Priya Singh",
    email: "priya.singh@gtmso.local",
    role: "RevOps Lead",
    team: "Revenue Operations",
    geography: Geography.EMEA,
    title: "RevOps Lead",
    avatarColor: "#0f172a",
    maxOpenHotLeads: 99,
    maxDailyInboundAssignments: 99,
    maxOpenTasks: 99,
  },
  {
    id: "usr_elena_morales",
    name: "Elena Morales",
    email: "elena.morales@gtmso.local",
    role: "Strategic AE",
    team: "Strategic Accounts",
    geography: Geography.NA_EAST,
    title: "Strategic Account Executive",
    avatarColor: "#7c3aed",
    maxOpenHotLeads: 10,
    maxDailyInboundAssignments: 10,
    maxOpenTasks: 14,
  },
  {
    id: "usr_miles_turner",
    name: "Miles Turner",
    email: "miles.turner@gtmso.local",
    role: "SDR",
    team: "North America West",
    geography: Geography.NA_WEST,
    title: "Senior SDR",
    avatarColor: "#1d4ed8",
    maxOpenHotLeads: 1,
    maxDailyInboundAssignments: 0,
    maxOpenTasks: 6,
  },
  {
    id: "usr_noor_haddad",
    name: "Noor Haddad",
    email: "noor.haddad@gtmso.local",
    role: "SDR",
    team: "EMEA Pod",
    geography: Geography.EMEA,
    title: "Enterprise SDR",
    avatarColor: "#2563eb",
    maxOpenHotLeads: 6,
    maxDailyInboundAssignments: 6,
    maxOpenTasks: 10,
  },
  {
    id: "usr_tessa_liu",
    name: "Tessa Liu",
    email: "tessa.liu@gtmso.local",
    role: "Growth Ops",
    team: "APAC Growth",
    geography: Geography.APAC,
    title: "Growth Operations Manager",
    avatarColor: "#059669",
    maxOpenHotLeads: 4,
    maxDailyInboundAssignments: 4,
    maxOpenTasks: 8,
  },
  {
    id: "usr_hana_cho",
    name: "Hana Cho",
    email: "hana.cho@gtmso.local",
    role: "Enterprise AE",
    team: "APAC Enterprise",
    geography: Geography.APAC,
    title: "Enterprise Account Executive",
    avatarColor: "#c2410c",
    maxOpenHotLeads: 6,
    maxDailyInboundAssignments: 6,
    maxOpenTasks: 10,
  },
  {
    id: "usr_sarah_kim",
    name: "Sarah Kim",
    email: "sarah.kim@gtmso.local",
    role: "SDR",
    team: "NA East Mid-Market",
    geography: Geography.NA_EAST,
    title: "Mid-Market SDR",
    avatarColor: "#7c2d12",
    maxOpenHotLeads: 6,
    maxDailyInboundAssignments: 8,
    maxOpenTasks: 10,
  },
  {
    id: "usr_owen_price",
    name: "Owen Price",
    email: "owen.price@gtmso.local",
    role: "SDR",
    team: "NA West Mid-Market",
    geography: Geography.NA_WEST,
    title: "Mid-Market SDR",
    avatarColor: "#0369a1",
    maxOpenHotLeads: 6,
    maxDailyInboundAssignments: 8,
    maxOpenTasks: 10,
  },
  {
    id: "usr_luca_rossi",
    name: "Luca Rossi",
    email: "luca.rossi@gtmso.local",
    role: "SDR",
    team: "EMEA Commercial",
    geography: Geography.EMEA,
    title: "Commercial SDR",
    avatarColor: "#0f766e",
    maxOpenHotLeads: 6,
    maxDailyInboundAssignments: 8,
    maxOpenTasks: 10,
  },
  {
    id: "usr_ivy_ng",
    name: "Ivy Ng",
    email: "ivy.ng@gtmso.local",
    role: "SDR",
    team: "APAC Commercial",
    geography: Geography.APAC,
    title: "Commercial SDR",
    avatarColor: "#be123c",
    maxOpenHotLeads: 1,
    maxDailyInboundAssignments: 0,
    maxOpenTasks: 5,
  },
];

const accountBlueprints: readonly AccountBlueprint[] = [
  {
    id: "acc_northstar_analytics",
    name: "Northstar Analytics",
    domain: "northstaranalytics.com",
    segment: Segment.MID_MARKET,
    industry: "SaaS",
    geography: Geography.NA_WEST,
    employeeCount: 420,
    annualRevenueBand: "$50M-$100M",
    namedOwnerId: "usr_dante_kim",
    ownerId: "usr_owen_price",
    lifecycleStage: LifecycleStage.SALES_READY,
    fitScore: 29,
    overallScore: 88,
    status: AccountStatus.HOT,
  },
  {
    id: "acc_cedarbridge_health",
    name: "CedarBridge Health",
    domain: "cedarbridgehealth.com",
    segment: Segment.MID_MARKET,
    industry: "Healthcare",
    geography: Geography.NA_EAST,
    employeeCount: 650,
    annualRevenueBand: "$100M-$250M",
    namedOwnerId: "usr_amelia_ross",
    lifecycleStage: LifecycleStage.ENGAGED,
    fitScore: 24,
    overallScore: 68,
    status: AccountStatus.WATCH,
  },
  {
    id: "acc_rivetstack",
    name: "RivetStack Automation",
    domain: "rivetstackautomation.com",
    segment: Segment.ENTERPRISE,
    industry: "Manufacturing",
    geography: Geography.NA_WEST,
    employeeCount: 1180,
    annualRevenueBand: "$250M-$500M",
    namedOwnerId: "usr_dante_kim",
    lifecycleStage: LifecycleStage.ENGAGED,
    fitScore: 27,
    overallScore: 76,
    status: AccountStatus.HEALTHY,
  },
  {
    id: "acc_brightharbor_retail",
    name: "BrightHarbor Retail",
    domain: "brightharborretail.com",
    segment: Segment.SMB,
    industry: "Retail",
    geography: Geography.NA_WEST,
    employeeCount: 180,
    annualRevenueBand: "$20M-$50M",
    namedOwnerId: null,
    ownerId: null,
    lifecycleStage: LifecycleStage.PROSPECT,
    fitScore: 20,
    overallScore: 59,
    status: AccountStatus.WATCH,
  },
  {
    id: "acc_summitflow_finance",
    name: "SummitFlow Finance",
    domain: "summitflowfinance.com",
    segment: Segment.STRATEGIC,
    industry: "Fintech",
    geography: Geography.NA_EAST,
    employeeCount: 4200,
    annualRevenueBand: "$500M+",
    namedOwnerId: "usr_elena_morales",
    lifecycleStage: LifecycleStage.SALES_READY,
    fitScore: 30,
    overallScore: 92,
    status: AccountStatus.HOT,
  },
  {
    id: "acc_latticebio",
    name: "LatticeBio Labs",
    domain: "latticebio.com",
    segment: Segment.ENTERPRISE,
    industry: "Healthcare",
    geography: Geography.EMEA,
    employeeCount: 1450,
    annualRevenueBand: "$250M-$500M",
    namedOwnerId: "usr_noor_haddad",
    lifecycleStage: LifecycleStage.SALES_READY,
    fitScore: 28,
    overallScore: 79,
    status: AccountStatus.HEALTHY,
  },
  {
    id: "acc_harborpoint",
    name: "HarborPoint SaaS",
    domain: "harborpointsaas.com",
    segment: Segment.ENTERPRISE,
    industry: "SaaS",
    geography: Geography.NA_EAST,
    employeeCount: 980,
    annualRevenueBand: "$100M-$250M",
    namedOwnerId: "usr_elena_morales",
    lifecycleStage: LifecycleStage.SALES_READY,
    fitScore: 28,
    overallScore: 86,
    status: AccountStatus.HOT,
  },
  {
    id: "acc_alloyworks",
    name: "AlloyWorks Cloud",
    domain: "alloyworkscloud.com",
    segment: Segment.ENTERPRISE,
    industry: "Manufacturing",
    geography: Geography.EMEA,
    employeeCount: 1750,
    annualRevenueBand: "$250M-$500M",
    namedOwnerId: "usr_noor_haddad",
    lifecycleStage: LifecycleStage.ENGAGED,
    fitScore: 26,
    overallScore: 74,
    status: AccountStatus.WATCH,
  },
  {
    id: "acc_cedar_loop",
    name: "Cedar Loop Finance",
    domain: "cedarloopfinance.com",
    segment: Segment.SMB,
    industry: "Fintech",
    geography: Geography.NA_EAST,
    employeeCount: 240,
    annualRevenueBand: "$20M-$50M",
    namedOwnerId: null,
    ownerId: null,
    lifecycleStage: LifecycleStage.NURTURE,
    fitScore: 19,
    overallScore: 57,
    status: AccountStatus.AT_RISK,
  },
  {
    id: "acc_frontier_retail",
    name: "Frontier Retail Systems",
    domain: "frontierretailsystems.com",
    segment: Segment.MID_MARKET,
    industry: "Retail",
    geography: Geography.APAC,
    employeeCount: 510,
    annualRevenueBand: "$50M-$100M",
    namedOwnerId: "usr_hana_cho",
    lifecycleStage: LifecycleStage.ENGAGED,
    fitScore: 24,
    overallScore: 72,
    status: AccountStatus.HEALTHY,
  },
  {
    id: "acc_orbitiq",
    name: "OrbitIQ Security",
    domain: "orbitiqsecurity.com",
    segment: Segment.STRATEGIC,
    industry: "Cybersecurity",
    geography: Geography.EMEA,
    employeeCount: 3100,
    annualRevenueBand: "$500M+",
    namedOwnerId: "usr_elena_morales",
    lifecycleStage: LifecycleStage.SALES_READY,
    fitScore: 29,
    overallScore: 90,
    status: AccountStatus.HOT,
  },
  {
    id: "acc_ironpeak",
    name: "Iron Peak Manufacturing",
    domain: "ironpeakmfg.com",
    segment: Segment.STRATEGIC,
    industry: "Manufacturing",
    geography: Geography.NA_WEST,
    employeeCount: 5200,
    annualRevenueBand: "$500M+",
    namedOwnerId: null,
    ownerId: null,
    lifecycleStage: LifecycleStage.SALES_READY,
    fitScore: 31,
    overallScore: 94,
    status: AccountStatus.HOT,
  },
  {
    id: "acc_signalnest",
    name: "SignalNest Software",
    domain: "signalnestsoftware.com",
    segment: Segment.SMB,
    industry: "SaaS",
    geography: Geography.NA_WEST,
    employeeCount: 220,
    annualRevenueBand: "$20M-$50M",
    namedOwnerId: null,
    ownerId: "usr_owen_price",
    lifecycleStage: LifecycleStage.PROSPECT,
    fitScore: 22,
    overallScore: 64,
    status: AccountStatus.WATCH,
  },
  {
    id: "acc_pinecrest",
    name: "Pinecrest Labs",
    domain: "pinecrestlabs.com",
    segment: Segment.MID_MARKET,
    industry: "Healthcare",
    geography: Geography.APAC,
    employeeCount: 760,
    annualRevenueBand: "$50M-$100M",
    namedOwnerId: "usr_hana_cho",
    lifecycleStage: LifecycleStage.ENGAGED,
    fitScore: 23,
    overallScore: 70,
    status: AccountStatus.HEALTHY,
  },
  {
    id: "acc_novachannel",
    name: "NovaChannel Commerce",
    domain: "novachannelcommerce.com",
    segment: Segment.MID_MARKET,
    industry: "Retail",
    geography: Geography.APAC,
    employeeCount: 680,
    annualRevenueBand: "$50M-$100M",
    namedOwnerId: null,
    ownerId: null,
    lifecycleStage: LifecycleStage.ENGAGED,
    fitScore: 22,
    overallScore: 67,
    status: AccountStatus.WATCH,
  },
  {
    id: "acc_aperture_robotics",
    name: "Aperture Robotics",
    domain: "aperturerobotics.com",
    segment: Segment.ENTERPRISE,
    industry: "Manufacturing",
    geography: Geography.APAC,
    employeeCount: 1600,
    annualRevenueBand: "$250M-$500M",
    namedOwnerId: "usr_hana_cho",
    lifecycleStage: LifecycleStage.ENGAGED,
    fitScore: 27,
    overallScore: 78,
    status: AccountStatus.HEALTHY,
  },
  {
    id: "acc_veritypulse",
    name: "VerityPulse Health",
    domain: "veritypulsehealth.com",
    segment: Segment.MID_MARKET,
    industry: "Healthcare",
    geography: Geography.NA_EAST,
    employeeCount: 720,
    annualRevenueBand: "$50M-$100M",
    namedOwnerId: null,
    ownerId: "usr_sarah_kim",
    lifecycleStage: LifecycleStage.ENGAGED,
    fitScore: 25,
    overallScore: 71,
    status: AccountStatus.WATCH,
  },
  {
    id: "acc_meridian_freight",
    name: "Meridian Freight Cloud",
    domain: "meridianfreightcloud.com",
    segment: Segment.ENTERPRISE,
    industry: "Logistics",
    geography: Geography.NA_EAST,
    employeeCount: 2100,
    annualRevenueBand: "$500M+",
    namedOwnerId: "usr_amelia_ross",
    lifecycleStage: LifecycleStage.SALES_READY,
    fitScore: 26,
    overallScore: 79,
    status: AccountStatus.HEALTHY,
  },
  {
    id: "acc_beaconops",
    name: "BeaconOps Partners",
    domain: "beaconopspartners.com",
    segment: Segment.SMB,
    industry: "Professional Services",
    geography: Geography.NA_WEST,
    employeeCount: 260,
    annualRevenueBand: "$20M-$50M",
    namedOwnerId: "usr_miles_turner",
    ownerId: "usr_owen_price",
    lifecycleStage: LifecycleStage.NURTURE,
    fitScore: 21,
    overallScore: 61,
    status: AccountStatus.WATCH,
  },
  {
    id: "acc_atlas_grid",
    name: "Atlas Grid Systems",
    domain: "atlasgridsystems.com",
    segment: Segment.STRATEGIC,
    industry: "Energy",
    geography: Geography.EMEA,
    employeeCount: 2800,
    annualRevenueBand: "$500M+",
    namedOwnerId: "usr_elena_morales",
    lifecycleStage: LifecycleStage.SALES_READY,
    fitScore: 27,
    overallScore: 77,
    status: AccountStatus.HEALTHY,
  },
] as const;

const seededSignalTypes = Object.values(SignalType);

type SeededSignalType = SignalType;
type JsonObject = Record<string, string | number | boolean | null>;

const secondaryLeadAccountIds = new Set([
  "acc_northstar_analytics",
  "acc_summitflow_finance",
  "acc_harborpoint",
  "acc_orbitiq",
  "acc_ironpeak",
  "acc_rivetstack",
  "acc_latticebio",
  "acc_aperture_robotics",
  "acc_meridian_freight",
  "acc_atlas_grid",
]);

const accountTaskAccountIds = [
  "acc_northstar_analytics",
  "acc_summitflow_finance",
  "acc_harborpoint",
  "acc_orbitiq",
  "acc_ironpeak",
  "acc_rivetstack",
  "acc_latticebio",
  "acc_aperture_robotics",
  "acc_meridian_freight",
  "acc_atlas_grid",
] as const;

const contactFirstNames = [
  "Avery",
  "Jordan",
  "Sofia",
  "Micah",
  "Leah",
  "Marcus",
  "Priyanka",
  "Julian",
  "Rhea",
  "Noah",
  "Keira",
  "Tobias",
  "Mina",
  "Caleb",
  "Lina",
  "Isaac",
  "Zara",
  "Ethan",
  "Anika",
  "Kai",
] as const;

const contactLastNames = [
  "Bennett",
  "Park",
  "Velasquez",
  "Khan",
  "Murphy",
  "Hale",
  "Patel",
  "Brooks",
  "Sato",
  "Miller",
  "Nguyen",
  "Wright",
  "Costa",
  "Reyes",
  "Ibrahim",
  "Cole",
  "Foster",
  "Kim",
  "Sullivan",
  "Grant",
] as const;

const primaryLeadSources = [
  "Pricing page revisit",
  "Signal-qualified inbound",
  "Webinar follow-up",
  "Product-led evaluation",
  "Intent surge",
  "Partner referral",
  "Content syndication",
] as const;

const secondaryLeadSources = [
  "Buying committee expansion",
  "Executive follow-up",
  "Late-stage re-engagement",
  "Trial activation",
  "Mutual action plan request",
] as const;

function getAccountTier(segment: Segment): AccountTier {
  if (segment === Segment.STRATEGIC) return AccountTier.STRATEGIC;
  if (segment === Segment.ENTERPRISE) return AccountTier.TIER_1;
  if (segment === Segment.MID_MARKET) return AccountTier.TIER_2;
  return AccountTier.TIER_3;
}

function clampScore(score: number) {
  return Math.max(35, Math.min(99, score));
}

function getTemperature(score: number): Temperature {
  if (score >= 90) return Temperature.URGENT;
  if (score >= 80) return Temperature.HOT;
  if (score >= 65) return Temperature.WARM;
  return Temperature.COLD;
}

function getLeadStatus(temperature: Temperature): LeadStatus {
  if (temperature === Temperature.URGENT) return LeadStatus.QUALIFIED;
  if (temperature === Temperature.HOT) return LeadStatus.WORKING;
  if (temperature === Temperature.WARM) return LeadStatus.NEW;
  return LeadStatus.NURTURING;
}

function getSlaHours(temperature: Temperature) {
  if (temperature === Temperature.URGENT) return 1;
  if (temperature === Temperature.HOT) return 4;
  if (temperature === Temperature.WARM) return 12;
  return 24;
}

function getFallbackLeadOwner(geography: Geography) {
  switch (geography) {
    case Geography.NA_WEST:
      return "usr_owen_price";
    case Geography.NA_EAST:
      return "usr_sarah_kim";
    case Geography.EMEA:
      return "usr_luca_rossi";
    case Geography.APAC:
      return "usr_ivy_ng";
  }
}

function getContactName(index: number, offset: number) {
  return {
    firstName: contactFirstNames[(index + offset) % contactFirstNames.length],
    lastName: contactLastNames[(index * 3 + offset) % contactLastNames.length],
  };
}

function getOperationalPersona(industry: string): PersonaProfile {
  switch (industry) {
    case "Manufacturing":
      return {
        title: "Director of Commercial Operations",
        department: "Commercial Operations",
        seniority: "Director",
        personaType: "Commercial Ops",
      };
    case "Healthcare":
      return {
        title: "Director of Revenue Operations",
        department: "Revenue Operations",
        seniority: "Director",
        personaType: "RevOps",
      };
    case "Retail":
      return {
        title: "Head of Ecommerce Operations",
        department: "Digital Commerce",
        seniority: "Director",
        personaType: "Ecommerce Ops",
      };
    case "Fintech":
      return {
        title: "Director of GTM Systems",
        department: "GTM Systems",
        seniority: "Director",
        personaType: "GTM Systems",
      };
    case "Logistics":
      return {
        title: "Director of Sales Operations",
        department: "Sales Operations",
        seniority: "Director",
        personaType: "Sales Ops",
      };
    case "Cybersecurity":
      return {
        title: "Director of Growth Operations",
        department: "Growth Operations",
        seniority: "Director",
        personaType: "Growth Ops",
      };
    case "Energy":
      return {
        title: "Director of Commercial Systems",
        department: "Commercial Systems",
        seniority: "Director",
        personaType: "Commercial Systems",
      };
    case "Professional Services":
      return {
        title: "Director of Revenue Operations",
        department: "Revenue Operations",
        seniority: "Director",
        personaType: "RevOps",
      };
    default:
      return {
        title: "Director of Revenue Operations",
        department: "Revenue Operations",
        seniority: "Director",
        personaType: "RevOps",
      };
  }
}

function getExecutivePersona(segment: Segment, industry: string, index: number): PersonaProfile {
  if (segment === Segment.STRATEGIC) {
    return {
      title: index % 2 === 0 ? "Chief Revenue Officer" : "Chief Commercial Officer",
      department: "Executive",
      seniority: "Executive",
      personaType: industry === "Fintech" ? "Executive Buyer" : "Economic Buyer",
    };
  }

  if (segment === Segment.ENTERPRISE) {
    return {
      title: index % 2 === 0 ? "VP, Global Sales" : "VP, Demand Generation",
      department: index % 2 === 0 ? "Sales" : "Marketing",
      seniority: "Vice President",
      personaType: index % 2 === 0 ? "Sales Leadership" : "Demand Gen",
    };
  }

  if (segment === Segment.MID_MARKET) {
    return {
      title: index % 2 === 0 ? "Director of Growth" : "VP, Sales Development",
      department: index % 2 === 0 ? "Growth" : "Sales",
      seniority: "Director",
      personaType: index % 2 === 0 ? "Growth Leader" : "Sales Leadership",
    };
  }

  return {
    title: index % 2 === 0 ? "Head of Marketing" : "VP, Revenue",
    department: index % 2 === 0 ? "Marketing" : "Revenue",
    seniority: "Head",
    personaType: index % 2 === 0 ? "Marketing Leader" : "Revenue Leader",
  };
}

function getPhoneNumber(geography: Geography, index: number, slot: number) {
  const prefix =
    geography === Geography.EMEA ? "+44" : geography === Geography.APAC ? "+61" : "+1";
  return `${prefix}-555-${String(1000 + index * 10 + slot).padStart(4, "0")}`;
}

function toIngestSignalType(eventType: SeededSignalType): IngestSignalInput["event_type"] {
  switch (eventType) {
    case SignalType.WEBSITE_VISIT:
      return "website_visit";
    case SignalType.PRICING_PAGE_VISIT:
      return "pricing_page_visit";
    case SignalType.HIGH_INTENT_PAGE_CLUSTER_VISIT:
      return "high_intent_page_cluster_visit";
    case SignalType.FORM_FILL:
      return "form_fill";
    case SignalType.WEBINAR_REGISTRATION:
      return "webinar_registration";
    case SignalType.PRODUCT_SIGNUP:
      return "product_signup";
    case SignalType.PRODUCT_USAGE_MILESTONE:
      return "product_usage_milestone";
    case SignalType.EMAIL_REPLY:
      return "email_reply";
    case SignalType.MEETING_BOOKED:
      return "meeting_booked";
    case SignalType.MEETING_NO_SHOW:
      return "meeting_no_show";
    case SignalType.THIRD_PARTY_INTENT_EVENT:
      return "third_party_intent_event";
    case SignalType.MANUAL_SALES_NOTE:
      return "manual_sales_note";
    case SignalType.ACCOUNT_STATUS_UPDATE:
      return "account_status_update";
  }
}

function getSignalSourceSystem(eventType: SeededSignalType): string {
  switch (eventType) {
    case SignalType.WEBSITE_VISIT:
    case SignalType.PRICING_PAGE_VISIT:
    case SignalType.HIGH_INTENT_PAGE_CLUSTER_VISIT:
      return "website";
    case SignalType.FORM_FILL:
      return "marketing_automation";
    case SignalType.WEBINAR_REGISTRATION:
      return "events";
    case SignalType.PRODUCT_SIGNUP:
    case SignalType.PRODUCT_USAGE_MILESTONE:
      return "product";
    case SignalType.EMAIL_REPLY:
      return "sales_engagement";
    case SignalType.MEETING_BOOKED:
    case SignalType.MEETING_NO_SHOW:
      return "calendar";
    case SignalType.THIRD_PARTY_INTENT_EVENT:
      return "third_party_intent";
    case SignalType.MANUAL_SALES_NOTE:
      return "sales_note";
    case SignalType.ACCOUNT_STATUS_UPDATE:
      return "crm";
  }
}

function getSignalPayload(
  account: SeededAccount,
  eventType: SeededSignalType,
  index: number,
): JsonObject {
  switch (eventType) {
    case SignalType.WEBSITE_VISIT:
      return {
        page: index % 2 === 0 ? "/blog/revenue-ops" : "/integrations/salesforce",
        session_id: `${account.id}_session_${index}`,
        visit_count: 1 + (index % 3),
      };
    case SignalType.PRICING_PAGE_VISIT:
      return {
        page: "/pricing",
        session_id: `${account.id}_pricing_${index}`,
        visit_count: 2 + (index % 3),
      };
    case SignalType.HIGH_INTENT_PAGE_CLUSTER_VISIT:
      return {
        page_cluster: "pricing,security,integrations",
        session_id: `${account.id}_cluster_${index}`,
      };
    case SignalType.FORM_FILL:
      return {
        form_id: "request_demo",
        submission_id: `${account.id}_form_${index}`,
        campaign: account.industry.toLowerCase().replace(/\s+/g, "-"),
        persona: "operations",
      };
    case SignalType.WEBINAR_REGISTRATION:
      return {
        webinar_name: "Signal orchestration benchmark",
        webinar_id: `webinar_${(index % 4) + 1}`,
        registration_id: `${account.id}_registration_${index}`,
        campaign: "q1_recruiter_demo",
      };
    case SignalType.PRODUCT_SIGNUP:
      return {
        workspace_id: `${account.id}_workspace`,
        signup_id: `${account.id}_signup_${index}`,
        plan: account.segment === Segment.SMB ? "trial" : "pilot",
      };
    case SignalType.PRODUCT_USAGE_MILESTONE:
      return {
        workspace_id: `${account.id}_workspace`,
        milestone: index % 2 === 0 ? "connected_crm" : "invited_teammates",
        user_id: `${account.id}_user_${index}`,
      };
    case SignalType.EMAIL_REPLY:
      return {
        thread_id: `${account.id}_thread_${index}`,
        message_id: `${account.id}_message_${index}`,
        subject: "Routing visibility follow-up",
      };
    case SignalType.MEETING_BOOKED:
      return {
        meeting_id: `${account.id}_meeting_${index}`,
        calendar_event_id: `${account.id}_calendar_${index}`,
        meeting_type: account.segment === Segment.STRATEGIC ? "exec_review" : "discovery_call",
      };
    case SignalType.MEETING_NO_SHOW:
      return {
        meeting_id: `${account.id}_meeting_no_show_${index}`,
        calendar_event_id: `${account.id}_calendar_no_show_${index}`,
        meeting_type: "follow_up_demo",
      };
    case SignalType.THIRD_PARTY_INTENT_EVENT:
      return {
        provider: "bombora",
        topic: account.industry === "Manufacturing" ? "sales_forecasting" : "revenue_intelligence",
        intent_id: `${account.id}_intent_${index}`,
      };
    case SignalType.MANUAL_SALES_NOTE:
      return {
        note_id: `${account.id}_note_${index}`,
        author_id: account.namedOwnerId ?? getFallbackLeadOwner(account.geography),
        note_subject: "AE field note",
      };
    case SignalType.ACCOUNT_STATUS_UPDATE:
      return {
        status_change_id: `${account.id}_status_${index}`,
        previous_status: account.lifecycleStage.toLowerCase(),
        new_status: account.status === AccountStatus.HOT ? "exec_attention" : "monitoring",
      };
  }
}

function buildMatchedSignalInputs(accounts: SeededAccount[], contacts: SeededContact[]): IngestSignalInput[] {
  return accounts.flatMap((account, accountIndex) => {
    const accountContacts = contacts.filter((contact) => contact.accountId === account.id);
    const signalCount = account.status === AccountStatus.HOT ? 6 : 4;
    const dayOffsets =
      account.id === "acc_frontier_retail"
        ? [45, 39, 34, 31]
        : account.status === AccountStatus.HOT
          ? [12, 9, 6, 4, 2, 0]
          : [11, 8, 4, 1];

    return Array.from({ length: signalCount }, (_, signalIndex) => {
      const eventType = seededSignalTypes[(accountIndex + signalIndex) % seededSignalTypes.length]!;
      const contact = accountContacts[signalIndex % accountContacts.length]!;
      const occurredAt = addMinutes(
        subDays(baseDate, dayOffsets[signalIndex]!),
        accountIndex * 13 + signalIndex * 17,
      );
      const receivedAt = addMinutes(occurredAt, 5 + ((accountIndex + signalIndex) % 3) * 6);
      const includeDomain =
        eventType !== SignalType.PRODUCT_USAGE_MILESTONE && eventType !== SignalType.EMAIL_REPLY;
      const includeEmail =
        eventType !== SignalType.MANUAL_SALES_NOTE && eventType !== SignalType.ACCOUNT_STATUS_UPDATE;

      return {
        source_system: getSignalSourceSystem(eventType),
        event_type: toIngestSignalType(eventType),
        account_domain: includeDomain ? account.domain : undefined,
        contact_email: includeEmail ? contact.email : undefined,
        occurred_at: occurredAt.toISOString(),
        received_at: receivedAt.toISOString(),
        payload: getSignalPayload(account, eventType, signalIndex),
      };
    });
  });
}

function buildUnmatchedSignalInputs(
  accounts: SeededAccount[],
  contacts: SeededContact[],
): IngestSignalInput[] {
  const conflictingContactOne = contacts.find((contact) => contact.accountId === accounts[4]!.id)!;
  const conflictingContactTwo = contacts.find((contact) => contact.accountId === accounts[7]!.id)!;

  return [
    {
      source_system: "website",
      event_type: "pricing_page_visit",
      contact_email: `ghost-1@${accounts[0]!.domain}`,
      occurred_at: subMinutes(baseDate, 110).toISOString(),
      received_at: subMinutes(baseDate, 104).toISOString(),
      payload: { page: "/pricing", session_id: "ghost_session_1", visit_count: 3 },
    },
    {
      source_system: "marketing_automation",
      event_type: "form_fill",
      contact_email: `ghost-2@${accounts[1]!.domain}`,
      occurred_at: subMinutes(baseDate, 104).toISOString(),
      received_at: subMinutes(baseDate, 100).toISOString(),
      payload: { form_id: "request_demo", submission_id: "ghost_form_2" },
    },
    {
      source_system: "sales_engagement",
      event_type: "email_reply",
      contact_email: `ghost-3@${accounts[2]!.domain}`,
      occurred_at: subMinutes(baseDate, 98).toISOString(),
      received_at: subMinutes(baseDate, 94).toISOString(),
      payload: { thread_id: "ghost_thread_3", message_id: "ghost_message_3", subject: "Unknown contact" },
    },
    {
      source_system: "product",
      event_type: "product_usage_milestone",
      contact_email: `ghost-4@${accounts[3]!.domain}`,
      occurred_at: subMinutes(baseDate, 92).toISOString(),
      received_at: subMinutes(baseDate, 86).toISOString(),
      payload: { workspace_id: "ghost_workspace_4", milestone: "activated" },
    },
    {
      source_system: "website",
      event_type: "website_visit",
      account_domain: "unknown-stage-two-1.example.com",
      occurred_at: subMinutes(baseDate, 86).toISOString(),
      received_at: subMinutes(baseDate, 82).toISOString(),
      payload: { page: "/docs", session_id: "unknown_domain_1" },
    },
    {
      source_system: "third_party_intent",
      event_type: "third_party_intent_event",
      account_domain: "unknown-stage-two-2.example.com",
      occurred_at: subMinutes(baseDate, 80).toISOString(),
      received_at: subMinutes(baseDate, 75).toISOString(),
      payload: { provider: "bombora", topic: "revenue_intelligence", intent_id: "ghost_intent_2" },
    },
    {
      source_system: "sales_note",
      event_type: "manual_sales_note",
      account_domain: "unknown-stage-two-3.example.com",
      occurred_at: subMinutes(baseDate, 74).toISOString(),
      received_at: subMinutes(baseDate, 70).toISOString(),
      payload: { note_id: "ghost_note_3", author_id: "usr_priya_singh", note_subject: "Unknown account" },
    },
    {
      source_system: "crm",
      event_type: "account_status_update",
      account_domain: "unknown-stage-two-4.example.com",
      occurred_at: subMinutes(baseDate, 68).toISOString(),
      received_at: subMinutes(baseDate, 62).toISOString(),
      payload: { status_change_id: "ghost_status_4", previous_status: "engaged", new_status: "unknown" },
    },
    {
      source_system: "website",
      event_type: "website_visit",
      occurred_at: subMinutes(baseDate, 62).toISOString(),
      received_at: subMinutes(baseDate, 58).toISOString(),
      payload: { page: "/security", session_id: "anonymous_1" },
    },
    {
      source_system: "calendar",
      event_type: "meeting_no_show",
      occurred_at: subMinutes(baseDate, 56).toISOString(),
      received_at: subMinutes(baseDate, 52).toISOString(),
      payload: { meeting_id: "anonymous_meeting_2", calendar_event_id: "anonymous_calendar_2", meeting_type: "demo" },
    },
    {
      source_system: "calendar",
      event_type: "meeting_booked",
      account_domain: accounts[4]!.domain,
      contact_email: conflictingContactTwo.email,
      occurred_at: subMinutes(baseDate, 50).toISOString(),
      received_at: subMinutes(baseDate, 46).toISOString(),
      payload: { meeting_id: "conflict_meeting_1", calendar_event_id: "conflict_calendar_1", meeting_type: "exec_review" },
    },
    {
      source_system: "marketing_automation",
      event_type: "webinar_registration",
      account_domain: accounts[7]!.domain,
      contact_email: conflictingContactOne.email,
      occurred_at: subMinutes(baseDate, 44).toISOString(),
      received_at: subMinutes(baseDate, 40).toISOString(),
      payload: { webinar_name: "Signal orchestration benchmark", webinar_id: "conflict_webinar_2", registration_id: "conflict_registration_2" },
    },
  ];
}

function getAccountOrThrow(accounts: SeededAccount[], accountId: string) {
  const account = accounts.find((entry) => entry.id === accountId);

  if (!account) {
    throw new Error(`Missing seeded account ${accountId}.`);
  }

  return account;
}

function getContactOrThrow(contacts: SeededContact[], contactId: string) {
  const contact = contacts.find((entry) => entry.id === contactId);

  if (!contact) {
    throw new Error(`Missing seeded contact ${contactId}.`);
  }

  return contact;
}

function buildScoringStorySignalInputs(
  accounts: SeededAccount[],
  contacts: SeededContact[],
): IngestSignalInput[] {
  const summitFlow = getAccountOrThrow(accounts, "acc_summitflow_finance");
  const summitFlowPrimary = getContactOrThrow(contacts, "acc_summitflow_finance_contact_01");

  const harborPoint = getAccountOrThrow(accounts, "acc_harborpoint");
  const harborPointPrimary = getContactOrThrow(contacts, "acc_harborpoint_contact_01");

  const ironPeak = getAccountOrThrow(accounts, "acc_ironpeak");
  const ironPeakPrimary = getContactOrThrow(contacts, "acc_ironpeak_contact_01");

  const signalNest = getAccountOrThrow(accounts, "acc_signalnest");
  const signalNestPrimary = getContactOrThrow(contacts, "acc_signalnest_contact_01");

  return [
    {
      source_system: "website",
      event_type: "pricing_page_visit",
      account_domain: summitFlow.domain,
      contact_email: summitFlowPrimary.email,
      occurred_at: subHours(baseDate, 70).toISOString(),
      received_at: subHours(baseDate, 69).toISOString(),
      payload: { page: "/pricing", session_id: "summitflow_pricing_story_1", visit_count: 2 },
    },
    {
      source_system: "website",
      event_type: "pricing_page_visit",
      account_domain: summitFlow.domain,
      contact_email: summitFlowPrimary.email,
      occurred_at: subHours(baseDate, 29).toISOString(),
      received_at: subHours(baseDate, 28).toISOString(),
      payload: { page: "/pricing", session_id: "summitflow_pricing_story_2", visit_count: 3 },
    },
    {
      source_system: "website",
      event_type: "pricing_page_visit",
      account_domain: summitFlow.domain,
      contact_email: summitFlowPrimary.email,
      occurred_at: subHours(baseDate, 5).toISOString(),
      received_at: subHours(baseDate, 4).toISOString(),
      payload: { page: "/pricing", session_id: "summitflow_pricing_story_3", visit_count: 4 },
    },
    {
      source_system: "website",
      event_type: "high_intent_page_cluster_visit",
      account_domain: summitFlow.domain,
      contact_email: summitFlowPrimary.email,
      occurred_at: subHours(baseDate, 3).toISOString(),
      received_at: subHours(baseDate, 2).toISOString(),
      payload: { page_cluster: "pricing,security,integrations", session_id: "summitflow_cluster_story_1" },
    },
    {
      source_system: "calendar",
      event_type: "meeting_booked",
      account_domain: summitFlow.domain,
      contact_email: summitFlowPrimary.email,
      occurred_at: subHours(baseDate, 2).toISOString(),
      received_at: subHours(baseDate, 1).toISOString(),
      payload: {
        meeting_id: "summitflow_story_meeting_1",
        calendar_event_id: "summitflow_story_calendar_1",
        meeting_type: "exec_review",
      },
    },
    {
      source_system: "marketing_automation",
      event_type: "form_fill",
      account_domain: summitFlow.domain,
      contact_email: summitFlowPrimary.email,
      occurred_at: subMinutes(baseDate, 70).toISOString(),
      received_at: subMinutes(baseDate, 64).toISOString(),
      payload: {
        form_id: "request_demo",
        submission_id: "summitflow_story_form_1",
        campaign: "executive_expansion",
      },
    },
    {
      source_system: "website",
      event_type: "pricing_page_visit",
      account_domain: harborPoint.domain,
      contact_email: harborPointPrimary.email,
      occurred_at: subHours(baseDate, 60).toISOString(),
      received_at: subHours(baseDate, 59).toISOString(),
      payload: { page: "/pricing", session_id: "harborpoint_pricing_story_1", visit_count: 2 },
    },
    {
      source_system: "website",
      event_type: "pricing_page_visit",
      account_domain: harborPoint.domain,
      contact_email: harborPointPrimary.email,
      occurred_at: subHours(baseDate, 26).toISOString(),
      received_at: subHours(baseDate, 25).toISOString(),
      payload: { page: "/pricing", session_id: "harborpoint_pricing_story_2", visit_count: 3 },
    },
    {
      source_system: "website",
      event_type: "pricing_page_visit",
      account_domain: harborPoint.domain,
      contact_email: harborPointPrimary.email,
      occurred_at: subHours(baseDate, 4).toISOString(),
      received_at: subHours(baseDate, 3).toISOString(),
      payload: { page: "/pricing", session_id: "harborpoint_pricing_story_3", visit_count: 4 },
    },
    {
      source_system: "marketing_automation",
      event_type: "form_fill",
      account_domain: harborPoint.domain,
      contact_email: harborPointPrimary.email,
      occurred_at: subHours(baseDate, 3).toISOString(),
      received_at: subHours(baseDate, 2).toISOString(),
      payload: { form_id: "request_demo", submission_id: "harborpoint_story_form_1", campaign: "ops_evaluation" },
    },
    {
      source_system: "calendar",
      event_type: "meeting_booked",
      account_domain: harborPoint.domain,
      contact_email: harborPointPrimary.email,
      occurred_at: subHours(baseDate, 2).toISOString(),
      received_at: subHours(baseDate, 1).toISOString(),
      payload: {
        meeting_id: "harborpoint_story_meeting_1",
        calendar_event_id: "harborpoint_story_calendar_1",
        meeting_type: "discovery_call",
      },
    },
    {
      source_system: "product",
      event_type: "product_usage_milestone",
      account_domain: harborPoint.domain,
      contact_email: harborPointPrimary.email,
      occurred_at: subMinutes(baseDate, 80).toISOString(),
      received_at: subMinutes(baseDate, 74).toISOString(),
      payload: {
        workspace_id: "harborpoint_story_workspace",
        milestone: "connected_crm",
        user_id: "harborpoint_story_user_1",
      },
    },
    {
      source_system: "product",
      event_type: "product_signup",
      account_domain: harborPoint.domain,
      contact_email: harborPointPrimary.email,
      occurred_at: subMinutes(baseDate, 70).toISOString(),
      received_at: subMinutes(baseDate, 64).toISOString(),
      payload: {
        workspace_id: "harborpoint_story_workspace",
        signup_id: "harborpoint_story_signup_1",
        plan: "pilot",
      },
    },
    {
      source_system: "product",
      event_type: "product_signup",
      account_domain: ironPeak.domain,
      contact_email: ironPeakPrimary.email,
      occurred_at: subHours(baseDate, 72).toISOString(),
      received_at: subHours(baseDate, 71).toISOString(),
      payload: { workspace_id: "ironpeak_story_workspace", signup_id: "ironpeak_story_signup_1", plan: "pilot" },
    },
    {
      source_system: "product",
      event_type: "product_usage_milestone",
      account_domain: ironPeak.domain,
      contact_email: ironPeakPrimary.email,
      occurred_at: subHours(baseDate, 8).toISOString(),
      received_at: subHours(baseDate, 7).toISOString(),
      payload: {
        workspace_id: "ironpeak_story_workspace",
        milestone: "invited_teammates",
        user_id: "ironpeak_story_user_2",
      },
    },
    {
      source_system: "product",
      event_type: "product_usage_milestone",
      account_domain: ironPeak.domain,
      contact_email: ironPeakPrimary.email,
      occurred_at: subHours(baseDate, 6).toISOString(),
      received_at: subHours(baseDate, 5).toISOString(),
      payload: {
        workspace_id: "ironpeak_story_workspace",
        milestone: "connected_crm",
        user_id: "ironpeak_story_user_3",
      },
    },
    {
      source_system: "sales_engagement",
      event_type: "email_reply",
      account_domain: ironPeak.domain,
      contact_email: ironPeakPrimary.email,
      occurred_at: subHours(baseDate, 4).toISOString(),
      received_at: subHours(baseDate, 3).toISOString(),
      payload: {
        thread_id: "ironpeak_story_thread_1",
        message_id: "ironpeak_story_message_1",
        subject: "Expansion readiness follow-up",
      },
    },
    {
      source_system: "calendar",
      event_type: "meeting_booked",
      account_domain: ironPeak.domain,
      contact_email: ironPeakPrimary.email,
      occurred_at: subHours(baseDate, 2).toISOString(),
      received_at: subHours(baseDate, 1).toISOString(),
      payload: {
        meeting_id: "ironpeak_story_meeting_1",
        calendar_event_id: "ironpeak_story_calendar_1",
        meeting_type: "exec_review",
      },
    },
    {
      source_system: "product",
      event_type: "product_signup",
      account_domain: signalNest.domain,
      contact_email: signalNestPrimary.email,
      occurred_at: subHours(baseDate, 48).toISOString(),
      received_at: subHours(baseDate, 47).toISOString(),
      payload: {
        workspace_id: "signalnest_story_workspace",
        signup_id: "signalnest_story_signup_1",
        plan: "trial",
      },
    },
    {
      source_system: "product",
      event_type: "product_usage_milestone",
      account_domain: signalNest.domain,
      contact_email: signalNestPrimary.email,
      occurred_at: subHours(baseDate, 20).toISOString(),
      received_at: subHours(baseDate, 19).toISOString(),
      payload: {
        workspace_id: "signalnest_story_workspace",
        milestone: "invited_teammates",
        user_id: "signalnest_story_user_1",
      },
    },
    {
      source_system: "product",
      event_type: "product_usage_milestone",
      account_domain: signalNest.domain,
      contact_email: signalNestPrimary.email,
      occurred_at: subHours(baseDate, 6).toISOString(),
      received_at: subHours(baseDate, 5).toISOString(),
      payload: {
        workspace_id: "signalnest_story_workspace",
        milestone: "connected_crm",
        user_id: "signalnest_story_user_2",
      },
    },
    {
      source_system: "sales_engagement",
      event_type: "email_reply",
      account_domain: signalNest.domain,
      contact_email: signalNestPrimary.email,
      occurred_at: subHours(baseDate, 5).toISOString(),
      received_at: subHours(baseDate, 4).toISOString(),
      payload: {
        thread_id: "signalnest_story_thread_1",
        message_id: "signalnest_story_message_1",
        subject: "Activation follow-up",
      },
    },
    {
      source_system: "calendar",
      event_type: "meeting_booked",
      account_domain: signalNest.domain,
      contact_email: signalNestPrimary.email,
      occurred_at: subHours(baseDate, 4).toISOString(),
      received_at: subHours(baseDate, 3).toISOString(),
      payload: {
        meeting_id: "signalnest_story_meeting_1",
        calendar_event_id: "signalnest_story_calendar_1",
        meeting_type: "activation_workshop",
      },
    },
  ];
}

function getLeadInboundType(source: string) {
  if (source.includes("Product")) return "Product-led";
  if (source.includes("Webinar") || source.includes("Pricing")) return "Inbound";
  return "Signal-driven";
}

function getFirstResponseAt(
  sequenceIndex: number,
  temperature: Temperature,
  routedAt: Date,
  slaDeadlineAt: Date,
  preferRecentOpen: boolean,
) {
  if (preferRecentOpen && sequenceIndex % 3 === 0) {
    return null;
  }

  if (sequenceIndex % 6 === 0) {
    return null;
  }

  if (sequenceIndex % 5 === 0) {
    return addMinutes(slaDeadlineAt, 75);
  }

  const responseMinutes =
    temperature === Temperature.URGENT
      ? 20
      : temperature === Temperature.HOT
        ? 55
        : temperature === Temperature.WARM
          ? 210
          : 600;

  return addMinutes(routedAt, responseMinutes);
}

function getLeadTaskPriority(temperature: Temperature) {
  if (temperature === Temperature.URGENT) return TaskPriority.URGENT;
  if (temperature === Temperature.HOT) return TaskPriority.HIGH;
  return TaskPriority.MEDIUM;
}

function getLeadTaskDueAt(lead: { temperature: Temperature }, sequenceIndex: number) {
  if (lead.temperature === Temperature.URGENT) {
    return addHours(baseDate, 2 + (sequenceIndex % 3));
  }

  if (lead.temperature === Temperature.HOT) {
    return addHours(baseDate, 6 + (sequenceIndex % 6));
  }

  if (lead.temperature === Temperature.WARM) {
    return addHours(baseDate, 24 + (sequenceIndex % 3) * 12);
  }

  return addHours(baseDate, 48 + (sequenceIndex % 3) * 12);
}

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.task.deleteMany();
  await prisma.routingDecision.deleteMany();
  await prisma.scoreHistory.deleteMany();
  await prisma.signalEvent.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.account.deleteMany();
  await prisma.ruleConfig.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.createMany({ data: userSeed });

  const accounts: SeededAccount[] = accountBlueprints.map((blueprint, index) => ({
    ...blueprint,
    ownerId: blueprint.ownerId ?? blueprint.namedOwnerId ?? null,
    accountTier: getAccountTier(blueprint.segment),
    createdAt: subDays(baseDate, 90 - index * 2),
    updatedAt: subDays(baseDate, index % 4),
  }));

  await prisma.account.createMany({ data: accounts });

  const contacts: SeededContact[] = accounts.flatMap((account, index) => {
    const operational = getOperationalPersona(account.industry);
    const executive = getExecutivePersona(account.segment, account.industry, index);
    const first = getContactName(index, 0);
    const second = getContactName(index, 7);

    return [
      {
        id: `${account.id}_contact_01`,
        accountId: account.id,
        firstName: first.firstName,
        lastName: first.lastName,
        email: `${first.firstName}.${first.lastName}@${account.domain}`.toLowerCase(),
        title: operational.title,
        department: operational.department,
        seniority: operational.seniority,
        phone: getPhoneNumber(account.geography, index, 1),
        personaType: operational.personaType,
        createdAt: subDays(baseDate, 55 - index),
        updatedAt: subDays(baseDate, index % 3),
      },
      {
        id: `${account.id}_contact_02`,
        accountId: account.id,
        firstName: second.firstName,
        lastName: second.lastName,
        email: `${second.firstName}.${second.lastName}@${account.domain}`.toLowerCase(),
        title: executive.title,
        department: executive.department,
        seniority: executive.seniority,
        phone: getPhoneNumber(account.geography, index, 2),
        personaType: executive.personaType,
        createdAt: subDays(baseDate, 53 - index),
        updatedAt: subDays(baseDate, (index + 1) % 4),
      },
    ];
  });

  await prisma.contact.createMany({ data: contacts });

  await prisma.ruleConfig.createMany({
    data: [
      {
        id: "rule_scoring_v1",
        ruleType: "scoring",
        version: "scoring/v1",
        isActive: true,
        configJson: {
          version: "scoring/v1",
          componentCaps: {
            fit: 25,
            intent: 20,
            engagement: 25,
            recency: 10,
            productUsage: 15,
            manualPriority: 5,
          },
          thresholds: {
            coldMax: 24,
            warmMax: 49,
            hotMax: 74,
            urgentMin: 75,
          },
        },
      },
      {
        id: "rule_routing_2026_03",
        ruleType: "routing",
        version: "routing/v1",
        isActive: true,
        configJson: {
          version: "routing/v1",
          precedence: [
            "named_account_owner",
            "existing_account_owner",
            "strategic_tier_override",
            "territory_segment_rule",
            "round_robin_pool",
            "ops_review_queue",
          ],
          territorySegmentRules: [
            {
              key: "na-west-mid-market",
              geography: Geography.NA_WEST,
              segment: Segment.MID_MARKET,
              team: "NA West Mid-Market",
              queue: "na-west-midmarket",
              poolKey: "pool-na-west-commercial",
              inboundTypes: [],
              sdrPod: "NA-West",
            },
            {
              key: "na-west-enterprise",
              geography: Geography.NA_WEST,
              segment: Segment.ENTERPRISE,
              team: "NA West Enterprise",
              queue: "na-west-enterprise",
              poolKey: "pool-na-west-enterprise",
              inboundTypes: [],
              sdrPod: "NA-West",
            },
            {
              key: "na-west-smb",
              geography: Geography.NA_WEST,
              segment: Segment.SMB,
              team: "NA West Commercial",
              queue: "na-west-smb",
              poolKey: "pool-na-west-commercial",
              inboundTypes: [],
              sdrPod: "NA-West",
            },
            {
              key: "na-east-mid-market",
              geography: Geography.NA_EAST,
              segment: Segment.MID_MARKET,
              team: "NA East Mid-Market",
              queue: "na-east-midmarket",
              poolKey: "pool-na-east-commercial",
              inboundTypes: [],
              sdrPod: "NA-East",
            },
            {
              key: "na-east-enterprise",
              geography: Geography.NA_EAST,
              segment: Segment.ENTERPRISE,
              team: "NA East Enterprise",
              queue: "na-east-enterprise",
              poolKey: "pool-na-east-enterprise",
              inboundTypes: [],
              sdrPod: "NA-East",
            },
            {
              key: "emea-mid-market",
              geography: Geography.EMEA,
              segment: Segment.MID_MARKET,
              team: "EMEA Commercial",
              queue: "emea-midmarket",
              poolKey: "pool-emea-commercial",
              inboundTypes: [],
              sdrPod: "EMEA",
            },
            {
              key: "emea-enterprise",
              geography: Geography.EMEA,
              segment: Segment.ENTERPRISE,
              team: "EMEA Enterprise",
              queue: "emea-enterprise",
              poolKey: "pool-emea-enterprise",
              inboundTypes: [],
              sdrPod: "EMEA",
            },
            {
              key: "apac-smb",
              geography: Geography.APAC,
              segment: Segment.SMB,
              team: "APAC Commercial",
              queue: "apac-smb",
              poolKey: "pool-apac-commercial",
              inboundTypes: [],
              sdrPod: "APAC",
            },
            {
              key: "apac-enterprise",
              geography: Geography.APAC,
              segment: Segment.ENTERPRISE,
              team: "APAC Enterprise",
              queue: "apac-enterprise",
              poolKey: "pool-apac-enterprise",
              inboundTypes: [],
              sdrPod: "APAC",
            },
          ],
          roundRobinPools: [
            {
              key: "pool-na-west-commercial",
              geography: Geography.NA_WEST,
              team: "NA West Mid-Market",
              queue: "na-west-midmarket",
              members: ["usr_owen_price", "usr_miles_turner"],
              backupPoolKey: "pool-na-west-fallback",
              sdrPod: "NA-West",
            },
            {
              key: "pool-na-west-enterprise",
              geography: Geography.NA_WEST,
              team: "NA West Enterprise",
              queue: "na-west-enterprise",
              members: ["usr_dante_kim"],
              backupPoolKey: "pool-na-west-fallback",
              sdrPod: "NA-West",
            },
            {
              key: "pool-na-east-commercial",
              geography: Geography.NA_EAST,
              team: "NA East Mid-Market",
              queue: "na-east-midmarket",
              members: ["usr_sarah_kim", "usr_amelia_ross"],
              backupPoolKey: "pool-na-east-fallback",
              sdrPod: "NA-East",
            },
            {
              key: "pool-na-east-enterprise",
              geography: Geography.NA_EAST,
              team: "NA East Enterprise",
              queue: "na-east-enterprise",
              members: ["usr_amelia_ross", "usr_elena_morales"],
              backupPoolKey: "pool-na-east-fallback",
              sdrPod: "NA-East",
            },
            {
              key: "pool-emea-commercial",
              geography: Geography.EMEA,
              team: "EMEA Commercial",
              queue: "emea-midmarket",
              members: ["usr_luca_rossi", "usr_noor_haddad"],
              backupPoolKey: "pool-emea-fallback",
              sdrPod: "EMEA",
            },
            {
              key: "pool-emea-enterprise",
              geography: Geography.EMEA,
              team: "EMEA Enterprise",
              queue: "emea-enterprise",
              members: ["usr_noor_haddad", "usr_luca_rossi"],
              backupPoolKey: "pool-emea-fallback",
              sdrPod: "EMEA",
            },
            {
              key: "pool-apac-commercial",
              geography: Geography.APAC,
              team: "APAC Commercial",
              queue: "apac-smb",
              members: ["usr_ivy_ng", "usr_tessa_liu"],
              backupPoolKey: "pool-apac-fallback",
              sdrPod: "APAC",
            },
            {
              key: "pool-apac-enterprise",
              geography: Geography.APAC,
              team: "APAC Enterprise",
              queue: "apac-enterprise",
              members: ["usr_hana_cho"],
              backupPoolKey: "pool-apac-fallback",
              sdrPod: "APAC",
            },
            {
              key: "pool-na-west-fallback",
              geography: Geography.NA_WEST,
              team: "NA West Review",
              queue: "na-west-review",
              members: ["usr_owen_price", "usr_miles_turner"],
              sdrPod: "NA-West",
            },
            {
              key: "pool-na-east-fallback",
              geography: Geography.NA_EAST,
              team: "NA East Review",
              queue: "na-east-review",
              members: ["usr_sarah_kim", "usr_amelia_ross"],
              sdrPod: "NA-East",
            },
            {
              key: "pool-emea-fallback",
              geography: Geography.EMEA,
              team: "EMEA Review",
              queue: "emea-review",
              members: ["usr_luca_rossi", "usr_noor_haddad"],
              sdrPod: "EMEA",
            },
            {
              key: "pool-apac-fallback",
              geography: Geography.APAC,
              team: "APAC Review",
              queue: "apac-review",
              members: ["usr_ivy_ng"],
              sdrPod: "APAC",
            },
          ],
          fallbackPoolKeys: {
            [Geography.NA_WEST]: "pool-na-west-fallback",
            [Geography.NA_EAST]: "pool-na-east-fallback",
            [Geography.EMEA]: "pool-emea-fallback",
            [Geography.APAC]: "pool-apac-fallback",
          },
          strategicOverrides: [
            {
              key: "strategic-global-pair",
              accountTier: AccountTier.STRATEGIC,
              team: "Strategic Accounts",
              queue: "strategic-accounts",
              primaryOwnerId: "usr_elena_morales",
              secondaryOwnerId: "usr_sarah_kim",
              escalationPolicyKey: "strategic-ae-sdr-pair",
            },
          ],
          opsReview: {
            team: "Revenue Operations",
            queue: "ops-review",
          },
          slaPolicy: {
            hotInboundLeadMinutes: 15,
            warmInboundLeadMinutes: 120,
            productQualifiedMinutes: 240,
            generalFormFillMinutes: 1440,
          },
        },
      },
    ],
  });

  const leads: SeededLead[] = accounts.flatMap((account, index) => {
    const primaryScore = clampScore(
      account.overallScore + (account.status === AccountStatus.HOT ? 2 : -4 + (index % 6)),
    );
    const primaryCreatedAt =
      account.status === AccountStatus.HOT
        ? subHours(baseDate, 10 + index * 2)
        : subHours(baseDate, 56 + (index % 6) * 12);
    const primaryTemperature = getTemperature(primaryScore);
    const primaryRoutedAt = addMinutes(primaryCreatedAt, 18 + (index % 4) * 12);
    const primarySlaDeadlineAt = addHours(primaryCreatedAt, getSlaHours(primaryTemperature));
    const primaryFirstResponseAt = getFirstResponseAt(
      index,
      primaryTemperature,
      primaryRoutedAt,
      primarySlaDeadlineAt,
      false,
    );
    const ownerId = account.namedOwnerId ?? getFallbackLeadOwner(account.geography);

    const primaryLead: SeededLead = {
      id: `${account.id}_lead_01`,
      accountId: account.id,
      contactId: `${account.id}_contact_01`,
      source: primaryLeadSources[index % primaryLeadSources.length],
      inboundType: getLeadInboundType(primaryLeadSources[index % primaryLeadSources.length]),
      currentOwnerId: ownerId,
      status: getLeadStatus(primaryTemperature),
      score: primaryScore,
      temperature: primaryTemperature,
      slaDeadlineAt: primarySlaDeadlineAt,
      firstResponseAt: primaryFirstResponseAt,
      routedAt: primaryRoutedAt,
      createdAt: primaryCreatedAt,
      updatedAt: addHours(primaryCreatedAt, 3),
    };

    if (!secondaryLeadAccountIds.has(account.id)) {
      return [primaryLead];
    }

    const secondaryScore = clampScore(account.overallScore + 4 - (index % 2));
    const secondaryCreatedAt = subMinutes(baseDate, 35 + index * 18);
    const secondaryTemperature = getTemperature(secondaryScore);
    const secondaryRoutedAt = addMinutes(secondaryCreatedAt, 10 + (index % 3) * 8);
    const secondarySlaDeadlineAt = addHours(secondaryCreatedAt, getSlaHours(secondaryTemperature));
    const secondaryFirstResponseAt = getFirstResponseAt(
      index,
      secondaryTemperature,
      secondaryRoutedAt,
      secondarySlaDeadlineAt,
      true,
    );

    const secondaryLead: SeededLead = {
      id: `${account.id}_lead_02`,
      accountId: account.id,
      contactId: `${account.id}_contact_02`,
      source: secondaryLeadSources[index % secondaryLeadSources.length],
      inboundType: "Signal-driven",
      currentOwnerId: ownerId,
      status: getLeadStatus(secondaryTemperature),
      score: secondaryScore,
      temperature: secondaryTemperature,
      slaDeadlineAt: secondarySlaDeadlineAt,
      firstResponseAt: secondaryFirstResponseAt,
      routedAt: secondaryRoutedAt,
      createdAt: secondaryCreatedAt,
      updatedAt: addHours(secondaryCreatedAt, 2),
    };

    return [primaryLead, secondaryLead];
  });

  await prisma.lead.createMany({ data: leads });

  const matchedSignalInputs = buildMatchedSignalInputs(accounts, contacts);
  const scoringStorySignalInputs = buildScoringStorySignalInputs(accounts, contacts);
  const unmatchedSignalInputs = buildUnmatchedSignalInputs(accounts, contacts);
  const seededSignalInputs = [...matchedSignalInputs, ...scoringStorySignalInputs, ...unmatchedSignalInputs];
  const ingestedSignals: Array<{
    signalId: string;
    occurredAt: Date;
    receivedAt: Date;
  }> = [];

  for (const signalInput of seededSignalInputs) {
    const result = await ingestSignal(signalInput);
    if (!result.created) {
      throw new Error(`Seed signal dedupe collision detected for ${signalInput.event_type}.`);
    }

    ingestedSignals.push({
      signalId: result.signalId,
      occurredAt: new Date(signalInput.occurred_at),
      receivedAt: new Date(signalInput.received_at ?? signalInput.occurred_at),
    });
  }

  await prisma.$transaction(
    ingestedSignals.map((signal, index) =>
      prisma.signalEvent.update({
        where: { id: signal.signalId },
        data: {
          createdAt: addMinutes(signal.receivedAt, 1 + (index % 3)),
          updatedAt: addMinutes(signal.receivedAt, 3 + (index % 3)),
        },
      }),
    ),
  );

  await setAccountManualPriorityBoost("acc_signalnest", 3, {
    actorType: "ops_user",
    actorName: "Priya Singh",
    note: "Prioritized after product-qualified expansion interest.",
    effectiveAtIso: addMinutes(baseDate, 20).toISOString(),
  });
  await setLeadManualPriorityBoost("acc_summitflow_finance_lead_01", 5, {
    actorType: "ops_user",
    actorName: "Amelia Ross",
    note: "Escalated because pricing activity and live meeting intent converged.",
    effectiveAtIso: addMinutes(baseDate, 21).toISOString(),
  });
  await setLeadManualPriorityBoost("acc_harborpoint_lead_01", 5, {
    actorType: "ops_user",
    actorName: "Elena Morales",
    note: "Moved into the executive queue after the direct meeting request.",
    effectiveAtIso: addMinutes(baseDate, 22).toISOString(),
  });
  await setLeadManualPriorityBoost("acc_ironpeak_lead_01", 5, {
    actorType: "ops_user",
    actorName: "Elena Morales",
    note: "Boosted after product activation and stakeholder follow-up aligned.",
    effectiveAtIso: addMinutes(baseDate, 23).toISOString(),
  });

  const scoreAsOf = addMinutes(baseDate, 45);
  for (const account of accounts) {
    await recomputeAccountScore(account.id, {
      type: "MANUAL_RECOMPUTE",
      actorType: "system",
      actorName: "Seed Snapshot",
      note: "Finalize deterministic end-of-day account scoring snapshots.",
      effectiveAtIso: scoreAsOf.toISOString(),
    });
  }

  for (const lead of leads) {
    await recomputeLeadScore(lead.id, {
      type: "MANUAL_RECOMPUTE",
      actorType: "system",
      actorName: "Seed Snapshot",
      note: "Finalize deterministic end-of-day lead scoring snapshots.",
      effectiveAtIso: scoreAsOf.toISOString(),
    });
  }

  await prisma.routingDecision.deleteMany();
  await prisma.auditLog.deleteMany({
    where: {
      eventType: {
        in: [
          AuditEventType.ROUTE_ASSIGNED,
          AuditEventType.ROUTING_FALLBACK_CAPACITY,
          AuditEventType.ROUTING_SENT_TO_OPS_REVIEW,
        ],
      },
    },
  });
  await prisma.$transaction(
    leads.map((lead) =>
      prisma.lead.update({
        where: { id: lead.id },
        data: {
          currentOwnerId: lead.currentOwnerId,
          routedAt: lead.routedAt,
          slaDeadlineAt: lead.slaDeadlineAt,
        },
      }),
    ),
  );

  for (const [index, lead] of leads.entries()) {
    const decision = await routeLead(lead.id, {
      effectiveAt: addMinutes(scoreAsOf, index),
    });

    if (!decision) {
      throw new Error(`Routing did not return a decision for lead ${lead.id}.`);
    }
  }

  const refreshedAccounts = await prisma.account.findMany({
    orderBy: {
      createdAt: "asc",
    },
  });
  const refreshedLeads = await prisma.lead.findMany({
    orderBy: {
      createdAt: "asc",
    },
  });
  const accountById = new Map(refreshedAccounts.map((account) => [account.id, account]));

  const tasks = [
    ...refreshedLeads.map((lead, index) => {
      const account = accountById.get(lead.accountId)!;
      const isSecondaryLead = lead.id.endsWith("_lead_02");
      const primaryTaskStatus = index % 4 === 0 ? TaskStatus.IN_PROGRESS : TaskStatus.OPEN;
      const secondaryTaskStatus =
        index % 3 === 0 ? TaskStatus.COMPLETED : index % 2 === 0 ? TaskStatus.IN_PROGRESS : TaskStatus.OPEN;
      const status = isSecondaryLead ? secondaryTaskStatus : primaryTaskStatus;
      const dueAt = getLeadTaskDueAt(lead, index);

      return {
        id: `${lead.id}_task_01`,
        leadId: lead.id,
        accountId: lead.accountId,
        ownerId: lead.currentOwnerId,
        taskType:
          lead.temperature === Temperature.URGENT
            ? TaskType.CALL
            : lead.temperature === Temperature.HOT
              ? TaskType.EMAIL
              : TaskType.RESEARCH,
        priority: getLeadTaskPriority(lead.temperature),
        dueAt,
        status,
        title:
          lead.temperature === Temperature.URGENT
            ? `Call ${account.name} within the active SLA`
            : isSecondaryLead
              ? `Expand buying committee coverage for ${account.name}`
              : `Send tailored follow-up to ${account.name}`,
        description:
          lead.temperature === Temperature.URGENT
            ? "Recent pricing, meeting, and intent activity signals a live opportunity. Confirm timing and next-step owner."
            : isSecondaryLead
              ? "Bring the executive stakeholder into the thread and validate decision criteria across the buying group."
              : "Use the latest signal bundle to personalize the next touch and qualify urgency.",
        createdAt: lead.createdAt,
        completedAt: status === TaskStatus.COMPLETED ? addHours(lead.createdAt, 8) : null,
      };
    }),
    ...accountTaskAccountIds.map((accountId, index) => {
      const account = accountById.get(accountId)!;
      const ownerId =
        account.ownerId ?? account.namedOwnerId ?? getFallbackLeadOwner(account.geography);
      const isHotAccount = account.status === AccountStatus.HOT;

      return {
        id: `${account.id}_task_account_${String(index + 1).padStart(2, "0")}`,
        leadId: null,
        accountId: account.id,
        ownerId,
        taskType: index % 2 === 0 ? TaskType.REVIEW : TaskType.HANDOFF,
        priority: isHotAccount ? TaskPriority.HIGH : TaskPriority.MEDIUM,
        dueAt: isHotAccount ? addHours(baseDate, 10 + index) : addHours(baseDate, 36 + index * 4),
        status: index % 3 === 0 ? TaskStatus.IN_PROGRESS : TaskStatus.OPEN,
        title:
          isHotAccount
            ? `Prepare executive brief for ${account.name}`
            : `Refresh account plan for ${account.name}`,
        description:
          isHotAccount
            ? "Consolidate the latest signals, routing trace, and stakeholder map ahead of the next executive touch."
            : "Review open signal clusters, confirm owner coverage, and update the next-best action summary.",
        createdAt: subDays(baseDate, 1),
        completedAt: null,
      };
    }),
  ];

  await prisma.task.createMany({ data: tasks });

  console.log(
    `Seeded GTM Signal Orchestrator demo data: ${userSeed.length} users, ${accounts.length} accounts, ${contacts.length} contacts, ${refreshedLeads.length} leads, ${seededSignalInputs.length} signal events, and ${tasks.length} tasks.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await Promise.all([prisma.$disconnect(), db.$disconnect()]);
  });
