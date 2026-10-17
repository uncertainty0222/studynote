import { cookies } from "next/headers";
import { accessFromCookie, PREMIUM_COOKIE } from "@/lib/premium";
import { getRanking, modelName, usageTotals, weekRange } from "@/lib/rankings";
import WeeklyVietnam from "./_components/WeeklyVietnam";

export const dynamic = "force-dynamic";

export default async function Page() {
  const access = accessFromCookie((await cookies()).get(PREMIUM_COOKIE)?.value);
  return (
    <WeeklyVietnam
      access={access}
      initial={[
        getRanking("national", "week", access.premium),
        getRanking("nhatrang", "week", access.premium),
        getRanking("expat", "week", access.premium),
        getRanking("specialty", "week", access.premium),
      ]}
      purchase={{
        price: process.env.PREMIUM_PRICE_TEXT ?? "",
        contact: process.env.PREMIUM_CONTACT ?? "",
      }}
      model={modelName()}
      totals={usageTotals()}
      currentWeek={weekRange().key}
    />
  );
}
