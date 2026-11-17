/* ============================================================
   NovaTV — app.js otimizado
   Player HLS (hls.js) + MP4 nativo
   Navegação por teclado/controle remoto
   Favoritos, EPG, busca e canais recomendados
   ============================================================ */

"use strict";

/* ============================================================
   1. CONFIGURAÇÃO DOS CANAIS
   ============================================================ */

const CHANNELS = [
  {
    id: "nova-1",
    name: "Nova Notícias",
    category: "aovivo",
    isLive: true,
    url: "",
    desc: "Jornalismo 24 horas com cobertura dos principais acontecimentos.",
    epg: [
      ["06:00", "Manhã Nova"],
      ["09:00", "Jornal das Dez"],
      ["12:00", "Nova Notícias ao Meio-dia"],
      ["13:00", "Economia em Dia"],
      ["18:00", "Plantão Nova"],
      ["21:00", "Grandes Reportagens"]
    ]
  },
  {
    id: "nova-2",
    name: "Nova Esportes",
    category: "aovivo",
    isLive: true,
    url: "",
    desc: "Transmissões esportivas, mesa-redonda e resumos da rodada.",
    epg: [
      ["07:00", "Bem-vindo ao Clan"],
      ["10:00", "Café com Bola"],
      ["14:00", "Volta Rápida"],
      ["17:00", "Mesa Redonda Nova"],
      ["20:00", "Jogo da Noite"]
    ]
  },
  {
    id: "nova-3",
    name: "Nova Documenta",
    category: "aovivo",
    isLive: true,
    url: "",
    desc: "Documentários sobre natureza, ciência e culturas do mundo.",
    epg: [
      ["08:00", "Planeta Extremo"],
      ["11:00", "Mundos Pequenos"],
      ["15:00", "Rotas do Oceano"],
      ["19:00", "Origens"],
      ["22:00", "Universo Sem Fim"]
    ]
  },
  {
    id: "nova-4",
    name: "Nova Culinária",
    category: "aovivo",
    isLive: true,
    url: "",
    desc: "Programas de gastronomia com chefs convidados.",
    epg: [
      ["09:00", "Café & Panela"],
      ["12:30", "Almoço Rápido"],
      ["16:00", "Doces & Segredos"],
      ["20:30", "Cozinha de Autor"]
    ]
  },
  {
    id: "filme-1",
    name: "Sala Nova — Aventura",
    category: "filmes",
    isLive: false,
    url: "",
    desc: "Maratona de filmes de aventura em exibição contínua.",
    epg: [
      ["10:00", "Trilhas do Horizonte"],
      ["12:00", "Vento Sul"],
      ["14:30", "O Último Farol"],
      ["17:00", "Rota Selvagem"],
      ["20:00", "Alto Mar"]
    ]
  },
  {
    id: "filme-2",
    name: "Sala Nova — Clássicos",
    category: "filmes",
    isLive: false,
    url: "",
    desc: "Grandes clássicos do cinema restaurados em alta definição.",
    epg: [
      ["11:00", "Cidade Antiga"],
      ["13:30", "A Sétima Carta"],
      ["16:00", "Noite de Gala"],
      ["19:30", "Estrela de Prata"]
    ]
  },
  {
    id: "serie-1",
    name: "Nova Séries — Drama",
    category: "series",
    isLive: false,
    url: "",
    desc: "Maratona da série dramática Fronteiras.",
    epg: [
      ["09:00", "Fronteiras T1E1"],
      ["10:00", "Fronteiras T1E2"],
      ["11:00", "Fronteiras T1E3"],
      ["12:00", "Fronteiras T1E4"],
      ["13:00", "Fronteiras T1E5"]
    ]
  },
  {
    id: "serie-2",
    name: "Nova Séries — Comédia",
    category: "series",
    isLive: false,
    url: "",
    desc: "Sitcoms e comédias leves para todas as idades.",
    epg: [
      ["08:00", "Vizinhança Feliz E1"],
      ["08:30", "Vizinhança Feliz E2"],
      ["09:00", "Papo de Elevador E1"],
      ["09:30", "Papo de Elevador E2"]
    ]
  }
];

