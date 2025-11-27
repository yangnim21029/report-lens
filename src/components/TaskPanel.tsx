"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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

interface TaskPanelProps {
  step: FlowStep | null;
  anchorEl: HTMLElement | null;
  containerRef?: React.RefObject<HTMLElement | null>;
  onClose: () => void;
}

function mapTasksWithStatus(step: FlowStep) {
  const base = step.tasks || [];
  if (step.status === "done") {
    return base.map((t) => ({ ...t, status: "done" as TaskStatus }));
  }
  if (step.status === "pending") {
    return base.map((t, idx) => ({ ...t, status: (idx === 0 ? "active" : "pending") as TaskStatus }));
  }
  return base.map((t, idx) => ({ ...t, status: (idx === 0 ? "active" : "pending") as TaskStatus }));
}

export function TaskPanel({ step, anchorEl, containerRef, onClose }: TaskPanelProps) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!anchorEl || !step) return;
    const scrollContainer = containerRef?.current;

    const updatePosition = () => {
      const rect = anchorEl.getBoundingClientRect();
      const scrollY = window.scrollY ?? document.documentElement?.scrollTop ?? 0;
      const scrollX = window.scrollX ?? document.documentElement?.scrollLeft ?? 0;

      // Position below the anchor, centered
      setPosition({
        top: rect.bottom + scrollY + 12,
        left: rect.left + scrollX + rect.width / 2,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition);
    scrollContainer?.addEventListener("scroll", updatePosition);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition);
      scrollContainer?.removeEventListener("scroll", updatePosition);
    };
  }, [anchorEl, step, containerRef]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        anchorEl &&
        !anchorEl.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    if (step && anchorEl) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [step, anchorEl, onClose]);

  if (!step || !anchorEl || !position) return null;

  const content = (
    <div
      ref={panelRef}
      className="absolute z-[1000] w-[400px] max-w-[90vw] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200 animate-in fade-in zoom-in-95 duration-200"
      style={{
        top: position.top,
        left: position.left,
        transform: "translateX(-50%)",
      }}
    >
      {/* Header */}
      <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-sm">
                <div className="h-5 w-5 rounded-full border-2 border-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-lg font-bold text-slate-900">
                  {step.title}
                </h3>
                <p className="text-xs text-slate-600">
                  {step.subtitle}
                </p>
              </div>
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${step.status === "done"
              ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200"
              : step.status === "active"
                ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200"
                : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
              }`}
          >
            {step.status}
          </span>
        </div>
      </div>

      {/* Tasks list */}
      <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
        <div className="space-y-2">
          {mapTasksWithStatus(step).map((task, idx) => (
            <div
              key={task.id}
              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 transition hover:border-indigo-200 hover:bg-white hover:shadow-sm"
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${task.status === "done"
                  ? "bg-emerald-500 text-white"
                  : task.status === "active"
                    ? "bg-indigo-500 text-white"
                    : "border border-slate-300 bg-white text-slate-400"
                  }`}
              >
                {task.status === "done" ? "✓" : idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                  {task.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );

  // Use Portal to render outside of the flow
  if (typeof document === "undefined") return null;

  return createPortal(content, document.body);
}
