"use client";

interface StatusBannerProps {
  state: "idle" | "loading" | "error" | "ready";
  message: string | null;
}

export default function StatusBanner({ state, message }: StatusBannerProps) {
  if (state === "idle" || !message) {
    return null;
  }

  return <div className={`status-banner status-${state}`}>{message}</div>;
}
