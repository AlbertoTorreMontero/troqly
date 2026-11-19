// Tarjeta para compartir (imagen PNG) generada en el navegador, en el idioma del usuario.
import { t, num, date, duration } from './i18n.js';

const C = { night: '#15131F', coral: '#FF6B4A', mint: '#3DDC97', amber: '#FFC845', cream: '#F6F1E7', muted: '#A8A2B8', surface: '#221F31' };

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  while (text.length > 1 && ctx.measureText(text + '…').width > max) text = text.slice(0, -1);
  return text + '…';
}

async function loadIcon() {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = '/icons/icon-192.png';
  });
}

export async function makeCard(st) {
  await document.fonts?.ready;
  const W = 1080, H = 1350;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const head = (s, w = 700) => `${w} ${s}px "Space Grotesk", system-ui, sans-serif`;
  const body = (s, w = 500) => `${w} ${s}px Inter, system-ui, sans-serif`;

  ctx.fillStyle = C.night; ctx.fillRect(0, 0, W, H);
  const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, 900);
  grd.addColorStop(0, 'rgba(255,107,74,.35)'); grd.addColorStop(1, 'rgba(255,107,74,0)');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);

  const icon = await loadIcon();
  if (icon) ctx.drawImage(icon, 80, 80, 72, 72);
  ctx.fillStyle = C.cream; ctx.font = head(44); ctx.fillText('TROQLY', 170, 132);

  ctx.fillStyle = C.muted; ctx.font = body(34);
  ctx.fillText(fit(ctx, `${st.game.name} · ${date(st.endedAt || Date.now())}`, W - 160), 80, 250);

  const pod = st.result.podium;
  const winner = pod.find((p) => p.rank === 1);
  ctx.fillStyle = C.cream; ctx.font = head(84);
  const title = st.game.cooperative ? (st.coopWon ? t('live.coop_won_big') : t('live.coop_lost_big')) : t('live.wins_title', { name: winner?.name || '' });
  const words = title.split(' ');
  let line = '', y = 360;
  for (const w of words) {
    if (ctx.measureText(line + w).width > W - 160 && line) { ctx.fillText(line.trim(), 80, y); y += 96; line = ''; }
    line += w + ' ';
  }
  ctx.fillText(line.trim(), 80, y);

  if (!st.game.cooperative) {
    const base = 1000;
    const steps = [{ rank: 2, x: 120, h: 230, color: C.cream }, { rank: 1, x: 400, h: 330, color: C.mint }, { rank: 3, x: 680, h: 170, color: C.amber }];
    for (const s of steps) {
      const p = pod.find((x) => x.rank === s.rank);
      if (!p) continue;
      ctx.fillStyle = s.color; roundRect(ctx, s.x, base - s.h, 280, s.h, 28); ctx.fill();
      ctx.fillStyle = C.night; ctx.font = head(96); ctx.textAlign = 'center'; ctx.fillText(String(s.rank), s.x + 140, base - s.h / 2 + 34);
      ctx.font = '88px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'; ctx.fillText(p.emoji, s.x + 140, base - s.h - 110);
      ctx.fillStyle = C.cream; ctx.font = head(38, 700); ctx.fillText(fit(ctx, p.name, 270), s.x + 140, base - s.h - 52);
      ctx.fillStyle = C.muted; ctx.font = body(30); ctx.fillText(num(Number(p.score)), s.x + 140, base - s.h - 14);
      ctx.textAlign = 'left';
    }
  }

  const awards = st.result.awards || [];
  let ay = 1090;
  ctx.font = body(32, 600);
  for (const a of awards.slice(0, 2)) {
    const p = pod.find((x) => x.id === a.playerId);
    ctx.fillStyle = C.amber;
    ctx.fillText(fit(ctx, p ? `${t('ach.' + a.key + '.name')} · ${p.name}` : t('ach.' + a.key + '.line'), W - 160), 80, ay);
    ay += 50;
  }
  ctx.fillStyle = C.muted; ctx.font = body(30);
  ctx.fillText(`⏱ ${duration(st.result.duration)}`, 80, H - 90);
  ctx.textAlign = 'right'; ctx.fillStyle = C.coral; ctx.font = head(32, 600);
  ctx.fillText(t('brand.slogan'), W - 80, H - 90);
  return new Promise((res) => cv.toBlob(res, 'image/png'));
}

export async function shareCard(st) {
  const blob = await makeCard(st);
  const file = new File([blob], `troqly-${st.code}.png`, { type: 'image/png' });
  const text = t('share.text', { game: st.game.name });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return; } catch { /* cancelado */ }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
