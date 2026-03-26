import { Input } from "@/components/ui/input";

export type SourceFilter = "all" | "retrieved" | "fresh" | "both";
export type RecencyFilter = "any" | "7d" | "30d" | "90d";
export type SortBy = "relevance" | "recent";

export function FilterBar({
  companyQuery,
  setCompanyQuery,
  sourceFilter,
  setSourceFilter,
  newOnly,
  setNewOnly,
  recencyFilter,
  setRecencyFilter,
  sortBy,
  setSortBy,
}: {
  companyQuery: string;
  setCompanyQuery: (value: string) => void;
  sourceFilter: SourceFilter;
  setSourceFilter: (value: SourceFilter) => void;
  newOnly: boolean;
  setNewOnly: (value: boolean) => void;
  recencyFilter: RecencyFilter;
  setRecencyFilter: (value: RecencyFilter) => void;
  sortBy: SortBy;
  setSortBy: (value: SortBy) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          value={companyQuery}
          onChange={(e) => setCompanyQuery(e.target.value)}
          placeholder="Company search"
          className="sm:max-w-sm"
        />
        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={newOnly}
            onChange={(e) => setNewOnly(e.target.checked)}
            className="size-4 rounded border-input"
          />
          New only
        </label>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All sources</option>
          <option value="retrieved">Retrieved only</option>
          <option value="fresh">Fresh only</option>
          <option value="both">Both sources</option>
        </select>

        <select
          value={recencyFilter}
          onChange={(e) => setRecencyFilter(e.target.value as RecencyFilter)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="any">Any recency</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="relevance">Sort: quality/relevance</option>
          <option value="recent">Sort: most recent</option>
        </select>
      </div>
    </div>
  );
}

