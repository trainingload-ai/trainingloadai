"use client";

import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

type DeckCard = {
  id: string;
  label: string;
  className: string;
  content: ReactNode;
  actions?: ReactNode;
  onOpen: () => void;
};

export function HomeSuggestionDeck({
  cards,
  switchLabel,
  disabled = false,
  onFrontChange,
}: {
  cards: DeckCard[];
  switchLabel: string;
  disabled?: boolean;
  onFrontChange?: (id: string | null) => void;
}) {
  const [frontId, setFrontId] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const locked = useRef(false);
  const suppressClick = useRef(false);
  const focusFront = useRef(false);
  const deck = useRef<HTMLDivElement>(null);
  const animation = useRef<ReturnType<typeof animate> | null>(null);
  const generation = useRef(0);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-400, 0, 400], [-10, 0, 10]);
  const reduceMotion = useReducedMotion();
  const frontIndex = Math.max(
    0,
    cards.findIndex((card) => card.id === frontId),
  );
  const activeId = cards[frontIndex]?.id;
  const ordered = [...cards.slice(frontIndex), ...cards.slice(0, frontIndex)];
  const ids = cards.map((card) => card.id).join("|");

  useEffect(() => {
    onFrontChange?.(activeId ?? null);
  }, [activeId, onFrontChange]);

  useLayoutEffect(() => {
    generation.current += 1;
    animation.current?.stop();
    x.set(0);
    locked.current = false;
    setSwitching(false);
    if (focusFront.current) {
      deck.current
        ?.querySelector<HTMLButtonElement>('[data-front="true"]')
        ?.focus({ preventScroll: true });
      focusFront.current = false;
    }
    return () => {
      generation.current += 1;
      animation.current?.stop();
    };
  }, [activeId, ids, disabled, reduceMotion, x]);

  const select = (id: string, direction = -1) => {
    if (disabled || locked.current || id === activeId) return;
    if (reduceMotion) {
      setFrontId(id);
      return;
    }
    locked.current = true;
    setSwitching(true);
    const revision = generation.current;
    const width = deck.current?.getBoundingClientRect().width ?? 320;
    animation.current = animate(x, direction * (width + 32), {
      duration: 0.22,
      ease: "easeIn",
    });
    void animation.current.then(() => {
      if (generation.current === revision) setFrontId(id);
    });
  };
  const step = (direction: number) => {
    const next = cards[(frontIndex + direction + cards.length) % cards.length];
    if (next) select(next.id, -direction);
  };
  const snapBack = () => {
    animation.current?.stop();
    animation.current = animate(x, 0, {
      type: "spring",
      stiffness: 300,
      damping: 30,
    });
  };

  return (
    <div ref={deck} className="min-w-0">
      <div
        className="relative isolate mx-0.5 grid"
        style={{ paddingBottom: (cards.length - 1) * 6 }}
      >
        {ordered.map((card, index) => {
          const isFront = index === 0;
          return (
            <motion.div
              key={card.id}
              data-deck-card={card.id}
              aria-hidden={!isFront || undefined}
              className={cn(
                "min-h-[150px] min-w-0 overflow-hidden rounded-surface p-3 text-left text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                card.className,
              )}
              style={{
                gridArea: "1 / 1",
                zIndex: cards.length - index,
                x: isFront ? x : 0,
                rotate: isFront ? rotate : index,
                touchAction: "pan-y",
              }}
              animate={{ y: index * 6, scale: 1 - index * 0.02 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 300, damping: 30 }
              }
              drag={
                isFront && cards.length > 1 && !disabled && !switching
                  ? "x"
                  : false
              }
              dragMomentum={false}
              onPointerDown={() => {
                suppressClick.current = false;
              }}
              onDragStart={() => {
                suppressClick.current = true;
              }}
              onDragEnd={(_, info) => {
                const width =
                  deck.current?.getBoundingClientRect().width ?? 320;
                if (
                  Math.abs(info.offset.x) > width * 0.24 ||
                  Math.abs(info.velocity.x) > 500
                ) {
                  step(info.offset.x < 0 ? 1 : -1);
                } else snapBack();
              }}
              onPointerCancel={() => {
                if (!locked.current) snapBack();
              }}
            >
              <button
                type="button"
                data-front={isFront}
                aria-label={card.label}
                tabIndex={isFront ? 0 : -1}
                disabled={disabled || switching}
                className={cn(
                  "flex w-full flex-col text-left focus-visible:outline-none",
                  card.actions && isFront ? "min-h-[82px]" : "min-h-[126px]",
                )}
                onClick={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false;
                    return;
                  }
                  if (isFront) card.onOpen();
                  else select(card.id);
                }}
                onKeyDown={(event) => {
                  if (
                    cards.length < 2 ||
                    !["ArrowLeft", "ArrowRight"].includes(event.key)
                  )
                    return;
                  event.preventDefault();
                  focusFront.current = true;
                  step(event.key === "ArrowRight" ? 1 : -1);
                }}
              >
                <span className="flex flex-1 flex-col justify-between gap-2">
                  {card.content}
                </span>
              </button>
              {isFront && card.actions ? (
                <div className="mt-2 flex min-h-8 flex-wrap items-center gap-1.5">
                  {card.actions}
                </div>
              ) : null}
            </motion.div>
          );
        })}
      </div>
      {cards.length > 1 ? (
        <div
          className="flex h-3 items-center justify-center"
          aria-label={switchLabel}
        >
          {cards.map((card, index) => (
            <button
              key={card.id}
              type="button"
              aria-label={`${switchLabel} · ${index + 1} · ${card.label}`}
              aria-pressed={card.id === activeId}
              disabled={disabled || switching}
              onClick={() => select(card.id)}
              className="flex h-3 w-6 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className={cn(
                  "h-1.5 rounded-full",
                  card.id === activeId
                    ? "w-4 bg-foreground/70"
                    : "w-1.5 bg-foreground/25",
                )}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
