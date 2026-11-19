// Reproductor de podcasts: el audio se reproduce desde la URL original del podcast.
import { api } from './api.js';
import { t, duration } from './i18n.js';
import { html, icon } from './ui.js';

const audio = new Audio();
audio.preload = 'metadata';
let current = null;
let lastSaved = 0;
const listeners = new Set();
const SPEEDS = [0.8, 1, 1.2, 1.5, 1.75, 2];

export const player = { audio, get episode() { return current; } };
export const onPlayer = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => { listeners.forEach((f) => f()); renderMini(); };

function save(force = false) {
  if (!current || !audio.duration) return;
  if (!force && Math.abs(audio.currentTime - lastSaved) < 10) return;
  lastSaved = audio.currentTime;
  const completed = audio.duration && audio.currentTime > audio.duration - 30;
  api(`/episodes/${current.id}/progress`, { method: 'POST', body: { position: audio.currentTime, completed } }).catch(() => {});
  localStorage.setItem('troqly_now', JSON.stringify({ ...current, position: audio.currentTime }));
}

export function playEpisode(ep, position = 0) {
  if (current?.id !== ep.id) {
    save(true);
    current = { id: ep.id, title: ep.title, podcast: ep.podcast, image_url: ep.image_url, audio_url: ep.audio_url };
    audio.src = ep.audio_url;
    audio.playbackRate = Number(localStorage.getItem('troqly_speed') || 1);
    audio.addEventListener('loadedmetadata', () => { if (position > 5) audio.currentTime = position; }, { once: true });
  }
  audio.play().catch(() => {});
  setupMediaSession();
  emit();
}
export const toggle = () => (audio.paused ? audio.play().catch(() => {}) : audio.pause());
export const skip = (s) => { audio.currentTime = Math.max(0, Math.min((audio.duration || 0) - 1, audio.currentTime + s)); };
export function cycleSpeed() {
  const i = SPEEDS.indexOf(audio.playbackRate);
  audio.playbackRate = SPEEDS[(i + 1) % SPEEDS.length];
  localStorage.setItem('troqly_speed', String(audio.playbackRate));
  emit();
}

function setupMediaSession() {
  if (!('mediaSession' in navigator) || !current) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: current.title, artist: current.podcast, album: 'TROQLY',
    artwork: current.image_url ? [{ src: current.image_url, sizes: '512x512' }] : [{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
  });
  const set = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch { /* no soportado */ } };
  set('play', () => audio.play());
  set('pause', () => audio.pause());
  set('seekbackward', () => skip(-30));
  set('seekforward', () => skip(30));
  set('seekto', (d) => { audio.currentTime = d.seekTime; });
}

['play', 'pause', 'ended', 'ratechange'].forEach((ev) => audio.addEventListener(ev, () => { save(true); emit(); }));
audio.addEventListener('timeupdate', () => {
  save();
  listeners.forEach((f) => f('time'));
  const prog = document.querySelector('.mini-player .prog');
  if (prog && audio.duration) prog.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
});
window.addEventListener('pagehide', () => save(true));

function renderMini() {
  const box = document.getElementById('mini-player');
  if (!box) return;
  const hidden = !current || location.pathname.startsWith('/m/') || location.pathname.startsWith('/live/');
  box.classList.toggle('hidden', hidden);
  document.documentElement.style.setProperty('--player-h', hidden ? '0px' : '72px');
  if (hidden) return;
  box.innerHTML = html`<div class="inner">
      <a href="/episode/${current.id}" class="row grow" style="text-decoration:none">
        <img src="${current.image_url || '/icons/icon-192.png'}" alt="" loading="lazy">
        <div class="grow"><div class="small ellipsis" style="font-weight:700">${current.title}</div><div class="tiny muted ellipsis">${current.podcast}</div></div>
      </a>
      <button class="btn icon soft" data-p="back" aria-label="${t('player.back30')}">-30</button>
      <button class="btn icon" data-p="toggle" aria-label="${audio.paused ? t('player.play') : t('player.pause')}">${icon(audio.paused ? 'play' : 'pause')}</button>
      <i class="prog" style="width:${audio.duration ? (audio.currentTime / audio.duration) * 100 : 0}%"></i>
    </div>`.__raw;
}

export function mountPlayer() {
  const box = document.getElementById('mini-player');
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    if (b.dataset.p === 'toggle') toggle();
    if (b.dataset.p === 'back') skip(-30);
  });
  try {
    const saved = JSON.parse(localStorage.getItem('troqly_now') || 'null');
    if (saved?.audio_url) {
      current = saved;
      audio.src = saved.audio_url;
      audio.playbackRate = Number(localStorage.getItem('troqly_speed') || 1);
      audio.addEventListener('loadedmetadata', () => { audio.currentTime = saved.position || 0; }, { once: true });
    }
  } catch { /* */ }
  window.addEventListener('popstate', renderMini);
  const origPush = history.pushState;
  history.pushState = function (...a) { origPush.apply(this, a); setTimeout(renderMini); };
  renderMini();
}

export function fullPlayer(ep) {
  const isCur = current?.id === ep.id;
  const pos = isCur ? audio.currentTime : ep.position_s || 0;
  const dur = isCur && audio.duration ? audio.duration : ep.duration_s || 0;
  return html`<div class="player-full center">
    <img class="art" src="${ep.image_url || '/icons/icon-512.png'}" alt="">
    <input type="range" min="0" max="${Math.round(dur) || 1}" value="${Math.round(pos)}" step="1" id="seek" aria-label="${t('player.seek')}" ${isCur ? '' : 'disabled'}>
    <div class="row between tiny muted"><span id="t-pos">${duration(pos)}</span><span id="t-dur">${dur ? duration(dur) : '--:--'}</span></div>
    <div class="controls">
      <button class="btn icon soft skip" data-pf="back" aria-label="${t('player.back30')}">-30</button>
      <button class="btn play" data-pf="play" aria-label="${isCur && !audio.paused ? t('player.pause') : t('player.play')}">${icon(isCur && !audio.paused ? 'pause' : 'play')}</button>
      <button class="btn icon soft skip" data-pf="fwd" aria-label="${t('player.fwd30')}">+30</button>
    </div>
    <button class="chip" data-pf="speed">${t('player.speed', { x: audio.playbackRate })}</button>
  </div>`;
}
