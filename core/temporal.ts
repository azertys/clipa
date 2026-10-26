// Use native Temporal when the runtime has it, else the polyfill.
// Bun 1.4 has native Temporal. Some webviews do not.
import { Temporal as TemporalPolyfill } from "@js-temporal/polyfill";

const native = (globalThis as { Temporal?: typeof TemporalPolyfill }).Temporal;

export const Temporal: typeof TemporalPolyfill = native ?? TemporalPolyfill;
export const hasNativeTemporal = native !== undefined;

export type ZonedDateTime = TemporalPolyfill.ZonedDateTime;
export type PlainDateTime = TemporalPolyfill.PlainDateTime;
export type PlainDate = TemporalPolyfill.PlainDate;
