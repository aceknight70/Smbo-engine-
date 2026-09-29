/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { fetchLiveMetrics } from "./supabase";

// --- Constants & Data Definitions ---
const LANES: string[] = [
  "Interiors, furniture and decor",
  "Curtains and soft furnishings",
  "Phones, telecoms and satellite TV",
  "Electronics and home appliances",
  "Fashion and tailoring",
  "Fashion accessories and boutiques",
  "Beauty, hair and cosmetics",
  "Food, restaurants and catering",
  "Bakeries and pastries",
  "Lounges, wine and lifestyle",
  "Hotels and hospitality",
  "Supermarkets and groceries",
  "Fresh produce, fish and crayfish",
  "Building materials and construction",
  "Hospitals, clinics, pharmacy and wellness",
  "Plumbing and pipe works",
  "Auto parts and repairs",
  "Transport and car hire",
  "Printing and media",
  "Events and rentals",
  "Arts and crafts",
  "Laundry and dry cleaning",
  "Home services (electrical, cleaning, repairs)",
  "Real estate and short-stay property",
  "Professional, creative and consulting services",
  "Sports and fitness",
  "Solar and inverter solutions",
  "Agriculture and agro-processing",
  "Welding, fabrication and metalwork",
  "Lane 30 (still to be named)",
];

const STAKEHOLDERS: string[] = ["Gatekeepers", "Response Academy", "Readiness & Reach"];

export interface EngineState {
  affiliates: number;
  active: number;
  sales: number;
  avgSale: number;
  pool: number;
  cohortOn: boolean;
  gift: number;
}

const INITIAL_STATE: EngineState = {
  affiliates: 90,
  active: 50,
  sales: 2,
  avgSale: 30000,
  pool: 5,
  cohortOn: true,
  gift: 200000,
};

const FIXED = {
  perLane: 10,
  pos: 20,
  logi: 20,
  equip: 20,
  sponsorGroup: 10,
  costPer: 10000,
  cohorts: 2,
};

interface SliderDef {
  label: string;
  min: number;
  max: number;
  step: number;
  f: "num" | "pct" | "sales" | "naira";
}

const SLIDERS: Record<keyof Omit<EngineState, "cohortOn">, SliderDef> = {
  affiliates: { label: "Affiliates and digital marketers by December", min: 20, max: 600, step: 10, f: "num" },
  active: { label: "Affiliates who actually sell", min: 10, max: 100, step: 5, f: "pct" },
  sales: { label: "Sales each active affiliate makes a month", min: 0.5, max: 10, step: 0.5, f: "sales" },
  avgSale: { label: "Average sale", min: 5000, max: 500000, step: 5000, f: "naira" },
  pool: { label: "Commission pool (share of each sale)", min: 1, max: 15, step: 0.5, f: "pct" },
  gift: { label: "Cohort Partner launch money", min: 100000, max: 1000000, step: 50000, f: "naira" },
};

// --- Formatters ---
function n0(n: number): string {
  return Math.round(n).toLocaleString("en-NG");
}

function naira(n: number): string {
  return "\u20A6" + n0(n);
}

function compact(n: number): string {
  if (n >= 1e6) return "\u20A6" + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M";
  if (n >= 1e3) return "\u20A6" + Math.round(n / 1e3) + "k";
  return "\u20A6" + Math.round(n);
}

function fmt(k: string, v: number): string {
  return k === "pct" ? v + "%" : k === "naira" ? naira(v) : k === "sales" ? v + " a month" : n0(v);
}

// --- Calculation Helper ---
function calculateEngine(S: EngineState) {
  const sh = S.cohortOn
    ? { aff: 60, spo: 20, stk: 10, net: 5, cp: 5 }
    : { aff: 60, spo: 20, stk: 10, net: 10, cp: 0 };
  const pool = S.pool / 100;
  const perAff = (S.active / 100) * S.sales * S.avgSale;
  const salesM = S.affiliates * perAff;
  const poolM = salesM * pool;
  const sponsors = Math.max(1, Math.ceil(S.affiliates / FIXED.sponsorGroup));
  const launched = Math.floor(S.gift / FIXED.costPer);
  const cSales = launched * perAff;
  const cpMonth = cSales * pool * (sh.cp / 100);
  const onePool = S.avgSale * pool;

  return {
    sh,
    pool,
    perAff,
    salesM,
    poolM,
    sponsors,
    businesses: FIXED.perLane * 30,
    launched,
    cSales,
    cpMonth,
    onePool,
    one: {
      aff: (onePool * sh.aff) / 100,
      spo: (onePool * sh.spo) / 100,
      stk: (onePool * sh.stk) / 100,
      net: (onePool * sh.net) / 100,
      cp: (onePool * sh.cp) / 100,
    },
  };
}

interface CardContent {
  t: string;
  s: string;
  rows: [string, string, string?][];
  note: string;
}

