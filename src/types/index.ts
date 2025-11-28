/**
 * Centralized Type Definitions
 * Shared types used across the application
 */

// API Endpoint types
export type Endpoint = {
    title: string;
    path: string;
    description: string;
    sample: string;
};

// Flow and Task types
export type StepStatus = "done" | "active" | "pending";
export type TaskStatus = StepStatus;

export type FlowTask = {
    id: string;
    title: string;
    desc: string;
    status?: TaskStatus;
};

export type FlowStep = {
    id: string;
    title: string;
    subtitle: string;
    status: StepStatus;
    tasks: FlowTask[];
    icon?: string;
};

// Context suggestion types
export type ContextSuggestion = {
    before?: string;
    whyProblemNow?: string;
    adjustAsFollows?: string;
    afterAdjust?: string | null;
};

// Keyword coverage types (from keyword-coverage.ts)
export interface GscStats {
    clicks: number;
    impressions: number;
    avgPosition?: number;
}

export interface CoverageItem {
    text: string;
    searchVolume: number | null;
    gsc?: GscStats;
}

export interface KeywordCoverageResponse {
    success: boolean;
    covered: CoverageItem[];
    uncovered: CoverageItem[];
}

// Search traffic types (from search-traffic.ts)
export interface KeywordItemLike {
    text: string;
    searchVolume: number | null;
}

export type SiteType =
    | "news"
    | "forum"
    | "ecommerce"
    | "video"
    | "social"
    | "wiki"
    | "other";

export interface EnrichedResultItem {
    title: string;
    url: string;
    domain: string;
    topOffset: number | null;
    domainAuthority: number | null;
    backlinks: number | null;
    backdomains: number | null;
    siteType: SiteType;
    domainTraffic: number | null;
    pageTraffic: number | null;
    pageKeywords: number | null;
    score: number;
}

export interface QueryInsight {
    query: string;
    count: number;
    avgDomainAuthority: number | null;
    siteTypes: Record<SiteType, number>;
    topPages: EnrichedResultItem[];
    pages: EnrichedResultItem[];
    bestPage: EnrichedResultItem | null;
    paa?: Array<{
        question: string;
        source_url?: string;
        answer?: string;
        topOffset?: number | null;
    }>;
}

export interface SearchTrafficInsights {
    success: boolean;
    pickedQueries: string[];
    insights: QueryInsight[];
    overall: {
        avgDomainAuthority: number | null;
        siteTypes: Record<SiteType, number>;
        bestPage: EnrichedResultItem | null;
    };
}

export interface UpstreamResultItem {
    topOffset?: number;
    title?: string;
    url?: string;
    domain?: string;
    description?: string;
    domainAuthority?: string;
    backdomains?: string;
    backlinks?: string;
    ahrefs_domain?: {
        DR?: string;
        RD?: string;
        BL?: string;
        KW?: string;
        ST?: string;
    };
    ahrefs_page?: {
        UR?: string;
        RP?: string;
        RD?: string;
        KW?: string;
        ST?: string;
        Words?: string;
    };
    UR?: string;
    RP?: string;
    RD?: string;
    KW?: string;
    ST?: string;
    Words?: string;
}

export interface UpstreamSearchResponse {
    success: boolean;
    query: string;
    count: number;
    results: UpstreamResultItem[];
    paa_count?: number;
    paa_list?: unknown[];
    merged_results?: UpstreamResultItem[];
}
