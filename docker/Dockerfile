# syntax=docker/dockerfile:1
###############################################################################
# IDS-Hybride : image tout-en-un (Snort 3 + backend FastAPI + UI + supervisor)
# Build depuis la racine du projet :  docker build -f docker/Dockerfile -t ids-hybride .
###############################################################################

# ---- Stage 1 : build du frontend React ----
FROM node:20-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build          # -> /app/frontend/dist

# ---- Stage 2 : compilation de Snort 3 + libDAQ ----
FROM ubuntu:24.04 AS snort
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential git wget ca-certificates cmake pkg-config autotools-dev \
    libpcap-dev libpcre2-dev libpcre3-dev libnet1-dev zlib1g-dev luajit hwloc \
    libdumbnet-dev bison flex liblzma-dev openssl libssl-dev libhwloc-dev \
    libsqlite3-dev uuid-dev libcmocka-dev libnetfilter-queue-dev libmnl-dev \
    libluajit-5.1-dev libunwind-dev libfl-dev libgoogle-perftools-dev \
 && rm -rf /var/lib/apt/lists/*
# header dnet.h attendu par certains builds
RUN [ -e /usr/include/dnet.h ] || ln -s /usr/include/dumbnet.h /usr/include/dnet.h
WORKDIR /src
RUN git clone --depth 1 https://github.com/snort3/libdaq.git \
 && cd libdaq && ./bootstrap && ./configure && make -j"$(nproc)" && make install
RUN git clone --depth 1 https://github.com/snort3/snort3.git \
 && cd snort3 && ./configure_cmake.sh --prefix=/usr/local --enable-tcmalloc \
 && cd build && make -j"$(nproc)" && make install

# ---- Stage 3 : image finale (runtime) ----
FROM ubuntu:24.04 AS runtime
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv python3-pip supervisor iproute2 ca-certificates \
    libpcap0.8 libpcre2-8-0 libpcre3 libdumbnet1 luajit libluajit-5.1-2 libhwloc15 \
    libnetfilter-queue1 libmnl0 libunwind8 zlib1g libssl3t64 libgoogle-perftools4t64 \
 && rm -rf /var/lib/apt/lists/*

# Snort compilé
COPY --from=snort /usr/local /usr/local
RUN ldconfig

WORKDIR /opt/ids-hybride

# Backend + venv
COPY backend/ ./backend/
RUN python3 -m venv /opt/venv \
 && /opt/venv/bin/pip install --no-cache-dir -U pip \
 && /opt/venv/bin/pip install --no-cache-dir -r backend/requirements.txt

# Config Snort du projet (chemins réécrits pour l'arborescence du conteneur)
COPY config/ ./config/
RUN sed -i "s#/mnt/d/Formation/Project/ids-hybride#/opt/ids-hybride#g" config/snort.lua

# Frontend buildé (servi par le backend)
COPY --from=frontend /app/frontend/dist ./frontend/dist

# Supervisor + entrypoint
COPY docker/supervisord.conf /etc/supervisor/supervisord.conf
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /opt/ids-hybride/logs

ENV SNORT_BACKEND=linux \
    SNORT_SERVICE_MANAGER=supervisor \
    SNORT_SERVICE_NAME=snort3 \
    SNORT_CONFIG_PATH=/opt/ids-hybride/config/snort.lua \
    SNORT_RULES_PATH=/opt/ids-hybride/config/local.rules \
    SNORT_ALERT_JSON_PATH=/opt/ids-hybride/logs/alert_json.txt \
    SNORT_INTERFACE=eth0

EXPOSE 8000
ENTRYPOINT ["/entrypoint.sh"]
