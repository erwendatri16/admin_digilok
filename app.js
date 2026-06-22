// ══════════════════════════════════════════════════════════
// SUPABASE CONFIG
// ══════════════════════════════════════════════════════════
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL  = 'https://ndtatoyctayebjszwvpz.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kdGF0b3ljdGF5ZWJqc3p3dnB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3OTUwNzIsImV4cCI6MjA5MzM3MTA3Mn0.eZ8ceZCDsNkIIKJZ6dWqY2TSPQB_7IziTXzkuf4VPpU';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ══════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════
let allUsers = [];
let allMentors = [];
let allInternships = [];
let assignTargetUserId = null;
let detailInternshipId = null;

// ══════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════
async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    showApp(session.user);
  }
}

window.doLogin = async () => {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-password').value;
  const btn   = document.getElementById('login-btn');
  const err   = document.getElementById('login-error');
  err.style.display = 'none';
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses…';

  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) {
    err.textContent = 'Login gagal: ' + (error.message === 'Invalid login credentials' ? 'Email atau password salah.' : error.message);
    err.style.display = 'block';
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-right-to-bracket"></i> Masuk ke Admin Panel';
    return;
  }

  // Cek apakah role = admin
  const { data: userData } = await sb.from('users').select('role').eq('id', data.user.id).maybeSingle();
  if (!userData || userData.role !== 'admin') {
    await sb.auth.signOut();
    err.textContent = 'Akses ditolak: Akun ini bukan admin.';
    err.style.display = 'block';
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-right-to-bracket"></i> Masuk ke Admin Panel';
    return;
  }

  showApp(data.user);
};

function showApp(user) {
  document.getElementById('login-screen').style.display = 'none';
  const label = user.email.split('@')[0];
  document.getElementById('topbar-email').textContent = user.email;
  document.getElementById('topbar-avatar').textContent = label[0].toUpperCase();
  window.navigate('dashboard');
}

window.doLogout = async () => {
  await sb.auth.signOut();
  location.reload();
};

// ══════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════
const pageLabels = {
  dashboard: 'Dashboard',
  users: 'Manajemen User',
  access: 'Kontrol Akses & Role',
  internship: 'Manajemen Magang',
};

window.navigate = (page) => {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.textContent.trim().toLowerCase().includes(pageLabels[page].toLowerCase().split(' ')[0].toLowerCase())) {
      n.classList.add('active');
    }
  });
  document.getElementById('topbar-title').textContent = pageLabels[page];
  window.closeSidebar();

  if (page === 'dashboard') loadDashboard();
  if (page === 'users') loadUsers();
  if (page === 'access') loadAccess();
  if (page === 'internship') window.loadInternship();
};

// ══════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════
async function loadDashboard() {
  const today = new Date().toISOString().slice(0, 10);

  const [usersRes, absensiRes, logbookRes, pendingRes] = await Promise.all([
    sb.from('users').select('role'),
    sb.from('absensi').select('id').eq('tanggal', today),
    sb.from('logbook').select('id').eq('tanggal', today),
    sb.from('internship_applications').select('id').eq('status', 'pending'),
  ]);

  const users = usersRes.data || [];
  const siswa = users.filter(u => u.role === 'user').length;
  const mentor = users.filter(u => u.role === 'mentor').length;

  document.getElementById('stat-users').textContent = siswa;
  document.getElementById('stat-mentors').textContent = mentor;
  document.getElementById('stat-absensi').textContent = (absensiRes.data || []).length;
  document.getElementById('stat-logbook').textContent = (logbookRes.data || []).length;
  document.getElementById('stat-pending').textContent = (pendingRes.data || []).length;

  window.loadAuditLogs();
}

