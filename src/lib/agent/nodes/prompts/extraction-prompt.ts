type PostInput = {
  index: number;
  url: string;
  text: string;
  authorProfile: {
    email_ID: string | null;
    location: string | null;
    companyName: string | null;
    companyLinkedinUrl: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    headline: string | null;
    about: string | null;
    latestPositionTitle: string | null;
    latestPositionCompanyName: string | null;
  } | null;
};

export function buildExtractionPrompt(input: {
  userRole: string;
  userLocation: string;
  locationIsHardFilter: boolean;
  posts: PostInput[];
}) {
  return `You are extracting structured job signals from LinkedIn posts.

Given:
- user role: ${input.userRole}
- user location: ${input.userLocation}
- locationIsHardFilter: ${String(input.locationIsHardFilter)}

For each post:
- extract role, location(s), company
- extract employmentType (full-time, part-time, contract, internship)
- extract yearsOfExperience (YoE) if explicitly mentioned
- extract workMode (onsite, hybrid, remote)
- determine if this is a hiring post (true/false)

-------------------------
INPUT STRUCTURE
-------------------------

Each post contains:
- text (includes original + reshared content if applicable)
- authorProfile:
  {
    email_ID,
    location,
    companyLinkedinUrl,
    companyName,
    city,
    state,
    country,
    headline,
    about,
    latestPositionTitle,
    latestPositionCompanyName
  }

authorProfile may be null.

-------------------------
STRICT RULES
-------------------------

Return STRICT JSON only. No markdown. No explanations.

Do NOT invent any field. If not present, return null.

-------------------------
REPOST HANDLING
-------------------------
- If the input contains an ORIGINAL POST section:
  - Treat it as the PRIMARY source of truth
  - Ignore weak reshared captions

-------------------------
ROLE EXTRACTION
-------------------------
- Extract PRIMARY hiring role
- Prefer near hiring phrases
- Avoid generic titles
- If unclear -> null

-------------------------
LOCATION EXTRACTION (PRIMARY + SECONDARY)
-------------------------

Primary:
- Post text

Secondary:
- authorProfile location

Rules:
- ALWAYS prefer post location
- ONLY use profile if post missing/ambiguous

If using profile:
- construct from city/state/country if available
- else use profile.location

Return:
- newline-separated string

-------------------------
COMPANY
-------------------------
- Extract ONLY from post text
- Do NOT infer from authorProfile

-------------------------
EMPLOYMENT TYPE
-------------------------
- full-time | part-time | contract | internship
- lowercase
- single value

-------------------------
WORK MODE
-------------------------
- onsite | hybrid | remote
- prefer hybrid > remote > onsite

-------------------------
YEARS OF EXPERIENCE
-------------------------
- Extract exact string if present
- else null

-------------------------
HIRING DETECTION
-------------------------
- TRUE if explicit hiring intent
- else FALSE

-------------------------
AUTHOR TYPE GUESS
-------------------------
- Infer a best-effort authorTypeGuess using:
  - post text hiring intent
  - authorProfile.latestPositionTitle
  - authorProfile.latestPositionCompanyName
  - authorProfile.headline
  - authorProfile.about
- Return one of:
  - hiring_manager
  - recruiter
  - unknown
- Keep authorTypeReason brief (<= 12 words), or null if unknown.

OUTPUT FORMAT
-------------------------

{
  "items": [
    {
      "index": number,
      "url": string,
      "role": string | null,
      "location": string | null,
      "company": string | null,
      "employmentType": string | null,
      "workMode": string | null,
      "yearsOfExperience": string | null,
      "isHiring": boolean,
      "authorTypeGuess": "hiring_manager" | "recruiter" | "unknown" | null,
      "authorTypeReason": string | null
    }
  ]
}

-------------------------
POSTS
-------------------------
${JSON.stringify(input.posts, null, 2)}`;
}
