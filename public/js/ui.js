const UI = {
  esc: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  cop: n => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0),
  fecha: t => new Date(t).toLocaleDateString('es-CO'),
  toast(m) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
    t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 2500);
  },
  // Cabecera y pie comunes. active: clave del enlace resaltado.
  mount(active) {
    const b = document.body.dataset.base || '', u = Auth.current();
    const l = (k, href, txt) => `<a href="${b}${href}" class="${active === k ? 'on' : ''}">${txt}</a>`;
    document.getElementById('hdr').innerHTML = `<div class="wrap"><a class="brand" href="${b}index.html"><img src="${b}img/logo-h.svg" alt="${UI.esc(CONFIG.marca)} — eventos y boutique"></a>
      <nav class="nav" aria-label="Principal">${l('inicio', 'index.html', 'Inicio')}${l('boutique', 'boutique.html', 'Boutique')}${l('eventos', 'eventos.html', 'Eventos')}
      ${u ? l('cuenta', 'cuenta.html', UI.esc(u.nombre.split(' ')[0])) : l('login', 'login.html', 'Ingresar')}
      ${u && u.rol === 'admin' ? l('admin', 'admin/index.html', 'Admin') : ''}${u ? '<a href="#" id="out">Salir</a>' : ''}</nav></div>`;
    const out = document.getElementById('out');
    if (out) out.onclick = e => { e.preventDefault(); Auth.logout().then(() => { location.href = b + 'index.html'; }); };
    const f = document.getElementById('ftr');
    if (f) f.innerHTML = `<div class="wrap">© ${new Date().getFullYear()} ${UI.esc(CONFIG.marca)} · Boutique y Eventos · <a href="https://wa.me/${CONFIG.whatsapp}">WhatsApp</a></div>`;
  }
};