window.loadAuditLogs = async () => {
  const el = document.getElementById('audit-log-list');
  el.innerHTML = '<div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Memuat log…</p></div>';

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await sb.from('audit_logs')
    .select('*').gte('created_at', today)
    .order('created_at', { ascending: false }).limit(60);

  if (error || !data?.length) {
    el.innerHTML = '<div class="empty"><i class="fas fa-list-ul"></i><p>Belum ada aktivitas tercatat hari ini.</p></div>';
    return;
  }

  el.innerHTML = data.map(log => {
    const time = (log.created_at || '').slice(11, 19);
    const aksi = log.aksi || 'LOG';
    let badgeCls = 'badge-blue';
    if (aksi.includes('HAPUS') || aksi.includes('BLOKIR')) badgeCls = 'badge-red';
    else if (aksi.includes('AKTIF') || aksi.includes('TAMBAH')) badgeCls = 'badge-green';
    else if (aksi.includes('UBAH') || aksi.includes('RESET')) badgeCls = 'badge-warn';
    return `<div class="log-entry">
      <span class="log-time">${time}</span>
      <span class="badge ${badgeCls}" style="flex-shrink:0;">${aksi}</span>
      <div class="log-detail"><strong>${log.detail || '—'}</strong> <span>· oleh ${log.admin_name || 'Admin'}</span></div>
    </div>`;
  }).join('');
};

// ══════════════════════════════════════════════════════════
// USERS
// ══════════════════════════════════════════════════════════
async function loadUsers() {
  const { data } = await sb.from('users').select('*').order('name');
  allUsers = data || [];
  renderUsers(allUsers);
}

window.filterUsers = () => {
  const q = document.getElementById('user-search').value.toLowerCase();
  renderUsers(allUsers.filter(u =>
    (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
  ));
};

function renderUsers(list) {
  const tb = document.getElementById('users-tbody');
  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="5"><div class="empty"><i class="fas fa-users-slash"></i><p>Tidak ada data.</p></div></td></tr>';
    return;
  }
  tb.innerHTML = list.map(u => {
    const roleBadge = u.role === 'admin' ? 'badge-purple' : u.role === 'mentor' ? 'badge-warn' : 'badge-blue';
    const statusBadge = u.is_active !== false ? 'badge-green' : 'badge-red';
    const statusText = u.is_active !== false ? 'Aktif' : 'Diblokir';
    return `<tr>
      <td><strong>${esc(u.name || '-')}</strong></td>
      <td style="color:var(--text-muted)">${esc(u.email || '-')}</td>
      <td><span class="badge ${roleBadge}">${u.role || 'user'}</span></td>
      <td><span class="badge ${statusBadge}">${statusText}</span></td>
      <td style="white-space:nowrap;">
        <button class="btn btn-warn" style="padding:6px 10px;font-size:12px;" onclick="openResetPass('${u.id}','${esc(u.name)}','${esc(u.email)}')">
          <i class="fas fa-key"></i> Reset
        </button>
        <button class="btn btn-danger" style="padding:6px 10px;font-size:12px;margin-left:6px;" onclick="deleteUser('${u.id}','${esc(u.name)}')">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    </tr>`;
  }).join('');
}

window.openAddUserModal = () => {
  document.getElementById('new-name').value = '';
  document.getElementById('new-email').value = '';
  document.getElementById('new-pass').value = '';
  window.openModal('modal-add-user');
};

window.addUser = async () => {
  const name  = document.getElementById('new-name').value.trim();
  const email = document.getElementById('new-email').value.trim();
  const pass  = document.getElementById('new-pass').value;
  const role  = document.getElementById('new-role').value;
  if (!name || !email || !pass) return window.showToast('Semua kolom wajib diisi!', 'error');

  const { data: authData, error } = await sb.auth.signUp({ email, password: pass });
  if (error) return window.showToast('Gagal: ' + error.message, 'error');

  await sb.from('users').insert({ id: authData.user.id, name, email, role, is_active: true });
  await insertAuditLog('TAMBAH USER', `Mendaftarkan user baru: ${name}`);
  window.closeModal('modal-add-user');
  window.showToast('User baru berhasil ditambahkan!');
  loadUsers();
};

