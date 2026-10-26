import type { Server } from "socket.io";

export type RealtimeResource =
  | "site"
  | "equipment"
  | "planification"
  | "rapport"
  | "notification"
  | "dashboard"
  | "user";

export type RealtimeAction = "created" | "updated" | "deleted";

export interface CompanyRealtimeEvent {
  resource: RealtimeResource;
  action: RealtimeAction;
  entityId?: string;
  companyId: string;
  actorId: string;
  occurredAt: string;
}

let io: Server | null = null;

/** Register the single Socket.IO server instance created by the HTTP server. */
export function configureRealtime(server: Server): void {
  io = server;
}

/**
 * Broadcast only to the authenticated company's server-assigned room.
 * Call this only after the corresponding database write has succeeded.
 */
export function emitCompanyEvent(
  event: Omit<CompanyRealtimeEvent, "occurredAt">
): void {
  if (!io || !event.companyId) return;
  io.to(companyRoom(event.companyId)).emit("company:changed", {
    ...event,
    occurredAt: new Date().toISOString()
  } satisfies CompanyRealtimeEvent);
}

export function companyRoom(companyId: string): string {
  return `company:${companyId}`;
}


/** Disconnects active sockets belonging to a user whose access has been revoked. */
export async function disconnectUserSockets(companyId: string, userId: string): Promise<void> {
  if (!io || !companyId || !userId) return;
  try {
    const sockets = await io.in(companyRoom(companyId)).fetchSockets();
    for (const socket of sockets) {
      const profile = socket.data.authProfile as { id?: string } | undefined;
      if (profile?.id === userId) socket.disconnect(true);
    }
  } catch {
    // A disconnect failure must not turn an already-committed user update into an API error.
  }
}
