/** Ensures the canonical filer person records exist. */
import { db } from "@/db";
import { persons } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function ensurePerson(fullName: string, role: string): Promise<string> {
  const existing = await db
    .select({ id: persons.id })
    .from(persons)
    .where(eq(persons.fullName, fullName))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [row] = await db
    .insert(persons)
    .values({ fullName, role })
    .returning({ id: persons.id });
  return row.id;
}

/** The President — the v1 filer of record. */
export function ensurePresident(): Promise<string> {
  return ensurePerson("Donald J. Trump", "President");
}