window.openResetPass = (id, name, email) => {
  const np = prompt(`Reset password untuk ${name}\n(${email})\n\nMasukkan password baru (min. 6 karakter):`);
  if (!np || np.length < 6) { if (np !== null) window.showToast('Password minimal 6 karakter!', 'error'); return; }
  insertAuditLog('RESET PASSWORD', `Admin mereset password akun ${email} (${name})`);
  window.showToast(`Permintaan reset password untuk ${name} dicatat. Proses via Supabase Auth dashboard.`);
};

window.deleteUser = async (id, name) => {
  if (!confirm(`Hapus permanen user "${name}"? Tindakan ini tidak bisa dibatalkan.`)) return;
  const { error } = await sb.from('users').delete().eq('id', id);
  if (error) return window.showToast('Gagal menghapus: ' + error.message, 'error');
  await insertAuditLog('HAPUS USER', `Menghapus user ${name} dari master data`);
  window.showToast('User berhasil dihapus.');
  loadUsers();
};

// ══════════════════════════════════════════════════════════
// ACCESS CONTROL
// ══════════════════════════════════════════════════════════
async function loadAccess() {
  // Maintenance status
  const { data: maint } = await sb.from('system_settings').select('is_active').eq('id', 'maintenance_mode').maybeSingle();
  const isOn = maint?.is_active ?? false;
  document.getElementById('maintenance-toggle').checked = isOn;
  updateMaintenanceUI(isOn);

  // Users
  const { data } = await sb.from('users').select('*').order('name');
  allUsers = data || [];
  allMentors = allUsers.filter(u => u.role === 'mentor');
  renderAccess(allUsers);
}

window.filterAccess = () => {
  const q    = document.getElementById('access-search').value.toLowerCase();
  const role = document.getElementById('access-role-filter').value;
  renderAccess(allUsers.filter(u => {
    const nm = (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
    const rm = !role || u.role === role;
    return nm && rm;
  }));
};

function renderAccess(list) {
  const tb = document.getElementById('access-tbody');
  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="6"><div class="empty"><i class="fas fa-user-slash"></i><p>Tidak ada data.</p></div></td></tr>';
    return;
  }

  const mentorMap = {};
  allMentors.forEach(m => { mentorMap[m.id] = m.name; });

  tb.innerHTML = list.map(u => {
    const active = u.is_active !== false;
    const statusBadge = active ? 'badge-green' : 'badge-red';
    const roleBadge = u.role === 'admin' ? 'badge-purple' : u.role === 'mentor' ? 'badge-warn' : 'badge-blue';
    const mentorName = u.mentor_id ? (mentorMap[u.mentor_id] || 'Tersimpan') : '<span style="color:var(--text-dim)">—</span>';
    const roleOptions = ['user','mentor','admin'].map(r =>
      `<option value="${r}" ${u.role === r ? 'selected' : ''}>${r.charAt(0).toUpperCase()+r.slice(1)}</option>`
    ).join('');

    return `<tr>
      <td><strong>${esc(u.name || '-')}</strong><br/><span style="font-size:11px;color:var(--text-muted)">${esc(u.email || '')}</span></td>
      <td style="display:none">${esc(u.email || '')}</td>
      <td><select class="field" style="margin:0;padding:6px 10px;font-size:12px;" onchange="window.changeRole('${u.id}','${u.role}',this.value,'${esc(u.name)}')">${roleOptions}</select></td>
      <td>${u.role === 'user' ? `<button class="btn btn-accent" style="padding:5px 10px;font-size:11px;" onclick="window.openAssignMentor('${u.id}','${esc(u.name)}','${u.mentor_id||''}')"><i class="fas fa-link"></i> ${u.mentor_id ? 'Ganti' : 'Assign'}</button>` : mentorName}</td>
      <td><span class="badge ${statusBadge}">${active ? 'Aktif' : 'Blokir'}</span></td>
      <td>
        <button class="btn ${active ? 'btn-danger' : 'btn-accent'}" style="padding:6px 10px;font-size:12px;" onclick="window.toggleStatus('${u.id}',${active},'${esc(u.name)}')">
          <i class="fas fa-${active ? 'lock' : 'lock-open'}"></i> ${active ? 'Blokir' : 'Aktifkan'}
        </button>
      </td>
    </tr>`;
  }).join('');
}

