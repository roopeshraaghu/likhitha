/* ============================================================
   vResolve — app.js
   All application logic
   ============================================================ */

// ── Config ───────────────────────────────────────────────────
const API = window.location.origin;

// ── State ────────────────────────────────────────────────────
let token        = localStorage.getItem('vr_token') || '';
let me           = JSON.parse(localStorage.getItem('vr_me') || 'null');
let wChart       = null;
let tSecs        = 300;
let tTotal       = 300;
let tRunning     = false;
let tInt         = null;
let calC         = 0;
let calG         = 2000;
let weeklyData   = [0, 0, 0, 0, 0, 0, 0];
let pendingImg   = '';
let vaultPollMap = {};

// ── API Helper ───────────────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {})
    }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── Boot ─────────────────────────────────────────────────────
(async () => {
  if (token && me) {
    try {
      me = await api('/api/auth/me');
      localStorage.setItem('vr_me', JSON.stringify(me));
      showApp();
    } catch {
      logout();
    }
  } else {
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('auth').style.display = 'flex';
  }
})();

// ════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════

function showReg() {
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('reg-form').style.display   = 'block';
  document.getElementById('auth-title').textContent   = 'Create account';
}

function showLogin() {
  document.getElementById('reg-form').style.display   = 'none';
  document.getElementById('login-form').style.display = 'block';
  document.getElementById('auth-title').textContent   = 'Sign in to vResolve';
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  const err   = document.getElementById('login-err');
  const btn   = document.getElementById('login-btn');
  setBtn(btn, true, 'Signing in...');
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: pass })
    });
    token = data.token;
    me    = data.user;
    localStorage.setItem('vr_token', token);
    localStorage.setItem('vr_me', JSON.stringify(me));
    err.style.display = 'none';
    showApp();
  } catch (e) {
    err.textContent   = e.message;
    err.style.display = 'block';
  } finally {
    setBtn(btn, false, 'Sign in');
  }
}

async function doRegister() {
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-pass').value;
  const err   = document.getElementById('reg-err');
  const btn   = document.getElementById('reg-btn');
  setBtn(btn, true, 'Creating...');
  try {
    const data = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password: pass })
    });
    token = data.token;
    me    = data.user;
    localStorage.setItem('vr_token', token);
    localStorage.setItem('vr_me', JSON.stringify(me));
    err.style.display = 'none';
    showApp();
  } catch (e) {
    err.textContent   = e.message;
    err.style.display = 'block';
  } finally {
    setBtn(btn, false, 'Create account');
  }
}

function logout() {
  token = '';
  me    = null;
  localStorage.removeItem('vr_token');
  localStorage.removeItem('vr_me');
  Object.values(vaultPollMap).forEach(clearInterval);
  vaultPollMap = {};
  document.getElementById('app').style.display  = 'none';
  document.getElementById('auth').style.display = 'flex';
}

function showApp() {
  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById('auth').style.display           = 'none';
  document.getElementById('app').style.display            = 'flex';
  refreshUI();
  loadFeed();
  loadVault();
  initWellness();
}

function refreshUI() {
  const ini = me.initials || '?';
  ['top-av', 'feed-av', 'dd-av'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = ini;
  });
  document.getElementById('dd-name').textContent  = me.name;
  document.getElementById('dd-email').textContent = me.email;
  document.getElementById('wname').textContent    = me.name;
}

// ════════════════════════════════════════════════════════════
// DROPDOWN
// ════════════════════════════════════════════════════════════

function toggleDD() {
  const dd = document.getElementById('dd');
  dd.style.display = dd.style.display === 'block' ? 'none' : 'block';
}

document.addEventListener('click', e => {
  const dd = document.getElementById('dd');
  const av = document.getElementById('top-av');
  if (dd && !dd.contains(e.target) && av && !av.contains(e.target))
    dd.style.display = 'none';
});

// ════════════════════════════════════════════════════════════
// PROFILE MODAL
// ════════════════════════════════════════════════════════════

function openProfModal() {
  document.getElementById('dd').style.display     = 'none';
  document.getElementById('s-name').value         = me.name  || '';
  document.getElementById('s-bio').value          = me.bio   || '';
  document.getElementById('s-email').value        = me.email || '';
  document.getElementById('mav').textContent      = me.initials || '?';
  document.getElementById('prof-modal').style.display = 'flex';
}

function closeProfModal(e) {
  if (!e || e.target === document.getElementById('prof-modal'))
    document.getElementById('prof-modal').style.display = 'none';
}

async function saveProfile() {
  const name = document.getElementById('s-name').value.trim();
  const bio  = document.getElementById('s-bio').value.trim();
  try {
    await api('/api/auth/me', {
      method: 'PUT',
      body: JSON.stringify({ name, bio })
    });
    me = await api('/api/auth/me');
    localStorage.setItem('vr_me', JSON.stringify(me));
    refreshUI();
    document.getElementById('prof-modal').style.display = 'none';
    showToast('Profile updated ✓');
  } catch (e) {
    showToast('Update failed: ' + e.message);
  }
}

