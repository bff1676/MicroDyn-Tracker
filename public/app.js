const statuses = ['Planned', 'Announced', 'In Dev', 'Dev Complete', 'In PPMO', 'PPMO Complete', 'In PROD', 'Complete'];
const dateFields = ['announceDate', 'devDeployDate', 'devCompleteDate', 'ppmoDeployDate', 'ppmoCompleteDate', 'prodDeployDate', 'prodCompleteDate'];
const labels = {
  announceDate: 'Announce',
  devDeployDate: 'Dev Deploy',
  devCompleteDate: 'Dev Complete',
  ppmoDeployDate: 'PPMO Deploy',
  ppmoCompleteDate: 'PPMO Complete',
  prodDeployDate: 'PROD Deploy',
  prodCompleteDate: 'PROD Complete'
};

const state = {
  tracker: [],
  releases: [],
  claimTypes: [],
  components: []
};

const $ = selector => document.querySelector(selector);

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  if (!response.ok) {
    let error = 'Request failed.';
    try { error = (await response.json()).error || error; } catch {}
    throw new Error(error);
  }
  return response.json();
}

function fmt(value) {
  return value || '<span class="muted">Not set</span>';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function currentRows() {
  const q = $('#searchInput').value.trim().toLowerCase();
  const status = $('#statusFilter').value;
  return state.tracker.filter(row => {
    const haystack = [row.claimType, row.componentType, row.version, row.status].join(' ').toLowerCase();
    return (!q || haystack.includes(q)) && (!status || row.status === status);
  });
}

function renderSummary() {
  const released = state.releases.length;
  const complete = state.releases.filter(row => row.status === 'Complete').length;
  const inFlight = state.releases.filter(row => row.status && row.status !== 'Complete').length;
  const docs = state.releases.reduce((sum, row) => sum + Number(row.attachmentCount || 0), 0);
  $('#summary').innerHTML = [
    ['Components', state.tracker.length],
    ['Tracked releases', released],
    ['In progress', inFlight],
    ['Documents', docs]
  ].map(([label, value]) => `<div class="metric"><strong>${value}</strong><span>${label}</span></div>`).join('');
}

function renderTracker() {
  const rows = currentRows();
  $('#trackerBody').innerHTML = rows.map(row => `
    <tr>
      <td><strong>${escapeHtml(row.claimType)}</strong></td>
      <td>${escapeHtml(row.componentType)}</td>
      <td>${row.version ? escapeHtml(row.version) : '<span class="muted">No release</span>'}</td>
      <td>${row.status ? `<span class="pill">${escapeHtml(row.status)}</span>` : '<span class="muted">Not started</span>'}</td>
      <td>${fmt(row.lastUpdateDate)}</td>
      ${dateFields.map(field => `<td>${fmt(row[field])}</td>`).join('')}
      <td>${row.attachmentCount || 0}</td>
    </tr>
  `).join('') || '<tr><td colspan="13" class="muted">No matching components.</td></tr>';
}

function fillSelects() {
  $('#statusFilter').innerHTML = '<option value="">All statuses</option>' + statuses.map(status => `<option>${status}</option>`).join('');
  $('#status').innerHTML = statuses.map(status => `<option>${status}</option>`).join('');
  $('#componentId').innerHTML = state.tracker.map(row => `<option value="${row.componentId}">${escapeHtml(row.claimType)} - ${escapeHtml(row.componentType)}</option>`).join('');
  $('#releaseId').innerHTML = '<option value="">New release update</option>' + state.releases.map(row => `<option value="${row.id}">${escapeHtml(row.announceDate || 'No announce date')} - ${escapeHtml(row.claimType)} - ${escapeHtml(row.componentType)} - ${escapeHtml(row.version)}</option>`).join('');
  $('#attachmentReleaseId').innerHTML = state.releases.map(row => `<option value="${row.id}">${escapeHtml(row.announceDate || 'No announce date')} - ${escapeHtml(row.claimType)} - ${escapeHtml(row.componentType)} - ${escapeHtml(row.version)}</option>`).join('');
}

function renderReports() {
  const rows = state.releases;
  $('#reportContent').innerHTML = `
    <h2>Release Report</h2>
    <p class="muted">Generated ${new Date().toLocaleString()}</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Claim Type</th><th>Component</th><th>Version</th><th>Status</th><th>Last Update</th>${dateFields.map(field => `<th>${labels[field]}</th>`).join('')}<th>Docs</th></tr></thead>
        <tbody>
          ${rows.map(row => `<tr><td>${escapeHtml(row.claimType)}</td><td>${escapeHtml(row.componentType)}</td><td>${escapeHtml(row.version)}</td><td>${escapeHtml(row.status)}</td><td>${fmt(row.lastUpdateDate)}</td>${dateFields.map(field => `<td>${fmt(row[field])}</td>`).join('')}<td>${row.attachmentCount}</td></tr>`).join('') || '<tr><td colspan="13" class="muted">No releases yet.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function renderComponents() {
  $('#componentList').innerHTML = state.components.map(row => `
    <form class="component-row" data-id="${row.id}">
      <div><strong>${escapeHtml(row.claimType)}</strong><span>${escapeHtml(row.componentType)}</span></div>
      <div class="muted">${fmt(row.lastUpdateDate)}</div>
      <label><span>Active</span><input name="isActive" type="checkbox" ${row.isActive ? 'checked' : ''}></label>
      <button type="submit">Save</button>
    </form>
  `).join('');
}

function loadReleaseIntoForm(release) {
  $('#releaseId').value = release.id;
  $('#componentId').value = release.componentId;
  $('#version').value = release.version || '';
  $('#status').value = release.status || 'Planned';
  $('#releaseNotes').value = release.releaseNotes || '';
  dateFields.forEach(field => document.getElementById(field).value = release[field] || '');
}

function syncReleaseByComponentDate() {
  const componentId = $('#componentId').value;
  const announceDate = $('#announceDate').value;
  if (!componentId || !announceDate) return;
  const release = state.releases.find(row => String(row.componentId) === String(componentId) && row.announceDate === announceDate);
  if (release) {
    if ($('#releaseId').value !== String(release.id)) {
      loadReleaseIntoForm(release);
      toast('Existing release values loaded.');
    }
    return;
  }
  if ($('#releaseId').value) $('#releaseId').value = '';
}

function renderClaimTypes() {
  $('#claimTypeList').innerHTML = state.claimTypes.map(row => `
    <form class="claim-row" data-id="${row.id}">
      <label><span>Name</span><input name="name" value="${escapeHtml(row.name)}" required></label>
      <label><span>Description</span><input name="description" value="${escapeHtml(row.description || '')}"></label>
      <label><span>Pricer only</span><input name="pricerOnly" type="checkbox" ${row.pricerOnly ? 'checked' : ''}></label>
      <button type="submit">Save</button>
    </form>
  `).join('');
}

async function renderAttachments() {
  const select = $('#attachmentReleaseId');
  if (!select.value) {
    $('#attachmentsPanel').innerHTML = '<h2>Documents</h2><p class="muted">Save a release before attaching documents.</p>';
    return;
  }
  const data = await api(`/api/releases/${select.value}/attachments`);
  $('#attachmentsPanel').innerHTML = `
    <div class="panel-title"><h2>Documents</h2></div>
    ${data.items.map(item => `
      <p><a href="/api/attachments/${item.id}/download">${escapeHtml(item.originalName)}</a> <span class="muted">${Math.ceil(item.sizeBytes / 1024)} KB ${item.description ? `- ${escapeHtml(item.description)}` : ''}</span></p>
    `).join('') || '<p class="muted">No documents attached to this release.</p>'}
  `;
}

async function loadAll() {
  const [tracker, releases, claimTypes, components] = await Promise.all([
    api('/api/tracker'),
    api('/api/releases'),
    api('/api/claim-types'),
    api('/api/components')
  ]);
  state.tracker = tracker.items;
  state.releases = releases.items;
  state.claimTypes = claimTypes.items;
  state.components = components.items;
  fillSelects();
  renderSummary();
  renderTracker();
  renderReports();
  renderClaimTypes();
  renderComponents();
  await renderAttachments();
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab, .view').forEach(el => el.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.view).classList.add('active');
  });
});

$('#searchInput').addEventListener('input', renderTracker);
$('#statusFilter').addEventListener('change', renderTracker);
$('#printReport').addEventListener('click', () => window.print());
$('#attachmentReleaseId').addEventListener('change', renderAttachments);
$('#componentId').addEventListener('change', syncReleaseByComponentDate);
$('#announceDate').addEventListener('change', syncReleaseByComponentDate);

$('#releaseId').addEventListener('change', () => {
  const release = state.releases.find(row => String(row.id) === $('#releaseId').value);
  if (!release) {
    $('#releaseForm').reset();
    $('#releaseId').value = '';
    return;
  }
  loadReleaseIntoForm(release);
});

$('#releaseForm').addEventListener('submit', async event => {
  event.preventDefault();
  const body = {
    id: $('#releaseId').value,
    componentId: $('#componentId').value,
    version: $('#version').value,
    status: $('#status').value,
    releaseNotes: $('#releaseNotes').value
  };
  dateFields.forEach(field => body[field] = document.getElementById(field).value);
  await api('/api/releases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  toast('Release saved.');
  await loadAll();
});

$('#attachmentForm').addEventListener('submit', async event => {
  event.preventDefault();
  const file = $('#attachmentFile').files[0];
  if (!file) return;
  const form = new FormData();
  form.append('file', file);
  form.append('description', $('#attachmentDescription').value);
  await fetch(`/api/releases/${$('#attachmentReleaseId').value}/attachments`, { method: 'POST', body: form });
  $('#attachmentFile').value = '';
  $('#attachmentDescription').value = '';
  toast('Document attached.');
  await loadAll();
});

$('#claimTypeList').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  const body = {
    name: form.name.value,
    description: form.description.value,
    pricerOnly: form.pricerOnly.checked
  };
  await api(`/api/claim-types/${form.dataset.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  toast('Claim type saved.');
  await loadAll();
});

$('#componentList').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  await api(`/api/components/${form.dataset.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isActive: form.isActive.checked })
  });
  toast('Component availability saved.');
  await loadAll();
});

loadAll().catch(error => toast(error.message));
