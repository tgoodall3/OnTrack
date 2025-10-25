"use client";

import { useEffect } from "react";
import { useToastStore } from "./use-toast";
import { X } from "lucide-react";
import clsx from "clsx";

export function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);

  useEffect(() => {
    const timers = toasts.map((toast) =>
      setTimeout(() => {
        removeToast(toast.id);
      }, toast.duration ?? 5000),
    );

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [toasts, removeToast]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-3 px-4">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={clsx(
            "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg backdrop-blur",
            {
              "bg-background text-foreground border-border": toast.variant === "default",
              "bg-green-600/90 text-white border-green-500": toast.variant === "success",
              "bg-red-600/90 text-white border-red-500": toast.variant === "destructive",
            },
          )}
        >
          <div className="flex-1">
            <p className="text-sm font-semibold">{toast.title}</p>
            {toast.description && <p className="mt-1 text-xs opacity-90">{toast.description}</p>}
          </div>
          <button
            type="button"
            onClick={() => removeToast(toast.id)}
            className="rounded-full border border-transparent p-1 transition hover:border-white/40 hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
