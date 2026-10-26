import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Server } from "socket.io";
import {
  companyRoom,
  configureRealtime,
  emitCompanyEvent
} from "../src/services/realtime";

describe("company realtime events", () => {
  it("builds a room scoped to one company", () => {
    assert.equal(companyRoom("company-a"), "company:company-a");
    assert.notEqual(companyRoom("company-a"), companyRoom("company-b"));
  });

  it("does not throw when realtime is not configured", () => {
    assert.doesNotThrow(() => emitCompanyEvent({
      resource: "site",
      action: "created",
      companyId: "company-a",
      actorId: "user-a"
    }));
  });

  it("broadcasts only to the specified company room with a timestamp", () => {
    let emittedRoom: string | undefined;
    let emittedEvent: unknown;
    const fakeServer = {
      to(room: string) {
        emittedRoom = room;
        return {
          emit(eventName: string, payload: unknown) {
            assert.equal(eventName, "company:changed");
            emittedEvent = payload;
          }
        };
      }
    } as unknown as Server;

    configureRealtime(fakeServer);
    emitCompanyEvent({
      resource: "equipment",
      action: "updated",
      entityId: "equipment-1",
      companyId: "company-a",
      actorId: "user-a"
    });

    assert.equal(emittedRoom, "company:company-a");
    assert.deepEqual(
      Object.keys(emittedEvent as Record<string, unknown>).sort(),
      ["action", "actorId", "companyId", "entityId", "occurredAt", "resource"]
    );
    assert.equal((emittedEvent as { companyId: string }).companyId, "company-a");
    assert.ok(Number.isFinite(Date.parse((emittedEvent as { occurredAt: string }).occurredAt)));
  });

  it("does not broadcast when companyId is empty", () => {
    let broadcastCount = 0;
    configureRealtime({
      to() {
        return { emit() { broadcastCount += 1; } };
      }
    } as unknown as Server);

    emitCompanyEvent({
      resource: "site",
      action: "deleted",
      companyId: "",
      actorId: "user-a"
    });

    assert.equal(broadcastCount, 0);
  });
});