/* ============================================================
   2. ESTADO GLOBAL
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

const CATEGORY_LABELS = {
  inicio: "Canais ao vivo",
  aovivo: "Canais ao vivo",
  filmes: "Canais de filmes",
  series: "Canais de séries",
  favoritos: "Seus favoritos"
};

/* ============================================================
   3. ELEMENTOS E UTILITÁRIOS
   ============================================================ */

const $ = (selector) => document.querySelector(selector);

const video = $("#video");

function el(tag, className = "", text = null) {
  const node = document.createElement(tag);

  if (className) node.className = className;
  if (text !== null) node.textContent = text;

  return node;
}

function setText(selector, value) {
  const node = $(selector);
  if (node) node.textContent = value ?? "";
}

function setHidden(selector, hidden) {
  const node = $(selector);
  if (node) node.hidden = hidden;
}

function getChannel(id) {
  return CHANNELS.find(channel => channel.id === id) || null;
}

function isValidChannelUrl(url) {
  if (typeof url !== "string" || !url.trim()) return false;

  if (url.includes("COLE_A_URL_DO_SEU_STREAM_AQUI")) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function loadFavorites() {
  try {
    const saved = JSON.parse(
      localStorage.getItem("novatv.favorites") || "[]"
    );

    if (!Array.isArray(saved)) return [];

    return saved.filter(id =>
      typeof id === "string" && getChannel(id)
    );
  } catch {
    return [];
  }
}

function saveFavorites() {
  try {
    localStorage.setItem(
      "novatv.favorites",
      JSON.stringify([...state.favorites])
    );
  } catch (error) {
    console.warn("Não foi possível salvar os favoritos:", error);
  }
}

/* ============================================================
   4. RELÓGIO
   ============================================================ */

function startClock() {
  const time = $("#clockTime");
  const date = $("#clockDate");

  if (!time && !date) return;

  const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "short"
  });

  function updateClock() {
    const now = new Date();

    if (time) {
      time.textContent = now.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit"
      });
    }

    if (date) {
      date.textContent = dateFormatter.format(now);
    }
  }

  updateClock();
  setInterval(updateClock, 30000);
}

/* ============================================================
   5. FILTROS E GRADE
   ============================================================ */

function matchesFilters(channel) {
  const category = state.category;

  const matchesCategory =
    category === "inicio" ||
    (
      category === "favoritos"
        ? state.favorites.has(channel.id)
        : channel.category === category
    );

  const query = state.search.trim().toLowerCase();

  const matchesSearch =
    !query ||
    channel.name.toLowerCase().includes(query) ||
    channel.desc.toLowerCase().includes(query);

  return matchesCategory && matchesSearch;
}

function channelCard(channel) {
  const card = el("button", "card");

  card.type = "button";
  card.dataset.id = channel.id;

  card.setAttribute("aria-label", channel.name);

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

  if (state.selectedId === channel.id) {
    thumb.appendChild(el("span", "card__playing", "▶"));
  }

  const body = el("div", "card__body");

  body.appendChild(
    el("h3", "card__name", channel.name)
  );

  const labels = {
    aovivo: "Ao vivo",
    filmes: "Filmes",
    series: "Séries"
  };

  const meta = el("p", "card__meta");

  meta.appendChild(
    el("span", "", labels[channel.category] || "Canal")
  );

  meta.appendChild(el("span", "dot"));

  meta.appendChild(
    el("span", "", channel.isLive ? "Em transmissão" : "Programado")
  );

  body.appendChild(meta);

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

  if (!grid) return;

  const channels = CHANNELS.filter(matchesFilters);

  grid.replaceChildren(
    ...channels.map(channelCard)
  );

  if (empty) {
    empty.hidden = channels.length > 0;
  }

  setText(
    "#gridTitle",
    CATEGORY_LABELS[state.category] || "Canais"
  );
}

