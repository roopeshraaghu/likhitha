// DATA
let users = JSON.parse(localStorage.getItem('vr_users') || '[]');
let currentUser = null;
const geminiKey = 'AIzaSyCJ0dD7iFTXNaOd-SRXuQ3fFLHy8UCoJnc';
let feedPosts = [
  {id:1,author:'Arjun K',initials:'AK',sub:'Mindfulness guide',body:'Showing up every day is what matters. 🌿',likes:12,liked:false,time:'2h ago',img:''},
  {id:2,author:'Priya M',initials:'PM',sub:'Wellness Advocate',body:'Small rituals lead to massive change.',likes:7,liked:false,time:'4h ago',img:''}
];
let vaultPosts = [
  {id:1,body:'Feeling stuck with career pressure',aiReply:'Lord Krishna says in Chapter 2, Verse 47: "You have a right to perform your prescribed duties, but you are not entitled to the fruits of action." Focus on effort, not outcome.',time:'1h ago'}
];
let calConsumed = 0, calGoal = 2000;
let weeklyData = [1800,2100,1650,2300,1950,0,0];
let timerSecs = 300, timerTotal = 300, timerRunning = false, timerInterval = null;
let weeklyChart = null;
let pendingPostImg = '';

// AUTH
function showRegister() {
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'block';
  document.getElementById('auth-title').textContent = 'Create account';
}
function showLogin() {
  document.getElementById('register-form').style.display = 'none';
  document.getElementById('login-form').style.display = 'block';
  document.getElementById('auth-title').textContent = 'Sign in to vResolve';
}
function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value;
  const user = users.find(u => u.email === email && u.pass === pass);
  if (!user) {
    document.getElementById('login-error').style.display = 'block';
    return;
  }
  document.getElementById('login-error').style.display = 'none';
  currentUser = user;
  launchApp();
}
function doRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass = document.getElementById('reg-pass').value;
  if (!name || !email || !pass) {
    document.getElementById('reg-error').textContent = 'All fields required';
    document.getElementById('reg-error').style.display = 'block';
    return;
  }
  if (pass.length < 6) {
    document.getElementById('reg-error').textContent = 'Password min 6 chars';
    document.getElementById('reg-error').style.display = 'block';
    return;
  }
  if (users.find(u => u.email === email)) {
    document.getElementById('reg-error').textContent = 'Email already exists';
    document.getElementById('reg-error').style.display = 'block';
    return;
  }
  const newUser = {
    name, email, pass,
    initials: name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2),
    bio: '', avatar: ''
  };
  users.push(newUser);
  localStorage.setItem('vr_users', JSON.stringify(users));
  currentUser = newUser;
  launchApp();
}
function launchApp() {
  document.getElementById('auth').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  refreshUserUI();
  renderFeed();
  renderVault();
  initWellness();
}
function doLogout() {
  currentUser = null;
  document.getElementById('auth').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  closeDropdown();
}

// UI helpers
function refreshUserUI() {
    // Top bar avatar & dropdown
    setAvatarEl(document.getElementById('topbar-avatar'), currentUser);
    setAvatarEl(document.getElementById('dd-avatar'), currentUser);
    const ddName = document.getElementById('dd-name');
    if (ddName) ddName.textContent = currentUser.name;
    const ddEmail = document.getElementById('dd-email');
    if (ddEmail) ddEmail.textContent = currentUser.email;
    const feedWelcome = document.getElementById('feed-welcome-name');
    if (feedWelcome) feedWelcome.textContent = currentUser.name;

    // Feed composer avatar
    setAvatarEl(document.getElementById('feed-avatar'), currentUser);

    // LEFT SIDEBAR (profile card) – safely update if elements exist
    const leftAvatar = document.getElementById('feed-left-avatar');
    if (leftAvatar) {
        if (currentUser.avatar) leftAvatar.innerHTML = `<img src="${currentUser.avatar}">`;
        else leftAvatar.textContent = currentUser.initials;
    }
    const leftName = document.getElementById('feed-left-name');
    if (leftName) leftName.textContent = currentUser.name;
    const leftBio = document.getElementById('feed-left-bio');
    if (leftBio) leftBio.textContent = currentUser.bio || 'Wellness explorer';
}
function setAvatarEl(el, u) {
  if (u.avatar) el.innerHTML = `<img src="${u.avatar}" alt="avatar">`;
  else el.textContent = u.initials;
}
function toggleDropdown() {
  const dd = document.getElementById('user-dropdown');
  dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}
