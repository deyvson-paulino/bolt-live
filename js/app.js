
/* ============================================================
   NOVATV - APP.JS
   Player HLS.js + MP4
   ============================================================ */

"use strict";

/* ============================================================
   1. CONFIGURAÇÃO DOS CANAIS
   IMPORTANTE: substitua as URLs pelos seus endereços.
   ============================================================ */

const CHANNELS = [
  {
    id: "tv-rabisco",
    name: "TV RABISCO",
    category: "aovivo",
    isLive: true,
    url: "COLOQUE_A_URL_M3U8_DA_TV_RABISCO",
    desc: "Transmissão ao vivo",
    epg: []
  },
  {
    id: "redbull",
    name: "REDBULL TV",
    category: "aovivo",
    isLive: true,
    url: "COLOQUE_A_URL_M3U8_DA_REDBULL",
    desc: "Programação Red Bull TV",
    epg: []
  }
];

/* ============================================================
   2. ESTADO
   ============================================================ */

const state = {
  category: "inicio",
  search: "",
  selectedId: null,
  hls: null,
  favorites: new Set(loadFavorites()),
  watching: [],
  requestId: 0
};

const $ = selector => document.querySelector(selector);

const video = $("#video");

/* ============================================================
   3. UTILITÁRIOS
   ============================================================ */

function loadFavorites() {
  try {
    return JSON.parse(
      localStorage.getItem("novatv.favorites") || "[]"
    );
  } catch {
    return [];
  }
}

function saveFavorites() {
  localStorage.setItem(
    "novatv.favorites",
    JSON.stringify([...state.favorites])
  );
}

function getChannel(id) {
  return CHANNELS.find(channel => channel.id === id);
}

function el(tag, className, text) {
  const node = document.createElement(tag);

  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;

  return node;
}

/* ============================================================
   4. RELÓGIO
   ============================================================ */

function startClock() {
  const time = $("#clockTime");
  const date = $("#clockDate");

  if (!time || !date) return;

  function update() {
    const now = new Date();

    time.textContent = now.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit"
    });

    date.textContent = now.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "short"
    });
  }

  update();
  setInterval(update, 30000);
}

/* ============================================================
   5. ESTADOS DO PLAYER
   ============================================================ */

function showPlayerState(which) {
  const states = {
    none: null,
    noUrl: $("#stateNoUrl"),
    loading: $("#stateLoading"),
    noSignal: $("#stateNoSignal"),
    error: $("#stateError")
  };

  Object.entries(states).forEach(([key, node]) => {
    if (node) node.hidden = key !== which;
  });
}

function showError(message) {
  destroyHls();

  const errorMessage = $("#errorMessage");

  if (errorMessage) {
    errorMessage.textContent = message;
  }

  showPlayerState("error");
}

/* ============================================================
   6. LIMPEZA DA TRANSMISSÃO
   ============================================================ */

function destroyHls() {
  if (state.hls) {
    state.hls.destroy();
    state.hls = null;
  }

  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
}

/* ============================================================
   7. NOVO SISTEMA DE CARREGAMENTO HLS
   ============================================================ */

function attachSource(channel) {

  const requestId = ++state.requestId;

  destroyHls();

  if (!channel || !channel.url) {
    showPlayerState("noUrl");
    return;
  }

  const url = channel.url.trim();

  if (
    url.includes("COLOQUE_A_URL") ||
    url.includes("COLE_A_URL") ||
    url === ""
  ) {
    showPlayerState("noUrl");
    return;
  }

  showPlayerState("loading");

  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;

  /* ========================================================
     HLS
     ======================================================== */

  if (url.toLowerCase().includes(".m3u8")) {

    // HLS NATIVO
    if (
      video.canPlayType("application/vnd.apple.mpegurl")
    ) {

      video.src = url;
      video.load();

      return;
    }

    // HLS.JS
    if (
      window.Hls &&
      window.Hls.isSupported()
    ) {

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
        maxBufferLength: 30,
        maxMaxBufferLength: 60
      });

      state.hls = hls;

      hls.on(Hls.Events.MEDIA_ATTACHED, () => {

        if (requestId !== state.requestId) return;

        hls.loadSource(url);

      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {

        if (requestId !== state.requestId) return;

        showPlayerState("loading");

        video.play().catch(() => {
          video.muted = false;
          updatePlayPauseIcon();
        });

      });

      hls.on(Hls.Events.ERROR, (_event, data) => {

        if (requestId !== state.requestId) return;

        if (!data.fatal) return;

        console.error("Erro HLS:", data);

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {

          console.warn("Tentando recuperar conexão...");

          hls.startLoad();

        } else if (
          data.type === Hls.ErrorTypes.MEDIA_ERROR
        ) {

          console.warn("Tentando recuperar mídia...");

          hls.recoverMediaError();

        } else {

          showError(
            "Não foi possível reproduzir esta transmissão."
          );

        }

      });

      hls.attachMedia(video);

      return;
    }

    showError(
      "Seu navegador não suporta reprodução HLS."
    );

    return;
  }

  /* ========================================================
     MP4
     ======================================================== */

  video.src = url;
  video.load();

  video.play().catch(() => {
    updatePlayPauseIcon();
  });

}

