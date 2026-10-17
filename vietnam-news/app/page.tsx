import { getRanking, modelName } from "@/lib/rankings";
import Top10App from "./_components/Top10App";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Top10App
      initialNational={getRanking("national", "week")}
      initialLocal={getRanking("nhatrang", "week")}
      model={modelName()}
    />
  );
}