function renderShelves() {
  const watchingSection = $("#watchingSection");
  const watchingRow = $("#watchingRow");
  const recommendedRow = $("#recommendedRow");

  const watching = state.watching
    .map(getChannel)
    .filter(Boolean);

  if (watchingSection) {
    watchingSection.hidden = watching.length === 0;
  }

  if (watchingRow) {
    watchingRow.replaceChildren(
      ...watching.map(channelCard)
    );
  }

  const recommended = CHANNELS
    .filter(channel =>
      channel.isLive && channel.id !== state.selectedId
    )
    .slice(0, 6);

  if (recommendedRow) {
    recommendedRow.replaceChildren(
      ...recommended.map(channelCard)
    );
  }
}

/* ============================================================
   6. EPG — PROGRAMAÇÃO
   ============================================================ */

function parseStart(time) {
  if (typeof time !== "string" || !/^\d{2}:\d{2}$/.test(time)) {
    return -1;
  }

  const [hours, minutes] = time.split(":").map(Number);

  if (hours > 23 || minutes > 59) return -1;

  return hours * 60 + minutes;
}

function currentProgram(channel) {
  if (!Array.isArray(channel.epg) || !channel.epg.length) {
    return null;
  }

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const schedule = channel.epg
    .filter(item =>
      Array.isArray(item) &&
      item.length >= 2 &&
      parseStart(item[0]) >= 0
    )
    .sort((a, b) => parseStart(a[0]) - parseStart(b[0]));

  if (!schedule.length) return null;

  let current = null;

  for (const item of schedule) {
    if (parseStart(item[0]) <= currentMinutes) {
      current = item[1];
    } else {
      break;
    }
  }

  return current;
}

function renderEpg(channel) {
  const section = $("#epgSection");
  const timeline = $("#epgTimeline");

  if (!section || !timeline) return;

  const schedule = Array.isArray(channel.epg)
    ? channel.epg.filter(item =>
        Array.isArray(item) &&
        item.length >= 2 &&
        parseStart(item[0]) >= 0
      ).sort((a, b) => parseStart(a[0]) - parseStart(b[0]))
    : [];

  if (!schedule.length) {
    section.hidden = true;
    return;
  }

  setText("#epgChannelName", channel.name);

  timeline.replaceChildren();

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  let currentIndex = -1;

  for (let i = 0; i < schedule.length; i++) {
    const start = parseStart(schedule[i][0]);
    const nextStart = schedule[i + 1]
      ? parseStart(schedule[i + 1][0])
      : 1440;

    if (currentMinutes >= start && currentMinutes < nextStart) {
      currentIndex = i;
      break;
    }
  }

  schedule.forEach(([time, name], index) => {
    const item = el("div", "epg__item");

    if (index === currentIndex) {
      item.classList.add("epg__item--current");
    } else if (index === currentIndex + 1) {
      item.classList.add("epg__item--next");
    }

    item.appendChild(el("span", "epg__time", time));
    item.appendChild(el("p", "epg__name", name));

    if (index === currentIndex) {
      item.appendChild(
        el("span", "epg__badge", "NO AR AGORA")
      );
    }

    timeline.appendChild(item);
  });

  section.hidden = false;
}

/* ============================================================
   7. PLAYER HLS / MP4
   ============================================================ */

function showPlayerState(which) {
  const states = {
    noUrl: $("#stateNoUrl"),
    loading: $("#stateLoading"),
    noSignal: $("#stateNoSignal"),
    error: $("#stateError")
  };

  Object.entries(states).forEach(([key, node]) => {
    if (node) {
      // A mensagem de carregamento permanece desativada.
      node.hidden = key !== which || key === "loading";
    }
  });
}

function destroyHls() {
  if (state.hls) {
    try {
      state.hls.destroy();
    } catch (error) {
      console.warn("Erro ao encerrar HLS:", error);
    }

    state.hls = null;
  }
}

