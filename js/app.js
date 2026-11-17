
"use strict";

/* =====================================================
   NOVATV - APP.JS
   Backend Node.js + HLS.js + MP4
   ===================================================== */

/* 1. CONFIGURAÇÃO */

const API_BASE_URL =
  "https://singles-secretariat-annual-consent.trycloudflare.com";

const API_CHANNELS = `${API_BASE_URL}/api/channels`;
const API_CHANNELS_JSON = `${API_BASE_URL}/api/channels-json`;

const $ = selector => document.querySelector(selector);

const video = $("#video");

let channels = [];
let selectedChannel = null;
let hls = null;
let requestId = 0;

let favorites = new Set(
  JSON.parse(localStorage.getItem("novatv.favorites") || "[]")
);

/* 2. ESTADO VISUAL */

function playerState(state = "none", message = "") {

  ["stateNoUrl", "stateLoading", "stateNoSignal", "stateError"]
    .forEach(id => {
      const element = document.getElementById(id);
      if (element) element.hidden = true;
    });

  const element = {
    noUrl: $("#stateNoUrl"),
    noSignal: $("#stateNoSignal"),
    error: $("#stateError")
  }[state];

  if (element) element.hidden = false;

  if (state === "error" && $("#errorMessage")) {
    $("#errorMessage").textContent = message;
  }
}

/* 3. CONEXÃO COM BACKEND */

async function checkServer() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      cache: "no-store"
    });

    if (!response.ok) throw new Error("Servidor indisponível");

    console.log("Backend conectado.");
    return true;

  } catch (error) {
    console.error("Erro no backend:", error);
    return false;
  }
}

