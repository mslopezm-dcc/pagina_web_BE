const Boutique = {
  async catalogo() {
    let ps = [];
    try { ps = await API.get('/products'); } catch (e) { lista.innerHTML = `<p>${UI.esc(e.message)}</p>`; return; }
    const cats = [...new Set(ps.map(p => p.categoria))].sort();
    c.insertAdjacentHTML('beforeend', cats.map(x => `<option>${UI.esc(x)}</option>`).join(''));
    const draw = () => {
      const qv = document.getElementById('q').value.trim().toLowerCase();
      const r = ps.filter(p => (!qv || (p.nombre + ' ' + p.color).toLowerCase().includes(qv)) && (!g.value || p.genero === g.value) && (!c.value || p.categoria === c.value)
        && (!o.value || p.modo === o.value || p.modo === 'ambos') && (!t.value || p.tallas.includes(t.value)));
      cnt.textContent = r.length + ' resultado(s)';
      lista.innerHTML = r.map(p => `<a class="card" href="producto.html?id=${encodeURIComponent(p.id)}" style="text-decoration:none;color:inherit">
        <img src="${UI.esc(p.imagen)}" alt="${UI.esc(p.nombre)}" loading="lazy"><div class="body"><h3>${UI.esc(p.nombre)}</h3>
        <span class="tag">${p.genero === 'M' ? 'Mujer' : 'Hombre'}</span><span class="tag">${UI.esc(p.categoria)}</span>
        <p class="price">${p.modo !== 'alquiler' ? 'Venta ' + UI.cop(p.precioVenta) : ''}${p.modo === 'ambos' ? '<br>' : ''}${p.modo !== 'venta' ? 'Alquiler ' + UI.cop(p.precioAlquilerDia) + '/día' : ''}</p></div></a>`).join('') || '<p>No hay vestidos con esos filtros.</p>';
    };
    fl.oninput = draw; fl.onsubmit = e => e.preventDefault(); draw();
  },
  async detalle() {
    let ps = [];
    try { ps = await API.get('/products'); } catch (e) { det.innerHTML = `<p>${UI.esc(e.message)}</p>`; return; }
    const p = ps.find(x => x.id === new URLSearchParams(location.search).get('id'));
    if (!p) { det.innerHTML = '<p>Producto no encontrado.</p>'; return; }
    Metrics.log('vista_producto', p.id);
    const tipos = [p.modo !== 'alquiler' && ['compra', 'Comprar'], p.modo !== 'venta' && ['alquiler', 'Alquilar']].filter(Boolean);
    det.innerHTML = `<div class="two"><img src="${UI.esc(p.imagen)}" alt="${UI.esc(p.nombre)}" style="border-radius:var(--r)">
      <div><h1>${UI.esc(p.nombre)}</h1><p><span class="tag">${p.genero === 'M' ? 'Mujer' : 'Hombre'}</span><span class="tag">${UI.esc(p.categoria)}</span><span class="tag">${UI.esc(p.color)}</span></p>
      <p class="price">${p.modo !== 'alquiler' ? 'Venta: ' + UI.cop(p.precioVenta) : ''}${p.modo === 'ambos' ? ' · ' : ''}${p.modo !== 'venta' ? 'Alquiler: ' + UI.cop(p.precioAlquilerDia) + '/día' : ''}</p>
      <form id="rf" class="form" novalidate>
        <div><label for="tp">¿Qué deseas?</label><select id="tp">${tipos.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
        <div><label for="tl">Talla</label><select id="tl">${p.tallas.map(x => `<option>${UI.esc(x)}</option>`).join('')}</select></div>
        <div id="fe" class="two" style="gap:12px"><div><label for="d1">Desde</label><input type="date" id="d1"></div><div><label for="d2">Hasta</label><input type="date" id="d2"></div></div>
        <p class="price" id="tot"></p><div class="msg" id="m" role="alert"></div>
        <button class="btn">Enviar solicitud</button>
        <a class="btn alt" id="wa" target="_blank" rel="noopener" href="https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent('Hola, me interesa: ' + p.nombre)}">Consultar por WhatsApp</a>
      </form></div></div>`;
    const hoy = new Date().toISOString().slice(0, 10); d1.min = d2.min = hoy;
    // El total mostrado es una estimación; el servidor lo recalcula al guardar la solicitud.
    const calc = () => {
      const al = tp.value === 'alquiler'; fe.hidden = !al;
      if (!al) { tot.textContent = 'Total: ' + UI.cop(p.precioVenta); return true; }
      const dias = d1.value && d2.value ? Math.round((new Date(d2.value) - new Date(d1.value)) / 864e5) + 1 : 0;
      tot.textContent = dias > 0 ? `${dias} día(s) · Total: ${UI.cop(dias * p.precioAlquilerDia)}` : 'Selecciona las fechas.';
      return dias > 0;
    };
    rf.oninput = calc; calc();
    wa.onclick = () => Metrics.log('click_cta', p.id);
    rf.onsubmit = async e => {
      e.preventDefault(); m.className = 'msg';
      if (!Auth.require()) return;
      if (!calc()) { m.textContent = 'Revisa las fechas (la fecha final no puede ser anterior).'; m.className = 'msg on'; return; }
      try {
        await API.post('/requests', { tipo: tp.value, productoId: p.id, talla: tl.value, desde: d1.value, hasta: d2.value });
        m.textContent = '¡Solicitud enviada! La verás en tu cuenta.'; m.className = 'msg on ok';
      } catch (err) { m.textContent = err.message; m.className = 'msg on'; }
    };
  }
};
