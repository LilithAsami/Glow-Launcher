/**
 * Mission clipboard screenshot utility.
 * Renders a mission card that matches the launcher's mission row style
 * and copies it as a PNG image to the system clipboard.
 */

import type { ProcessedMission } from '../../shared/types';

function loadImg(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function zoneBadgeColor(zone: string): string {
  const first = zone.trim().charAt(0).toLowerCase();
  if (first === 't') return '#9b59b6';
  if (first === 'c') return '#e67e22';
  if (first === 'p') return '#f39c12';
  if (first === 's') return '#2ecc71';
  return '#555';
}

function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '\u2026').width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + '\u2026';
}

export async function copyMissionToClipboard(m: ProcessedMission): Promise<void> {
  const SCALE   = 2;
  let W         = 580;
  const H       = 72;
  const PAD     = 14;
  const BADGE   = 22;
  const ICN     = 34;   // mission icon size
  const MOD_SZ  = 18;   // modifier thumb size
  const PILL_H  = 22;   // pill height
  const PILL_ICN = 18;  // icon inside pill

  // Group reward items by icon path, summing quantities for duplicates
  const groupByIcon = <T extends { icon: string | null; quantity: number }>(arr: T[]): T[] => {
    const map = new Map<string, T>();
    for (const r of arr) {
      const key = r.icon!;
      const existing = map.get(key);
      if (existing) map.set(key, { ...existing, quantity: existing.quantity + r.quantity });
      else map.set(key, { ...r });
    }
    return [...map.values()];
  };
  const alertRewards   = groupByIcon(m.alerts.filter((r) => r.icon));
  const regularRewards = groupByIcon(m.rewards.filter((r) => r.icon));
  const allMods        = m.modifiers.slice(0, 8);

  // ── Load all images ─────────────────────────────────────────
  const srcs = [
    m.missionIcon,
    ...alertRewards.map((r) => r.icon!),
    ...regularRewards.map((r) => r.icon!),
    ...allMods.map((mod) => mod.icon),
  ];
  const [missionImg, ...rest] = await Promise.all(srcs.map(loadImg));
  const alertRewardImgs   = rest.slice(0, alertRewards.length);
  const regularRewardImgs = rest.slice(alertRewards.length, alertRewards.length + regularRewards.length);
  const modImgs           = rest.slice(alertRewards.length + regularRewards.length);

  // ── Pre-measure right-side width ─────────────────────────────
  const tmpCanvas = document.createElement('canvas');
  const tmpCtx = tmpCanvas.getContext('2d')!;
  tmpCtx.font = `bold 9.5px -apple-system, "Segoe UI", sans-serif`;

  const calcPillWidths = (arr: typeof alertRewards) => arr.map((r) => {
    const qtyW = r.quantity > 1 ? tmpCtx.measureText(`\u00d7${r.quantity}`).width + 3 : 0;
    return PILL_ICN + qtyW + 8;
  });
  const alertPillWidths   = calcPillWidths(alertRewards);
  const regularPillWidths = calcPillWidths(regularRewards);
  const totalAlertPillsW   = alertPillWidths.reduce((s, w) => s + w + 5, 0);
  const totalRegularPillsW = regularPillWidths.reduce((s, w) => s + w + 5, 0);
  const hasPillSep = alertRewards.length > 0 && regularRewards.length > 0;
  tmpCtx.font = `bold 13px -apple-system, "Segoe UI", sans-serif`;
  const pillSepW = hasPillSep ? tmpCtx.measureText('\u00b7').width + 12 : 0;
  const totalModsW  = allMods.length > 0 ? allMods.length * (MOD_SZ + 4) : 0;
  const rightBlockW = totalModsW + (totalModsW > 0 ? 8 : 0) + totalAlertPillsW + pillSepW + totalRegularPillsW;

  // Expand canvas width if mission name would have less than 150px
  const fixedLx = PAD + (m.hasAlerts ? 4 : 0) + BADGE + 10 + ICN + 10;
  const neededW = Math.ceil(fixedLx + 150 + rightBlockW + PAD + 16);
  if (neededW > W) W = neededW;

  // ── Canvas setup ─────────────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.width  = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);

  // Background
  ctx.fillStyle = '#0f0f1c';
  ctx.fillRect(0, 0, W, H);

  // Subtle border (like --border in the app)
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

  // Left accent bar for alerts
  if (m.hasAlerts) {
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 0, 3, H);
  }

  // ─── Left side content ───────────────────────────────────────
  const accentOffset = m.hasAlerts ? 4 : 0;
  let lx = PAD + accentOffset;
  const cy = H / 2; // vertical center

  // Zone badge
  const badgeColor = zoneBadgeColor(m.zone === 'V-Bucks' ? m.zoneGeo : m.zone);
  ctx.fillStyle = badgeColor;
  roundRect(ctx, lx, cy - BADGE / 2, BADGE, BADGE, 4);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `bold 12px -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    (m.zone === 'V-Bucks' ? m.zoneGeo : m.zone).charAt(0).toUpperCase(),
    lx + BADGE / 2,
    cy,
  );
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  lx += BADGE + 10;

  // Mission icon
  if (missionImg) {
    ctx.globalAlpha = 0.88;
    ctx.drawImage(missionImg, lx, cy - ICN / 2, ICN, ICN);
    ctx.globalAlpha = 1;
  }
  lx += ICN + 10;

  // Text column — give it the remaining space minus the right block
  const textMaxW = W - lx - rightBlockW - PAD - 16;

  // Mission name
  ctx.font = `600 13px -apple-system, "Segoe UI", sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.90)';
  ctx.fillText(truncateText(ctx, m.missionName, Math.max(80, textMaxW)), lx, cy - 5);

  // Tags row: ⚡ power + zone + alerts badge
  ctx.font = `11px -apple-system, "Segoe UI", sans-serif`;
  const powerStr = `\u26a1 ${m.power}`;
  ctx.fillStyle = 'rgba(255,255,255,0.40)';
  ctx.fillText(powerStr, lx, cy + 11);
  const pwW = ctx.measureText(powerStr).width;

  const zoneLabel = m.zone === 'V-Bucks' ? m.zoneGeo : m.zone;
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillText(`  ${zoneLabel}`, lx + pwW, cy + 11);

  // ─── Right side: mods + reward pills (drawn right-to-left) ───
  let rx = W - PAD;

  // Helper: draw a pill group right-to-left, returns updated rx
  const drawPills = (
    rewards: typeof alertRewards,
    imgs: (HTMLImageElement | null)[],
    widths: number[],
  ): void => {
    for (let i = rewards.length - 1; i >= 0; i--) {
      const r   = rewards[i];
      const img = imgs[i];
      const pw  = widths[i];
      rx -= pw;
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      roundRect(ctx, rx, cy - PILL_H / 2, pw, PILL_H, 4);
      ctx.fill();
      if (img) ctx.drawImage(img, rx + 4, cy - PILL_ICN / 2, PILL_ICN, PILL_ICN);
      if (r.quantity > 1) {
        ctx.font = `bold 9.5px -apple-system, "Segoe UI", sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.60)';
        ctx.textBaseline = 'middle';
        ctx.fillText(`\u00d7${r.quantity}`, rx + PILL_ICN + 5, cy);
        ctx.textBaseline = 'alphabetic';
      }
      rx -= 5;
    }
  };

  // Regular reward pills (rightmost)
  drawPills(regularRewards, regularRewardImgs, regularPillWidths);

  // Dot separator between alert rewards and regular rewards
  if (hasPillSep) {
    ctx.font = `bold 13px -apple-system, "Segoe UI", sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.textBaseline = 'middle';
    const dotW = ctx.measureText('\u00b7').width;
    rx -= dotW + 10;
    ctx.fillText('\u00b7', rx, cy);
    rx -= 6;
    ctx.textBaseline = 'alphabetic';
  }

  // Alert reward pills (left of separator)
  drawPills(alertRewards, alertRewardImgs, alertPillWidths);

  // Gap before modifier thumbs
  if (allMods.length > 0) { rx -= 8; }

  // Modifier thumbs
  for (let i = allMods.length - 1; i >= 0; i--) {
    const img = modImgs[i];
    rx -= MOD_SZ + (i < allMods.length - 1 ? 4 : 0);
    if (img) {
      ctx.globalAlpha = 0.80;
      ctx.drawImage(img, rx, cy - MOD_SZ / 2, MOD_SZ, MOD_SZ);
      ctx.globalAlpha = 1;
    }
  }

  // Watermark
  ctx.font = `7.5px -apple-system, "Segoe UI", sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.09)';
  const wm = 'GLOW LAUNCHER';
  ctx.fillText(wm, W - PAD - ctx.measureText(wm).width, H - 3);

  // ── Copy to clipboard ───────────────────────────────────────
  await new Promise<void>((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) { reject(new Error('Canvas blob failed')); return; }
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        resolve();
      } catch (e) { reject(e); }
    }, 'image/png');
  });
}

