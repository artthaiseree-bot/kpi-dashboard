let globalData = [];
let globalErrors = [];
let globalDuplicates = [];
let selectedMall = 'all';

document.addEventListener('DOMContentLoaded', () => {
  fetchData();
  initEvents();
  initSSE();
});

async function fetchData() {
  try {
    const res = await fetch('/api/data');
    const json = await res.json();
    globalData = json.data || [];
    globalErrors = json.errors || [];
    globalDuplicates = json.duplicates || [];
    
    updateConnectionStatus(json.status, json.lastUpdated);
    populateFilters();
    renderDashboard();
    renderAlerts();
  } catch (err) {
    console.error('ไม่สามารถดึงข้อมูลได้:', err);
    updateConnectionStatus('Connection Error', '-');
  }
}

function initSSE() {
  const evtSource = new EventSource('/api/events');
  evtSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    updateConnectionStatus(data.status, data.lastUpdated);
    fetchData();
  };
}

function updateConnectionStatus(status, time) {
  document.getElementById('statusText').innerText = status;
  document.getElementById('lastUpdate').innerText = `อัปเดตล่าสุด: ${time}`;
}

function initEvents() {
  document.querySelectorAll('#mallFilters .chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('#mallFilters .chip').forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');
      selectedMall = e.target.getAttribute('data-mall');
      renderDashboard();
    });
  });

  const filterGrp = document.getElementById('filterGrp');
  if (filterGrp) filterGrp.addEventListener('change', renderDashboard);

  const searchBox = document.getElementById('searchBox');
  if (searchBox) searchBox.addEventListener('input', renderDashboard);

  const btnRefresh = document.getElementById('btnRefresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', async () => {
      btnRefresh.innerText = '⏳ กำลังโหลด...';
      try {
        await fetch('/api/refresh', { method: 'POST' });
        await fetchData();
      } catch (e) { console.error(e); }
      btnRefresh.innerText = '🔄 Refresh Data';
    });
  }

  const btnTheme = document.getElementById('btnTheme');
  if (btnTheme) {
    btnTheme.addEventListener('click', () => {
      const html = document.documentElement;
      const isDark = html.getAttribute('data-theme') === 'dark';
      html.setAttribute('data-theme', isDark ? 'light' : 'dark');
      btnTheme.innerText = isDark ? '🌙 Dark Mode' : '☀️ Light Mode';
    });
  }
}

function populateFilters() {
  const mainInspectors = ['ต้า', 'เก๋', 'เอ้', 'อ้น'];
  const whoContainer = document.getElementById('whoFilters');
  if (!whoContainer) return;

  whoContainer.innerHTML = `<button class="chip active" data-who="all">ทุกคน</button>`;
  
  mainInspectors.forEach(w => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.setAttribute('data-who', w);
    btn.innerText = w;
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('#whoFilters .chip').forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');
      renderDashboard();
    });
    whoContainer.appendChild(btn);
  });
}

function getSelectedWho() {
  const activeChip = document.querySelector('#whoFilters .chip.active');
  return activeChip ? activeChip.getAttribute('data-who') : 'all';
}

function getFilteredData() {
  const selectedWho = getSelectedWho();
  const filterGrpEl = document.getElementById('filterGrp');
  const grp = filterGrpEl ? filterGrpEl.value : 'all';
  const searchBoxEl = document.getElementById('searchBox');
  const keyword = searchBoxEl ? searchBoxEl.value.toLowerCase() : '';

  return globalData.filter(d => {
    if (selectedMall !== 'all' && d.mall !== selectedMall) return false;
    if (selectedWho !== 'all' && (!d.who || !d.who.includes(selectedWho))) return false;
    if (grp !== 'all' && d.grp !== grp) return false;
    if (keyword) {
      const matchBrand = (d.brand || '').toLowerCase().includes(keyword);
      const matchUnit = (d.unit || '').toLowerCase().includes(keyword);
      if (!matchBrand && !matchUnit) return false;
    }
    return true;
  });
}