export default function App() {
  // Shared store state
  const [state, setState] = useState<EngineState>(INITIAL_STATE);
  const [selLane, setSelLane] = useState<number>(1);
  const [selNode, setSelNode] = useState<string | null>(null);
  const [playing, setPlaying] = useState<boolean>(false);
  const [playBtnText, setPlayBtnText] = useState<string>("Play one sale");
  const [summary, setSummary] = useState<string>("");
  const [badgeAmounts, setBadgeAmounts] = useState<Record<string, number | null>>({});
  const [hitNodes, setHitNodes] = useState<Record<string, boolean>>({});

  // Modals state
  const [sheetOpen, setSheetOpen] = useState<boolean>(false);
  const [supabaseSheetOpen, setSupabaseSheetOpen] = useState<boolean>(false);
  const [cardOpen, setCardOpen] = useState<boolean>(false);
  const [activeCardKey, setActiveCardKey] = useState<string | null>(null);

  // Supabase Connection state
  const [supabaseUrl, setSupabaseUrl] = useState<string>(() => {
    return localStorage.getItem("smbo_supabase_url") || "";
  });
  const [supabaseKey, setSupabaseKey] = useState<string>(() => {
    return localStorage.getItem("smbo_supabase_key") || "";
  });
  const [supabaseTable, setSupabaseTable] = useState<string>(() => {
    return localStorage.getItem("smbo_supabase_table") || "smbo_metrics";
  });
  const [showKey, setShowKey] = useState<boolean>(false);
  const [isLiveFromSupabase, setIsLiveFromSupabase] = useState<boolean>(false);
  const [supabaseLoading, setSupabaseLoading] = useState<boolean>(false);
  const [supabaseStatusMsg, setSupabaseStatusMsg] = useState<{
    type: "info" | "success" | "error";
    text: string;
  } | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const lastFocusRef = useRef<HTMLElement | null>(null);
  const flyContainerRef = useRef<HTMLDivElement>(null);
  const cardTitleRef = useRef<HTMLHeadingElement>(null);
  const sheetTitleRef = useRef<HTMLHeadingElement>(null);
  const supabaseTitleRef = useRef<HTMLHeadingElement>(null);

  // Derived calculation
  const c = useMemo(() => calculateEngine(state), [state]);

  // Sync body classes
  useEffect(() => {
    if (cardOpen) {
      document.body.classList.add("card-open");
    } else {
      document.body.classList.remove("card-open");
    }
  }, [cardOpen]);

  useEffect(() => {
    if (sheetOpen || supabaseSheetOpen) {
      document.body.classList.add("locked");
    } else {
      document.body.classList.remove("locked");
    }
  }, [sheetOpen, supabaseSheetOpen]);

  // ESC handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (supabaseSheetOpen) {
          closeSupabaseSheet();
        } else if (sheetOpen) {
          closeSheet();
        } else if (cardOpen) {
          closeCard();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sheetOpen, supabaseSheetOpen, cardOpen]);

  const clearPlay = useCallback(() => {
    setBadgeAmounts({});
    setHitNodes({});
    setSummary("");
  }, []);

  const openCard = useCallback((key: string) => {
    setActiveCardKey(key);
    setCardOpen(true);
    setTimeout(() => {
      cardTitleRef.current?.focus({ preventScroll: true });
    }, 0);
  }, []);

  const closeCard = useCallback(() => {
    setCardOpen(false);
    setActiveCardKey(null);
    setSelNode(null);
    if (lastFocusRef.current && document.contains(lastFocusRef.current)) {
      lastFocusRef.current.focus();
    }
  }, []);

  const openSheet = useCallback(() => {
    lastFocusRef.current = document.activeElement as HTMLElement;
    setSheetOpen(true);
    setTimeout(() => {
      sheetTitleRef.current?.focus({ preventScroll: true });
    }, 0);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    if (lastFocusRef.current && document.contains(lastFocusRef.current)) {
      lastFocusRef.current.focus();
    }
  }, []);

  const openSupabaseSheet = useCallback(() => {
    lastFocusRef.current = document.activeElement as HTMLElement;
    setSupabaseSheetOpen(true);
    setTimeout(() => {
      supabaseTitleRef.current?.focus({ preventScroll: true });
    }, 0);
  }, []);

  const closeSupabaseSheet = useCallback(() => {
    setSupabaseSheetOpen(false);
    if (lastFocusRef.current && document.contains(lastFocusRef.current)) {
      lastFocusRef.current.focus();
    }
  }, []);

  // Fetch live metrics from Supabase
  const handleFetchFromSupabase = async (overrideUrl?: string, overrideKey?: string, overrideTable?: string) => {
    const targetUrl = (overrideUrl !== undefined ? overrideUrl : supabaseUrl).trim();
    const targetKey = (overrideKey !== undefined ? overrideKey : supabaseKey).trim();
    const targetTable = (overrideTable !== undefined ? overrideTable : supabaseTable).trim() || "smbo_metrics";

    if (!targetUrl || !targetKey) {
      setSupabaseStatusMsg({
        type: "error",
        text: "Please provide both Supabase Project URL and Anon/Public Key.",
      });
      return;
    }

    setSupabaseLoading(true);
    setSupabaseStatusMsg({ type: "info", text: "Connecting to Supabase and querying metrics..." });

    const result = await fetchLiveMetrics(targetUrl, targetKey, targetTable);
    setSupabaseLoading(false);

    if (result.error) {
      setSupabaseStatusMsg({
        type: "error",
        text: result.error,
      });
      return;
    }

    if (result.data && Object.keys(result.data).length > 0) {
      // Store in state
      setState((prev) => ({
        ...prev,
        ...result.data,
      }));
      setIsLiveFromSupabase(true);
      const timeStr = new Date().toLocaleTimeString();
      setLastSyncTime(timeStr);

      // Persist in localStorage
      localStorage.setItem("smbo_supabase_url", targetUrl);
      localStorage.setItem("smbo_supabase_key", targetKey);
      localStorage.setItem("smbo_supabase_table", targetTable);

      setSupabaseStatusMsg({
        type: "success",
        text: `Successfully synced live data from table "${targetTable}" at ${timeStr}. The engine is now running on Supabase numbers.`,
      });
      clearPlay();
    } else {
      setSupabaseStatusMsg({
        type: "error",
        text: `Connected to "${targetTable}", but no valid engine metrics fields were recognized.`,
      });
    }
  };

  const handleLoadDemoPayload = () => {
    const demoPayload: EngineState = {
      affiliates: 120,
      active: 65,
      sales: 3.5,
      avgSale: 45000,
      pool: 6,
      cohortOn: true,
      gift: 350000,
    };
    setState(demoPayload);
    setIsLiveFromSupabase(true);
    setLastSyncTime(new Date().toLocaleTimeString() + " (Demo)");
    setSupabaseStatusMsg({
      type: "success",
      text: "Loaded demo cooperative data payload (120 affiliates, ₦45,000 avg sale, 6% pool). All views updated.",
    });
    clearPlay();
  };

  const handleDisconnectSupabase = () => {
    setIsLiveFromSupabase(false);
    setLastSyncTime(null);
    setState(INITIAL_STATE);
    setSupabaseStatusMsg({
      type: "info",
      text: "Disconnected. Reverted engine numbers to default cooperative assumptions.",
    });
    clearPlay();
  };

  // Card details generation
  const cardData = useMemo((): CardContent | null => {
    if (!activeCardKey) return null;
    const pool = c.pool;
    const sh = c.sh;

    if (activeCardKey.startsWith("lane:")) {
      const N = parseInt(activeCardKey.split(":")[1], 10);
      const ls = c.salesM / 30;
      const lp = c.poolM / 30;
      return {
        t: "Lane " + N + ": " + LANES[N - 1],
        s: "One of the 30 lanes of businesses",
        rows: [
          ["Members this lane brings in", "about " + FIXED.perLane],
          ["Lane lead", N === 1 ? "Jotra" : N === 30 ? "Still to be named" : "Open, needs a lead"],
          ["Sales through referrals a month", naira(ls)],
          ["Commission paid out", naira(lp)],
          ["Kept by the businesses", naira(ls - lp)],
        ],
        note: "Sales are shared evenly across the 30 lanes in this picture.",
      };
    }

    if (activeCardKey === "aff") {
      return {
        t: "Affiliates and digital marketers",
        s: "People with a personal code who share business stores",
        rows: [
          ["How many", n0(state.affiliates)],
          ["Who actually sell", n0((state.affiliates * state.active) / 100)],
          ["An active affiliate earns a month", naira((c.perAff * pool * sh.aff) / 100)],
          ["Earned on an average sale", naira(c.one.aff)],
        ],
        note: "An affiliate earns nothing until the seller confirms the payment.",
      };
    }

    if (activeCardKey === "spo") {
      return {
        t: "Sponsors",
        s: "People who manage and groom affiliates",
        rows: [
          ["How many", n0(c.sponsors)],
          ["Affiliates each looks after", String(FIXED.sponsorGroup)],
          ["Each earns a month", naira((c.poolM * sh.spo) / 100 / c.sponsors)],
        ],
        note: "Sponsors earn only from confirmed sales, never for signing people up.",
      };
    }

    if (activeCardKey === "stk") {
      return {
        t: "Stakeholder sponsors",
        s: STAKEHOLDERS.join(", "),
        rows: [
          ["How many", "3"],
          ["Each earns a month", naira((c.poolM * sh.stk) / 100 / 3)],
          ["All three in 12 months", naira(((c.poolM * sh.stk) / 100) * 12)],
        ],
        note: "They train and supervise the sponsors and affiliates.",
      };
    }

    if (activeCardKey === "net") {
      return {
        t: "The SMBO network",
        s: "Holds the whole system together",
        rows: [
          ["Share of each commission pool", sh.net + "%"],
          ["Earns a month", naira((c.poolM * sh.net) / 100)],
          ["In 12 months", naira(((c.poolM * sh.net) / 100) * 12)],
        ],
        note: "Entry fees and members' savings are separate from this commission income.",
      };
    }

    if (activeCardKey === "cp") {
      const pct = state.gift ? ((c.cpMonth * 12) / state.gift) * 100 : 0;
      const need = (pool * sh.cp) / 100 ? state.gift / ((pool * sh.cp) / 100) : 0;
      return {
        t: "Cohort Partners",
        s: "Fund the launch of a cohort of affiliates and work hand in hand with the network",
        rows: [
          ["Launch money", naira(state.gift)],
          ["Affiliates launched", n0(c.launched)],
          ["Earned a month from that cohort", c.sh.cp ? naira(c.cpMonth) : "share switched off"],
          ["Comes back in 12 months", c.sh.cp ? pct.toFixed(1) + "%" : "not applicable", "warn"],
          ["Cohort sales needed to recover it all", need ? naira(need) : "not possible"],
        ],
        note: "On commission alone the return is small. This suits someone who also values the impact. It is not a promise of repayment.",
      };
    }

    const arms: Record<string, { t: string; s: string; n: number; w: string }> = {
      pos: {
        t: "POS and cash agents",
        s: "Settlement & Cash Partners",
        n: FIXED.pos,
        w: "Move money into the cooperative and out to businesses, so people who deal in cash can take part.",
      },
      log: {
        t: "Logistics businesses",
        s: "Logistics Partners",
        n: FIXED.logi,
        w: "Take orders and deliver them. A sale is finished when the customer gets the item.",
      },
      eq: {
        t: "Equipment and repair businesses",
        s: "Digital Technology Tools & Equipment Partners",
        n: FIXED.equip,
        w: "Keep gadgets, printers and repairs available. HiTech leads this arm.",
      },
    };

    if (arms[activeCardKey]) {
      const a = arms[activeCardKey];
      return {
        t: a.t,
        s: a.s,
        rows: [
          ["How many", n0(a.n)],
          ["What they do", a.w],
        ],
        note: "Their earnings are not counted in this picture yet.",
      };
    }

    return null;
  }, [activeCardKey, c, state]);

  // Center coordinate helper
  const center = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const fly = (fromEl: HTMLElement, toEl: HTMLElement, text: string, ms: number) => {
    return new Promise<void>((resolve) => {
      if (!flyContainerRef.current) {
        resolve();
        return;
      }
      const a = center(fromEl);
      const b = center(toEl);
      const d = document.createElement("div");
      d.className = "dot";
      d.textContent = text;
      d.style.left = a.x + "px";
      d.style.top = a.y + "px";
      flyContainerRef.current.appendChild(d);

      const anim = d.animate(
        [
          { transform: "translate(-50%,-50%) scale(0.8)", opacity: 0 },
          { transform: "translate(-50%,-50%) scale(1)", opacity: 1, offset: 0.15 },
          {
            transform:
              "translate(calc(-50% + " +
              (b.x - a.x) +
              "px), calc(-50% + " +
              (b.y - a.y) +
              "px)) scale(1)",
            opacity: 1,
          },
        ],
        { duration: ms, easing: "ease-in-out", fill: "forwards" }
      );

      anim.onfinish = () => {
        d.remove();
        resolve();
      };
    });
  };

  const summaryText = useCallback(
    (calcResult: typeof c) => {
      return (
        "The customer pays " +
        naira(state.avgSale) +
        ", the same price as always. The business keeps " +
        naira(state.avgSale - calcResult.onePool) +
        ". The commission pool is " +
        naira(calcResult.onePool) +
        ": affiliate " +
        naira(calcResult.one.aff) +
        ", sponsor " +
        naira(calcResult.one.spo) +
        ", stakeholder sponsor " +
        naira(calcResult.one.stk) +
        ", network " +
        naira(calcResult.one.net) +
        (calcResult.sh.cp ? ", Cohort Partner " + naira(calcResult.one.cp) : "") +
        "."
      );
    },
    [state.avgSale]
  );

  const showBadge = (key: string, amount: number) => {
    setBadgeAmounts((prev) => ({ ...prev, [key]: amount }));
    setHitNodes((prev) => ({ ...prev, [key]: true }));
  };

  const handlePlay = async () => {
    if (playing) return;
    setPlaying(true);
    clearPlay();

    const targets: [string, number][] = [
      ["aff", c.one.aff],
      ["spo", c.one.spo],
      ["stk", c.one.stk],
      ["net", c.one.net],
    ];
    if (c.sh.cp) {
      targets.push(["cp", c.one.cp]);
    }

    const finish = () => {
      setSummary(summaryText(c));
      setPlayBtnText("Play again");
      setPlaying(false);
    };

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      targets.forEach((t) => showBadge(t[0], t[1]));
      finish();
      return;
    }

    const laneEl = document.getElementById("lane" + selLane);
    const affEl = document.querySelector('[data-key="aff"]') as HTMLElement;

    if (!laneEl || !affEl) {
      targets.forEach((t) => showBadge(t[0], t[1]));
      finish();
      return;
    }

    laneEl.scrollIntoView({ block: "center", behavior: "smooth" });

    try {
      await wait(650);
      await fly(laneEl, affEl, naira(state.avgSale) + " paid", 1100);
      await Promise.all(
        targets.map(async (t, i) => {
          const el = document.querySelector('[data-key="' + t[0] + '"]') as HTMLElement;
          if (t[0] === "aff") {
            showBadge("aff", t[1]);
            return;
          }
          await wait(i * 120);
          if (el) {
            await fly(affEl, el, naira(t[1]), 900);
            showBadge(t[0], t[1]);
          }
        })
      );
      finish();
    } catch {
      finish();
    }
  };

  const handleLaneClick = (laneNum: number, e: React.MouseEvent<HTMLButtonElement>) => {
    setSelLane(laneNum);
    lastFocusRef.current = e.currentTarget;
    setSelNode(null);
    openCard("lane:" + laneNum);
  };

  const handleNodeClick = (key: string, e: React.MouseEvent<HTMLButtonElement>) => {
    lastFocusRef.current = e.currentTarget;
    setSelNode(key);
    openCard(key);
  };

  const handleSliderChange = (key: keyof EngineState, value: number) => {
    setState((prev) => ({ ...prev, [key]: value }));
    if (!playing) clearPlay();
  };

  const handleCheckboxChange = (checked: boolean) => {
    setState((prev) => ({ ...prev, cohortOn: checked }));
    if (!playing) clearPlay();
  };

  return (
    <>
      <div className="wrap">
        <header className="top">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", flexWrap: "wrap" }}>
            <h1>The SMBO engine</h1>
            <button
              type="button"
              onClick={openSupabaseSheet}
              className={`status-badge ${isLiveFromSupabase ? "status-live" : "status-mock"}`}
              style={{ cursor: "pointer", border: "1.5px solid var(--line)", marginTop: "4px" }}
              title="Click to configure Supabase URL and keys"
            >
              <span className={isLiveFromSupabase ? "dot-live" : "dot-mock"}></span>
              <span>{isLiveFromSupabase ? "Live Supabase" : "Offline Model"}</span>
            </button>
          </div>
          <p className="lede">
            Businesses on the left feed the engine on the right. Watch one sale move through it.
          </p>
          <div className="actions">
            <button
              className="play"
              type="button"
              id="play"
              disabled={playing}
              onClick={handlePlay}
            >
              {playBtnText}
            </button>
            <button
              className="ghost"
              type="button"
              id="openSheet"
              onClick={openSheet}
            >
              Change the numbers
            </button>
            <button
              className="ghost"
              type="button"
              id="openSupabase"
              onClick={openSupabaseSheet}
            >
              Supabase URL & keys
            </button>
          </div>
          <p className="summary" id="summary" aria-live="polite">
            {summary}
          </p>
        </header>

        <div className="cols">
          <section aria-label="The 30 lanes of businesses">
            <h2>30 lanes</h2>
            <p className="cap">
              Each lane brings in about 10 members. Tap one to choose it for the sale.
            </p>
            <ol className="lanes" id="lanes">
              {LANES.map((name, idx) => {
                const i = idx + 1;
                const isLead = i === 1;
                const isSelected = i === selLane;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      className={`lane${isLead ? " lead" : ""}${isSelected ? " on" : ""}`}
                      data-lane={i}
                      id={`lane${i}`}
                      onClick={(e) => handleLaneClick(i, e)}
                    >
                      <span className="n">{i}</span>
                      <span className="t">{name}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="right" aria-label="The engine">
            <span className="inflow" id="inflow">
              {compact(c.salesM)} of sales a month flow in
            </span>

            {/* Row Top: SMBO network and Cohort Partners */}
            <div className="row2" id="rowTop">
              <button
                type="button"
                className={`node${hitNodes["net"] ? " hit" : ""}${selNode === "net" ? " on" : ""}`}
                data-key="net"
                style={{ "--k": "var(--c-net)" } as React.CSSProperties}
                onClick={(e) => handleNodeClick("net", e)}
              >
                <i
                  className={`badge${badgeAmounts["net"] != null ? " show" : ""}`}
                  id="b_net"
                >
                  {badgeAmounts["net"] != null ? `+${naira(badgeAmounts["net"]!)}` : ""}
                </i>
                <strong>SMBO network</strong>
                <span>{naira((c.poolM * c.sh.net) / 100)} a month</span>
              </button>

              <button
                type="button"
                className={`node${hitNodes["cp"] ? " hit" : ""}${selNode === "cp" ? " on" : ""}`}
                data-key="cp"
                style={{ "--k": "var(--c-cp)" } as React.CSSProperties}
                onClick={(e) => handleNodeClick("cp", e)}
              >
                <i
                  className={`badge${badgeAmounts["cp"] != null ? " show" : ""}`}
                  id="b_cp"
                >
                  {badgeAmounts["cp"] != null ? `+${naira(badgeAmounts["cp"]!)}` : ""}
                </i>
                <strong>{FIXED.cohorts} Cohort Partners</strong>
                <span>
                  {c.sh.cp ? `${naira(c.cpMonth)} a month from one cohort` : "share switched off"}
                </span>
              </button>
            </div>

            <div className="conn"></div>

            {/* Stakeholders */}
            <div id="stk">
              <button
                type="button"
                className={`node${hitNodes["stk"] ? " hit" : ""}${selNode === "stk" ? " on" : ""}`}
                data-key="stk"
                style={{ "--k": "var(--c-stk)" } as React.CSSProperties}
                onClick={(e) => handleNodeClick("stk", e)}
              >
                <i
                  className={`badge${badgeAmounts["stk"] != null ? " show" : ""}`}
                  id="b_stk"
                >
                  {badgeAmounts["stk"] != null ? `+${naira(badgeAmounts["stk"]!)}` : ""}
                </i>
                <strong>3 stakeholder sponsors</strong>
                <span>{naira((c.poolM * c.sh.stk) / 100)} a month together</span>
              </button>
            </div>

            <div className="conn"></div>

            {/* Sponsors */}
            <div id="spo">
              <button
                type="button"
                className={`node${hitNodes["spo"] ? " hit" : ""}${selNode === "spo" ? " on" : ""}`}
                data-key="spo"
                style={{ "--k": "var(--c-spo)" } as React.CSSProperties}
                onClick={(e) => handleNodeClick("spo", e)}
              >
                <i
                  className={`badge${badgeAmounts["spo"] != null ? " show" : ""}`}
                  id="b_spo"
                >
                  {badgeAmounts["spo"] != null ? `+${naira(badgeAmounts["spo"]!)}` : ""}
                </i>
                <strong>{n0(c.sponsors)} sponsors</strong>
                <span>{naira((c.poolM * c.sh.spo) / 100)} a month together</span>
              </button>
            </div>

            <div className="conn"></div>

            {/* Arms: Affiliates & Small Arms (POS, Log, Eq) */}
            <div className="arms" id="arms">
              <button
                type="button"
                className={`node aff${hitNodes["aff"] ? " hit" : ""}${selNode === "aff" ? " on" : ""}`}
                data-key="aff"
                style={{ "--k": "var(--c-aff)" } as React.CSSProperties}
                onClick={(e) => handleNodeClick("aff", e)}
              >
                <i
                  className={`badge${badgeAmounts["aff"] != null ? " show" : ""}`}
                  id="b_aff"
                >
                  {badgeAmounts["aff"] != null ? `+${naira(badgeAmounts["aff"]!)}` : ""}
                </i>
                <strong>{n0(state.affiliates)}</strong>
                <span>
                  Affiliates and digital marketers earn {naira((c.poolM * c.sh.aff) / 100)} a month
                  together
                </span>
              </button>

              <div className="small">
                <button
                  type="button"
                  className={`node${hitNodes["pos"] ? " hit" : ""}${selNode === "pos" ? " on" : ""}`}
                  data-key="pos"
                  style={{ "--k": "var(--c-arm)" } as React.CSSProperties}
                  onClick={(e) => handleNodeClick("pos", e)}
                >
                  <i className="badge" id="b_pos"></i>
                  <strong>{n0(FIXED.pos)}</strong>
                  <span>POS agents</span>
                </button>

                <button
                  type="button"
                  className={`node${hitNodes["log"] ? " hit" : ""}${selNode === "log" ? " on" : ""}`}
                  data-key="log"
                  style={{ "--k": "var(--c-arm)" } as React.CSSProperties}
                  onClick={(e) => handleNodeClick("log", e)}
                >
                  <i className="badge" id="b_log"></i>
                  <strong>{n0(FIXED.logi)}</strong>
                  <span>Logistics</span>
                </button>

                <button
                  type="button"
                  className={`node${hitNodes["eq"] ? " hit" : ""}${selNode === "eq" ? " on" : ""}`}
                  data-key="eq"
                  style={{ "--k": "var(--c-arm)" } as React.CSSProperties}
                  onClick={(e) => handleNodeClick("eq", e)}
                >
                  <i className="badge" id="b_eq"></i>
                  <strong>{n0(FIXED.equip)}</strong>
                  <span>Equipment</span>
                </button>
              </div>
            </div>
          </section>
        </div>

        <footer>
          <p>
            An illustration with numbers you can change, not a promise of returns. Commission is paid
            only after the seller confirms the payment, and nobody earns for recruiting alone. Rates
            and rules depend on the SMBO bye-laws and the cooperative registrar.
          </p>
        </footer>
      </div>

      <div id="fly" ref={flyContainerRef} aria-hidden="true"></div>

      {/* Reading Card modal/drawer */}
      <aside
        className="card"
        id="card"
        hidden={!cardOpen}
        aria-label="Details"
      >
        <div className="in">
          <div className="ph">
            <div>
              <h3 id="cTitle" ref={cardTitleRef} tabIndex={-1}>
                {cardData?.t || ""}
              </h3>
              <p id="cSub">{cardData?.s || ""}</p>
            </div>
            <button className="close" type="button" id="cClose" onClick={closeCard}>
              Close
            </button>
          </div>
          <ul className="rows" id="cRows">
            {cardData?.rows.map((row, i) => (
              <li key={i} className={row[2] || ""}>
                <span>{row[0]}</span>
                <span>{row[1]}</span>
              </li>
            ))}
          </ul>
          <p className="fine" id="cNote">
            {cardData?.note || ""}
          </p>
        </div>
      </aside>

      {/* Scrim for sheets */}
      <div
        className="scrim"
        id="scrim"
        hidden={!sheetOpen && !supabaseSheetOpen}
        onClick={() => {
          if (supabaseSheetOpen) closeSupabaseSheet();
          if (sheetOpen) closeSheet();
        }}
      ></div>

      {/* Settings / Numbers Sheet */}
      <section
        className="sheet"
        id="sheet"
        hidden={!sheetOpen}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheetTitle"
      >
        <div className="in">
          <div className="ph">
            <div>
              <h3 id="sheetTitle" ref={sheetTitleRef} tabIndex={-1}>
                Change the numbers
              </h3>
              <p style={{ margin: "2px 0 0", color: "var(--muted)", fontSize: "0.85rem" }}>
                Adjust assumptions manually or sync live values from Supabase.
              </p>
            </div>
            <button className="close" type="button" id="sheetClose" onClick={closeSheet}>
              Done
            </button>
          </div>

          <div id="sheetBody">
            <div style={{ marginTop: "14px", padding: "10px 12px", background: "var(--tint)", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <div>
                <span style={{ fontSize: "0.85rem", fontWeight: 600, display: "block" }}>
                  Data source: {isLiveFromSupabase ? "Supabase Live Database" : "Offline Assumptions"}
                </span>
                <span style={{ fontSize: "0.76rem", color: "var(--muted)" }}>
                  {lastSyncTime ? `Last synced: ${lastSyncTime}` : "Using default Delta SMBO MPCS model numbers"}
                </span>
              </div>
              <button
                type="button"
                className="btn-ghost"
                style={{ padding: "4px 14px", minHeight: "36px", fontSize: "0.82rem" }}
                onClick={() => {
                  closeSheet();
                  openSupabaseSheet();
                }}
              >
                Configure Supabase
              </button>
            </div>

            {(Object.keys(SLIDERS) as (keyof typeof SLIDERS)[]).map((k) => {
              const item = SLIDERS[k];
              const val = state[k];
              return (
                <div className="ctl" key={k}>
                  <div className="head">
                    <label htmlFor={`s_${k}`}>{item.label}</label>
                    <output id={`o_${k}`}>{fmt(item.f, val)}</output>
                  </div>
                  <input
                    type="range"
                    id={`s_${k}`}
                    data-key={k}
                    min={item.min}
                    max={item.max}
                    step={item.step}
                    value={val}
                    onChange={(e) => handleSliderChange(k, parseFloat(e.target.value) || 0)}
                  />
                </div>
              );
            })}
            <div className="tick">
              <input
                type="checkbox"
                id="s_cohortOn"
                data-key="cohortOn"
                checked={state.cohortOn}
                onChange={(e) => handleCheckboxChange(e.target.checked)}
              />
              <label htmlFor="s_cohortOn">
                A Cohort Partner funded the cohort (takes 5% of the pool, the network keeps 5%)
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* Supabase URL & Keys Sheet / Card */}
      <section
        className="sheet"
        id="supabaseSheet"
        hidden={!supabaseSheetOpen}
        role="dialog"
        aria-modal="true"
        aria-labelledby="supabaseTitle"
      >
        <div className="in">
          <div className="ph">
            <div>
              <h3 id="supabaseTitle" ref={supabaseTitleRef} tabIndex={-1}>
                Supabase URL & keys
              </h3>
              <p style={{ margin: "2px 0 0", color: "var(--muted)", fontSize: "0.85rem" }}>
                Connect the Delta SDG SMBO MPCS database to stream live cooperative metrics.
              </p>
            </div>
            <button className="close" type="button" id="supabaseClose" onClick={closeSupabaseSheet}>
              Done
            </button>
          </div>

          <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
            {/* Status indicator message */}
            {supabaseStatusMsg && (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  fontSize: "0.85rem",
                  lineHeight: 1.35,
                  background:
                    supabaseStatusMsg.type === "success"
                      ? "#e6f7ef"
                      : supabaseStatusMsg.type === "error"
                      ? "#fde8e8"
                      : "var(--tint)",
                  color:
                    supabaseStatusMsg.type === "success"
                      ? "#0e4f45"
                      : supabaseStatusMsg.type === "error"
                      ? "#9b1c1c"
                      : "var(--ink)",
                  border: `1.5px solid ${
                    supabaseStatusMsg.type === "success"
                      ? "#a3dcbe"
                      : supabaseStatusMsg.type === "error"
                      ? "#f8b4b4"
                      : "var(--line)"
                  }`,
                }}
              >
                {supabaseStatusMsg.text}
              </div>
            )}

            {/* Supabase URL */}
            <div>
              <label className="field-label" htmlFor="supabaseUrl">
                Supabase Project URL
              </label>
              <input
                id="supabaseUrl"
                type="text"
                className="input-text"
                placeholder="https://xyzcompany.supabase.co"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                autoComplete="off"
                spellCheck="false"
              />
              <p className="field-desc">
                Found in your Supabase Dashboard under <strong>Project Settings &gt; API &gt; Project URL</strong>.
              </p>
            </div>

            {/* Supabase Anon / Public Key */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label className="field-label" htmlFor="supabaseKey">
                  Supabase Anon / Public Key
                </label>
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--muted)",
                    fontSize: "0.78rem",
                    cursor: "pointer",
                    padding: "2px 4px",
                  }}
                >
                  {showKey ? "Hide key" : "Show key"}
                </button>
              </div>
              <input
                id="supabaseKey"
                type={showKey ? "text" : "password"}
                className="input-text"
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={supabaseKey}
                onChange={(e) => setSupabaseKey(e.target.value)}
                autoComplete="off"
                spellCheck="false"
              />
              <p className="field-desc">
                The public <code>anon</code> / <code>public</code> API key from your Supabase API settings. Safe for client apps.
              </p>
            </div>

            {/* Table Name */}
            <div>
              <label className="field-label" htmlFor="supabaseTable">
                Metrics Table / View Name
              </label>
              <input
                id="supabaseTable"
                type="text"
                className="input-text"
                placeholder="smbo_metrics"
                value={supabaseTable}
                onChange={(e) => setSupabaseTable(e.target.value)}
              />
              <p className="field-desc">
                Defaults to <code>smbo_metrics</code>. Supports columns: <code>affiliates</code>, <code>active</code>, <code>sales</code>, <code>avg_sale</code>, <code>pool</code>, <code>gift</code>, <code>cohort_on</code>.
              </p>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "6px" }}>
              <button
                type="button"
                className="btn-solid"
                style={{ flex: "1 1 180px" }}
                disabled={supabaseLoading}
                onClick={() => handleFetchFromSupabase()}
              >
                {supabaseLoading ? "Connecting..." : "Connect & Fetch Live Data"}
              </button>

              <button
                type="button"
                className="btn-ghost"
                onClick={handleLoadDemoPayload}
                title="Populate engine with realistic Delta live numbers for demonstration"
              >
                Load Demo Payload
              </button>

              {isLiveFromSupabase && (
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ color: "#9b1c1c", borderColor: "#f8b4b4" }}
                  onClick={handleDisconnectSupabase}
                >
                  Disconnect
                </button>
              )}
            </div>

            {/* Schema reference hint */}
            <div
              style={{
                marginTop: "10px",
                padding: "10px 12px",
                background: "var(--surface)",
                border: "1px dashed var(--line)",
                borderRadius: "8px",
                fontSize: "0.8rem",
                color: "var(--muted)",
              }}
            >
              <strong style={{ color: "var(--ink)", display: "block", marginBottom: "4px" }}>
                Expected Supabase Table Schema:
              </strong>
              <code>
                CREATE TABLE smbo_metrics (<br />
                &nbsp;&nbsp;id SERIAL PRIMARY KEY,<br />
                &nbsp;&nbsp;affiliates INT DEFAULT 90,<br />
                &nbsp;&nbsp;active INT DEFAULT 50,<br />
                &nbsp;&nbsp;sales NUMERIC DEFAULT 2,<br />
                &nbsp;&nbsp;avg_sale NUMERIC DEFAULT 30000,<br />
                &nbsp;&nbsp;pool NUMERIC DEFAULT 5,<br />
                &nbsp;&nbsp;gift NUMERIC DEFAULT 200000,<br />
                &nbsp;&nbsp;cohort_on BOOLEAN DEFAULT true,<br />
                &nbsp;&nbsp;created_at TIMESTAMP DEFAULT now()<br />
                );
              </code>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
