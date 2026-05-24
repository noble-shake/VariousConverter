FROM node:20-alpine

RUN apk add --no-cache ffmpeg python3 py3-pip && \
    python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir yt-dlp

ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /downloads

ENV PORT=3000
ENV DOWNLOADS_DIR=/downloads
ENV YTDLP_PATH=yt-dlp

EXPOSE 3000

CMD ["node", "server.js"]
