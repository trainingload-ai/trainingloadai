import { headers } from "next/headers";
import { getV2HomeServer } from "@/api/v2-home";
import V2HomePageClient from "./home/V2HomePageClient";

export default async function LocaleHomePage() {
  try {
    const requestHeaders = await headers();
    const initialData = await getV2HomeServer(requestHeaders);

    return <V2HomePageClient initialData={initialData} />;
  } catch (error) {
    console.error("[home:page] server render failed", error);
    throw error;
  }
}
