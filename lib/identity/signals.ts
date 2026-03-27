import type { Prisma, PrismaClient } from "@prisma/client";

import { db } from "@/lib/db";
import type { IdentityResolutionCode } from "@/lib/contracts/signals";

import type { NormalizedSignalEnvelope } from "@/lib/data/signals/normalize";

type SignalIdentityClient = Prisma.TransactionClient | PrismaClient;

type ResolvedAccount = {
  id: string;
  name: string;
  domain: string;
};

type ResolvedContact = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  account: ResolvedAccount;
};

export type SignalIdentityResolution = {
  matched: boolean;
  account: ResolvedAccount | null;
  contact: ResolvedContact | null;
  reasonCodes: IdentityResolutionCode[];
  explanation: string;
};

function getFullName(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`.trim();
}

export async function resolveAccountByDomain(
  domain: string | null,
  client: SignalIdentityClient = db,
) {
  if (!domain) {
    return null;
  }

  return client.account.findUnique({
    where: { domain },
    select: {
      id: true,
      name: true,
      domain: true,
    },
  });
}

export async function resolveContactByEmail(
  email: string | null,
  client: SignalIdentityClient = db,
) {
  if (!email) {
    return null;
  }

  return client.contact.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      account: {
        select: {
          id: true,
          name: true,
          domain: true,
        },
      },
    },
  });
}

export async function resolveSignalIdentity(
  normalizedSignal: NormalizedSignalEnvelope,
  client: SignalIdentityClient = db,
): Promise<SignalIdentityResolution> {
  const reasonCodes: IdentityResolutionCode[] = [];
  const [accountMatch, contactMatch] = await Promise.all([
    resolveAccountByDomain(normalizedSignal.accountDomain, client),
    resolveContactByEmail(normalizedSignal.contactEmail, client),
  ]);

  if (!normalizedSignal.accountDomain) {
    reasonCodes.push("no_domain_provided");
  }

  if (!normalizedSignal.contactEmail) {
    reasonCodes.push("no_email_provided");
  }

  if (accountMatch) {
    reasonCodes.push("account_domain_exact_match");
  }

  if (contactMatch) {
    reasonCodes.push("contact_email_exact_match");
  }

  if (accountMatch && contactMatch && contactMatch.account.id !== accountMatch.id) {
    return {
      matched: false,
      account: null,
      contact: null,
      reasonCodes: [...reasonCodes, "conflicting_match_candidates"],
      explanation: `Signal identity is unresolved because domain ${normalizedSignal.accountDomain} maps to ${accountMatch.name}, while contact ${contactMatch.email} belongs to ${contactMatch.account.name}.`,
    };
  }

  if (contactMatch && !accountMatch) {
    reasonCodes.push("contact_implies_account");
    return {
      matched: true,
      account: contactMatch.account,
      contact: contactMatch,
      reasonCodes,
      explanation: `Resolved signal to ${contactMatch.account.name} from exact contact email ${contactMatch.email}.`,
    };
  }

  if (accountMatch && contactMatch) {
    return {
      matched: true,
      account: accountMatch,
      contact: contactMatch,
      reasonCodes,
      explanation: `Resolved signal to ${accountMatch.name} from exact domain and contact matches.`,
    };
  }

  if (accountMatch) {
    return {
      matched: true,
      account: accountMatch,
      contact: null,
      reasonCodes,
      explanation: `Resolved signal to ${accountMatch.name} from exact domain ${accountMatch.domain}.`,
    };
  }

  if (contactMatch) {
    return {
      matched: true,
      account: contactMatch.account,
      contact: contactMatch,
      reasonCodes: [...reasonCodes, "contact_implies_account"],
      explanation: `Resolved signal to ${contactMatch.account.name} from contact ${getFullName(contactMatch.firstName, contactMatch.lastName)}.`,
    };
  }

  return {
    matched: false,
    account: null,
    contact: null,
    reasonCodes: [...reasonCodes, "no_confident_match"],
    explanation: "Signal identity is unresolved because no exact account or contact match was found.",
  };
}
