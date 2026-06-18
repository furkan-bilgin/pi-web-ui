/**
 * Persistent event ring buffer for session events.
 *
 * Fixed-size circular buffer that survives WebSocket disconnects.
 * New connections can always replay events after their lastSeq.
 */

const DEFAULT_CAPACITY = 1000;

export interface RingEntry {
  seq: number;
  event: Record<string, unknown>;
}

export class EventRing {
  private buffer: RingEntry[];
  private capacity: number;
  private nextSeq: number;
  private startSeq: number; // seq of the oldest entry in the buffer

  constructor(capacity = DEFAULT_CAPACITY) {
    this.buffer = [];
    this.capacity = capacity;
    this.nextSeq = 1;
    this.startSeq = 1;
  }

  /** Append an event and return its seq number. */
  append(event: Record<string, unknown>): number {
    const seq = this.nextSeq++;
    this.buffer.push({ seq, event });

    // Trim oldest when over capacity
    if (this.buffer.length > this.capacity) {
      this.buffer.shift();
      this.startSeq++;
    }

    return seq;
  }

  /** Get all events after the given cursor seq.
   *  Returns { miss: true } if the cursor is before our oldest entry. */
  eventsAfter(cursor: number | null): { events: RingEntry[]; miss: boolean } {
    if (cursor === null || cursor === undefined) {
      return { events: [], miss: true };
    }
    if (cursor < this.startSeq - 1) {
      return { events: [], miss: true };
    }
    return {
      events: this.buffer.filter((e) => e.seq > cursor),
      miss: false,
    };
  }

  /** Trim all events up to and including the given seq. */
  trimUpTo(seq: number): void {
    const idx = this.buffer.findIndex((e) => e.seq === seq);
    if (idx >= 0) {
      const removed = this.buffer.splice(0, idx + 1);
      if (removed.length > 0) {
        this.startSeq = removed[removed.length - 1].seq + 1;
      }
    }
  }

  currentSeq(): number {
    return this.nextSeq - 1;
  }

  /** Get the last N events (for snapshot/bootstrap). */
  lastEvents(n: number): RingEntry[] {
    return this.buffer.slice(-n);
  }

  size(): number {
    return this.buffer.length;
  }
}
