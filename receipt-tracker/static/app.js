const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const uploadQueue = document.getElementById('upload-queue');
const processBtn = document.getElementById('process-btn');
const toast = document.getElementById('toast');
const modal = document.getElementById('modal');

let pendingFiles = [];
let allExpenses = [];

// ── Drag & Drop ──────────────────────────────────────────────
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  addFiles([...e.dataTransfer.files]);
});

fileInput.addEventListener('change', () => {
  addFiles([...fileInput.files]);
  fileInput.value = '';
});

function addFiles(files) {
  const imgs = files.filter(f => f.type.startsWith('image/'));
  if (!imgs.length) { showToast('이미지 파일만 업로드할 수 있어요.'); return; }
  pendingFiles.push(...imgs);
  renderQueue();
}

function renderQueue() {
  if (!pendingFiles.length) {
    uploadQueue.classList.add('hidden');
    processBtn.classList.add('hidden');
    return;
  }
  uploadQueue.classList.remove('hidden');
  processBtn.classList.remove('hidden');
  uploadQueue.innerHTML = pendingFiles.map((f, i) => `
    <div class="queue-item" id="qi-${i}">
      <img class="queue-thumb" src="${URL.createObjectURL(f)}" alt="" />
      <span class="queue-name">${f.name}</span>
      <span class="queue-status pending" id="qs-${i}">대기 중</span>
    </div>
  `).join('');
}

// ── Process ──────────────────────────────────────────────────
processBtn.addEventListener('click', async () => {
  if (!pendingFiles.length) return;
  processBtn.disabled = true;
  processBtn.innerHTML = '<span class="spinner"></span> 분석 중…';

  const formData = new FormData();
  pendingFiles.forEach(f => formData.append('files', f));

  // Mark all as processing
  pendingFiles.forEach((_, i) => setQueueStatus(i, 'processing', '<span class="spinner"></span>'));

  try {
    const res = await fetch('/api/receipts/upload', { method: 'POST', body: formData });
    const data = await res.json();

    let successCount = 0;
    data.results.forEach((r, i) => {
      if (r.success) {
        setQueueStatus(i, 'done', '✅ 완료');
        successCount++;
      } else {
        setQueueStatus(i, 'error', `❌ ${r.error || '실패'}`);
      }
    });

    showToast(`${successCount}개 영수증 처리 완료!`);
    setTimeout(() => {
      pendingFiles = [];
      renderQueue();
      loadExpenses();
    }, 2000);
  } catch {
    showToast('오류가 발생했어요. 다시 시도해주세요.');
    pendingFiles.forEach((_, i) => setQueueStatus(i, 'error', '❌ 오류'));
  } finally {
    processBtn.disabled = false;
    processBtn.innerHTML = '<span class="btn-icon">⚡</span> 분석 시작';
  }
});

function setQueueStatus(i, cls, html) {
  const el = document.getElementById(`qs-${i}`);
  if (!el) return;
  el.className = `queue-status ${cls}`;
  el.innerHTML = html;
}

// ── Load & Render Expenses ───────────────────────────────────
async function loadExpenses() {
  const res = await fetch('/api/expenses');
  const data = await res.json();
  allExpenses = data.expenses;
  populateMonthFilter();
  renderExpenses();
  renderSummary();
}

function populateMonthFilter() {
  const months = [...new Set(allExpenses.map(e => e.receipt_date?.slice(0, 7)).filter(Boolean))].sort().reverse();
  const sel = document.getElementById('filter-month');
  const cur = sel.value;
  sel.innerHTML = '<option value="">전체 기간</option>' + months.map(m => `<option value="${m}">${m}</option>`).join('');
  if (months.includes(cur)) sel.value = cur;
}

document.getElementById('filter-month').addEventListener('change', renderExpenses);
document.getElementById('filter-category').addEventListener('change', renderExpenses);

function filtered() {
  const month = document.getElementById('filter-month').value;
  const cat = document.getElementById('filter-category').value;
  return allExpenses.filter(e => {
    if (month && !e.receipt_date?.startsWith(month)) return false;
    if (cat && e.category !== cat) return false;
    return true;
  });
}