// ════════════════════════════════════════════════════════════
// TABS
// ════════════════════════════════════════════════════════════

function goTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tc').forEach(t  => t.classList.remove('active'));
  document.getElementById('tb-'  + name).classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
  document.getElementById('dd').style.display = 'none';
}

// ════════════════════════════════════════════════════════════
// FEED
// ════════════════════════════════════════════════════════════

function expandComposer() {
  document.getElementById('cph').style.display  = 'none';
  document.getElementById('cexp').style.display = 'block';
  document.getElementById('feed-inp').focus();
}

function handlePhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  const r  = new FileReader();
  r.onload = ev => {
    pendingImg = ev.target.result;
    document.getElementById('pp-img').src           = ev.target.result;
    document.getElementById('photo-preview').style.display = 'block';
  };
  r.readAsDataURL(file);
}

async function postFeed() {
  const txt = document.getElementById('feed-inp').value.trim();
  if (!txt && !pendingImg) return;
  const btn = document.getElementById('post-btn');
  setBtn(btn, true, 'Posting...');
  try {
    await api('/api/posts', {
      method: 'POST',
      body: JSON.stringify({ body: txt, img_url: pendingImg })
    });
    document.getElementById('feed-inp').value          = '';
    document.getElementById('cexp').style.display      = 'none';
    document.getElementById('cph').style.display       = 'block';
    document.getElementById('photo-preview').style.display = 'none';
    pendingImg = '';
    await loadFeed();
    showToast('Posted! 🎉');
  } catch (e) {
    showToast('Failed: ' + e.message);
  } finally {
    setBtn(btn, false, 'Post');
  }
}

async function loadFeed() {
  try {
    const posts = await api('/api/posts');
    const el    = document.getElementById('feed-posts');
    if (!posts.length) {
      el.innerHTML = '<div class="empty">No posts yet. Be the first! 🌟</div>';
      return;
    }
    el.innerHTML = posts.map(p => `
      <div class="pcard">
        <div class="ph">
          <div class="av" style="width:42px;height:42px;font-size:.82rem;flex-shrink:0">${p.initials || '?'}</div>
          <div>
            <div class="pname">${p.author || 'User'}</div>
            <div class="psub">${p.bio || ''} · ${fmtTime(p.created_at)}</div>
          </div>
        </div>
        ${p.body    ? `<div class="pbody">${p.body}</div>`              : ''}
        ${p.img_url ? `<img class="pimg" src="${p.img_url}" alt="post">` : ''}
        <div class="pacts">
          <button class="pact${p.liked ? ' liked' : ''}" onclick="likePost('${p.id}')">
            ♥ ${p.likes || 0}
          </button>
          <button class="pact">💬 Comment</button>
          <button class="pact">↗ Share</button>
        </div>
      </div>`).join('');
  } catch {
    document.getElementById('feed-posts').innerHTML = '<div class="empty">Failed to load posts.</div>';
  }
}

async function likePost(id) {
  try {
    await api(`/api/posts/${id}/like`, { method: 'POST' });
    await loadFeed();
  } catch {
    showToast('Like failed');
  }
}

// ════════════════════════════════════════════════════════════
// COMMUNITY VAULT
// ════════════════════════════════════════════════════════════

async function postVault() {
  const txt = document.getElementById('vault-inp').value.trim();
  if (!txt) return;
  const btn = document.getElementById('vault-btn');
  setBtn(btn, true, 'Sharing...');
  try {
    const post = await api('/api/vault', {
      method: 'POST',
      body: JSON.stringify({ body: txt })
    });
    document.getElementById('vault-inp').value = '';
    await loadVault();
    if (post.thinking) pollVaultPost(post.id);
  } catch (e) {
    showToast('Failed: ' + e.message);
  } finally {
    setBtn(btn, false, 'Share Anonymously');
  }
}

async function loadVault() {
  try {
    const posts = await api('/api/vault');
    renderVault(posts);
    posts.filter(p => p.thinking).forEach(p => pollVaultPost(p.id));
  } catch {
    document.getElementById('vault-posts').innerHTML = '<div class="empty">Failed to load.</div>';
  }
}

function renderVault(posts) {
  const el = document.getElementById('vault-posts');
  if (!posts.length) {
    el.innerHTML = '<div class="empty">No posts yet. Share anonymously 🔒</div>';
    return;
  }
  el.innerHTML = posts.map(p => `
    <div class="vpost" id="vp-${p.id}">
      <div class="ph">
        <div class="av" style="width:36px;height:36px;font-size:.72rem;background:#3a3a5e;flex-shrink:0">CM</div>
        <div>
          <div class="pname">Community Member</div>
          <div class="psub">${fmtTime(p.created_at)}</div>
        </div>
      </div>
      <div class="pbody">${p.body}</div>
      ${p.ai_reply
        ? `<div class="air"><div class="ail">✦ AI First Responder</div>${p.ai_reply}</div>`
        : ''}
      ${p.thinking
        ? `<div class="air" id="think-${p.id}">
             <div class="ail">✦ AI is responding...</div>
             <div class="aith">
               <div class="dot"></div>
               <div class="dot"></div>
               <div class="dot"></div>
             </div>
           </div>`
        : ''}
    </div>`).join('');
}