function closeDropdown() { document.getElementById('user-dropdown').style.display = 'none'; }
document.addEventListener('click', (e) => {
  const dd = document.getElementById('user-dropdown');
  const av = document.getElementById('topbar-avatar');
  if (dd && !dd.contains(e.target) && !av.contains(e.target)) dd.style.display = 'none';
});

// Profile modal
function openProfileModal() {
  closeDropdown();
  document.getElementById('settings-name').value = currentUser.name;
  document.getElementById('settings-bio').value = currentUser.bio || '';
  document.getElementById('settings-email').value = currentUser.email;
  document.getElementById('settings-pass').value = '';
  const av = document.getElementById('modal-avatar-preview');
  av.innerHTML = `<span id="modal-avatar-initials">${currentUser.initials}</span><div class="modal-avatar-overlay">change photo</div>`;
  if (currentUser.avatar) av.innerHTML = `<img src="${currentUser.avatar}"><div class="modal-avatar-overlay">change photo</div>`;
  document.getElementById('profile-modal').style.display = 'flex';
}
function closeProfileModal(e) {
  if (!e || e.target === document.getElementById('profile-modal'))
    document.getElementById('profile-modal').style.display = 'none';
}
function handleAvatarUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    currentUser.avatar = ev.target.result;
    const idx = users.findIndex(u => u.email === currentUser.email);
    if (idx !== -1) users[idx] = currentUser;
    localStorage.setItem('vr_users', JSON.stringify(users));
    refreshUserUI();
    openProfileModal();
  };
  reader.readAsDataURL(file);
}
function saveProfile() {
  currentUser.name = document.getElementById('settings-name').value.trim();
  currentUser.bio = document.getElementById('settings-bio').value.trim();
  currentUser.email = document.getElementById('settings-email').value.trim();
  const newPass = document.getElementById('settings-pass').value;
  if (newPass.length >= 6) currentUser.pass = newPass;
  currentUser.initials = currentUser.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
  const idx = users.findIndex(u => u.email === currentUser.email);
  if (idx !== -1) users[idx] = currentUser;
  localStorage.setItem('vr_users', JSON.stringify(users));
  refreshUserUI();
  closeProfileModal();
}

