import { getAccess } from "@/lib/access";
import { getRanking, modelName, usageTotals, weekRange } from "@/lib/rankings";
import WeeklyVietnam from "./_components/WeeklyVietnam";

export const dynamic = "force-dynamic";

export default async function Page() {
  const access = await getAccess();
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
        // 변수에 따옴표나 공백이 같이 들어가도 링크가 깨지지 않게
        kakaopayLink: (process.env.KAKAOPAY_LINK ?? "").trim().replace(/^["']|["']$/g, ""),
        kakaopayAmount: process.env.KAKAOPAY_AMOUNT ?? "",
      }}
      model={modelName()}
      totals={usageTotals()}
      currentWeek={weekRange().key}
    />
  );
}
