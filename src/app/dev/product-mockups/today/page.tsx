import { notFound } from "next/navigation";
import { type MockScenarioId, TodayProductMockup } from "./today-product-mockup";

type TodayMockupSearchParams = {
  state?: string | string[];
};

export const dynamic = "force-dynamic";

export default async function TodayProductMockupPage({
  searchParams
}: {
  searchParams?: Promise<TodayMockupSearchParams>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = searchParams ? await searchParams : {};
  const state = Array.isArray(params.state) ? params.state[0] : params.state;
  const initialState = state === "refreshing" ? "checking" : state;

  return <TodayProductMockup initialState={isTodayMockState(initialState) ? initialState : "default"} />;
}

function isTodayMockState(value: string | undefined): value is MockScenarioId {
  return (
    value === "default" ||
    value === "pain" ||
    value === "schedule" ||
    value === "great" ||
    value === "checking" ||
    value === "refreshed" ||
    value === "no-run" ||
    value === "strava-error"
  );
}