window.changeRole = async (id, oldRole, newRole, name) => {
  if (oldRole === newRole) return;
  const { error } = await sb.from('users').update({ role: newRole }).eq('id', id);
  if (error) return window.showToast('Gagal ubah role: ' + error.message, 'error');
  await insertAuditLog('UBAH ROLE', `Mengubah role ${name} dari ${oldRole} → ${newRole}`);
  window.showToast(`Role ${name} diubah ke ${newRole}.`);
  loadAccess();
};

window.toggleStatus = async (id, current, name) => {
  const newStatus = !current;
  const { error } = await sb.from('users').update({ is_active: newStatus }).eq('id', id);
  if (error) return window.showToast('Gagal: ' + error.message, 'error');
  await insertAuditLog(newStatus ? 'STATUS: AKTIF' : 'STATUS: BLOKIR', `Mengubah status akses ${name}`);
  window.showToast(`Akses ${name} ${newStatus ? 'diaktifkan' : 'diblokir'}.`);
  loadAccess();
};

window.openAssignMentor = (userId, userName, currentMentorId) => {
  assignTargetUserId = userId;
  document.getElementById('assign-mentor-user-name').textContent = `Menugaskan mentor untuk: ${userName}`;
  const sel = document.getElementById('assign-mentor-select');
  sel.innerHTML = allMentors.length
    ? allMentors.map(m => `<option value="${m.id}" ${m.id === currentMentorId ? 'selected' : ''}>${esc(m.name)}</option>`).join('')
    : '<option disabled>Belum ada mentor di database</option>';
  window.openModal('modal-assign-mentor');
};

window.saveMentorAssign = async () => {
  const mentorId = document.getElementById('assign-mentor-select').value;
  if (!mentorId) return;
  const { error } = await sb.from('users').update({ mentor_id: mentorId }).eq('id', assignTargetUserId);
  if (error) return window.showToast('Gagal: ' + error.message, 'error');
  window.showToast('Mentor berhasil ditugaskan!');
  window.closeModal('modal-assign-mentor');
  loadAccess();
};

window.toggleMaintenance = async (val) => {
  const { error } = await sb.from('system_settings').update({ is_active: val }).eq('id', 'maintenance_mode');
  if (error) { window.showToast('Gagal update maintenance: ' + error.message, 'error'); return; }
  updateMaintenanceUI(val);
  await insertAuditLog('MAINTENANCE ' + (val ? 'ON' : 'OFF'), `Mode pemeliharaan ${val ? 'diaktifkan' : 'dinonaktifkan'}`);
  window.showToast(`Mode pemeliharaan ${val ? 'AKTIF — hanya admin bisa login.' : 'dinonaktifkan.'}`);
};

function updateMaintenanceUI(on) {
  const panel = document.getElementById('maintenance-panel');
  document.getElementById('maintenance-desc').textContent = on
    ? 'Aktif — hanya Admin yang bisa login ke sistem.'
    : 'Kunci akses login untuk semua kecuali Admin';
  panel.classList.toggle('off', !on);
  panel.style.borderColor = on ? 'var(--warn)' : 'var(--border)';
}

// ══════════════════════════════════════════════════════════
// INTERNSHIP
// ══════════════════════════════════════════════════════════
window.loadInternship = async () => {
  // Load quota
  const { data: settings } = await sb.from('internship_settings').select('max_quota').eq('id', 1).maybeSingle();
  document.getElementById('quota-input').value = settings?.max_quota ?? 20;

  // Load pengajuan
  const { data, error } = await sb.from('internship_applications').select('*').order('created_at', { ascending: false });
  if (error) {
    window.showToast('Gagal memuat data: ' + error.message, 'error');
    document.getElementById('internship-tbody').innerHTML =
      `<tr><td colspan="6"><div class="empty"><i class="fas fa-circle-exclamation"></i><p>Error: ${error.message}</p></div></td></tr>`;
    return;
  }
  allInternships = data || [];
  window.filterInternship();
};