function pollVaultPost(id) {
  if (vaultPollMap[id]) return;
  vaultPollMap[id] = setInterval(async () => {
    try {
      const p = await api(`/api/vault/${id}`);
      if (!p.thinking) {
        clearInterval(vaultPollMap[id]);
        delete vaultPollMap[id];
        const think = document.getElementById(`think-${id}`);
        if (think)
          think.outerHTML = `<div class="air"><div class="ail">✦ AI First Responder</div>${p.ai_reply}</div>`;
      }
    } catch {
      clearInterval(vaultPollMap[id]);
      delete vaultPollMap[id];
    }
  }, 3000);
}

// ════════════════════════════════════════════════════════════
// WELLNESS
// ════════════════════════════════════════════════════════════

function wKey(k) { return `vr_w_${me?.id}_${k}`; }

function initWellness() {
  calC        = parseInt(localStorage.getItem(wKey('cal'))    || '0');
  calG        = parseInt(localStorage.getItem(wKey('goal'))   || '2000');
  weeklyData  = JSON.parse(localStorage.getItem(wKey('weekly')) || '[0,0,0,0,0,0,0]');
  document.getElementById('goal-inp').value = calG;
  updateCalUI();
  if (wChart) { wChart.destroy(); wChart = null; }
  initChart();
}

async function addCal() {
  const v = parseInt(document.getElementById('cal-inp').value);
  const g = parseInt(document.getElementById('goal-inp').value);
  if (g > 0) calG = g;
  if (v > 0) calC += v;
  document.getElementById('cal-inp').value = '';
  const day = new Date().getDay();
  weeklyData[day === 0 ? 6 : day - 1] = calC;
  localStorage.setItem(wKey('cal'),    calC);
  localStorage.setItem(wKey('goal'),   calG);
  localStorage.setItem(wKey('weekly'), JSON.stringify(weeklyData));
  try {
    await api('/api/wellness/calories', {
      method: 'POST',
      body: JSON.stringify({ cal_consumed: calC, cal_goal: calG })
    });
  } catch {}
  updateCalUI();
  updateChart();
}

function resetCal() {
  calC = 0;
  localStorage.setItem(wKey('cal'), 0);
  updateCalUI();
}

function updateCalUI() {
  document.getElementById('cal-c').textContent  = calC;
  document.getElementById('cal-g').textContent  = calG;
  document.getElementById('cal-pf').style.width = Math.min(100, Math.round(calC / calG * 100)) + '%';
  const rem = calG - calC;
  document.getElementById('cal-rem').textContent = rem > 0 ? `${rem} kcal remaining` : 'Goal reached! 🎉';
}

function setTmr(mins) {
  clearInterval(tInt);
  tRunning = false;
  tSecs    = tTotal = mins * 60;
  const tog = document.getElementById('t-tog');
  tog.textContent = 'Start';
  tog.classList.add('active');
  updTmr();
}

function togTmr() {
  if (tRunning) {
    clearInterval(tInt);
    tRunning = false;
    document.getElementById('t-tog').textContent = 'Resume';
  } else {
    if (tSecs <= 0) tSecs = tTotal;
    tRunning = true;
    document.getElementById('t-tog').textContent = 'Pause';
    tInt = setInterval(() => {
      tSecs--;
      updTmr();
      if (tSecs <= 0) {
        clearInterval(tInt);
        tRunning = false;
        document.getElementById('t-tog').textContent = 'Done ✓';
        showToast('Meditation complete 🧘');
      }
    }, 1000);
  }
}

function updTmr() {
  const m = Math.floor(tSecs / 60).toString().padStart(2, '0');
  const s = (tSecs % 60).toString().padStart(2, '0');
  document.getElementById('t-dsp').textContent  = `${m}:${s}`;
  document.getElementById('t-pf').style.width   = Math.round(tSecs / tTotal * 100) + '%';
}

function initChart() {
  const ctx = document.getElementById('wchart').getContext('2d');
  wChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{
        label: 'Calories',
        data: weeklyData,
        backgroundColor: 'rgba(124,106,247,0.7)',
        borderColor: 'rgba(124,106,247,1)',
        borderWidth: 1,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#8888aa', font: { size: 11 } } },
        x: { grid: { display: false },                 ticks: { color: '#8888aa', font: { size: 11 } } }
      }
    }
  });
}

function updateChart() {
  if (wChart) {
    wChart.data.datasets[0].data = [...weeklyData];
    wChart.update();
  }
}

// ════════════════════════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════════════════════════

function fmtTime(ts) {
  if (!ts) return 'just now';
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return Math.floor(diff / 60)   + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600)  + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent  = msg;
  t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 2500);
}

function setBtn(btn, disabled, text) {
  btn.disabled    = disabled;
  btn.textContent = text;
}