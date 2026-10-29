const CONFIG = { marca: 'Tanary', whatsapp: '573142242933' };
// Cliente de la API. La cabecera X-Requested-With protege contra CSRF (el servidor la exige en escrituras).
const API = {
  async call(method, url, body) {
    let r;
    try {
      r = await fetch('/api' + url, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'tanary' }, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch { throw new Error('No se pudo conectar con el servidor.'); }
    let d = null; try { d = await r.json(); } catch {}
    if (!r.ok) throw new Error((d && d.error) || 'Error del servidor (' + r.status + ')');
    return d;
  },
  get: u => API.call('GET', u),
  post: (u, b = {}) => API.call('POST', u, b),
  put: (u, b) => API.call('PUT', u, b),
  patch: (u, b) => API.call('PATCH', u, b),
  del: u => API.call('DELETE', u, {})
};
