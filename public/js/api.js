export class ApiError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (form) opts.body = form;
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['content-type'] = 'application/json'; }
  let res;
  try {
    res = await fetch(`/api${path}`, opts);
  } catch {
    throw new ApiError('offline', 0);
  }
  let data = null;
  try { data = await res.json(); } catch { /* vacío */ }
  if (!res.ok) throw new ApiError(data?.error || 'server', res.status);
  return data;
}