function stopPlayer() {
  destroyHls();

  if (!video) return;

  video.pause();
  video.removeAttribute("src");

  try {
    video.load();
  } catch (error) {
    console.warn("Erro ao limpar player:", error);
  }
}

function updatePlayPauseIcon() {
  if (!video) return;

  const playIcon = $(".pbtn__icon--play");
  const pauseIcon = $(".pbtn__icon--pause");

  if (playIcon) {
    playIcon.style.display = video.paused ? "" : "none";
  }

  if (pauseIcon) {
    pauseIcon.style.display = video.paused ? "none" : "";
  }
}

function isHlsSource(url) {
  return /\.m3u8($|[?#])/i.test(url);
}

function showError(message, requestId) {
  // Ignora erros pertencentes a um canal anterior.
  if (requestId !== undefined && requestId !== state.requestId) {
    return;
  }

  destroyHls();

  if (video) {
    video.pause();
  }

  setText("#errorMessage", message);
  showPlayerState("error");
}

function attachSource(channel, requestId) {
  stopPlayer();

  if (!video) {
    console.error("Elemento #video não encontrado no HTML.");
    return false;
  }

  if (!isValidChannelUrl(channel.url)) {
    showPlayerState("noUrl");
    return false;
  }

  // Não exibe o overlay de carregamento.
  showPlayerState("none");

  const url = channel.url.trim();

  if (isHlsSource(url)) {
    // Safari e dispositivos com suporte HLS nativo.
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.load();
      return true;
    }

    // HLS.js para Chrome, Edge e Firefox.
    if (window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        maxBufferLength: 30,
        maxMaxBufferLength: 60
      });

      state.hls = hls;

      hls.on(window.Hls.Events.ERROR, (_event, data) => {
        if (requestId !== state.requestId) return;
        if (!data.fatal) return;

        if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
          showError(
            "Falha de rede ao acessar a transmissão. Verifique a URL, os segmentos HLS e as permissões CORS.",
            requestId
          );
        } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
          showError(
            "Erro de mídia. O formato da transmissão pode ser incompatível.",
            requestId
          );
        } else {
          showError(
            "Não foi possível iniciar a transmissão HLS.",
            requestId
          );
        }
      });

      hls.attachMedia(video);

      hls.on(window.Hls.Events.MEDIA_ATTACHED, () => {
        if (requestId !== state.requestId) return;
        hls.loadSource(url);
      });

      return true;
    }

    showError(
      "Este navegador não oferece suporte à reprodução HLS necessária.",
      requestId
    );

    return false;
  }

  // MP4 e formatos nativos compatíveis.
  video.src = url;
  video.load();

  return true;
}

/* ============================================================
   8. SELEÇÃO E REPRODUÇÃO DOS CANAIS
   ============================================================ */

function selectChannel(id) {
  const channel = getChannel(id);

  if (!channel || !video) return;

  // Identificador evita que eventos antigos afetem o canal atual.
  const requestId = ++state.requestId;

  state.selectedId = id;

  state.watching = [
    id,
    ...state.watching.filter(item => item !== id)
  ].slice(0, 6);

  setText("#heroTitle", channel.name);
  setText("#heroDesc", channel.desc);

  setHidden("#heroLiveTag", !channel.isLive);
  setHidden("#liveBadge", !channel.isLive);

  updateFavButton(channel);

  renderEpg(channel);
  renderGrid();
  renderShelves();

  const sourceReady = attachSource(channel, requestId);

  if (!sourceReady) {
    stopPlayer();
    updatePlayPauseIcon();
    return;
  }

  // Autoplay silenciado para compatibilidade com navegadores.
  video.muted = true;

  const playPromise = video.play();

  if (playPromise && typeof playPromise.catch === "function") {
    playPromise
      .then(() => {
        if (requestId !== state.requestId) return;

        // Mantém o áudio liberado depois do início da reprodução.
        video.muted = false;
        updatePlayPauseIcon();
      })
      .catch(() => {
        if (requestId !== state.requestId) return;

        // O navegador pode bloquear o autoplay.
        video.pause();
        video.muted = false;
        updatePlayPauseIcon();
      });
  }
}

