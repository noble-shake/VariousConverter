# Various Converter

개인용 로컬 미디어 다운로드 / 변환 툴.  
Synology NAS Docker 환경에서 셀프호스팅을 목적으로 제작되었습니다.

---

## Stack

| 영역 | 기술 |
|------|------|
| 서버 | Node.js + Express |
| 다운로드 | yt-dlp |
| 변환 | FFmpeg |
| 프론트엔드 | Vanilla JS (ES Modules), 빌드 도구 없음 |
| 배포 | Docker / docker-compose |

---

## 프로젝트 구조

```
VariousConverterProject/
│
├── server.js                   # Express API 서버
├── package.json
├── Dockerfile
├── docker-compose.yml
├── .env.example                # 환경 변수 예시
│
└── public/                     # 정적 프론트엔드
    ├── index.html              # HTML 진입점 (구조만)
    │
    ├── css/
    │   ├── base.css                        # 공통 레이아웃 / 컴포넌트 스타일
    │   ├── Sidebar.css                     # 사이드바 전용 스타일
    │   └── SideTab_YoutubeDownloader.css   # YouTube 탭 전용 스타일
    │
    └── js/
        ├── main.js             # 앱 진입점 — 페이지 라우팅 및 탭 초기화
        ├── Sidebar.js          # 사이드바 컴포넌트 (네비게이션 렌더링)
        ├── utils.js            # 공통 유틸 (toast, esc, fmtSize, fmtDuration)
        └── tabs/
            └── SideTab_YoutubeDownloader.js   # YouTube 다운로더 탭 전체 로직
```

---

## Features

### YouTube Downloader

#### URL 입력 및 영상 미리보기
URL 입력 필드에 YouTube 링크를 붙여넣으면 0.7초 디바운스 후 자동으로 영상 정보를 조회합니다.  
응답 대기 중에는 스켈레톤 로딩 애니메이션이 표시되고, 조회 완료 시 썸네일 / 제목 / 채널명 / 재생시간이 나타납니다.

#### 포맷 선택
- **MP3 (오디오)** — yt-dlp `-x --audio-format mp3 --audio-quality 0` 으로 최고 품질 추출
- **MP4 (영상)** — 선택한 화질에 맞춰 영상 + 오디오 스트림을 병합하여 mp4 출력

#### 화질 선택 (MP4 전용)
| 옵션 | yt-dlp 포맷 셀렉터 |
|------|--------------------|
| 최고화질 | `bestvideo[ext=mp4]+bestaudio[ext=m4a]/best` |
| 1080p | `bestvideo[height<=1080]+bestaudio/best[height<=1080]` |
| 720p | `bestvideo[height<=720]+bestaudio/best[height<=720]` |
| 480p | `bestvideo[height<=480]+bestaudio/best[height<=480]` |

#### 실시간 다운로드 진행률
다운로드 시작 즉시 jobId를 발급하고 SSE(Server-Sent Events)로 진행률을 스트리밍합니다.  
진행률(%), 현재 파일명을 실시간으로 표시하며, 완료 / 오류 시 자동으로 상태를 업데이트합니다.

#### 다운로드된 파일 목록
서버의 `downloads/` 디렉토리를 조회하여 파일명 / 용량을 목록으로 표시합니다.  
각 파일에 대해 **저장**(브라우저 다운로드)과 **삭제** 기능을 제공합니다.

#### IP 기반 다운로드 제한
외부에서 접근하는 사용자의 다운로드 횟수를 IP 단위로 제한합니다.  
기본값은 3회이며 `.env`의 `DOWNLOAD_LIMIT`으로 조정할 수 있습니다.  
`OWNER_IP`에 본인 IP를 등록하면 해당 IP는 제한 없이 사용 가능합니다.  
횟수는 서버 메모리에 저장되므로 재시작 시 초기화됩니다.

---

## 환경 변수

`.env.example`을 복사하여 `.env`를 만들고 값을 채웁니다.

```env
PORT=3000               # 서버 포트
DOWNLOADS_DIR=./downloads   # 다운로드 저장 경로
YTDLP_PATH=yt-dlp       # yt-dlp 실행 경로
DOWNLOAD_LIMIT=3        # IP당 최대 다운로드 횟수
OWNER_IP=               # 무제한 허용할 IP (비워두면 미사용)
```

---

## 실행

### 로컬

```bash
npm install
node server.js
# → http://localhost:3000
```

> 로컬 실행 시 `yt-dlp`와 `ffmpeg`가 PATH에 설치되어 있어야 합니다.

### Docker (Synology NAS)

```bash
docker compose up -d --build
# → http://NAS_IP:3000
```

`./downloads` 폴더가 컨테이너 내 `/downloads`에 마운트됩니다.  
yt-dlp / ffmpeg는 이미지 빌드 시 자동으로 설치됩니다.

---

## API

| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/api/download` | 다운로드 시작. `{ url, format, quality }` → `{ jobId }` |
| `GET` | `/api/progress/:id` | SSE 진행률 스트림. `{ status, progress, filename, error }` |
| `GET` | `/api/info?url=` | 영상 메타데이터 조회. `{ title, thumbnail, duration, uploader }` |
| `GET` | `/api/files` | 다운로드된 파일 목록 |
| `DELETE` | `/api/files/:filename` | 파일 삭제 |
