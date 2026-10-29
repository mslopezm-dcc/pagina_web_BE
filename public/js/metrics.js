const Metrics = {
  log(tipo, ref = '') {
    API.post('/events', { tipo, ref, pagina: location.pathname.split('/').pop() || 'index.html' }).catch(() => {});
  }
};
// Visita automática (el panel admin no cuenta como visita).
if (!document.body.dataset.admin) Metrics.log('visita');
