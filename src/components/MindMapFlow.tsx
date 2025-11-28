/**
 * MindMapFlow Component
 * Visualizes flow steps with zig-zag S-curve pattern
 */

"use client";

import type { RefObject } from "react";
import type { FlowStep } from "~/types";
import { useMindMapLayout, getStatusStyles } from "~/hooks/useMindMapLayout";
import { MINDMAP_LAYOUT } from "~/config";

interface MindMapFlowProps {
    steps: FlowStep[];
    onSelect: (step: FlowStep, target: HTMLElement) => void;
    containerRef?: RefObject<HTMLDivElement | null>;
}

export function MindMapFlow({ steps, onSelect, containerRef }: MindMapFlowProps) {
    const { nodes, paths, totalWidth, height } = useMindMapLayout(steps);
    const { NODE_WIDTH, NODE_HEIGHT } = MINDMAP_LAYOUT;

    return (
        <div
            ref={containerRef}
            className="relative w-full overflow-x-auto overflow-y-visible rounded-xl bg-white/70 px-4 py-6 ring-1 ring-slate-200"
        >
            <div className="relative" style={{ height, width: totalWidth }}>
                <svg
                    width={totalWidth}
                    height={height}
                    viewBox={`0 0 ${totalWidth} ${height}`}
                    preserveAspectRatio="xMinYMid meet"
                    className="absolute inset-0"
                >
                    {/* Background paths */}
                    {paths.map((p, i) => (
                        <path
                            key={`bg-${i}`}
                            d={p.d}
                            fill="none"
                            stroke="#dfe5ef"
                            strokeWidth={8}
                            strokeLinecap="round"
                        />
                    ))}
                    {/* Foreground paths (completed) */}
                    {paths.map((p, i) =>
                        p.isComplete ? (
                            <path
                                key={`fg-${i}`}
                                d={p.d}
                                fill="none"
                                stroke="url(#flowGradient)"
                                strokeWidth={8}
                                strokeLinecap="round"
                            />
                        ) : null
                    )}
                    <defs>
                        <linearGradient id="flowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#60a5fa" />
                            <stop offset="100%" stopColor="#22d3ee" />
                        </linearGradient>
                    </defs>
                </svg>
                <div className="relative" style={{ height, width: totalWidth }}>
                    {nodes.map((node, idx) => (
                        <div
                            key={node.id}
                            className={`absolute flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition-all duration-200 hover:shadow-lg ${getStatusStyles(node.status)}`}
                            style={{
                                left: node.x,
                                top: node.y,
                                minWidth: NODE_WIDTH,
                                minHeight: NODE_HEIGHT,
                            }}
                            onClick={(e) => onSelect(node, e.currentTarget)}
                        >
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-xl text-slate-500">
                                <div className="h-6 w-6 rounded-full border border-slate-300" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    {node.subtitle}
                                </span>
                                <span className="text-base font-bold text-slate-900">{node.title}</span>
                            </div>
                            {idx === nodes.length - 1 && (
                                <span className="absolute right-[-6px] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-sky-500 shadow" />
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
