const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DOWNLOADS_DIR = path.resolve(process.env.DOWNLOADS_DIR || path.join(__dirname, 'downloads'));
const YTDLP_PATH = process.env.YTDLP_PATH || 'yt-dlp';

// jobId → { status, progress, filename, error, listeners: Set }
const jobs = new Map();

// ip → download count
const downloadCounts = new Map();
const DOWNLOAD_LIMIT = parseInt(process.env.DOWNLOAD_LIMIT || '3', 10);

app.use(express.json());
app.use(express.static('public'));
app.use('/downloads', express.static(DOWNLOADS_DIR));

fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

app.post('/api/download', (req, res) => {
  const { url, format = 'mp3', quality = 'best' } = req.body;

  if (!url || !isValidUrl(url)) {
    return res.status(400).json({ error: '유효한 URL을 입력하세요' });
  }

  const ip = req.ip;
  const isOwner = process.env.OWNER_IP && ip === process.env.OWNER_IP;
  if (!isOwner) {
    const count = downloadCounts.get(ip) || 0;
    if (count >= DOWNLOAD_LIMIT) {
      return res.status(429).json({ error: `다운로드 횟수 제한(${DOWNLOAD_LIMIT}회)을 초과했습니다` });
    }
    downloadCounts.set(ip, count + 1);
  }

  const jobId = randomUUID();
  jobs.set(jobId, { status: 'pending', progress: 0, filename: null, error: null, listeners: new Set() });

  res.json({ jobId });
  startDownload(jobId, url, format, quality);
});

app.get('/api/info', (req, res) => {
  const { url } = req.query;
  if (!url || !isValidUrl(url)) {
    return res.status(400).json({ error: '유효한 URL을 입력하세요' });
  }

  const proc = spawn(YTDLP_PATH, ['--dump-json', '--no-playlist', '--no-warnings', url]);
  let stdout = '';

  proc.stdout.on('data', d => { stdout += d; });

  const timer = setTimeout(() => {
    proc.kill();
    if (!res.headersSent) res.status(408).json({ error: '요청 시간 초과' });
  }, 20000);

  proc.on('close', (code) => {
    clearTimeout(timer);
    if (res.headersSent) return;
    if (code !== 0) return res.status(400).json({ error: '영상 정보를 가져올 수 없습니다' });
    try {
      const d = JSON.parse(stdout);
      res.json({
        title:     d.title,
        thumbnail: d.thumbnail,
        duration:  d.duration,
        uploader:  d.uploader || d.channel,
      });
    } catch {
      res.status(500).json({ error: '데이터 파싱 실패' });
    }
  });

  proc.on('error', () => {
    clearTimeout(timer);
    if (!res.headersSent) res.status(500).json({ error: 'yt-dlp 실행 오류' });
  });
});

app.get('/api/progress/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  send({ status: job.status, progress: job.progress, filename: job.filename, error: job.error });

  if (job.status === 'done' || job.status === 'error') {
    return res.end();
  }

  job.listeners.add(send);
  req.on('close', () => job.listeners.delete(send));
});

app.get('/api/files', (req, res) => {
  try {
    const files = fs.readdirSync(DOWNLOADS_DIR)
      .filter(f => !f.startsWith('.'))
      .map(f => {
        const stat = fs.statSync(path.join(DOWNLOADS_DIR, f));
        return { name: f, size: stat.size, created: stat.mtimeMs };
      })
      .sort((a, b) => b.created - a.created);
    res.json(files);
  } catch {
    res.json([]);
  }
});

app.delete('/api/files/:filename', (req, res) => {
  const filename = path.basename(decodeURIComponent(req.params.filename));
  const filepath = path.join(DOWNLOADS_DIR, filename);

  if (!path.resolve(filepath).startsWith(DOWNLOADS_DIR + path.sep)) {
    return res.status(400).json({ error: 'Invalid path' });
  }
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'File not found' });

  fs.unlinkSync(filepath);
  res.json({ success: true });
});

function notify(job, jobId, data) {
  Object.assign(job, data);
  const payload = { status: job.status, progress: job.progress, filename: job.filename, error: job.error };
  for (const send of job.listeners) send(payload);

  if (data.status === 'done' || data.status === 'error') {
    job.listeners.clear();
    setTimeout(() => jobs.delete(jobId), 5 * 60 * 1000);
  }
}

const VIDEO_FORMATS = {
  best:  'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best',
  '1080p': 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]',
  '720p':  'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720]',
  '480p':  'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best[height<=480]',
};

function startDownload(jobId, url, format, quality) {
  const job = jobs.get(jobId);
  notify(job, jobId, { status: 'downloading' });

  const args = [
    '--no-playlist',
    '--progress', '--newline',
    '--no-warnings',
    '-o', path.join(DOWNLOADS_DIR, '%(title)s.%(ext)s'),
  ];

  if (format === 'mp3') {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
  } else {
    args.push('-f', VIDEO_FORMATS[quality] || VIDEO_FORMATS.best, '--merge-output-format', 'mp4');
  }

  args.push(url);

  const proc = spawn(YTDLP_PATH, args);

  proc.stdout.on('data', (chunk) => {
    for (const line of chunk.toString().split('\n')) {
      const pct = line.match(/(\d+\.?\d*)%/);
      if (pct) notify(job, jobId, { progress: parseFloat(pct[1]) });

      const dest = line.match(/\[(?:download|ffmpeg|Merger)\].*?(?:Destination:|into) "?(.+?)"?\s*$/);
      if (dest) {
        const name = path.basename(dest[1].trim());
        if (name) notify(job, jobId, { filename: name });
      }
    }
  });

  proc.stderr.on('data', (chunk) => {
    const line = chunk.toString().trim();
    if (line.toLowerCase().includes('error')) {
      notify(job, jobId, { error: line });
    }
  });

  proc.on('close', (code) => {
    if (code === 0) {
      notify(job, jobId, { status: 'done', progress: 100 });
    } else {
      notify(job, jobId, { status: 'error', error: job.error || `다운로드 실패 (exit ${code})` });
    }
  });

  proc.on('error', (err) => {
    notify(job, jobId, { status: 'error', error: `yt-dlp 실행 오류: ${err.message}` });
  });
}

function isValidUrl(str) {
  try {
    const { protocol } = new URL(str);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Media Downloader listening on port ${PORT}`);
  console.log(`Downloads: ${DOWNLOADS_DIR}`);
});