/* ============================================================
   9. EVENTOS DO PLAYER
   ============================================================ */

function setupPlayerControls() {
  if (!video) {
    console.error("O HTML precisa conter <video id='video'>.");
    return;
  }

  const playPause = $("#playPauseBtn");
  const mute = $("#muteBtn");
  const volume = $("#volumeSlider");
  const fullscreen = $("#fullscreenBtn");
  const speed = $("#speedSelect");

  function togglePlay() {
    if (!video.currentSrc && !video.src) return;

    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }

  playPause?.addEventListener("click", togglePlay);

  video.addEventListener("play", updatePlayPauseIcon);
  video.addEventListener("pause", updatePlayPauseIcon);

  video.addEventListener("playing", () => {
    showPlayerState("none");
  });

  // Não exibe overlay de carregamento durante buffering.
  video.addEventListener("waiting", () => {});

  video.addEventListener("error", () => {
    if (!state.selectedId) return;

    // Erros do vídeo sem uma fonte atual são ignorados.
    if (!video.currentSrc && !video.src) return;

    showError(
      "O stream não pôde ser carregado. Verifique a URL, o servidor e as permissões CORS.",
      state.requestId
    );
  });

  video.addEventListener("timeupdate", () => {
    const label = $("#timeLabel");
    if (!label) return;

    if (Number.isFinite(video.duration) && video.duration > 0) {
      const format = seconds => {
        const minutes = Math.floor(seconds / 60);
        const remaining = Math.floor(seconds % 60);

        return (
          String(minutes).padStart(2, "0") +
          ":" +
          String(remaining).padStart(2, "0")
        );
      };

      label.textContent =
        `${format(video.currentTime)} / ${format(video.duration)}`;
    } else {
      label.textContent = "AO VIVO";
    }
  });

  mute?.addEventListener("click", () => {
    video.muted = !video.muted;
    mute.style.opacity = video.muted ? "0.5" : "1";
  });

  volume?.addEventListener("input", () => {
    video.volume = Number(volume.value) / 100;
    video.muted = video.volume === 0;

    if (mute) {
      mute.style.opacity = video.muted ? "0.5" : "1";
    }
  });

  fullscreen?.addEventListener("click", async () => {
    const shell = $("#playerShell");

    if (!shell) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (shell.requestFullscreen) {
        await shell.requestFullscreen();
      }
    } catch (error) {
      console.warn("Não foi possível ativar tela cheia:", error);
    }
  });

  speed?.addEventListener("change", () => {
    const rate = Number(speed.value);

    video.playbackRate =
      Number.isFinite(rate) && rate > 0 ? rate : 1;
  });

  const retry = () => {
    if (state.selectedId) {
      selectChannel(state.selectedId);
    }
  };

  $("#retryBtn")?.addEventListener("click", retry);
  $("#errorRetryBtn")?.addEventListener("click", retry);

  updatePlayPauseIcon();
}

/* ============================================================
   10. FAVORITOS
   ============================================================ */

function updateFavButton(channel) {
  if (!channel) return;

  const button = $("#heroFavBtn");
  const label = $("#heroFavLabel");

  const isFavorite = state.favorites.has(channel.id);

  if (button) {
    button.setAttribute("aria-pressed", String(isFavorite));
  }

  if (label) {
    label.textContent = isFavorite
      ? "Nos favoritos"
      : "Favoritar";
  }
}

