/** The shape a domain object has after a JSON round trip: Dates become ISO strings. */
export type Jsonified<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K];
};
