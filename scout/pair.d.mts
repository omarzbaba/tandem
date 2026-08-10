/**
 * Types for the shared pairing engine, so the React board can import the exact
 * module the harvester runs instead of keeping a parallel implementation.
 */

import type { Metro, Pair, Role } from "../src/lib/types";

export declare const DEFAULT_RADIUS_MILES: number;

export declare function buildPairs(
  roles: Role[],
  opts?: { radiusMiles?: number }
): Pair[];

export declare function buildMetros(
  roles: Role[],
  opts?: { radiusMiles?: number }
): Metro[];