function renderDashboard() {
  const data = getFilteredData();

  const total = data.length;
  const approved = data.filter(d => d.st === 'approved').length;
  const partial = data.filter(d => d.st === 'partial').length;
  const progress = data.filter(d => d.st === 'progress').length;
  const totalArea = data.reduce((sum, d) => sum + (d.area || 0), 0);
  const avgRounds = total > 0 ? (data.reduce((sum, d) => sum + (d.rounds || 1), 0) / total).toFixed(1) : 0;

  const setElemText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  };

  setElemText('kpiTotal', total);
  setElemText('kpiApproved', approved);
  setElemText('kpiPartial', partial);
  setElemText('kpiProgress', progress);
  setElemText('kpiArea', totalArea.toLocaleString('th-TH', { maximumFractionDigits: 2 }));
  setElemText('kpiAvgRounds', avgRounds);

  renderMonthlyChart(data);
  renderStatusChart(data);
  renderMatrixTable();
  renderPersonTable();
  renderDuplicateTable();
  renderDetailTable(data);
}

function renderAlerts() {
  const section = document.getElementById('alertsSection');
  const alertBox = document.getElementById('validationAlert');
  if (!section || !alertBox) return;

  if (globalErrors.length > 0 || globalDuplicates.length > 0) {
    section.style.display = 'block';
    alertBox.innerHTML = `<strong>⚠️ ตรวจพบข้อผิดพลาด ${globalErrors.length} รายการ และรายการซ้ำ ${globalDuplicates.length} รายการใน Excel</strong>`;
  } else {
    section.style.display = 'none';
  }
}

function renderMonthlyChart(data) {
  const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  const monthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const counts = new Array(12).fill(0);

  data.forEach(d => {
    if (d.appr && d.st === 'approved') {
      const parts = d.appr.split('/');
      if (parts.length >= 2) {
        let mIdx = parseInt(parts[1]) - 1;
        if (mIdx >= 0 && mIdx < 12) counts[mIdx]++;
      }
    }
  });

  const maxVal = Math.max(...counts, 5);
  const container = document.getElementById('monChart');
  if (!container) return;
  container.innerHTML = '';

  months.forEach((m, idx) => {
    const val = counts[idx];
    const heightPercent = (val / maxVal) * 100;
    const item = document.createElement('div');
    item.className = 'bar-item';
    item.innerHTML = `
      <div class="bar" style="height: ${heightPercent}%"><span>${val > 0 ? val : ''}</span></div>
      <div class="bar-label">${monthNames[idx]}</div>
    `;
    container.appendChild(item);
  });
}

function renderStatusChart(data) {
  const shopCount = data.filter(d => d.grp === 'SHOP').length;
  const opCount = data.filter(d => d.grp === 'OP').length;
  const commonCount = data.filter(d => d.grp === 'COMMON').length;
  const tempCount = data.filter(d => d.grp === 'TEMP').length;
  const maxVal = Math.max(shopCount, opCount, commonCount, tempCount, 5);

  const container = document.getElementById('statusChart');
  if (!container) return;
  
  container.innerHTML = `
    <div class="bar-item"><div class="bar" style="height: ${(shopCount/maxVal)*100}%; background: var(--primary-color);"><span>${shopCount}</span></div><div class="bar-label">SHOP</div></div>
    <div class="bar-item"><div class="bar" style="height: ${(opCount/maxVal)*100}%; background: var(--success-color);"><span>${opCount}</span></div><div class="bar-label">OP</div></div>
    <div class="bar-item"><div class="bar" style="height: ${(commonCount/maxVal)*100}%; background: var(--warning-color);"><span>${commonCount}</span></div><div class="bar-label">COMMON</div></div>
    <div class="bar-item"><div class="bar" style="height: ${(tempCount/maxVal)*100}%; background: var(--info-color);"><span>${tempCount}</span></div><div class="bar-label">TEMP</div></div>
  `;
}

