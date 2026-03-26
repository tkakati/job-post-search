export type RecencyPreference = "past-24h" | "past-week" | "past-month";

export function recencyPreferenceToDays(recencyPreference: RecencyPreference) {
  switch (recencyPreference) {
    case "past-24h":
      return 1;
    case "past-week":
      return 7;
    case "past-month":
      return 30;
    default:
      return 7;
  }
}

export function daysToRecencyPreference(days: number): RecencyPreference {
  if (days <= 1) return "past-24h";
  if (days <= 7) return "past-week";
  return "past-month";
}

export function buildLinkedInContentSearchUrl(input: {
  queryText: string;
  recencyPreference: RecencyPreference;
}) {
  if (!input.queryText) {
    throw new Error("buildLinkedInContentSearchUrl requires non-empty queryText");
  }
  const keywords = encodeURIComponent(input.queryText);
  const datePostedFacet = encodeURIComponent(JSON.stringify([input.recencyPreference]));
  return `https://www.linkedin.com/search/results/content/?keywords=${keywords}&origin=GLOBAL_SEARCH_HEADER&datePosted=${datePostedFacet}`;
}