function renderExpenses() {
  const list = document.getElementById('expense-list');
  const section = document.getElementById('expense-section');
  const data = filtered();

  if (!data.length && !allExpenses.length) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');

  // Group by date
  const groups = {};
  data.forEach(e => {
    const d = e.receipt_date || '날짜 미상';
    if (!groups[d]) groups[d] = [];
    groups[d].push(e);
  });

  const dateTotal = date => groups[date].reduce((s, e) => s + (e.total || 0), 0);

  list.innerHTML = Object.keys(groups).sort().reverse().map(date => `
    <div class="expense-group-header">
      ${formatDate(date)} &nbsp;·&nbsp; 합계 ${fmtMoney(dateTotal(date))}
    </div>
    ${groups[date].map(e => expenseCard(e)).join('')}
  `).join('');

  list.querySelectorAll('.expense-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.expense-delete')) return;
      const id = +card.dataset.id;
      openModal(allExpenses.find(ex => ex.id === id));
    });
  });

  list.querySelectorAll('.expense-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('이 항목을 삭제할까요?')) return;
      await fetch(`/api/expenses/${btn.dataset.id}`, { method: 'DELETE' });
      allExpenses = allExpenses.filter(e => e.id !== +btn.dataset.id);
      renderExpenses();
      renderSummary();
    });
  });
}

function expenseCard(e) {
  return `
    <div class="expense-card" data-id="${e.id}">
      <span class="expense-cat-badge ${catClass(e.category)}">${e.category}</span>
      <div class="expense-info">
        <div class="expense-merchant">${e.merchant}</div>
        <div class="expense-date">${e.receipt_date || ''}</div>
      </div>
      <div class="expense-total">${fmtMoney(e.total)}</div>
      <button class="expense-delete" data-id="${e.id}" title="삭제">🗑</button>
    </div>
  `;
}

// ── Summary ──────────────────────────────────────────────────
function renderSummary() {
  const section = document.getElementById('summary-section');
  if (!allExpenses.length) { section.classList.add('hidden'); return; }

  const curMonth = new Date().toISOString().slice(0, 7);
  const thisMonth = allExpenses.filter(e => e.receipt_date?.startsWith(curMonth));

  if (!thisMonth.length) { section.classList.add('hidden'); return; }

  section.classList.remove('hidden');

  const totals = {};
  thisMonth.forEach(e => { totals[e.category] = (totals[e.category] || 0) + (e.total || 0); });

  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);

  const cards = document.getElementById('summary-cards');
  cards.innerHTML = `
    <div class="summary-card">
      <div class="cat-label"><span class="cat-dot" style="background:#4f46e5"></span>이번 달 합계</div>
      <div class="cat-total" style="color:#4f46e5">${fmtMoney(grandTotal)}</div>
    </div>
    ${Object.entries(totals).sort((a,b) => b[1]-a[1]).map(([cat, total]) => `
      <div class="summary-card">
        <div class="cat-label"><span class="cat-dot ${catClass(cat)}"></span>${cat}</div>
        <div class="cat-total">${fmtMoney(total)}</div>
      </div>
    `).join('')}
  `;
}

// ── Modal ─────────────────────────────────────────────────────
function openModal(e) {
  if (!e) return;
  document.getElementById('modal-content').innerHTML = `
    <div class="modal-merchant">${e.merchant}</div>
    <div class="modal-meta">${e.receipt_date || ''} &nbsp;·&nbsp; <span class="expense-cat-badge ${catClass(e.category)}">${e.category}</span></div>
    <div class="modal-items">
      ${(e.items || []).map(it => `
        <div class="modal-item">
          <span>${it.name}</span>
          <span>${fmtMoney(it.price)}</span>
        </div>
      `).join('')}
    </div>
    <div class="modal-total"><span>합계</span><span>${fmtMoney(e.total)}</span></div>
    ${e.image_path ? `<img class="modal-receipt-img" src="${e.image_path}" alt="영수증" loading="lazy" />` : ''}
  `;
  modal.classList.remove('hidden');
}

modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.classList.add('hidden'));
modal.querySelector('.modal-close').addEventListener('click', () => modal.classList.add('hidden'));

// ── Helpers ──────────────────────────────────────────────────
function fmtMoney(n) {
  return (n || 0).toLocaleString('ko-KR') + '원';
}

function formatDate(d) {
  if (!d || d === '날짜 미상') return d;
  const [y, m, day] = d.split('-');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const dow = days[new Date(d).getDay()];
  return `${y}년 ${+m}월 ${+day}일 (${dow})`;
}

function catClass(cat) {
  if (!cat) return 'cat-기타';
  return 'cat-' + cat.replace('/', '-');
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  toast.classList.add('show');
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.classList.add('hidden'), 300); }, 3000);
}

// ── Init ─────────────────────────────────────────────────────
loadExpenses();