function renderMatrixTable() {
  const malls = ['M3', 'M5', 'M6', 'M7', 'M8', 'M10'];
  const grps = ['SHOP', 'OP', 'COMMON', 'TEMP'];
  const tbody = document.querySelector('#matrixTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  malls.forEach(mall => {
    let rowTr = document.createElement('tr');
    let mallTotal = [0, 0];
    let html = `<td><strong>${mall}</strong></td>`;
    
    grps.forEach(grp => {
      const items = globalData.filter(d => d.mall === mall && d.grp === grp);
      const totalCount = items.length;
      const appCount = items.filter(d => d.st === 'approved').length;
      mallTotal[0] += totalCount;
      mallTotal[1] += appCount;
      html += `<td>${totalCount} / <span style="color:var(--success-color); font-weight:600;">${appCount}</span></td>`;
    });
    
    html += `<td><strong>${mallTotal[0]} / <span style="color:var(--success-color);">${mallTotal[1]}</span></strong></td>`;
    rowTr.innerHTML = html;
    tbody.appendChild(rowTr);
  });
}

function renderPersonTable() {
  const tbody = document.querySelector('#personTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const mainInspectors = ['ต้า', 'เก๋', 'เอ้', 'อ้น'];
  const personMap = {};
  mainInspectors.forEach(p => { personMap[p] = { total: 0, approved: 0, partial: 0, progress: 0, area: 0 }; });

  globalData.forEach(d => {
    if (d.who && Array.isArray(d.who)) {
      d.who.forEach(w => {
        let matchedKey = mainInspectors.find(m => w.includes(m));
        if (matchedKey && personMap[matchedKey]) {
          personMap[matchedKey].total++;
          if (d.st === 'approved') personMap[matchedKey].approved++;
          if (d.st === 'partial') personMap[matchedKey].partial++;
          if (d.st === 'progress') personMap[matchedKey].progress++;
          if (d.area) personMap[matchedKey].area += d.area;
        }
      });
    }
  });

  mainInspectors.forEach(person => {
    const p = personMap[person];
    const pct = p.total > 0 ? ((p.approved / p.total) * 100).toFixed(0) : 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${person}</strong></td>
      <td>${p.total}</td>
      <td><span style="color:var(--success-color); font-weight:600;">${p.approved}</span></td>
      <td>${p.partial}</td>
      <td>${p.progress}</td>
      <td>${pct}%</td>
      <td>${p.area.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderDuplicateTable() {
  const tbody = document.querySelector('#duplicateTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (globalDuplicates.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">ไม่พบข้อมูลซ้ำในระบบ</td></tr>`;
    return;
  }

  globalDuplicates.forEach(dup => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${dup.mall}</strong></td><td>${dup.unit}</td><td><span style="color:var(--danger-color);">${dup.brands.join(', ')}</span></td>`;
    tbody.appendChild(tr);
  });
}

function renderDetailTable(data) {
  const tbody = document.querySelector('#detailTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  data.forEach(d => {
    const tr = document.createElement('tr');
    let badgeClass = 'progress';
    let statusText = 'Pending';
    if (d.st === 'approved') { badgeClass = 'approved'; statusText = 'Approved'; }
    else if (d.st === 'partial') { badgeClass = 'partial'; statusText = 'Partial'; }

    tr.innerHTML = `
      <td><strong>${d.mall}</strong></td>
      <td>${d.unit || '-'}</td>
      <td><strong>${d.brand}</strong></td>
      <td>${d.cat}</td>
      <td>${d.area !== null ? d.area.toLocaleString() : 'ไม่มีข้อมูล'}</td>
      <td>${d.rounds} รอบ</td>
      <td>${d.who.join(', ')}</td>
      <td><span class="badge ${badgeClass}">${statusText}</span></td>
      <td>${d.appr || d.apprNote || '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}