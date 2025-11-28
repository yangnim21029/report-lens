/**
 * Custom Hook for MindMap Layout Calculations
 * Separates layout logic from rendering
 */

import { useMemo } from "react";
import type { FlowStep, StepStatus } from "~/types";
import { MINDMAP_LAYOUT } from "~/config";

export interface MindMapNode extends FlowStep {
    x: number;
    y: number;
}

export interface MindMapPath {
    d: string;
    isComplete: boolean;
}

export interface MindMapLayout {
    nodes: MindMapNode[];
    paths: MindMapPath[];
    totalWidth: number;
    height: number;
}

/**
 * Calculate MindMap layout with zig-zag S-curve pattern
 */
export function useMindMapLayout(steps: FlowStep[]): MindMapLayout {
    return useMemo(() => {
        const {
            CANVAS_HEIGHT,
            WAVE_AMPLITUDE,
            NODE_SPACING,
            NODE_WIDTH,
            NODE_HEIGHT,
            PADDING_LEFT,
            PADDING_RIGHT,
            CURVE_CONTROL_POINT_OFFSET,
        } = MINDMAP_LAYOUT;

        const baseY = CANVAS_HEIGHT / 2;

        // Calculate node positions
        const nodes: MindMapNode[] = steps.map((step, idx) => {
            const x = PADDING_LEFT + idx * NODE_SPACING;
            const y = baseY + (idx % 2 === 0 ? -WAVE_AMPLITUDE : WAVE_AMPLITUDE);
            return { ...step, x, y };
        });

        // Calculate paths between nodes
        const paths: MindMapPath[] = nodes.slice(0, -1).map((node, idx) => {
            const next = nodes[idx + 1]!;
            const midX1 = node.x + NODE_SPACING * CURVE_CONTROL_POINT_OFFSET;
            const midX2 = next.x - NODE_SPACING * CURVE_CONTROL_POINT_OFFSET;
            const d = `M ${node.x} ${node.y} C ${midX1} ${node.y}, ${midX2} ${next.y}, ${next.x} ${next.y}`;
            const isComplete = node.status === "done" && next.status !== "pending";
            return { d, isComplete };
        });

        const totalWidth =
            PADDING_LEFT + (steps.length - 1) * NODE_SPACING + NODE_WIDTH + PADDING_RIGHT;

        return {
            nodes,
            paths,
            totalWidth,
            height: CANVAS_HEIGHT,
        };
    }, [steps]);
}

/**
 * Get status-based styling classes
 */
export function getStatusStyles(status: StepStatus): string {
    const styles: Record<StepStatus, string> = {
        done: "ring-2 ring-sky-500 shadow-lg shadow-sky-100 border-sky-200 bg-white scale-[1.02]",
        active: "ring-2 ring-slate-300 border-slate-200 bg-white",
        pending: "border-slate-200 bg-white/80 text-slate-500",
    };
    return styles[status];
}