function setupFavorites() {
  const button = $("#heroFavBtn");

  if (!button) return;

  button.addEventListener("click", () => {
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
   11. NAVEGAÇÃO E BUSCA
   ============================================================ */

function setupNav() {
  const nav = $("#mainNav");
  const search = $("#searchInput");

  nav?.addEventListener("click", event => {
    const button = event.target.closest(".topnav__item");

    if (!button) return;

    const category = button.dataset.category;

    if (!category) return;

    state.category = category;

    nav.querySelectorAll(".topnav__item").forEach(item => {
      const active = item === button;

      item.classList.toggle("is-active", active);

      if (active) {
        item.setAttribute("aria-current", "page");
      } else {
        item.removeAttribute("aria-current");
      }
    });

    renderGrid();
  });

  search?.addEventListener("input", event => {
    state.search = event.target.value || "";
    renderGrid();
  });

  $("#profileBtn")?.addEventListener("click", () => {
    alert(
      `Perfil "N" — ${state.favorites.size} canal(is) favorito(s).`
    );
  });
}

/* ============================================================
   12. NAVEGAÇÃO PELO TECLADO
   ============================================================ */

function gridColumns() {
  const grid = $("#channelGrid");

  if (!grid || !grid.children.length) return 1;

  const first = grid.children[0].getBoundingClientRect();

  if (!first.width) return 1;

  let columns = 1;

  for (let i = 1; i < grid.children.length; i++) {
    const item = grid.children[i].getBoundingClientRect();

    if (Math.abs(item.top - first.top) > 5) break;

    columns++;
  }

  return Math.max(1, columns);
}

function setupKeyboard() {
  document.addEventListener("keydown", event => {
    const active = document.activeElement;

    const typing = active &&
      ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName);

    if (typing) return;

    if (event.key === " " && active?.classList.contains("card")) {
      return;
    }

    if (event.key === " " && !typing) {
      event.preventDefault();
      $("#playPauseBtn")?.click();
      return;
    }

    switch (event.key) {
      case "ArrowRight":
      case "ArrowLeft":
      case "ArrowUp":
      case "ArrowDown": {
        const cards = [
          ...document.querySelectorAll("#channelGrid .card")
        ];

        if (!cards.length) return;

        event.preventDefault();

        const index = cards.indexOf(active);
        const columns = gridColumns();

        let next = index;

        if (index === -1) {
          next = 0;
        } else if (event.key === "ArrowRight") {
          next = Math.min(index + 1, cards.length - 1);
        } else if (event.key === "ArrowLeft") {
          next = Math.max(index - 1, 0);
        } else if (event.key === "ArrowDown") {
          next = Math.min(index + columns, cards.length - 1);
        } else if (event.key === "ArrowUp") {
          next = Math.max(index - columns, 0);
        }

        cards[next].focus();

        cards[next].scrollIntoView({
          block: "nearest",
          behavior: "smooth"
        });

        break;
      }

      case "Escape":
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }

        $("#searchInput")?.blur();
        break;

      case "f":
      case "F":
        $("#fullscreenBtn")?.click();
        break;

      case "m":
      case "M":
        $("#muteBtn")?.click();
        break;
    }
  });
}

/* ============================================================
   13. INICIALIZAÇÃO
   ============================================================ */

function init() {
  if (window.novaTVInitialized) return;

  window.novaTVInitialized = true;

  if (!video) {
    console.error(
      "NovaTV: elemento <video id='video'> não encontrado."
    );
  }

  startClock();

  setupPlayerControls();
  setupFavorites();
  setupNav();
  setupKeyboard();

  renderGrid();
  renderShelves();

  const firstChannel =
    CHANNELS.find(channel => channel.isLive) ||
    CHANNELS[0];

  if (!firstChannel) return;

  state.selectedId = firstChannel.id;

  setText("#heroTitle", firstChannel.name);
  setText("#heroDesc", firstChannel.desc);

  setHidden("#heroLiveTag", !firstChannel.isLive);
  setHidden("#liveBadge", true);

  updateFavButton(firstChannel);
  renderEpg(firstChannel);

  renderGrid();
  renderShelves();

  showPlayerState("noUrl");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
