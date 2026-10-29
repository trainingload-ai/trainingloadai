"use client";

import { useEffect } from "react";
import {
  allenCogganCategoryForWkg,
  estimateFieldFtp,
  ftpWattsPerKg,
  ftpWkgBand,
  parseFtpFieldQuery,
  type FtpFieldProtocol,
} from "@/lib/ftp-field";

const SNAP_MS = 700;

function readMatch() {
  const query = parseFtpFieldQuery(window.location.search);
  const power = query.power == null ? null : Number(query.power);
  const weight = query.weight == null ? null : Number(query.weight);
  if (power == null || weight == null) return null;
  const protocol = (query.protocol ?? "20MIN") as FtpFieldProtocol;
  const ftp = estimateFieldFtp(power, protocol);
  if (ftp == null) return null;
  const wkg = ftpWattsPerKg(ftp, weight);
  if (wkg == null) return null;
  return {
    band: ftpWkgBand(wkg),
    men: allenCogganCategoryForWkg(wkg, "men"),
    women: allenCogganCategoryForWkg(wkg, "women"),
  };
}

function paint(match: ReturnType<typeof readMatch>) {
  document.querySelectorAll("[data-band], [data-category]").forEach((row) => {
    row.classList.remove("isMatch", "isSnap");
    row.removeAttribute("aria-current");
  });
  document.querySelectorAll("[data-sex]").forEach((cell) => {
    cell.classList.remove("isMatchCell");
  });
  if (!match) return;

  const bandRow = document.querySelector(`[data-band="${match.band}"]`);
  bandRow?.classList.add("isMatch");
  bandRow?.setAttribute("aria-current", "true");

  const ids = new Set([match.men, match.women].filter((id) => id !== null));
  for (const id of ids) {
    const row = document.querySelector(`[data-category="${id}"]`);
    row?.classList.add("isMatch");
    row?.setAttribute("aria-current", "true");
  }
  if (match.men) {
    document
      .querySelector(`[data-category="${match.men}"] [data-sex="men"]`)
      ?.classList.add("isMatchCell");
  }
  if (match.women) {
    document
      .querySelector(`[data-category="${match.women}"] [data-sex="women"]`)
      ?.classList.add("isMatchCell");
  }
}

const lastSnapAt = new Map<string, number>();

function snapVisible(sectionId: string) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  const now = Date.now();
  if (now - (lastSnapAt.get(sectionId) ?? 0) < 1200) return;
  const rows = section.querySelectorAll(".isMatch");
  if (rows.length === 0) return;
  lastSnapAt.set(sectionId, now);
  rows.forEach((row) => {
    row.classList.remove("isSnap");
    void (row as HTMLElement).offsetWidth;
    row.classList.add("isSnap");
    window.setTimeout(() => row.classList.remove("isSnap"), SNAP_MS);
  });
}

function sectionIsInView(id: string) {
  const section = document.getElementById(id);
  if (!section) return false;
  const rect = section.getBoundingClientRect();
  return rect.top < window.innerHeight * 0.72 && rect.bottom > 120;
}

export function FtpTableHighlight() {
  useEffect(() => {
    const apply = (snapInView: boolean) => {
      paint(readMatch());
      if (!snapInView) return;
      for (const id of ["levels", "categories"]) {
        if (sectionIsInView(id)) snapVisible(id);
      }
    };
    apply(false);
    const onUpdate = () => apply(true);
    window.addEventListener("ftp-field-updated", onUpdate);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const top = entry.boundingClientRect.top;
          const bottom = entry.boundingClientRect.bottom;
          if (top < window.innerHeight * 0.62 && bottom > 96) {
            snapVisible(entry.target.id);
          }
        }
      },
      { threshold: [0, 0.15, 0.4] },
    );
    for (const id of ["levels", "categories"]) {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    }

    return () => {
      window.removeEventListener("ftp-field-updated", onUpdate);
      observer.disconnect();
    };
  }, []);

  return null;
}
