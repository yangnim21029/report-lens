/**
 * Application Configuration
 * Centralized configuration values to avoid hardcoded strings and magic numbers
 */

// Default values for testing and development
export const DEFAULT_SITE = "sc-domain:holidaysmart.io";
export const DEFAULT_PAGE = "https://holidaysmart.io/hk/article/458268/%E5%B1%AF%E9%96%80";
export const DEFAULT_BASE_URL = "http://localhost:3000";

// External API endpoints
export const COVERAGE_API_URL = "https://keyword-lens.vercel.app/api/url/coverage?url=";

// MindMapFlow layout constants
export const MINDMAP_LAYOUT = {
    CANVAS_HEIGHT: 340,
    WAVE_AMPLITUDE: 80,
    NODE_SPACING: 260,
    NODE_WIDTH: 240,
    NODE_HEIGHT: 100,
    PADDING_LEFT: 120,
    PADDING_RIGHT: 40,
    CURVE_CONTROL_POINT_OFFSET: 0.35,
} as const;

// Date configuration
export const DEFAULT_PERIOD_DAYS = 14;

/**
 * Get default start date (14 days ago from today)
 */
export function getDefaultStartDate(): string {
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - DEFAULT_PERIOD_DAYS);
    return start.toISOString().split("T")[0]!;
}
