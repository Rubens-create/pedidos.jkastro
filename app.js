// ===== CONFIG =====
const SUPABASE_URL = 'https://bclsxvnunxoadusnarju.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjbHN4dm51bnhvYWR1c25hcmp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTY2MzAsImV4cCI6MjA5MDQ3MjYzMH0.F6pSJUYkRMqxZ2FeiHvjxvLTzDoNlPyw5s4D78mxW2w';
const TABLE = 'print_jobs';
const SCHEMA = 'jkastro';

// ===== DOM REFS =====
const $ = (sel) => document.querySelector(sel);
const loadingState = $('#loadingState');
const emptyState = $('#emptyState');
const errorState = $('#errorState');
const errorText = $('#errorText');
const ordersContainer = $('#ordersContainer');
const btnRefresh = $('#btnRefresh');
const btnRetry = $('#btnRetry');
const statTotal = $('#statTotal');
const statToday = $('#statToday');
const searchInput = $('#searchInput');

const editModal = $('#editModal');
const editForm = $('#editForm');
const editId = $('#editId');
const editCliente = $('#editCliente');
const editNumero = $('#editNumero');
const editProdutos = $('#editProdutos');
const editObservacao = $('#editObservacao');
const modalClose = $('#modalClose');
const modalCancel = $('#modalCancel');

const toast = $('#toast');
const toastText = $('#toastText');

// ===== HEADERS HELPER =====
const getHeaders = (method = 'GET') => {
  const h = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Accept-Profile': SCHEMA
  };
  if (method !== 'GET') {
    h['Content-Profile'] = SCHEMA;
    h['Prefer'] = 'return=representation';
  }
  return h;
};

// ===== API CALLS =====
async function fetchOrders() {
  const url = `${SUPABASE_URL}/rest/v1/${TABLE}?select=*&order=created_at.desc`;
  const res = await fetch(url, { headers: getHeaders('GET') });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || `Erro ${res.status}`);
  }
  return res.json();
}

async function updateOrder(id, conteudo) {
  const url = `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${id}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: getHeaders('PATCH'),
    body: JSON.stringify({
      conteudo: JSON.stringify(conteudo),
      status: 'edited'
    })
  });
  if (!res.ok) throw new Error(`Erro ao atualizar: ${res.status}`);
  return res.json();
}

async function completeOrder(id) {
  const url = `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${id}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: getHeaders('PATCH'),
    body: JSON.stringify({ status: 'completed' })
  });
  if (!res.ok) throw new Error(`Erro ao concluir: ${res.status}`);
  return res.json();
}

// ===== STATE =====
let allOrders = [];
let currentQuery = localStorage.getItem('jk_search') || '';

// ===== SCROLL PERSISTENCE =====
let scrollState = {
  windowY: 0,
  rows: {} // dateKey -> scrollLeft
};

function saveScrollState() {
  scrollState.windowY = window.scrollY;
  document.querySelectorAll('.orders-row').forEach(row => {
    const key = row.dataset.key;
    if (key) scrollState.rows[key] = row.scrollLeft;
  });
}

function restoreScrollState() {
  window.scrollTo(0, scrollState.windowY);
  document.querySelectorAll('.orders-row').forEach(row => {
    const key = row.dataset.key;
    if (key && scrollState.rows[key]) {
      row.scrollLeft = scrollState.rows[key];
    }
  });
}

// ===== DATE UTILS (BRASIL) =====
const todayStr = () => {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); // retorna AAAA-MM-DD
};

const formatDateLabel = (s) => s.split('-').reverse().join('/');

const normalizeIso = (iso) => {
  let dateStr = String(iso).trim();
  if (dateStr.includes(' ') && !dateStr.includes('T')) {
    dateStr = dateStr.replace(' ', 'T');
  }
  const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(dateStr);
  if (!hasTz) {
    dateStr += 'Z';
  }
  return dateStr;
};

const getDateKey = (iso) => {
  const dateStr = normalizeIso(iso);
  return new Date(dateStr).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
};

