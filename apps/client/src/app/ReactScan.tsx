"use client";
import { JSX, useEffect } from "react";

export function ReactScan(): JSX.Element {
  useEffect(() => {
    let active = true;
    let disable: (() => void) | null = null;

    void import("react-scan")
      .then(({ scan, setOptions }) => {
        if (!active) return;
        scan({
          enabled: true,
        });
        disable = () => {
          setOptions({ enabled: false, showToolbar: false });
        };
      })
      .catch(() => {
        return;
      });

    return () => {
      active = false;
      disable?.();
    };
  }, []);

  return <></>;
}