// Tabs
function switchTabByName(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-btn-${name}`).classList.add('active');
  document.getElementById(`tab-${name}`).classList.add('active');
}

// Feed
function expandComposer() {
  document.getElementById('composer-placeholder').style.display = 'none';
  document.getElementById('composer-expanded').style.display = 'block';
  document.getElementById('feed-input').focus();
}
function handlePostPhoto(e) {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = ev => {
      pendingPostImg = ev.target.result;
      document.getElementById('photo-preview-img').src = ev.target.result;
      document.getElementById('photo-preview').style.display = 'block';
    };
    reader.readAsDataURL(file);
  }
}
function postFeed() {
  const txt = document.getElementById('feed-input').value.trim();
  if (!txt && !pendingPostImg) return;
  feedPosts.push({
    id: Date.now(),
    author: currentUser.name,
    initials: currentUser.initials,
    avatar: currentUser.avatar || '',
    sub: currentUser.bio || 'Community voice',
    body: txt,
    likes: 0,
    liked: false,
    time: 'just now',
    img: pendingPostImg
  });
  document.getElementById('feed-input').value = '';
  document.getElementById('composer-expanded').style.display = 'none';
  document.getElementById('composer-placeholder').style.display = 'block';
  document.getElementById('photo-preview').style.display = 'none';
  pendingPostImg = '';
  renderFeed();
}
function renderFeed() {
  const container = document.getElementById('feed-posts');
  container.innerHTML = feedPosts.slice().reverse().map(p => `
    <div class="post-card">
      <div class="post-header">
        <div class="avatar" style="width:44px;height:44px;">${p.avatar ? `<img src="${p.avatar}">` : p.initials}</div>
        <div class="post-meta"><div class="post-name">${p.author}</div><div class="post-sub">${p.sub || ''} · ${p.time}</div></div>
      </div>
      <div class="post-body">${p.body}</div>
      ${p.img ? `<img class="post-img" src="${p.img}">` : ''}
      <div class="post-actions"><button class="post-action" onclick="likePost(${p.id})">♥ ${p.likes}</button><button class="post-action">💬</button><button class="post-action">↗</button></div>
    </div>
  `).join('');
}
function likePost(id) {
  const post = feedPosts.find(p => p.id === id);
  if (post) {
    post.liked = !post.liked;
    post.likes += post.liked ? 1 : -1;
    renderFeed();
  }
}

// Vault
function renderVault() {
  const container = document.getElementById('vault-posts');
  container.innerHTML = vaultPosts.slice().reverse().map(p => `
    <div class="vault-post">
      <div><div style="display:flex; align-items:center; gap:0.5rem;"><div class="avatar" style="width:32px;height:32px; background:#3a2e5c;">CM</div><div><span class="post-name">Community Member</span><div style="font-size:0.7rem; color:var(--text-secondary);">${p.time}</div></div></div>
      <div style="margin:0.7rem 0;">${p.body}</div>
      ${p.aiReply ? `<div class="ai-response"><div class="ai-label">✦ AI First Responder</div>${p.aiReply}</div>` : ''}
      ${p.thinking ? `<div class="ai-response"><div class="ai-label">✦ AI thinking ...</div><div class="ai-thinking"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div>` : ''}
    </div>
  `).join('');
}
async function postVault() {
  const txt = document.getElementById('vault-input').value.trim();
  if (!txt) return;
  const post = { id: Date.now(), body: txt, aiReply: '', thinking: true, time: 'just now' };
  vaultPosts.push(post);
  document.getElementById('vault-input').value = '';
  renderVault();
  const reply = await getAIReply(txt);
  post.thinking = false;
  post.aiReply = reply;
  renderVault();
}
async function getAIReply(msg) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: `You are a wise compassionate guide. Respond with wisdom (reference Bhagavad Gita if appropriate). Keep under 110 words.\nUser says: ${msg}` }] }] })
    });
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "The Gita says: Steadiness of mind is the path to peace.";
  } catch(e) {
    return "Lord Krishna reminds us: 'You have the right to work, but never to its fruits.' (Chapter 2, Verse 47) – focus on your present step.";
  }
}

// Wellness
function initWellness() {
  updateCalUI();
  if (!weeklyChart) {
    const ctx = document.getElementById('weekly-chart').getContext('2d');
    weeklyChart = new Chart(ctx, {
      type: 'bar',
      data: { labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], datasets: [{ label: 'Calories', data: weeklyData, backgroundColor: '#8b5cf6', borderRadius: 8 }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { grid: { color: 'rgba(255,255,255,0.1)' } } } }
    });
  }
}
function addCalories() {
  let v = parseInt(document.getElementById('cal-input').value);
  let g = parseInt(document.getElementById('cal-goal-input')?.value);
  if (!isNaN(g) && g > 0) calGoal = g;
  if (!isNaN(v) && v > 0) calConsumed += v;
  const day = new Date().getDay();
  weeklyData[day === 0 ? 6 : day-1] = calConsumed;
  updateCalUI();
  if (weeklyChart) weeklyChart.update();
}
function resetCalories() {
  calConsumed = 0;
  updateCalUI();
}
function updateCalUI() {
  document.getElementById('cal-consumed').textContent = calConsumed;
  document.getElementById('cal-goal').textContent = calGoal;
  const pct = Math.min(100, Math.round((calConsumed / calGoal) * 100));
  document.getElementById('cal-progress').style.width = pct + '%';
}
function setTimer(mins) {
  clearInterval(timerInterval);
  timerRunning = false;
  timerSecs = timerTotal = mins * 60;
  document.getElementById('timer-toggle').textContent = 'Start';
  updateTimerUI();
}
function toggleTimer() {
  if (timerRunning) {
    clearInterval(timerInterval);
    timerRunning = false;
    document.getElementById('timer-toggle').textContent = 'Resume';
  } else {
    if (timerSecs <= 0) timerSecs = timerTotal;
    timerRunning = true;
    document.getElementById('timer-toggle').textContent = 'Pause';
    timerInterval = setInterval(() => {
      timerSecs--;
      updateTimerUI();
      if (timerSecs <= 0) {
        clearInterval(timerInterval);
        timerRunning = false;
        document.getElementById('timer-toggle').textContent = 'Done ✓';
      }
    }, 1000);
  }
}
function updateTimerUI() {
  const mins = Math.floor(timerSecs / 60).toString().padStart(2,'0');
  const secs = (timerSecs % 60).toString().padStart(2,'0');
  document.getElementById('timer-display').textContent = `${mins}:${secs}`;
  const percent = Math.round((timerSecs / timerTotal) * 100);
  document.getElementById('timer-progress').style.width = percent + '%';
}