import { CSSProperties, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from './ui';
import { TourStep } from '../lib/tour';

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOTLIGHT_PADDING = 6;
const CARD_WIDTH = 336;
const CARD_ESTIMATED_HEIGHT = 210;

/**
 * Lightweight guided tour. Renders above the app (no extra dependency): a
 * spotlight cut-out over the current step's data-tour target, a step card
 * with progress and navigation, and route changes between steps so the tour
 * walks the real pages. Closing — finish or skip — always calls onClose,
 * which is expected to persist "seen" server-side.
 */
export function Tour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<TargetRect | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const step = steps[index];

  // Bring the step's page on screen first, then measure its target.
  useEffect(() => {
    if (step?.route && location.pathname !== step.route) navigate(step.route);
  }, [step, location.pathname, navigate]);

  useEffect(() => {
    if (!step) return;
    if (!step.target) {
      setRect(null);
      return;
    }
    let attempts = 0;
    let timer: number | undefined;
    const measure = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else if (attempts < 20) {
        // The page for this step may still be rendering after navigation.
        attempts += 1;
        timer = window.setTimeout(measure, 100);
      } else {
        setRect(null);
      }
    };
    measure();
    const remeasure = () => measure();
    window.addEventListener('resize', remeasure);
    window.addEventListener('scroll', remeasure, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('scroll', remeasure, true);
    };
  }, [step, location.pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight' && index < steps.length - 1) setIndex(index + 1);
      if (event.key === 'ArrowLeft' && index > 0) setIndex(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, steps.length, onClose]);

  if (!step) return null;
  const last = index === steps.length - 1;

  const cardStyle: CSSProperties = { width: `min(${CARD_WIDTH}px, calc(100vw - 32px))` };
  if (rect) {
    const spaceBelow = window.innerHeight - (rect.top + rect.height);
    if (spaceBelow > CARD_ESTIMATED_HEIGHT + 24) {
      cardStyle.top = rect.top + rect.height + SPOTLIGHT_PADDING + 12;
    } else {
      cardStyle.bottom = window.innerHeight - rect.top + SPOTLIGHT_PADDING + 12;
    }
    cardStyle.left = Math.max(16, Math.min(rect.left, window.innerWidth - CARD_WIDTH - 16));
  } else {
    cardStyle.top = '50%';
    cardStyle.left = '50%';
    cardStyle.transform = 'translate(-50%, -50%)';
  }

  return (
    // z-[60]: above the app shell and the z-40 modal layer (Tailwind v3
    // arbitrary value — the default scale stops at 50).
    <div className="fixed inset-0 z-[60]">
      {/* Click shield: the app underneath is inert while the tour runs. */}
      <div
        className={`absolute inset-0 ${rect ? '' : 'bg-slate-900/55'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-indigo-400 transition-all duration-300"
          style={{
            top: rect.top - SPOTLIGHT_PADDING,
            left: rect.left - SPOTLIGHT_PADDING,
            width: rect.width + SPOTLIGHT_PADDING * 2,
            height: rect.height + SPOTLIGHT_PADDING * 2,
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.55)',
          }}
        />
      ) : null}

      <div
        role="dialog"
        aria-modal="true"
        aria-label={step.title}
        className="fade-in absolute rounded-xl border border-slate-200 bg-white p-4 shadow-2xl"
        style={cardStyle}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
          Step {index + 1} of {steps.length}
        </p>
        <h2 className="mt-1 text-base font-bold text-slate-900">{step.title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{step.body}</p>
        <div className="mt-3 flex items-center gap-1.5">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? 'w-4 bg-indigo-600' : 'w-1.5 bg-slate-300'
              }`}
            />
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          {last ? (
            <span />
          ) : (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Skip tour
            </Button>
          )}
          <div className="flex gap-2">
            {index > 0 ? (
              <Button variant="secondary" size="sm" onClick={() => setIndex(index - 1)}>
                Back
              </Button>
            ) : null}
            <Button size="sm" onClick={() => (last ? onClose() : setIndex(index + 1))}>
              {last ? 'Finish' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
