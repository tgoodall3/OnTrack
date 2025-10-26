"use client";

import { create } from "zustand";

type Toast = {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "destructive" | "success";
  duration?: number;
};

type ToastState = {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
};

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (toast) =>
    set((state) => ({
      toasts: [
        ...state.toasts,
        { id: crypto.randomUUID(), duration: 5000, variant: "default", ...toast },
      ],
    })),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
}));

export function useToast() {
  const addToast = useToastStore((state) => state.addToast);
  return {
    toast: addToast,
  };
}

