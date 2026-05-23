import { get } from "./client";
import type { SearchResults } from "./types";

export const searchAll = (q: string, limit = 10) =>
  get<SearchResults>(
    `/api/search?q=${encodeURIComponent(q)}&limit=${limit}`,
  );