const formatTime = (iso) => {
  if (!iso) return '--:--';
  // Garante que a string seja tratada como UTC (adiciona Z se não houver fuso)
  const date = new Date(normalizeIso(iso));
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo'
  });
};

// ===== PARSE CONTEUDO =====
function parseConteudo(raw) {
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      cliente: obj.cliente || 'Sem nome',
      numero: obj.numero || '',
      produtos: Array.isArray(obj.produtos) ? obj.produtos : [],
      observacao: obj.observacao || ''
    };
  } catch (e) {
    return { cliente: 'Erro de dados', numero: '', produtos: [], observacao: String(raw) };
  }
}

function formatPhone(num) {
  if (!num) return '';
  const raw = num.replace(/\D/g, '');
  let d = raw;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) {
    d = d.slice(2);
  }
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return num;
}

// ===== RENDER =====
function updateStats(orders) {
  const today = todayStr();
  statTotal.textContent = orders.length;
  statToday.textContent = orders.filter(o => getDateKey(o.created_at) === today).length;
}

function renderView(orders) {
  const today = todayStr();

  if (orders.length === 0) {
    ordersContainer.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  ordersContainer.classList.remove('hidden');

  const pendingOrders = orders.filter(o => o.status !== 'completed');
  const completedOrders = orders.filter(o => o.status === 'completed');

  const groups = {};
  pendingOrders.forEach(o => {
    const key = getDateKey(o.created_at);
    if (!groups[key]) groups[key] = [];
    groups[key].push(o);
  });

  const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  const pendingHtml = sortedKeys.map(key => {
    const isToday = key === today;
    return `
      <section class="date-section">
        <div class="date-header">
          <span class="date-badge ${isToday ? 'date-badge--today' : ''}">
            <i data-lucide="${isToday ? 'calendar-check' : 'calendar'}" class="date-badge-icon"></i>
            ${isToday ? 'Hoje' : formatDateLabel(key)}
          </span>
          <span class="date-count">${groups[key].length} pedidos</span>
        </div>
        <div class="orders-row-wrapper">
          <button class="scroll-btn scroll-btn--left" onclick="scrollRow(this, -1)">
            <i data-lucide="chevron-left" class="scroll-btn-icon"></i>
          </button>
          <div class="orders-row" data-key="${key}">
            ${groups[key].map(o => renderCard(o)).join('')}
          </div>
          <button class="scroll-btn scroll-btn--right" onclick="scrollRow(this, 1)">
            <i data-lucide="chevron-right" class="scroll-btn-icon"></i>
          </button>
        </div>
      </section>`;
  }).join('');

  const completedHtml = completedOrders.length ? `
    <section class="date-section date-section--completed">
      <div class="date-header">
        <span class="date-badge date-badge--completed">
          <i data-lucide="check-circle-2" class="date-badge-icon"></i>
          Concluidos
        </span>
        <span class="date-count">${completedOrders.length} pedidos</span>
      </div>
      <div class="orders-row-wrapper">
        <button class="scroll-btn scroll-btn--left" onclick="scrollRow(this, -1)">
          <i data-lucide="chevron-left" class="scroll-btn-icon"></i>
        </button>
        <div class="orders-row" data-key="completed">
          ${completedOrders.map(o => renderCard(o)).join('')}
        </div>
        <button class="scroll-btn scroll-btn--right" onclick="scrollRow(this, 1)">
          <i data-lucide="chevron-right" class="scroll-btn-icon"></i>
        </button>
      </div>
    </section>` : '';

  ordersContainer.innerHTML = pendingHtml + completedHtml;

  lucide.createIcons();
  bindCardEvents();
  restoreScrollState();
}

function applySearch() {
  const q = currentQuery.trim().toLowerCase();
  if (!q) {
    renderView(allOrders);
    return;
  }
  const qDigits = q.replace(/\D/g, '');
  const filtered = allOrders.filter(o => {
    const c = parseConteudo(o.conteudo);
    const name = String(c.cliente || '').toLowerCase();
    const digits = String(c.numero || '').replace(/\D/g, '');
    if (name.includes(q)) return true;
    if (qDigits && digits.includes(qDigits)) return true;
    return false;
  });
  localStorage.setItem('jk_search', q);
  renderView(filtered);
}

function setOrders(orders) {
  allOrders = orders;
  updateStats(orders);
  applySearch();
}

// Lógica de Scroll
window.scrollRow = (btn, direction) => {
  const row = btn.parentElement.querySelector('.orders-row');
  const scrollAmount = 350 * direction;
  row.scrollBy({ left: scrollAmount, behavior: 'smooth' });
};

function renderCard(order) {
  const c = parseConteudo(order.conteudo);
  const time = formatTime(order.created_at);
  const phone = formatPhone(c.numero);
  const isEdited = order.status === 'edited';
  const isCompleted = order.status === 'completed';

  return `
    <article class="card ${isCompleted ? 'card--completed' : ''}">
      <div class="card-top">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="card-number-badge">#${order.id}</span>
          ${isCompleted ? '<span class="badge-completed">CONCLUIDO</span>' : ''}
          ${isEdited ? '<span class="badge-edited">EDITADO</span>' : ''}
        </div>
        <div class="card-top-actions">
          <button class="card-complete" data-action="complete" data-id="${order.id}" title="Concluir pedido" ${isCompleted ? 'disabled' : ''}><i data-lucide="check"></i></button>
          <button class="card-edit" data-action="edit" data-id="${order.id}"><i data-lucide="pencil"></i></button>
        </div>
      </div>
      <div class="card-body">
        <div class="card-client"><i data-lucide="user" class="card-client-icon"></i> ${escapeHtml(c.cliente)}</div>
        ${phone ? `<div class="card-phone"><i data-lucide="phone"></i> ${phone}</div>` : ''}
        <hr class="card-divider" />
        <ul class="card-products">${c.produtos.map(p => `<li><span class="product-bullet"></span>${escapeHtml(p)}</li>`).join('')}</ul>
        ${c.observacao ? `<div class="card-obs">${escapeHtml(c.observacao)}</div>` : ''}
        <div class="card-time"><i data-lucide="clock"></i> ${time}</div>
      </div>
      <div class="card-actions">
        <button class="card-action" data-action="copy" data-id="${order.id}"><i data-lucide="copy"></i> Copiar</button>
        <button class="card-action" data-action="print" data-id="${order.id}"><i data-lucide="printer"></i> Imprimir</button>
      </div>
    </article>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== EVENTS =====
function bindCardEvents() {
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.onclick = () => {
      const action = btn.dataset.action;
      const id = Number(btn.dataset.id);
      if (action === 'copy') handleCopy(id);
      if (action === 'print') handlePrint(id);
      if (action === 'edit') handleEdit(id);
      if (action === 'complete') handleComplete(id);
    };
  });
}

async function handleComplete(id) {
  const o = allOrders.find(x => x.id === id);
  if (!o || o.status === 'completed') return;
  try {
    await completeOrder(id);
    showToast('Pedido concluido!');
    loadOrders(true);
  } catch (e) {
    showToast('Erro ao concluir pedido');
  }
}

function handleCopy(id) {
  const o = allOrders.find(x => x.id === id);
  if (!o) return;
  const c = parseConteudo(o.conteudo);
  const phone = formatPhone(c.numero);
  const text = [`Cliente: ${c.cliente}`, phone ? `Tel: ${phone}` : '', '', 'Produtos:', ...c.produtos.map(p => `- ${p}`), '', `Obs: ${c.observacao || '-'}`].filter(Boolean).join('\n');
  navigator.clipboard.writeText(text).then(() => showToast('Copiado!'));
}

function handlePrint(id) {
  const o = allOrders.find(x => x.id === id);
  if (!o) return;
  const c = parseConteudo(o.conteudo);
  const phone = formatPhone(c.numero);
  const time = formatTime(o.created_at);
  const obs = c.observacao && c.observacao.trim() !== "" ? c.observacao : "-";
  const html = `<html><head><style>@page{margin:0}body{font-family:monospace;width:72mm;padding:5mm;font-size:14px;line-height:1.4}.text-center{text-align:center}.bold{font-weight:bold}.large{font-size:22px;font-weight:bold}.divider{margin:10px 0;border-top:1px dashed #000}.item{margin:10px 0}</style></head><body><div class="text-center large">PEDIDO</div><div class="divider"></div><div><span class="bold">CLIENTE:</span> ${c.cliente.toUpperCase()}</div><div><span class="bold">NUMERO:</span> ${phone || "-"}</div><div class="divider"></div><div class="bold">PRODUTOS:</div>${c.produtos.map(p => `<div class="item">- ${p}</div>`).join('')}<div class="divider"></div><div class="bold">OBSERVACAO:</div><div>${obs}</div><div class="divider"></div><div class="text-center" style="font-size:10px">ID: #${o.id} | ${time} | JKASTRO</div></body></html>`;
  const frame = document.getElementById('printFrame');
  const doc = frame.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => { frame.contentWindow.focus(); frame.contentWindow.print(); }, 300);
}

function handleEdit(id) {
  stopAutoRefresh();
  const o = allOrders.find(x => x.id === id);
  const c = parseConteudo(o.conteudo);
  const time = formatTime(o.created_at);
  
  // Atualiza título do modal com a hora
  $('.modal-title').innerHTML = `<i data-lucide="pencil"></i> Editar Pedido <span style="font-size:0.7rem; color:var(--text-muted); margin-left:8px;">(Feito às ${time})</span>`;
  lucide.createIcons();

  editId.value = id;
  editCliente.value = c.cliente;
  editNumero.value = c.numero;
  editProdutos.value = c.produtos.join('\n');
  editObservacao.value = c.observacao;
  editModal.classList.remove('hidden');
}

editForm.onsubmit = async (e) => {
  e.preventDefault();
  const id = Number(editId.value);
  const conteudo = {
    cliente: editCliente.value,
    numero: editNumero.value,
    produtos: editProdutos.value.split('\n').filter(p => p.trim()),
    observacao: editObservacao.value
  };
  try {
    await updateOrder(id, conteudo);
    closeModal();
    showToast('Atualizado!');
    loadOrders();
  } catch (e) { showToast('Erro ao salvar'); }
};

function closeModal() { editModal.classList.add('hidden'); startAutoRefresh(); }
modalClose.onclick = modalCancel.onclick = closeModal;

function showToast(m) {
  toastText.textContent = m;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2000);
}

// ===== REFRESH TIMER =====
let autoRefreshTimer;
function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshTimer = setInterval(() => loadOrders(true), 60000);
}
function stopAutoRefresh() { if (autoRefreshTimer) clearInterval(autoRefreshTimer); }

async function loadOrders(silent = false) {
  saveScrollState();
  if (!silent) {
    loadingState.classList.remove('hidden');
    errorState.classList.add('hidden');
    emptyState.classList.add('hidden');
    ordersContainer.classList.add('hidden');
  }
  btnRefresh.classList.add('spinning');
  try {
    const data = await fetchOrders();
    setOrders(data);
  } catch (e) {
    if (!silent) { errorText.textContent = e.message; errorState.classList.remove('hidden'); }
  } finally {
    loadingState.classList.add('hidden');
    setTimeout(() => btnRefresh.classList.remove('spinning'), 600);
  }
}

btnRefresh.onclick = () => loadOrders();
btnRetry.onclick = () => loadOrders();
document.addEventListener('DOMContentLoaded', () => {
  if (searchInput) {
    searchInput.value = currentQuery;
    searchInput.addEventListener('input', (e) => {
      currentQuery = e.target.value;
      applySearch();
    });
  }
  loadOrders();
  startAutoRefresh();
});
