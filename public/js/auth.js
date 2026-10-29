// La sesión vive en una cookie HttpOnly del servidor; aquí solo guardamos el usuario actual.
const Auth = {
  user: null,
  async load() { try { Auth.user = (await API.get('/me')).user; } catch { Auth.user = null; } },
  current() { return Auth.user; },
  async register(nombre, email, password) {
    if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
    Auth.user = (await API.post('/auth/register', { nombre, email, password })).user; return Auth.user;
  },
  async login(email, password) { Auth.user = (await API.post('/auth/login', { email, password })).user; return Auth.user; },
  async logout() { try { await API.post('/auth/logout'); } catch {} Auth.user = null; },
  // Redirige al login si no hay sesión o el rol no alcanza (el servidor valida de verdad cada llamada).
  require(rol) {
    const u = Auth.user, base = document.body.dataset.base || '';
    if (!u || (rol && u.rol !== rol)) {
      location.href = base + 'login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search);
      return null;
    }
    return u;
  }
};
const Ready = Auth.load();