window.filterInternship = () => {
  const status = document.getElementById('internship-status-filter').value;
  const filtered = status ? allInternships.filter(i => i.status === status) : allInternships;
  renderInternship(filtered);
};

function renderInternship(list) {
  const tb = document.getElementById('internship-tbody');
  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="6"><div class="empty"><i class="fas fa-inbox"></i><p>Tidak ada pengajuan ditemukan.</p></div></td></tr>';
    return;
  }

  tb.innerHTML = list.map(i => {
    const st = i.status || 'pending';
    const badge = st === 'diterima' ? 'badge-green' : st === 'ditolak' ? 'badge-red' : 'badge-warn';
    const stText = st === 'diterima' ? 'Diterima' : st === 'ditolak' ? 'Ditolak' : 'Pending';
    const tgl = i.created_at ? new Date(i.created_at).toLocaleDateString('id-ID') : '-';
    return `<tr>
      <td><span style="font-family:'JetBrains Mono',monospace;font-size:12px;">${esc(i.nomor_pengajuan || i.id?.slice(0,8) || '-')}</span></td>
      <td><strong>${esc(i.nama_lengkap || '-')}</strong></td>
      <td style="color:var(--text-muted)">${esc(i.asal_campus || '-')}</td>
      <td><span class="badge ${badge}">${stText}</span></td>
      <td style="color:var(--text-muted);font-size:12px;">${tgl}</td>
      <td>
        <button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;" onclick="window.openInternshipDetail('${i.id}')">
          <i class="fas fa-eye"></i> Detail
        </button>
      </td>
    </tr>`;
  }).join('');
}

window.saveQuota = async () => {
  const val = parseInt(document.getElementById('quota-input').value);
  if (isNaN(val) || val < 1) return window.showToast('Masukkan angka kuota yang valid (min. 1).', 'error');
  const { error } = await sb.from('internship_settings').upsert({ id: 1, max_quota: val, updated_at: new Date().toISOString() });
  if (error) return window.showToast('Gagal simpan kuota: ' + error.message, 'error');
  await insertAuditLog('UBAH KUOTA', `Kuota magang diubah menjadi ${val}`);
  window.showToast(`Kuota magang berhasil disimpan: ${val} peserta.`);
};

window.openInternshipDetail = (id) => {
  const item = allInternships.find(i => i.id === id);
  if (!item) return;
  detailInternshipId = id;

  const fmt = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' }) : '-';

  const fields = [
    ['No. Pengajuan', item.nomor_pengajuan],
    ['Nama Lengkap', item.nama_lengkap],
    ['Email', item.email],
    ['No. HP', item.no_hp],
    ['Asal Kampus/Instansi', item.asal_campus],
    ['Jurusan', item.jurusan],
    ['Periode Mulai', fmt(item.periode_mulai)],
    ['Periode Selesai', fmt(item.periode_selesai)],
    ['Status', item.status],
    ['Alasan Penolakan', item.alasan_penolakan],
    ['Direview oleh', item.reviewed_by],
    ['Tanggal Review', fmt(item.reviewed_at)],
  ].filter(([, v]) => v);

  const docs = [
    ['Surat Pengantar', item.url_surat_pengantar],
    ['KTM', item.url_ktm],
    ['CV', item.url_cv],
    ['Surat Balasan', item.url_surat_balasan],
  ].filter(([, v]) => v);

  let docsHtml = '';
  if (docs.length) {
    docsHtml = `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">
      <div style="font-size:11px;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px;">Dokumen Terlampir</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${docs.map(([label, url]) =>
          `<a href="${url}" target="_blank" class="btn btn-ghost" style="padding:5px 10px;font-size:12px;text-decoration:none;">
            <i class="fas fa-file-arrow-down"></i> ${label}
          </a>`
        ).join('')}
      </div>
    </div>`;
  }

  document.getElementById('internship-detail-content').innerHTML =
    fields.map(([k, v]) =>
      `<div style="display:flex;gap:12px;padding:5px 0;border-bottom:1px solid var(--border);">
        <span style="min-width:160px;color:var(--text-dim);font-size:12px;font-weight:600;text-transform:uppercase;flex-shrink:0;">${k}</span>
        <span style="color:var(--text)">${esc(String(v))}</span>
      </div>`
    ).join('') + docsHtml;

  const actions = document.getElementById('internship-detail-actions');
  const st = item.status || 'pending';
  actions.innerHTML = `
    <button class="btn btn-ghost" onclick="window.closeModal('modal-internship-detail')">Tutup</button>
    ${st !== 'diterima' ? `<button class="btn btn-accent" onclick="window.updateInternshipStatus('${id}','diterima')"><i class="fas fa-check"></i> Terima</button>` : ''}
    ${st !== 'ditolak' ? `<button class="btn btn-danger" onclick="window.promptRejectInternship('${id}')"><i class="fas fa-xmark"></i> Tolak</button>` : ''}
  `;
  window.openModal('modal-internship-detail');
};

