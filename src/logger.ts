export function logInfo(message: string, meta?: unknown): void {
  console.log(`[INFO] ${message}`, meta ?? "");
}

export function logWarn(message: string, meta?: unknown): void {
  console.warn(`[WARN] ${message}`, meta ?? "");
}

export function logError(message: string, meta?: unknown): void {
  console.error(`[ERROR] ${message}`, meta ?? "");
}

