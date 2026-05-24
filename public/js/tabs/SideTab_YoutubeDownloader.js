import { toast, esc, fmtSize, fmtDuration } from '../utils.js';

export function initYoutubeDownloader(container) {
  container.innerHTML = `
    <div class="page-header">
      <div class="page-title">YouTube Downloader</div>
      <div class="page-desc">영상 또는 오디오를 다운로드합니다</div>
    </div>

    <div class="card">
      <input type="text" id="urlInput" placeholder="YouTube URL 붙여넣기..." autocomplete="off" spellcheck="false">

      <div class="preview" id="preview">
        <img class="preview-thumb" id="previewThumb" src="" alt="">
        <div class="preview-info" id="previewInfo"></div>
      </div>

      <div class="fmt-tabs">
        <div class="fmt-tab active" data-fmt="mp3">MP3 (오디오)</div>
        <div class="fmt-tab" data-fmt="mp4">MP4 (영상)</div>
      </div>

      <div class="field" id="qualityField" style="display:none">
        <label>화질</label>
        <select id="qualitySelect">
          <option value="best">최고화질 (Best)</option>
          <option value="1080p">1080p</option>
          <option value="720p">720p</option>
          <option value="480p">480p</option>
        </select>
      </div>

      <button class="btn-primary" id="dlBtn">다운로드</button>
    </div>

    <div class="card progress-section" id="progressCard">
      <div class="progress-header">
        <span class="progress-title" id="pTitle">다운로드 중...</span>
        <span class="progress-pct" id="pPct">0%</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" id="pFill"></div></div>
      <div class="progress-filename" id="pFile"></div>
    </div>

    <div class="card">
      <div class="files-header">
        <span class="files-title">다운로드된 파일</span>
        <button class="btn-ghost" id="refreshBtn">새로고침</button>
      </div>
      <div id="filesList"><div class="empty">파일 없음</div></div>
    </div>
  `;

  bindEvents(container);
  loadFiles();
}

// ── Internal ────────────────────────────────────────────────

let fmt = 'mp3';
let infoTimer = null;

function bindEvents(container) {
  container.querySelectorAll('.fmt-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.fmt-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      fmt = tab.dataset.fmt;
      document.getElementById('qualityField').style.display = fmt === 'mp4' ? 'block' : 'none';
    });
  });

  document.getElementById('dlBtn').addEventListener('click', startDownload);
  document.getElementById('refreshBtn').addEventListener('click', loadFiles);

  document.getElementById('urlInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') startDownload();
  });

  document.getElementById('urlInput').addEventListener('input', () => {
    clearTimeout(infoTimer);
    const url = document.getElementById('urlInput').value.trim();
    if (!url || !url.startsWith('http')) { hidePreview(); return; }
    showSkeleton();
    infoTimer = setTimeout(() => fetchInfo(url), 700);
  });
}

// ── Preview ──────────────────────────────────────────────────

function showSkeleton() {
  document.getElementById('preview').classList.add('visible');
  document.getElementById('previewThumb').classList.add('loading');
  document.getElementById('previewThumb').src = '';
  document.getElementById('previewInfo').innerHTML =
    `<div class="preview-skeleton"></div><div class="preview-skeleton short"></div>`;
}

function hidePreview() {
  document.getElementById('preview').classList.remove('visible');
}

async function fetchInfo(url) {
  try {
    const r = await fetch(`/api/info?url=${encodeURIComponent(url)}`);
    const d = await r.json();
    if (d.error) { hidePreview(); return; }

    const thumb = document.getElementById('previewThumb');
    thumb.src = d.thumbnail || '';
    thumb.classList.remove('loading');

    const meta = [d.uploader, d.duration ? fmtDuration(d.duration) : ''].filter(Boolean).join(' · ');
    document.getElementById('previewInfo').innerHTML = `
      <div class="preview-title" title="${esc(d.title)}">${esc(d.title)}</div>
      <div class="preview-meta">${esc(meta)}</div>`;
  } catch {
    hidePreview();
  }
}

// ── Download ─────────────────────────────────────────────────

async function startDownload() {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) { toast('URL을 입력하세요', 'err'); return; }

  const quality = document.getElementById('qualitySelect').value;
  const btn = document.getElementById('dlBtn');
  btn.disabled = true;

  try {
    const r = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, format: fmt, quality }),
    });
    const { jobId, error } = await r.json();
    if (error) throw new Error(error);
    trackProgress(jobId);
  } catch (e) {
    toast(e.message, 'err');
    btn.disabled = false;
  }
}

function trackProgress(jobId) {
  const card  = document.getElementById('progressCard');
  const fill  = document.getElementById('pFill');
  const pct   = document.getElementById('pPct');
  const title = document.getElementById('pTitle');
  const file  = document.getElementById('pFile');

  card.classList.add('visible');
  title.textContent = '다운로드 중...';
  fill.style.width = '0%';
  pct.textContent = '0%';
  file.textContent = '';

  const es = new EventSource(`/api/progress/${jobId}`);
  es.onmessage = ({ data }) => {
    const job = JSON.parse(data);
    fill.style.width = `${job.progress}%`;
    pct.textContent = `${Math.round(job.progress)}%`;
    if (job.filename) file.textContent = job.filename;

    if (job.status === 'done') {
      es.close();
      title.textContent = '완료';
      toast('다운로드 완료!', 'ok');
      document.getElementById('dlBtn').disabled = false;
      document.getElementById('urlInput').value = '';
      hidePreview();
      setTimeout(() => { card.classList.remove('visible'); loadFiles(); }, 2000);
    } else if (job.status === 'error') {
      es.close();
      title.textContent = '오류 발생';
      toast(job.error || '다운로드 실패', 'err');
      document.getElementById('dlBtn').disabled = false;
    }
  };
  es.onerror = () => {
    es.close();
    document.getElementById('dlBtn').disabled = false;
  };
}

// ── File list ────────────────────────────────────────────────

async function loadFiles() {
  const r = await fetch('/api/files');
  const files = await r.json();
  const list = document.getElementById('filesList');

  if (!files.length) {
    list.innerHTML = '<div class="empty">파일 없음</div>';
    return;
  }

  list.innerHTML = files.map(f => {
    const name = esc(f.name);
    const href = `/downloads/${encodeURIComponent(f.name)}`;
    return `
      <div class="file-item">
        <span class="file-name" title="${name}">${name}</span>
        <span class="file-size">${fmtSize(f.size)}</span>
        <a class="btn-sm btn-save" href="${href}" download>저장</a>
        <button class="btn-sm btn-trash" data-name="${name}">삭제</button>
      </div>`;
  }).join('');

  list.querySelectorAll('.btn-trash').forEach(btn => {
    btn.addEventListener('click', () => deleteFile(btn.dataset.name));
  });
}

async function deleteFile(name) {
  if (!confirm(`"${name}" 을(를) 삭제할까요?`)) return;
  await fetch(`/api/files/${encodeURIComponent(name)}`, { method: 'DELETE' });
  toast('삭제됨', 'ok');
  loadFiles();
}