/* ============================================================
   8. SELEÇÃO DE CANAIS
   ============================================================ */

function selectChannel(id) {

  const channel = getChannel(id);

  if (!channel) return;

  state.selectedId = id;

  if (!state.watching.includes(id)) {
    state.watching.unshift(id);
  }

  state.watching = state.watching.slice(0, 6);

  $("#heroTitle").textContent = channel.name;
  $("#heroDesc").textContent = channel.desc;

  if ($("#heroLiveTag")) {
    $("#heroLiveTag").hidden = !channel.isLive;
  }

  updateFavButton(channel);

  renderEpg(channel);
  renderGrid();
  renderShelves();

  $("#liveBadge").hidden = !channel.isLive;

  attachSource(channel);
}

/* ============================================================
   9. CONTROLES DO PLAYER
   ============================================================ */

function updatePlayPauseIcon() {

  if (!video) return;

  const playing = !video.paused;

  $(".pbtn__icon--play").style.display =
    playing ? "none" : "";

  $(".pbtn__icon--pause").style.display =
    playing ? "" : "none";
}

function setupPlayerControls() {

  const playPause = $("#playPauseBtn");
  const mute = $("#muteBtn");
  const volume = $("#volumeSlider");
  const fullscreen = $("#fullscreenBtn");
  const speed = $("#speedSelect");

  playPause.addEventListener("click", () => {

    if (video.paused) {
      video.play().catch(console.error);
    } else {
      video.pause();
    }

  });

  video.addEventListener("play", updatePlayPauseIcon);
  video.addEventListener("pause", updatePlayPauseIcon);

  video.addEventListener("playing", () => {
    showPlayerState("none");
    video.muted = false;
  });

  video.addEventListener("waiting", () => {
    showPlayerState("loading");
  });

  video.addEventListener("error", () => {

    if (!video.currentSrc && !video.src) return;

    console.error("Erro no vídeo:", video.error);

    showError(
      "Falha ao carregar a transmissão. Verifique a URL, o servidor e o CORS."
    );

  });

  mute.addEventListener("click", () => {
    video.muted = !video.muted;
    mute.style.opacity = video.muted ? "0.5" : "1";
  });

  volume.addEventListener("input", () => {
    video.volume = volume.value / 100;
    video.muted = video.volume === 0;
  });

  fullscreen.addEventListener("click", () => {

    const shell = $("#playerShell");

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      shell.requestFullscreen?.();
    }

  });

  speed.addEventListener("change", () => {
    video.playbackRate = Number(speed.value) || 1;
  });

  const retry = () => {
    if (state.selectedId) {
      selectChannel(state.selectedId);
    }
  };

  $("#retryBtn").addEventListener("click", retry);
  $("#errorRetryBtn").addEventListener("click", retry);

  updatePlayPauseIcon();
}

/* ============================================================
   10. FAVORITOS
   ============================================================ */

function updateFavButton(channel) {

  const isFav = state.favorites.has(channel.id);

  $("#heroFavBtn").setAttribute(
    "aria-pressed",
    String(isFav)
  );

  $("#heroFavLabel").textContent =
    isFav ? "Nos favoritos" : "Favoritar";
}

function setupFavorites() {

  $("#heroFavBtn").addEventListener("click", () => {

    if (!state.selectedId) return;

    const id = state.selectedId;

    if (state.favorites.has(id)) {
      state.favorites.delete(id);
    } else {
      state.favorites.add(id);
    }

    saveFavorites();

    const channel = getChannel(id);

    updateFavButton(channel);
    renderGrid();
    renderShelves();

  });
}

/* ============================================================
   11. PROGRAMAÇÃO E EPG
   ============================================================ */

function currentProgram(channel) {

  if (!channel.epg || !channel.epg.length) return null;

  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();

  for (let i = 0; i < channel.epg.length; i++) {

    const [hour, name] = channel.epg[i];

    const [h, m] = hour.split(":").map(Number);

    const start = h * 60 + m;

    const next = channel.epg[i + 1];

    const end = next
      ? parseStart(next[0])
      : 1440;

    if (minutes >= start && minutes < end) {
      return name;
    }

  }

  return channel.epg[0][1];
}

