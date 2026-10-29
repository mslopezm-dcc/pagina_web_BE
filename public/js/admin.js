const Admin = {
  nav: [['index', 'Dashboard'], ['productos', 'Productos'], ['solicitudes', 'Solicitudes'], ['usuarios', 'Usuarios']],
  async init(page) {
    const me = Auth.require('admin'); if (!me) return;
    UI.mount('admin');
    side.innerHTML = Admin.nav.map(([k, t]) => `<a href="${k}.html" class="${k === page ? 'on' : ''}">${t}</a>`).join('');
    try { await Admin[page](me); } catch (e) { app.innerHTML = `<div class="msg on">${UI.esc(e.message)}</div>`; }
  },
  // ---------- Dashboard ----------
  async index() {
    const [log, rs, us, ps] = await Promise.all([API.get('/admin/log'), API.get('/requests'), API.get('/users'), API.get('/products?all=1')]);
    const n = t => log.filter(l => l.tipo === t).length;
    const vistas = n('vista_producto'), sols = rs.filter(r => r.tipo !== 'evento').length;
    const ingresos = rs.filter(r => ['confirmada', 'cerrada'].includes(r.estado)).reduce((a, r) => a + (r.total || 0), 0);
    const kpi = (t, v) => `<div class="kpi"><small>${t}</small><b>${v}</b></div>`;
    const cuenta = (arr, f) => arr.reduce((m, x) => (m[f(x)] = (m[f(x)] || 0) + 1, m), {});
    const barras = (obj, fmt = x => x) => {
      const e = Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 8), mx = Math.max(1, ...e.map(x => x[1]));
      return e.map(([k, v]) => `<div class="bar"><span title="${UI.esc(fmt(k))}">${UI.esc(fmt(k))}</span><i style="width:${v / mx * 55}%"></i><b>${v}</b></div>`).join('') || '<p class="legend">Sin datos.</p>';
    };
    // Serie diaria (14 días)
    const dias = [...Array(14)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 13 + i); return d.getTime(); });
    const serie = t => dias.map(d => log.filter(l => l.tipo === t && l.ts >= d && l.ts < d + 864e5).length);
    const sv = serie('visita'), ss = serie('solicitud'), mx = Math.max(1, ...sv, ...ss);
    const W = 560, H = 180, bw = W / 14;
    const svg = `<svg viewBox="0 0 ${W} ${H + 24}" role="img" aria-label="Visitas y solicitudes por día, últimos 14 días" style="width:100%">
      ${dias.map((d, i) => { const a = sv[i] / mx * H, b = ss[i] / mx * H, x = i * bw;
        return `<rect x="${x + 4}" y="${H - a}" width="${bw / 2 - 5}" height="${a}" fill="#c9a227"><title>${new Date(d).toLocaleDateString('es-CO')}: ${sv[i]} visitas</title></rect>
        <rect x="${x + bw / 2}" y="${H - b}" width="${bw / 2 - 5}" height="${b}" fill="#17171a"><title>${new Date(d).toLocaleDateString('es-CO')}: ${ss[i]} solicitudes</title></rect>
        <text x="${x + bw / 2}" y="${H + 16}" font-size="10" text-anchor="middle" fill="#66666c">${new Date(d).getDate()}</text>`; }).join('')}
      <line x1="0" y1="${H}" x2="${W}" y2="${H}" stroke="#e6e3da"/></svg>`;
    const nombreProd = id => (ps.find(p => p.id === id) || { nombre: '(eliminado)' }).nombre;
    app.innerHTML = `<h1>Dashboard</h1>
      <div class="row"><button class="btn sm alt" id="csv">Exportar CSV</button><button class="btn sm alt" id="demo">Cargar datos demo</button><button class="btn sm alt" id="undemo">Quitar datos demo</button></div>
      <div class="kpis">${kpi('Visitas', n('visita'))}${kpi('Usuarios', us.length)}${kpi('Vistas de producto', vistas)}${kpi('Solicitudes boutique', sols)}${kpi('Cotizaciones eventos', rs.filter(r => r.tipo === 'evento').length)}${kpi('Conversión vista→solicitud', vistas ? Math.round(sols / vistas * 100) + '%' : '—')}${kpi('Ingresos confirmados', UI.cop(ingresos))}</div>
      <div class="cols"><section class="panel"><h3>Últimos 14 días</h3><div class="legend"><b style="background:#c9a227"></b>Visitas<b style="background:#17171a"></b>Solicitudes</div>${svg}</section>
      <section class="panel"><h3>Productos más vistos</h3>${barras(cuenta(log.filter(l => l.tipo === 'vista_producto'), l => l.ref), nombreProd)}</section></div>
      <div class="cols"><section class="panel"><h3>Solicitudes por tipo</h3>${barras(cuenta(rs, r => r.tipo))}</section>
      <section class="panel"><h3>Solicitudes por estado</h3>${barras(cuenta(rs, r => r.estado))}</section>
      <section class="panel"><h3>Páginas más visitadas</h3>${barras(cuenta(log.filter(l => l.tipo === 'visita'), l => l.pagina))}</section></div>
      <p class="legend">Las métricas se guardan en la base de datos del servidor (cuentan visitas de todos los dispositivos).</p>`;
    csv.onclick = () => {
      const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
      const f = s => /^[=+\-@]/.test(s) ? "'" + s : s; // evita inyección de fórmulas en Excel
      const rows = [['fecha', 'tipo', 'pagina', 'ref'], ...log.map(l => [new Date(l.ts).toISOString(), l.tipo, l.pagina, l.ref])];
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + rows.map(r => r.map(v => q(f(String(v ?? '')))).join(',')).join('\n')], { type: 'text/csv' }));
      a.download = 'metricas.csv'; a.click();
    };
    demo.onclick = async () => { await API.post('/admin/demo'); location.reload(); };
    undemo.onclick = async () => { await API.del('/admin/demo'); location.reload(); };
  },
  // ---------- Productos ----------
  async productos() {
    let ps = await API.get('/products?all=1');
    const draw = () => {
      app.innerHTML = `<h1>Productos</h1><div class="row"><button class="btn" id="nuevo">+ Nuevo producto</button></div>
      <div class="tw"><table><thead><tr><th></th><th>Nombre</th><th>Para</th><th>Categoría</th><th>Modo</th><th>Venta</th><th>Alquiler/día</th><th>Activo</th><th></th></tr></thead><tbody>
      ${ps.map(p => `<tr><td><img src="${UI.esc(p.imagen)}" alt="" width="40" height="53" style="object-fit:cover;border-radius:6px"></td><td>${UI.esc(p.nombre)}</td><td>${p.genero === 'M' ? 'Mujer' : 'Hombre'}</td><td>${UI.esc(p.categoria)}</td><td>${p.modo}</td><td>${UI.cop(p.precioVenta)}</td><td>${UI.cop(p.precioAlquilerDia)}</td><td>${p.activo ? 'Sí' : 'No'}</td>
      <td><button class="btn sm alt" data-e="${p.id}">Editar</button> <button class="btn sm danger" data-d="${p.id}">Borrar</button></td></tr>`).join('')}</tbody></table></div>
      <dialog id="dlg"><form id="pf" class="form" style="max-width:none" method="dialog" novalidate><h2 id="dt"></h2>
        <div><label for="fn">Nombre</label><input id="fn" required></div>
        <div class="two" style="gap:12px"><div><label for="fg">Para</label><select id="fg"><option value="M">Mujer</option><option value="H">Hombre</option></select></div><div><label for="fc">Categoría</label><input id="fc" required></div></div>
        <div class="two" style="gap:12px"><div><label for="fk">Color</label><input id="fk"></div><div><label for="fm">Modalidad</label><select id="fm"><option value="ambos">Alquiler y venta</option><option value="alquiler">Solo alquiler</option><option value="venta">Solo venta</option></select></div></div>
        <div class="two" style="gap:12px"><div><label for="fv">Precio venta</label><input id="fv" type="number" min="0"></div><div><label for="fa">Alquiler por día</label><input id="fa" type="number" min="0"></div></div>
        <div class="two" style="gap:12px"><div><label for="ft">Tallas (separadas por coma)</label><input id="ft" value="S,M,L"></div><div><label for="fs">Stock</label><input id="fs" type="number" min="0" value="1"></div></div>
        <div><label for="fi">Imagen (opcional, máx. 300 KB)</label><input id="fi" type="file" accept="image/*"></div>
        <label><input type="checkbox" id="fx" checked style="width:auto"> Activo (visible en la tienda)</label>
        <div class="msg" id="m" role="alert"></div>
        <div class="row"><button class="btn" id="sv">Guardar</button><button class="btn alt" type="button" id="cx">Cancelar</button></div></form></dialog>`;
      let edit = null;
      const abrir = p => {
        edit = p; dt.textContent = p ? 'Editar producto' : 'Nuevo producto'; m.className = 'msg';
        fn.value = p?.nombre || ''; fg.value = p?.genero || 'M'; fc.value = p?.categoria || ''; fk.value = p?.color || ''; fm.value = p?.modo || 'ambos';
        fv.value = p?.precioVenta || 0; fa.value = p?.precioAlquilerDia || 0; ft.value = (p?.tallas || ['S', 'M', 'L']).join(','); fs.value = p?.stock ?? 1; fx.checked = p?.activo ?? true; fi.value = '';
        dlg.showModal();
      };
      nuevo.onclick = () => abrir(null); cx.onclick = () => dlg.close();
      app.onclick = async e => {
        if (e.target.dataset.e) abrir(ps.find(p => p.id === e.target.dataset.e));
        if (e.target.dataset.d && confirm('¿Borrar este producto?')) {
          try { await API.del('/products/' + e.target.dataset.d); ps = ps.filter(p => p.id !== e.target.dataset.d); draw(); } catch (err) { UI.toast(err.message); }
        }
      };
      pf.onsubmit = async ev => {
        ev.preventDefault();
        if (!fn.value.trim() || !fc.value.trim()) { m.textContent = 'Nombre y categoría son obligatorios.'; m.className = 'msg on'; return; }
        let img = '';
        if (fi.files[0]) {
          if (fi.files[0].size > 300 * 1024) { m.textContent = 'La imagen supera 300 KB.'; m.className = 'msg on'; return; }
          img = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(fi.files[0]); });
        }
        const d = { nombre: fn.value.trim(), genero: fg.value, categoria: fc.value.trim(), color: fk.value.trim(), modo: fm.value, precioVenta: +fv.value || 0, precioAlquilerDia: +fa.value || 0,
          tallas: ft.value.split(',').map(x => x.trim().toUpperCase()).filter(Boolean), stock: +fs.value || 0, imagen: img, activo: fx.checked };
        try {
          const saved = edit ? await API.put('/products/' + edit.id, d) : await API.post('/products', d);
          ps = edit ? ps.map(p => p.id === saved.id ? saved : p) : [...ps, saved];
        } catch (err) { m.textContent = err.message; m.className = 'msg on'; return; }
        dlg.close(); draw();
      };
    };
    draw();
  },
  // ---------- Solicitudes ----------
  async solicitudes() {
    const rs = await API.get('/requests');
    app.innerHTML = `<h1>Solicitudes</h1><div class="tw"><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Tipo</th><th>Detalle</th><th>Total</th><th>Estado</th></tr></thead><tbody>
      ${rs.map(r => {
        const d = r.tipo === 'evento' ? `${UI.esc(r.datos.tipoEvento)} · ${UI.esc(r.datos.paquete)} · ${UI.esc(r.datos.fecha)} · ${r.datos.invitados} inv.${r.datos.notas ? '<br><small>' + UI.esc(r.datos.notas) + '</small>' : ''}`
          : `${UI.esc(r.productoNombre || '(eliminado)')} · ${UI.esc(r.talla)}${r.desde ? ` · ${UI.esc(r.desde)} → ${UI.esc(r.hasta)}` : ''}`;
        return `<tr><td>${UI.fecha(r.creado)}</td><td>${UI.esc(r.cliente?.nombre || '?')}<br><small>${UI.esc(r.cliente?.email || '')}</small></td><td>${UI.esc(r.tipo)}</td><td>${d}</td><td>${r.total ? UI.cop(r.total) : '—'}</td>
        <td><select data-id="${r.id}" aria-label="Estado">${['nueva', 'confirmada', 'cerrada', 'cancelada'].map(s => `<option ${s === r.estado ? 'selected' : ''}>${s}</option>`).join('')}</select></td></tr>`; }).join('') || '<tr><td colspan="6">Sin solicitudes.</td></tr>'}</tbody></table></div>`;
    app.onchange = async e => {
      if (!e.target.dataset.id) return;
      try { await API.patch('/requests/' + e.target.dataset.id, { estado: e.target.value }); UI.toast('Estado actualizado'); } catch (err) { UI.toast(err.message); }
    };
  },
  // ---------- Usuarios ----------
  async usuarios(me) {
    const draw = async () => {
      const us = await API.get('/users');
      app.innerHTML = `<h1>Usuarios</h1><div class="tw"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Registro</th><th>Rol</th><th></th></tr></thead><tbody>
      ${us.map(u => `<tr><td>${UI.esc(u.nombre)}</td><td>${UI.esc(u.email)}</td><td>${UI.fecha(u.creado)}</td>
        <td><select data-r="${u.id}" ${u.id === me.id ? 'disabled' : ''} aria-label="Rol"><option ${u.rol === 'cliente' ? 'selected' : ''}>cliente</option><option ${u.rol === 'admin' ? 'selected' : ''}>admin</option></select></td>
        <td>${u.id === me.id ? '' : `<button class="btn sm danger" data-d="${u.id}">Eliminar</button>`}</td></tr>`).join('')}</tbody></table></div>`;
    };
    app.onchange = async e => {
      if (!e.target.dataset.r) return;
      try { await API.patch('/users/' + e.target.dataset.r, { rol: e.target.value }); UI.toast('Rol actualizado'); } catch (err) { UI.toast(err.message); }
    };
    app.onclick = async e => {
      const id = e.target.dataset.d;
      if (id && confirm('¿Eliminar este usuario?')) { try { await API.del('/users/' + id); await draw(); } catch (err) { UI.toast(err.message); } }
    };
    await draw();
  }
};