async function loadChannels() {

  try {

    let response = await fetch(API_CHANNELS, {
      cache: "no-store"
    });

    if (!response.ok) {
      response = await fetch(API_CHANNELS_JSON, {
        cache: "no-store"
      });
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    channels = Array.isArray(data)
      ? data
      : data.channels || [];

    renderChannels();

    console.log(`${channels.length} canais carregados.`);

  } catch (error) {

    console.error("Erro ao carregar canais:", error);

    playerState(
      "error",
      "Não foi possível conectar ao servidor de canais."
    );

  }
}

/* 4. BUSCAR CANAL INDIVIDUAL */

async function getChannel(id) {

  const response = await fetch(
    `${API_BASE_URL}/api/channels/${encodeURIComponent(id)}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error(`Canal não encontrado: HTTP ${response.status}`);
  }

  const data = await response.json();

  return data.channel || data;
}

/* 5. LIMPAR PLAYER */

function destroyPlayer() {

  if (hls) {
    hls.destroy();
    hls = null;
  }

  video.pause();
  video.removeAttribute("src");
  video.load();
}

/* 6. REPRODUZIR TRANSMISSÃO */

async function playChannel(channel) {

  if (!channel || !channel.url) {
    playerState("noUrl");
    return;
  }

  const id = ++requestId;

  destroyPlayer();

  selectedChannel = channel;

  playerState("none");

  const url = channel.url.trim();

  video.muted = true;
  video.playsInline = true;

  // HLS

  if (url.toLowerCase().includes(".m3u8")) {

    // HLS nativo

    if (video.canPlayType("application/vnd.apple.mpegurl")) {

      video.src = url;
      video.load();

      video.play().catch(error => {
        console.warn("Clique em play para iniciar:", error);
      });

      return;
    }

    // HLS.js

    if (window.Hls && Hls.isSupported()) {

      let networkRetries = 0;
      let mediaRetries = 0;

      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 30,
        manifestLoadingMaxRetry: 3,
        levelLoadingMaxRetry: 3,
        fragLoadingMaxRetry: 3
      });

      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        if (id === requestId) {
          hls.loadSource(url);
        }
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {

        if (id !== requestId) return;

        video.play().catch(error => {
          console.warn("Reprodução manual necessária:", error);
        });

      });

      hls.on(Hls.Events.ERROR, (_event, data) => {

        if (id !== requestId || !data.fatal) return;

        console.error("Erro HLS:", data);

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {

          if (networkRetries++ < 2) {
            hls.startLoad();
          } else {
            playerState(
              "error",
              "Falha de conexão com a transmissão."
            );
          }

        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {

          if (mediaRetries++ < 2) {
            hls.recoverMediaError();
          } else {
            playerState(
              "error",
              "Falha na reprodução da mídia."
            );
          }

        } else {

          playerState(
            "error",
            "Não foi possível reproduzir este canal."
          );

        }

      });

      hls.attachMedia(video);

      return;
    }

    playerState(
      "error",
      "Seu navegador não suporta HLS."
    );

    return;
  }

  // MP4

  video.src = url;
  video.load();

  video.play().catch(error => {
    console.warn("Reprodução manual necessária:", error);
  });

}

/* 7. SELECIONAR CANAL */

async function selectChannel(id) {

  try {

    const channel = await getChannel(id);

    if (!channel.url) {
      playerState("noUrl");
      return;
    }

    selectedChannel = channel;

    $("#heroTitle").textContent = channel.name || "Canal";
    $("#heroDesc").textContent = channel.group || "";

    if ($("#heroLiveTag")) {
      $("#heroLiveTag").hidden = false;
    }

    if ($("#liveBadge")) {
      $("#liveBadge").hidden = false;
    }

    updateFavoriteButton();
    renderChannels();

    await playChannel(channel);

  } catch (error) {

    console.error("Erro ao selecionar canal:", error);

    playerState(
      "error",
      "Não foi possível acessar este canal no servidor."
    );

  }
}

/* 8. RENDERIZAR CANAIS */

function renderChannels() {

  const grid = $("#channelGrid");

  if (!grid) return;

  grid.replaceChildren();

  const search = ($("#searchInput")?.value || "").toLowerCase();

  const category = document.querySelector(
    ".topnav__item.is-active"
  )?.dataset.category || "inicio";

  const filtered = channels.filter(channel => {

    const name = (channel.name || "").toLowerCase();
    const group = (channel.group || "").toLowerCase();

    const matchesSearch =
      name.includes(search) || group.includes(search);

    const matchesCategory =
      category === "inicio" ||
      (category === "favoritos"
        ? favorites.has(channel.id)
        : group.includes(category.toLowerCase()));

    return matchesSearch && matchesCategory;

  });

  filtered.forEach(channel => {

    const card = document.createElement("button");

    card.type = "button";
    card.className = "card";

    if (selectedChannel?.id === channel.id) {
      card.classList.add("is-selected");
    }

    const thumb = document.createElement("div");
    thumb.className = "card__thumb";

    if (channel.logo) {

      const img = document.createElement("img");

      img.src = channel.logo;
      img.alt = channel.name || "Canal";
      img.loading = "lazy";

      thumb.appendChild(img);

    } else {

      const initial = document.createElement("span");

      initial.className = "card__initial";
      initial.textContent = (channel.name || "?").charAt(0);

      thumb.appendChild(initial);

    }

    const body = document.createElement("div");
    body.className = "card__body";

    const title = document.createElement("h3");
    title.className = "card__name";
    title.textContent = channel.name || "Canal";

    const group = document.createElement("p");
    group.className = "card__meta";
    group.textContent = channel.group || "TV";

    body.append(title, group);

    card.append(thumb, body);

    card.addEventListener("click", () => {
      selectChannel(channel.id);
    });

    grid.appendChild(card);

  });

  if ($("#gridEmpty")) {
    $("#gridEmpty").hidden = filtered.length > 0;
  }

}

/* 9. FAVORITOS */

function toggleFavorite() {

  if (!selectedChannel) return;

  const id = selectedChannel.id;

  if (favorites.has(id)) {
    favorites.delete(id);
  } else {
    favorites.add(id);
  }

  localStorage.setItem(
    "novatv.favorites",
    JSON.stringify([...favorites])
  );

  updateFavoriteButton();
  renderChannels();

}

function updateFavoriteButton() {

  if (!selectedChannel) return;

  const active = favorites.has(selectedChannel.id);

  if ($("#heroFavBtn")) {
    $("#heroFavBtn").setAttribute(
      "aria-pressed",
      String(active)
    );
  }

  if ($("#heroFavLabel")) {
    $("#heroFavLabel").textContent =
      active ? "Nos favoritos" : "Favoritar";
  }

}

/* 10. CONTROLES */

function setupControls() {

  $("#heroFavBtn")?.addEventListener(
    "click",
    toggleFavorite
  );

  $("#searchInput")?.addEventListener(
    "input",
    renderChannels
  );

  $("#mainNav")?.addEventListener("click", event => {

    const button = event.target.closest(".topnav__item");

    if (!button) return;

    document.querySelectorAll(".topnav__item")
      .forEach(item => {
        item.classList.toggle("is-active", item === button);
      });

    renderChannels();

  });

  $("#playPauseBtn")?.addEventListener("click", () => {

    if (video.paused) {
      video.play().catch(console.error);
    } else {
      video.pause();
    }

  });

  video.addEventListener("playing", () => {
    playerState("none");
  });

  video.addEventListener("error", () => {

    if (!video.currentSrc) return;

    console.error("Erro de vídeo:", video.error);

    playerState(
      "error",
      "Erro ao reproduzir a transmissão."
    );

  });

  $("#retryBtn")?.addEventListener("click", () => {
    if (selectedChannel) playChannel(selectedChannel);
  });

  $("#errorRetryBtn")?.addEventListener("click", () => {
    if (selectedChannel) playChannel(selectedChannel);
  });

  $("#muteBtn")?.addEventListener("click", () => {
    video.muted = !video.muted;
  });

  $("#volumeSlider")?.addEventListener("input", event => {
    video.volume = Number(event.target.value) / 100;
    video.muted = video.volume === 0;
  });

  $("#fullscreenBtn")?.addEventListener("click", () => {

    const shell = $("#playerShell");

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      shell?.requestFullscreen();
    }

  });

  $("#speedSelect")?.addEventListener("change", event => {
    video.playbackRate = Number(event.target.value) || 1;
  });

}

/* 11. INICIAR APP */

async function init() {

  if (!video) {
    console.error("Elemento #video não encontrado no HTML.");
    return;
  }

  setupControls();

  const connected = await checkServer();

  if (!connected) {
    playerState(
      "error",
      "O servidor de streaming está indisponível."
    );
    return;
  }

  await loadChannels();

}

document.addEventListener("DOMContentLoaded", init);

