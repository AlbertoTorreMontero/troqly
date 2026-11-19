import { api } from './api.js';

export const store = { user: null, groups: [], groupId: null };

export async function refreshMe() {
  const me = await api('/me');
  store.user = me.user;
  store.groups = me.groups || [];
  const saved = Number(localStorage.getItem('troqly_group'));
  store.groupId = store.groups.find((g) => g.id === saved)?.id || store.groups[0]?.id || null;
  return store;
}

export function setGroup(id) {
  store.groupId = id;
  localStorage.setItem('troqly_group', String(id));
}

export const group = () => store.groups.find((g) => g.id === store.groupId) || null;

// Token de invitado para la Mesa en vivo (permite reclamar partidas al crear cuenta)
export function guestToken() {
  let tk = localStorage.getItem('troqly_guest');
  if (!tk) {
    tk = crypto.getRandomValues(new Uint8Array(18)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '');
    localStorage.setItem('troqly_guest', tk);
  }
  return tk;
}
