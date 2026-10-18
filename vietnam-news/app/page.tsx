import { getAccess } from "@/lib/access";
import { getRanking, modelName, usageTotals, weekRange } from "@/lib/rankings";
import QRCode from "qrcode";
import WeeklyVietnam from "./_components/WeeklyVietnam";

export const dynamic = "force-dynamic";

export default async function Page() {
  const access = await getAccess();
  // 카카오페이 송금 링크는 휴대폰 앱에서만 열려서, PC에서는 이 QR을 휴대폰으로 찍게 한다
  const kakaopayLink = (process.env.KAKAOPAY_LINK ?? "").trim().replace(/^["']|["']$/g, "");
  const kakaopayQr = kakaopayLink ? await QRCode.toString(kakaopayLink, { type: "svg", margin: 1, width: 168 }).catch(() => "") : "";
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
        kakaopayLink,
        kakaopayQr,
        kakaopayAmount: process.env.KAKAOPAY_AMOUNT ?? "",
      }}
      model={modelName()}
      totals={usageTotals()}
      currentWeek={weekRange().key}
    />
  );
}
