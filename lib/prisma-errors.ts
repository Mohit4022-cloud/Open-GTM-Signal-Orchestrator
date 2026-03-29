import { Prisma } from "@prisma/client";

export function isMissingTableError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021";
}

export async function withMissingTableFallback<T>(
  operation: () => Promise<T>,
  fallbackValue: T,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isMissingTableError(error)) {
      return fallbackValue;
    }

    throw error;
  }
}
