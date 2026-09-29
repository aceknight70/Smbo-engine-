/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { EngineState } from "./App";

let clientInstance: SupabaseClient | null = null;
let lastUrl = "";
let lastKey = "";

export function getSupabaseClient(url: string, key: string): SupabaseClient | null {
  if (!url || !key) return null;
  const cleanUrl = url.trim();
  const cleanKey = key.trim();
  if (clientInstance && lastUrl === cleanUrl && lastKey === cleanKey) {
    return clientInstance;
  }
  try {
    clientInstance = createClient(cleanUrl, cleanKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    lastUrl = cleanUrl;
    lastKey = cleanKey;
    return clientInstance;
  } catch (err) {
    console.error("Failed to initialize Supabase client:", err);
    return null;
  }
}

export interface SupabaseRecord {
  id?: string | number;
  affiliates?: number;
  active?: number;
  sales?: number;
  avg_sale?: number;
  avgSale?: number;
  pool?: number;
  commission_pool?: number;
  cohort_on?: boolean;
  cohortOn?: boolean;
  gift?: number;
  launch_money?: number;
  created_at?: string;
  updated_at?: string;
}

export function parseSupabaseMetrics(record: Record<string, unknown>): Partial<EngineState> {
  const result: Partial<EngineState> = {};

  if (typeof record.affiliates === "number") result.affiliates = record.affiliates;
  else if (typeof record.affiliates === "string" && !isNaN(Number(record.affiliates))) {
    result.affiliates = Number(record.affiliates);
  }

  if (typeof record.active === "number") result.active = record.active;
  else if (typeof record.active === "string" && !isNaN(Number(record.active))) {
    result.active = Number(record.active);
  }

  if (typeof record.sales === "number") result.sales = record.sales;
  else if (typeof record.sales === "string" && !isNaN(Number(record.sales))) {
    result.sales = Number(record.sales);
  }

  const avgSaleVal = record.avg_sale ?? record.avgSale;
  if (typeof avgSaleVal === "number") result.avgSale = avgSaleVal;
  else if (typeof avgSaleVal === "string" && !isNaN(Number(avgSaleVal))) {
    result.avgSale = Number(avgSaleVal);
  }

  const poolVal = record.pool ?? record.commission_pool;
  if (typeof poolVal === "number") result.pool = poolVal;
  else if (typeof poolVal === "string" && !isNaN(Number(poolVal))) {
    result.pool = Number(poolVal);
  }

  const cohortVal = record.cohort_on ?? record.cohortOn;
  if (typeof cohortVal === "boolean") result.cohortOn = cohortVal;
  else if (typeof cohortVal === "string") {
    result.cohortOn = cohortVal.toLowerCase() === "true" || cohortVal === "1";
  }

  const giftVal = record.gift ?? record.launch_money;
  if (typeof giftVal === "number") result.gift = giftVal;
  else if (typeof giftVal === "string" && !isNaN(Number(giftVal))) {
    result.gift = Number(giftVal);
  }

  return result;
}

export async function fetchLiveMetrics(
  url: string,
  key: string,
  tableName: string = "smbo_metrics"
): Promise<{ data: Partial<EngineState> | null; raw: Record<string, unknown> | null; error: string | null }> {
  try {
    const supabase = getSupabaseClient(url, key);
    if (!supabase) {
      return { data: null, raw: null, error: "Invalid Supabase Project URL or Anon Key." };
    }

    const { data, error } = await supabase
      .from(tableName.trim() || "smbo_metrics")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      return { data: null, raw: null, error: error.message };
    }

    if (!data || data.length === 0) {
      return {
        data: null,
        raw: null,
        error: `Table "${tableName}" was reached, but contains no records. Insert a row or use demo data.`,
      };
    }

    const parsed = parseSupabaseMetrics(data[0] as Record<string, unknown>);
    return { data: parsed, raw: data[0] as Record<string, unknown>, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error contacting Supabase.";
    return { data: null, raw: null, error: msg };
  }
}