function parseStart(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function renderEpg(channel) {

  const section = $("#epgSection");
  const timeline = $("#epgTimeline");

  if (!channel.epg || !channel.epg.length) {
    section.hidden = true;
    return;
  }

  $("#epgChannelName").textContent = channel.name;

  timeline.replaceChildren();

  channel.epg.forEach(([time, name]) => {

    const item = el("div", "epg__item");

    item.appendChild(el("span", "epg__time", time));
    item.appendChild(el("p", "epg__name", name));

    timeline.appendChild(item);

  });

  section.hidden = false;
}

/* ============================================================
   12. CARDS E GRADE
   ============================================================ */

function matchesFilters(channel) {

  const category = state.category;

  const okCategory =
    category === "inicio" ||
    (category === "favoritos"
      ? state.favorites.has(channel.id)
      : channel.category === category);

  const query = state.search.trim().toLowerCase();

  const okSearch =
    !query ||
    channel.name.toLowerCase().includes(query) ||
    channel.desc.toLowerCase().includes(query);

  return okCategory && okSearch;
}

function channelCard(channel) {

  const card = el("button", "card");

  card.type = "button";
  card.dataset.id = channel.id;

  if (state.selectedId === channel.id) {
    card.classList.add("is-selected");
  }

  const thumb = el("div", "card__thumb");

  thumb.appendChild(
    el("span", "card__initial", channel.name.charAt(0))
  );

  if (channel.isLive) {
    thumb.appendChild(el("span", "card__live", "AO VIVO"));
  }

  if (state.favorites.has(channel.id)) {
    thumb.appendChild(el("span", "card__fav", "♥"));
  }

  const body = el("div", "card__body");

  body.appendChild(
    el("h3", "card__name", channel.name)
  );

  body.appendChild(
    el(
      "p",
      "card__meta",
      channel.isLive ? "Ao vivo" : "Programado"
    )
  );

  const current = currentProgram(channel);

  if (current) {
    body.appendChild(
      el("p", "card__now", `Agora: ${current}`)
    );
  }

  card.append(thumb, body);

  card.addEventListener("click", () => {
    selectChannel(channel.id);
  });

  return card;
}

function renderGrid() {

  const grid = $("#channelGrid");

  const empty = $("#gridEmpty");

  grid.replaceChildren();

  const channels = CHANNELS.filter(matchesFilters);

  channels.forEach(channel => {
    grid.appendChild(channelCard(channel));
  });

  empty.hidden = channels.length > 0;

  $("#gridTitle").textContent =
    CATEGORY_LABELS[state.category] || "Canais";
}

function renderShelves() {

  const watching = $("#watchingSection");

  const watchingRow = $("#watchingRow");

  const list = state.watching
    .map(getChannel)
    .filter(Boolean);

  watching.hidden = list.length === 0;

  watchingRow.replaceChildren(
    ...list.map(channelCard)
  );

  const recommendations = CHANNELS
    .filter(c => c.isLive && c.id !== state.selectedId)
    .slice(0, 6);

  $("#recommendedRow").replaceChildren(
    ...recommendations.map(channelCard)
  );
}

/* ============================================================
   13. NAVEGAÇÃO
   ============================================================ */

const CATEGORY_LABELS = {
  inicio: "Canais ao vivo",
  aovivo: "Canais ao vivo",
  filmes: "Canais de filmes",
  series: "Canais de séries",
  favoritos: "Seus favoritos"
};

function setupNav() {

  $("#mainNav").addEventListener("click", event => {

    const button = event.target.closest(".topnav__item");

    if (!button) return;

    state.category = button.dataset.category;

    document.querySelectorAll(".topnav__item").forEach(item => {

      item.classList.toggle(
        "is-active",
        item === button
      );

    });

    renderGrid();

  });

  $("#searchInput").addEventListener("input", event => {

    state.search = event.target.value;

    renderGrid();

  });

}

/* ============================================================
   14. INICIALIZAÇÃO
   ============================================================ */

function init() {

  if (!video) {
    console.error("Elemento #video não encontrado.");
    return;
  }

  startClock();

  setupPlayerControls();
  setupFavorites();
  setupNav();

  renderGrid();
  renderShelves();

  const first = CHANNELS.find(channel => channel.isLive);

  if (first) {

    $("#heroTitle").textContent = first.name;
    $("#heroDesc").textContent = first.desc;

    $("#heroLiveTag").hidden = !first.isLive;

    updateFavButton(first);

    renderEpg(first);

    state.selectedId = first.id;

    renderGrid();
    renderShelves();

    showPlayerState("noUrl");

  }

}

document.addEventListener("DOMContentLoaded", init);