window.promptRejectInternship = (id) => {
  const item = allInternships.find(i => i.id === id);
  detailInternshipId = id;
  document.getElementById('reject-modal-name').textContent = 'Pengajuan: ' + (item?.nama_lengkap || id);
  document.getElementById('reject-alasan').value = '';
  window.openModal('modal-reject');
};

window.submitReject = async () => {
  const alasan = document.getElementById('reject-alasan').value.trim();
  if (!alasan) { window.showToast('Alasan penolakan wajib diisi!', 'error'); return; }
  window.closeModal('modal-reject');
  await window.updateInternshipStatus(detailInternshipId, 'ditolak', alasan);
};

window.updateInternshipStatus = async (id, status, alasan = null) => {
  const { data: { user } } = await sb.auth.getUser();
  const payload = {
    status,
    reviewed_by: user?.id,
    reviewed_at: new Date().toISOString(),
  };
  if (alasan) payload.alasan_penolakan = alasan;

  const { error } = await sb.from('internship_applications').update(payload).eq('id', id);
  if (error) return window.showToast('Gagal: ' + error.message, 'error');

  const item = allInternships.find(i => i.id === id);
  const label = status === 'diterima' ? 'Diterima' : 'Ditolak';
  await insertAuditLog(`MAGANG: ${label.toUpperCase()}`, `Pengajuan ${item?.nomor_pengajuan || id} — ${label}`);
  window.showToast(`Pengajuan magang berhasil ${label.toLowerCase()}.`);
  window.closeModal('modal-internship-detail');
  window.loadInternship();
};

// ══════════════════════════════════════════════════════════
// HELPERS & MODAL MANIPULATION
// ══════════════════════════════════════════════════════════
async function insertAuditLog(aksi, detail) {
  try {
    const { data: { user } } = await sb.auth.getUser();
    await sb.from('audit_logs').insert({
      admin_id: user?.id,
      admin_name: user?.email?.split('@')[0] || 'Admin',
      aksi,
      detail,
    });
  } catch (e) { console.warn('audit log gagal:', e); }
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let toastTimer;
window.showToast = (msg, type = 'success') => {
  const el = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  el.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 3500);
};

window.openModal  = id => document.getElementById(id).classList.remove('hidden');
window.closeModal = id => document.getElementById(id).classList.add('hidden');

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.add('hidden'); });
});

window.toggleSidebar = () => {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('backdrop').classList.toggle('show');
};
window.closeSidebar = () => {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('backdrop').classList.remove('show');
};

// Nav item active state binding
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    if (!this.classList.contains('danger')) this.classList.add('active');
  });
});

// ══════════════════════════════════════════════════════════
// THEME TOGGLE
// ══════════════════════════════════════════════════════════
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('digilok-theme', theme);
  const icon = document.getElementById('theme-icon');
  if (icon) {
    icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
  }
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.title = theme === 'light' ? 'Mode Gelap' : 'Mode Terang';
  }
}

window.toggleTheme = () => {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
};

// Load saved theme
const savedTheme = localStorage.getItem('digilok-theme') || 'dark';
applyTheme(savedTheme);

// Run authentication state checks
init();