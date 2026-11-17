
"use strict";

/* ============================================================
   NOVATV — APLICAÇÃO PRINCIPAL
   Backend Node.js + API REST + Player HLS/MP4

   Recursos:
   - Carregamento automático da playlist M3U pela API
   - Player HLS com hls.js
   - Reprodução MP4
   - Busca de canais
   - Categorias
   - Favoritos persistentes
   - Histórico da sessão
   - EPG
   - Navegação por teclado e controle remoto
   - Tela de erro
   - Reconexão de transmissões
   ============================================================ */


/* ============================================================
   1. CONFIGURAÇÃO
   ============================================================ */

// Endereço público do seu Cloudflare Tunnel.
// Não coloque /api/channels no final.

const API_BASE_URL =
    "https://nose-highways-agency-butler.trycloudflare.com";

const API_CHANNELS =
    `${API_BASE_URL.replace(/\/+$/, "")}/api/channels`;


/* ============================================================
   2. ESTADO DA APLICAÇÃO
   ============================================================ */

let CHANNELS = [];

const state = {
    category: "inicio",
    search: "",
    selectedId: null,
    hls: null,
    favorites: new Set(loadFavorites()),
    watching: [],
    requestId: 0,
    retryCount: 0,
    maxRetries: 3,
    retryTimer: null,
    destroyed: false
};

const CATEGORY_LABELS = {
    inicio: "Canais disponíveis",
    aovivo: "Canais ao vivo",
    filmes: "Canais de filmes",
    series: "Canais de séries",
    favoritos: "Seus favoritos"
};


/* ============================================================
   3. UTILITÁRIOS
   ============================================================ */

const $ = (selector) =>
    document.querySelector(selector);

const $$ = (selector) =>
    [...document.querySelectorAll(selector)];

function el(tag, className = "", text = null) {

    const node = document.createElement(tag);

    if (className) {
        node.className = className;
    }

    if (text !== null) {
        node.textContent = text;
    }

    return node;
}

function loadFavorites() {

    try {

        const data = JSON.parse(
            localStorage.getItem("novatv.favorites") || "[]"
        );

        return Array.isArray(data)
            ? data.filter(id => typeof id === "string")
            : [];

    } catch (error) {

        console.warn("Erro ao carregar favoritos:", error);

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

        console.warn("Erro ao salvar favoritos:", error);

    }
}

function getChannel(id) {

    return CHANNELS.find(
        channel => channel.id === id
    ) || null;

}

function validarURL(url) {

    if (typeof url !== "string" || !url.trim()) {
        return "";
    }

    try {

        const parsed = new URL(url.trim());

        if (
            parsed.protocol !== "http:" &&
            parsed.protocol !== "https:"
        ) {
            return "";
        }

        return parsed.href;

    } catch {

        return "";

    }
}

function normalizarTexto(value) {

    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

}


/* ============================================================
   4. PREPARAÇÃO DOS CANAIS
   ============================================================ */

function prepararCanais(canais) {

    if (!Array.isArray(canais)) {
        return [];
    }

    const ids = new Set();

    return canais.map((canal, index) => {

        const grupo = normalizarTexto(canal.group);

        let categoria = "aovivo";

        if (
            grupo.includes("filme") ||
            grupo.includes("cinema")
        ) {

            categoria = "filmes";

        } else if (
            grupo.includes("serie") ||
            grupo.includes("seriado")
        ) {

            categoria = "series";

        }

        let id = String(
            canal.id || `canal-${index + 1}`
        );

        // Evita identificadores duplicados.

        if (ids.has(id)) {
            id = `${id}-${index + 1}`;
        }

        ids.add(id);

        const nome = String(
            canal.name || `Canal ${index + 1}`
        );

        const url = validarURL(canal.url);

        return {

            id,

            name: nome,

            category: categoria,

            isLive: categoria === "aovivo",

            url,

            logo: validarURL(canal.logo),

            desc: String(
                canal.desc || `Transmissão do canal ${nome}.`
            ),

            epg: Array.isArray(canal.epg)
                ? canal.epg
                : []

        };

    });

}


/* ============================================================
   5. CONEXÃO COM BACKEND NODE.JS
   ============================================================ */

async function carregarCanaisAPI() {

    console.log("Conectando ao backend NovaTV...");

    try {

        const resposta = await fetch(API_CHANNELS, {

            method: "GET",

            headers: {
                Accept: "application/json"
            },

            cache: "no-store"

        });

        if (!resposta.ok) {

            throw new Error(
                `Erro HTTP ${resposta.status}`
            );

        }

        const dados = await resposta.json();

        // Aceita tanto uma lista direta quanto
        // um objeto contendo { channels: [...] }.

        const lista = Array.isArray(dados)
            ? dados
            : dados?.channels;

        if (!Array.isArray(lista)) {

            throw new Error(
                "A API não retornou uma lista válida de canais."
            );

        }

        CHANNELS = prepararCanais(lista);

        console.log(
            `${CHANNELS.length} canais carregados.`
        );

        atualizarHeroStatus(
            "NovaTV",
            `${CHANNELS.length} canais disponíveis.`
        );

        return true;

    } catch (error) {

        console.error(
            "Erro ao conectar com o backend:",
            error
        );

        CHANNELS = [];

        atualizarHeroStatus(
            "Backend indisponível",
            "Não foi possível carregar os canais. Verifique o Node.js, o Cloudflare Tunnel e a API."
        );

        return false;

    }

}

function atualizarHeroStatus(titulo, descricao) {

    const heroTitle = $("#heroTitle");
    const heroDesc = $("#heroDesc");

    if (heroTitle) {
        heroTitle.textContent = titulo;
    }

    if (heroDesc) {
        heroDesc.textContent = descricao;
    }

}


/* ============================================================
   6. RELÓGIO
   ============================================================ */

function startClock() {

    const time = $("#clockTime");
    const date = $("#clockDate");

    if (!time || !date) return;

    const formatDate = new Intl.DateTimeFormat(
        "pt-BR",
        {
            weekday: "long",
            day: "numeric",
            month: "short"
        }
    );

    function tick() {

        const now = new Date();

        time.textContent = now.toLocaleTimeString(
            "pt-BR",
            {
                hour: "2-digit",
                minute: "2-digit"
            }
        );

        date.textContent = formatDate.format(now);

    }

    tick();

    setInterval(tick, 30000);

}


/* ============================================================
   7. FILTROS
   ============================================================ */

function matchesFilters(channel) {

    const category = state.category;

    let categoryOK = true;

    if (category === "favoritos") {

        categoryOK = state.favorites.has(channel.id);

    } else if (category !== "inicio") {

        categoryOK = channel.category === category;

    }

    const query = normalizarTexto(state.search);

    const searchOK =
        !query ||
        normalizarTexto(channel.name).includes(query) ||
        normalizarTexto(channel.desc).includes(query) ||
        normalizarTexto(channel.category).includes(query);

    return categoryOK && searchOK;

}


/* ============================================================
   8. CARTÕES DOS CANAIS
   ============================================================ */

function channelCard(channel) {

    const card = el("button", "card");

    card.type = "button";

    card.dataset.id = channel.id;

    card.setAttribute("role", "listitem");

    card.setAttribute(
        "aria-label",
        `${channel.name} — ${channel.desc}`
    );

    if (state.selectedId === channel.id) {

        card.classList.add("is-selected");

    }

    const thumb = el("div", "card__thumb");

    if (channel.logo) {

        const logo = el("img", "card__logo");

        logo.src = channel.logo;

        logo.alt = channel.name;

        logo.loading = "lazy";

        logo.onerror = () => logo.remove();

        thumb.appendChild(logo);

    } else {

        thumb.appendChild(
            el(
                "span",
                "card__initial",
                channel.name.charAt(0).toUpperCase()
            )
        );

    }

    if (channel.isLive) {

        thumb.appendChild(
            el("span", "card__live", "AO VIVO")
        );

    }

    if (state.favorites.has(channel.id)) {

        thumb.appendChild(
            el("span", "card__fav", "♥")
        );

    }

    if (state.selectedId === channel.id) {

        thumb.appendChild(
            el("span", "card__playing", "▶")
        );

    }

    card.appendChild(thumb);

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
        el(
            "span",
            null,
            labels[channel.category] || "Canal"
        )
    );

    meta.appendChild(
        el("span", "dot")
    );

    meta.appendChild(
        el(
            "span",
            null,
            channel.isLive ? "Em transmissão" : "Programado"
        )
    );

    body.appendChild(meta);

    const current = currentProgram(channel);

    if (current) {

        body.appendChild(
            el("p", "card__now", `Agora: ${current}`)
        );

    }

    card.appendChild(body);

    card.addEventListener("click", () => {

        selectChannel(channel.id);

    });

    return card;

}


/* ============================================================
   9. RENDERIZAÇÃO DA GRADE
   ============================================================ */

function renderGrid() {

    const grid = $("#channelGrid");

    const empty = $("#gridEmpty");

    if (!grid || !empty) return;

    grid.replaceChildren();

    const list = CHANNELS.filter(matchesFilters);

    list.forEach(channel => {

        grid.appendChild(
            channelCard(channel)
        );

    });

    empty.hidden = list.length > 0;

    const title = $("#gridTitle");

    if (title) {

        title.textContent =
            CATEGORY_LABELS[state.category] || "Canais";

    }

}


/* ============================================================
   10. HISTÓRICO E RECOMENDAÇÕES
   ============================================================ */

function renderShelves() {

    const watching = $("#watchingSection");
    const watchingRow = $("#watchingRow");
    const recommendedRow = $("#recommendedRow");

    if (watching && watchingRow) {

        const watchList = state.watching
            .map(getChannel)
            .filter(Boolean);

        watching.hidden = watchList.length === 0;

        watchingRow.replaceChildren(
            ...watchList.map(channelCard)
        );

    }

    if (recommendedRow) {

        const recommendations = CHANNELS
            .filter(channel =>
                channel.isLive &&
                channel.id !== state.selectedId
            )
            .slice(0, 6);

        recommendedRow.replaceChildren(
            ...recommendations.map(channelCard)
        );

    }

}


/* ============================================================
   11. EPG
   ============================================================ */

function parseStart(time) {

    if (typeof time !== "string") {
        return null;
    }

    const match = time.match(/^(\d{1,2}):(\d{2})$/);

    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);

    if (
        hours < 0 ||
        hours > 23 ||
        minutes < 0 ||
        minutes > 59
    ) {
        return null;
    }

    return hours * 60 + minutes;

}

function currentProgram(channel) {

    if (!Array.isArray(channel.epg)) {
        return null;
    }

    const programs = channel.epg
        .filter(item =>
            Array.isArray(item) &&
            item.length >= 2 &&
            parseStart(item[0]) !== null
        )
        .sort((a, b) =>
            parseStart(a[0]) - parseStart(b[0])
        );

    if (!programs.length) return null;

    const now = new Date();

    const minutesNow =
        now.getHours() * 60 + now.getMinutes();

    for (let i = 0; i < programs.length; i++) {

        const start = parseStart(programs[i][0]);

        const end = i + 1 < programs.length
            ? parseStart(programs[i + 1][0])
            : 1440;

        if (
            minutesNow >= start &&
            minutesNow < end
        ) {

            return String(programs[i][1]);

        }

    }

    return null;

}

function renderEpg(channel) {

    const section = $("#epgSection");
    const timeline = $("#epgTimeline");
    const channelName = $("#epgChannelName");

    if (!section || !timeline) return;

    if (!channel.epg || !channel.epg.length) {

        section.hidden = true;

        return;

    }

    if (channelName) {
        channelName.textContent = channel.name;
    }

    timeline.replaceChildren();

    const now = new Date();

    const minutesNow =
        now.getHours() * 60 + now.getMinutes();

    const programs = channel.epg
        .filter(item =>
            Array.isArray(item) &&
            item.length >= 2 &&
            parseStart(item[0]) !== null
        )
        .sort((a, b) =>
            parseStart(a[0]) - parseStart(b[0])
        );

    const currentIndex = programs.findIndex(
        (program, index) => {

            const start = parseStart(program[0]);

            const end = index + 1 < programs.length
                ? parseStart(programs[index + 1][0])
                : 1440;

            return minutesNow >= start && minutesNow < end;

        }
    );

    programs.forEach(([time, name], index) => {

        const item = el("div", "epg__item");

        if (index === currentIndex) {

            item.classList.add("epg__item--current");

        } else if (index === currentIndex + 1) {

            item.classList.add("epg__item--next");

        }

        item.appendChild(
            el("span", "epg__time", time)
        );

        item.appendChild(
            el("p", "epg__name", String(name))
        );

        if (index === currentIndex) {

            item.appendChild(
                el("span", "epg__badge", "NO AR AGORA")
            );

        }

        timeline.appendChild(item);

    });

    section.hidden = programs.length === 0;

}


/* ============================================================
   12. PLAYER
   ============================================================ */

function getVideo() {

    return $("#video");

}

function showPlayerState(which) {

    const states = {
        none: null,
        noUrl: $("#stateNoUrl"),
        loading: $("#stateLoading"),
        noSignal: $("#stateNoSignal"),
        error: $("#stateError")
    };

    Object.entries(states).forEach(([key, node]) => {

        if (node) {

            node.hidden = key !== which;

        }

    });

}

function clearRetryTimer() {

    if (state.retryTimer) {

        clearTimeout(state.retryTimer);

        state.retryTimer = null;

    }

}

function destroyHls() {

    clearRetryTimer();

    if (state.hls) {

        try {
            state.hls.destroy();
        } catch (error) {
            console.warn("Erro ao destruir HLS:", error);
        }

        state.hls = null;

    }

}

function isHlsSource(url) {

    try {

        return new URL(url).pathname
            .toLowerCase()
            .endsWith(".m3u8");

    } catch {

        return false;

    }

}

function showError(message) {

    destroyHls();

    const errorMessage = $("#errorMessage");

    if (errorMessage) {

        errorMessage.textContent = message;

    }

    showPlayerState("error");

}

function updatePlayPauseIcon() {

    const video = getVideo();

    if (!video) return;

    const playIcon = $(".pbtn__icon--play");
    const pauseIcon = $(".pbtn__icon--pause");

    if (playIcon) {

        playIcon.style.display =
            video.paused ? "" : "none";

    }

    if (pauseIcon) {

        pauseIcon.style.display =
            video.paused ? "none" : "";

    }

}


/* ============================================================
   13. RECUPERAÇÃO DE TRANSMISSÃO
   ============================================================ */

function recoverStream(message) {

    const video = getVideo();

    if (!video || !state.selectedId) return;

    if (state.retryCount >= state.maxRetries) {

        showError(
            message || "Não foi possível recuperar a transmissão."
        );

        return;

    }

    state.retryCount++;

    console.warn(
        `Tentativa de reconexão ${state.retryCount}/${state.maxRetries}`
    );

    showPlayerState("loading");

    clearRetryTimer();

    state.retryTimer = setTimeout(() => {

        const channel = getChannel(state.selectedId);

        if (!channel) return;

        iniciarReproducao(channel, true);

    }, 3000);

/*}


/* ============================================================
   14. INICIAR HLS / MP4
   ============================================================ */


function attachSource(channel) {
  const video = getVideo();

  if (!video) return false;

  destroyHls();

  const requestId = ++state.requestId;
  const url = validarURL(channel.url);

  video.pause();
  video.removeAttribute("src");
  video.load();

  if (!url) {
      showPlayerState("noUrl");
      return false;
  }

  showPlayerState("loading");

  // Só tenta reproduzir quando a mídia estiver pronta.
  function playWhenReady() {
      if (requestId !== state.requestId) return;

      video.muted = true;

      video.play()
          .then(() => {
              if (requestId !== state.requestId) return;

              console.log("Reprodução iniciada:", channel.name);
              clearRetryTimer();
              state.retryCount = 0;
          })
          .catch(error => {
              if (requestId !== state.requestId) return;

              console.warn("Falha ao iniciar reprodução:", error);

              if (error.name === "NotAllowedError") {
                  showPlayerState("none");
                  console.warn("Clique em Play para iniciar.");
              } else {
                  showError(
                      "O navegador não conseguiu iniciar esta transmissão: " +
                      error.message
                  );
              }
          });
  }

  // HLS
  if (isHlsSource(url)) {

      // HLS nativo do navegador.
      if (video.canPlayType("application/vnd.apple.mpegurl")) {

          video.addEventListener(
              "loadedmetadata",
              playWhenReady,
              { once: true }
          );

          video.src = url;
          video.load();

          return true;
      }

      // HLS usando hls.js.
      if (window.Hls && window.Hls.isSupported()) {

          const hls = new window.Hls({
              enableWorker: true,
              lowLatencyMode: false,
              backBufferLength: 30,
              maxBufferLength: 30,
              manifestLoadingTimeOut: 20000,
              fragLoadingTimeOut: 20000
          });

          state.hls = hls;

          hls.on(window.Hls.Events.ERROR, (_event, data) => {

              if (requestId !== state.requestId) return;

              console.error("[HLS] Erro:", {
                  type: data.type,
                  details: data.details,
                  fatal: data.fatal,
                  response: data.response
              });

              if (!data.fatal) return;

              if (
                  data.type === window.Hls.ErrorTypes.NETWORK_ERROR
              ) {
                  recoverStream(
                      "Falha ao carregar a transmissão. Verifique o servidor."
                  );

              } else if (
                  data.type === window.Hls.ErrorTypes.MEDIA_ERROR
              ) {
                  console.warn("[HLS] Tentando recuperar mídia.");

                  hls.recoverMediaError();

              } else {
                  showError(
                      "Falha fatal no HLS: " + data.details
                  );
              }
          });

          hls.on(
              window.Hls.Events.MANIFEST_PARSED,
              () => {
                  if (requestId !== state.requestId) return;

                  console.log(
                      "[HLS] Manifesto carregado:",
                      channel.name
                  );

                  playWhenReady();
              }
          );

          hls.loadSource(url);
          hls.attachMedia(video);

          return true;
      }

      showError(
          "HLS não é suportado neste navegador ou hls.js não foi carregado."
      );

      return false;
  }

  // MP4 e outros formatos nativos.
  video.addEventListener(
      "loadedmetadata",
      playWhenReady,
      { once: true }
  );

  video.src = url;
  video.load();

  return true;
}


function iniciarReproducao(channel, reconexao = false) {

  if (!channel) return;

  console.log(
      reconexao
          ? "[PLAYER] Reconectando:"
          : "[PLAYER] Iniciando:",
      channel.name
  );

  const ok = attachSource(channel);

  if (!ok) {
      console.error("[PLAYER] Não foi possível associar a fonte.");
  }
}

/*function attachSource(channel) {

    const video = getVideo();

    if (!video) {

        console.error("Elemento #video não encontrado.");

        return false;

    }

    destroyHls();

    const requestId = ++state.requestId;

    video.pause();

    video.removeAttribute("src");

    video.load();

    const url = validarURL(channel.url);

    if (!url) {

        showPlayerState("noUrl");

        return false;

    }

    showPlayerState("loading");

    if (isHlsSource(url)) {

        // HLS nativo.

        if (
            video.canPlayType(
                "application/vnd.apple.mpegurl"
            )
        ) {

            video.src = url;

            video.load();

            return true;

        }

        // HLS.js.

        if (
            window.Hls &&
            window.Hls.isSupported()
        ) {

            const hls = new window.Hls({

                enableWorker: true,

                lowLatencyMode: true,

                backBufferLength: 30,

                maxBufferLength: 30

            });

            state.hls = hls;

            hls.on(
                window.Hls.Events.ERROR,
                (_event, data) => {

                    if (requestId !== state.requestId) return;

                    if (!data.fatal) return;

                    console.error(
                        "Erro fatal HLS:",
                        data
                    );

                    if (
                        data.type ===
                        window.Hls.ErrorTypes.NETWORK_ERROR
                    ) {

                        recoverStream(
                            "Falha de rede. Verifique o servidor e a conexão."
                        );

                    } else if (
                        data.type ===
                        window.Hls.ErrorTypes.MEDIA_ERROR
                    ) {

                        try {

                            hls.recoverMediaError();

                        } catch {

                            recoverStream(
                                "Falha na recuperação da mídia."
                            );

                        }

                    } else {

                        showError(
                            "Não foi possível iniciar a transmissão HLS."
                        );

                    }

                }
            );

            hls.on(
                window.Hls.Events.MANIFEST_PARSED,
                () => {

                    if (requestId !== state.requestId) return;

                    console.log(
                        "Manifest HLS carregado:",
                        channel.name
                    );

                }
            );

            hls.loadSource(url);

            hls.attachMedia(video);

            return true;

        }

        showError(
            "Este navegador não suporta reprodução HLS. Verifique se hls.js foi carregado."
        );

        return false;

    }

    // MP4 ou outro formato suportado nativamente.

    video.src = url;

    video.load();

    return true;

}

function iniciarReproducao(channel, reconexao = false) {

    const video = getVideo();

    if (!video) return;

    const ok = attachSource(channel);

    if (!ok) return;

    // O navegador pode bloquear autoplay com áudio.
    // Por isso, iniciamos sem som.

    video.muted = true;

    video.play()
        .then(() => {

            if (state.selectedId !== channel.id) return;

            showPlayerState("none");

            console.log(
                "Reprodução iniciada:",
                channel.name
            );

            state.retryCount = 0;

            clearRetryTimer();

        })
        .catch(error => {

            console.warn(
                "Autoplay bloqueado ou reprodução não iniciada:",
                error
            );

            // Mantém o player pronto para o usuário
            // iniciar manualmente.

            updatePlayPauseIcon();

            if (reconexao) {

                showError(
                    "A reconexão foi iniciada, mas o navegador não permitiu a reprodução automática. Pressione Play."
                );

            }

        });

}*/


/* ============================================================
   15. SELEÇÃO DE CANAIS
   ============================================================ */

function selectChannel(id) {

    const channel = getChannel(id);

    if (!channel) return;

    state.selectedId = id;

    state.retryCount = 0;

    clearRetryTimer();

    if (!state.watching.includes(id)) {

        state.watching.unshift(id);

    } else {

        state.watching = state.watching.filter(
            item => item !== id
        );

        state.watching.unshift(id);

    }

    state.watching = state.watching.slice(0, 6);

    const heroTitle = $("#heroTitle");
    const heroDesc = $("#heroDesc");
    const heroLiveTag = $("#heroLiveTag");
    const liveBadge = $("#liveBadge");

    if (heroTitle) {
        heroTitle.textContent = channel.name;
    }

    if (heroDesc) {
        heroDesc.textContent = channel.desc;
    }

    if (heroLiveTag) {
        heroLiveTag.hidden = !channel.isLive;
    }

    if (liveBadge) {
        liveBadge.hidden = !channel.isLive;
    }

    updateFavButton(channel);

    renderEpg(channel);

    renderGrid();

    renderShelves();

    iniciarReproducao(channel);

}


/* ============================================================
   16. CONTROLES DO PLAYER
   ============================================================ */

function setupPlayerControls() {

    const video = getVideo();

    if (!video) {

        console.warn("Player #video não encontrado.");

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

            video.play().catch(error => {

                console.warn("Não foi possível reproduzir:", error);

            });

        } else {

            video.pause();

        }

    }

    playPause?.addEventListener(
        "click",
        togglePlay
    );

    video.addEventListener(
        "play",
        updatePlayPauseIcon
    );

    video.addEventListener(
        "pause",
        updatePlayPauseIcon
    );

    video.addEventListener(
        "playing",
        () => {

            showPlayerState("none");

            updatePlayPauseIcon();

        }
    );

    video.addEventListener(
        "waiting",
        () => {

            if (video.currentSrc || video.src) {

                showPlayerState("loading");

            }

        }
    );

    video.addEventListener(
        "error",
        () => {

            if (!video.currentSrc && !video.src) return;

            if (state.hls) return;

            showError(
                "O vídeo não pôde ser carregado. Verifique a URL, o servidor e o formato."
            );

        }
    );

    video.addEventListener(
        "timeupdate",
        () => {

            const timeLabel = $("#timeLabel");

            if (!timeLabel) return;

            if (
                Number.isFinite(video.duration) &&
                video.duration > 0
            ) {

                const format = seconds => {

                    const minutes = Math.floor(seconds / 60);

                    const secs = Math.floor(seconds % 60);

                    return (
                        String(minutes).padStart(2, "0") +
                        ":" +
                        String(secs).padStart(2, "0")
                    );

                };

                timeLabel.textContent =
                    `${format(video.currentTime)} / ${format(video.duration)}`;

            } else {

                timeLabel.textContent = "AO VIVO";

            }

        }
    );

    video.addEventListener(
        "stalled",
        () => {

            if (video.currentSrc || video.src) {

                showPlayerState("loading");

            }

        }
    );

    mute?.addEventListener(
        "click",
        () => {

            video.muted = !video.muted;

            mute.style.opacity =
                video.muted ? "0.5" : "1";

        }
    );

    volume?.addEventListener(
        "input",
        () => {

            const value = Math.min(
                100,
                Math.max(0, Number(volume.value) || 0)
            );

            video.volume = value / 100;

            video.muted = value === 0;

            if (mute) {

                mute.style.opacity =
                    video.muted ? "0.5" : "1";

            }

        }
    );

    fullscreen?.addEventListener(
        "click",
        async () => {

            const shell = $("#playerShell");

            if (!shell) return;

            try {

                if (document.fullscreenElement) {

                    await document.exitFullscreen();

                } else if (shell.requestFullscreen) {

                    await shell.requestFullscreen();

                }

            } catch (error) {

                console.warn(
                    "Erro ao alternar tela cheia:",
                    error
                );

            }

        }
    );

    speed?.addEventListener(
        "change",
        () => {

            video.playbackRate =
                Number(speed.value) || 1;

        }
    );

    function retry() {

        if (state.selectedId) {

            const channel = getChannel(state.selectedId);

            if (channel) {

                state.retryCount = 0;

                iniciarReproducao(channel);

            }

        }

    }

    $("#retryBtn")?.addEventListener("click", retry);

    $("#errorRetryBtn")?.addEventListener("click", retry);

    video.addEventListener(
        "volumechange",
        () => {

            if (mute) {

                mute.style.opacity =
                    video.muted ? "0.5" : "1";

            }

        }
    );

    updatePlayPauseIcon();

}


/* ============================================================
   17. FAVORITOS
   ============================================================ */

function updateFavButton(channel) {

    const button = $("#heroFavBtn");
    const label = $("#heroFavLabel");

    if (!button || !label) return;

    const isFavorite =
        state.favorites.has(channel.id);

    button.setAttribute(
        "aria-pressed",
        String(isFavorite)
    );

    label.textContent = isFavorite
        ? "Nos favoritos"
        : "Favoritar";

}

function setupFavorites() {

    const button = $("#heroFavBtn");

    if (!button) return;

    button.addEventListener(
        "click",
        () => {

            if (!state.selectedId) return;

            const id = state.selectedId;

            if (state.favorites.has(id)) {

                state.favorites.delete(id);

            } else {

                state.favorites.add(id);

            }

            saveFavorites();

            const channel = getChannel(id);

            if (channel) {

                updateFavButton(channel);

            }

            renderGrid();

            renderShelves();

        }
    );

}


/* ============================================================
   18. NAVEGAÇÃO E BUSCA
   ============================================================ */

function setupNav() {

    const mainNav = $("#mainNav");

    const searchInput = $("#searchInput");

    const profileBtn = $("#profileBtn");

    mainNav?.addEventListener(
        "click",
        event => {

            const btn = event.target.closest(
                ".topnav__item"
            );

            if (!btn || !mainNav.contains(btn)) return;

            const category = btn.dataset.category;

            if (!CATEGORY_LABELS[category]) return;

            state.category = category;

            $$(".topnav__item").forEach(item => {

                const active = item === btn;

                item.classList.toggle(
                    "is-active",
                    active
                );

                if (active) {

                    item.setAttribute(
                        "aria-current",
                        "page"
                    );

                } else {

                    item.removeAttribute("aria-current");

                }

            });

            renderGrid();

        }
    );

    searchInput?.addEventListener(
        "input",
        event => {

            state.search = event.target.value || "";

            renderGrid();

        }
    );

    profileBtn?.addEventListener(
        "click",
        () => {

            alert(
                `Perfil NovaTV — ${state.favorites.size} canal(is) favorito(s).`
            );

        }
    );

}


/* ============================================================
   19. NAVEGAÇÃO POR TECLADO
   ============================================================ */

function gridColumns() {

    const grid = $("#channelGrid");

    if (!grid || !grid.children.length) return 1;

    const first = grid.children[0]
        .getBoundingClientRect();

    const second = grid.children[1]
        ?.getBoundingClientRect();

    if (!second || first.width <= 0) return 1;

    const gap = second.left - first.left;

    return Math.max(
        1,
        Math.round(gap / first.width)
    );

}

function setupKeyboard() {

    document.addEventListener(
        "keydown",
        event => {

            const active = document.activeElement;

            const typing = [
                "INPUT",
                "SELECT",
                "TEXTAREA"
            ].includes(active?.tagName);

            if (typing) {

                if (event.key === "Escape") {

                    active.blur();

                } else {

                    return;

                }

            }

            switch (event.key) {

                case " ":

                    if (
                        active?.tagName !== "BUTTON" &&
                        active?.tagName !== "A"
                    ) {

                        event.preventDefault();

                        $("#playPauseBtn")?.click();

                    }

                    break;

                case "ArrowRight":
                case "ArrowLeft":
                case "ArrowUp":
                case "ArrowDown": {

                    const cards = [
                        ...$$(
                            "#channelGrid .card"
                        )
                    ];

                    if (!cards.length) return;

                    event.preventDefault();

                    const index = cards.indexOf(active);

                    const columns = gridColumns();

                    let next = index;

                    if (index === -1) {

                        next = 0;

                    } else if (event.key === "ArrowRight") {

                        next = Math.min(
                            index + 1,
                            cards.length - 1
                        );

                    } else if (event.key === "ArrowLeft") {

                        next = Math.max(
                            index - 1,
                            0
                        );

                    } else if (event.key === "ArrowDown") {

                        next = Math.min(
                            index + columns,
                            cards.length - 1
                        );

                    } else if (event.key === "ArrowUp") {

                        next = Math.max(
                            index - columns,
                            0
                        );

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

        }
    );

}


/* ============================================================
   20. INICIALIZAÇÃO
   ============================================================ */

async function init() {

    console.log("Inicializando NovaTV...");

    if (state.destroyed) return;

    // Relógio.

    startClock();

    // Controles.

    setupPlayerControls();

    setupFavorites();

    setupNav();

    setupKeyboard();

    // Estado inicial.

    showPlayerState("loading");

    // Conexão com backend.

    const conectado = await carregarCanaisAPI();

    if (state.destroyed) return;

    if (!conectado || CHANNELS.length === 0) {

        renderGrid();

        renderShelves();

        showPlayerState("noUrl");

        console.warn(
            "NovaTV iniciada sem canais. Verifique o backend."
        );

        return;

    }

    // Renderização.

    renderGrid();

    renderShelves();

    // Seleciona o primeiro canal sem iniciar
    // automaticamente a transmissão.

    const primeiroCanal = CHANNELS[0];

    if (primeiroCanal) {

        state.selectedId = primeiroCanal.id;

        atualizarHeroStatus(
            primeiroCanal.name,
            primeiroCanal.desc
        );

        const heroLiveTag = $("#heroLiveTag");

        if (heroLiveTag) {

            heroLiveTag.hidden =
                !primeiroCanal.isLive;

        }

        const liveBadge = $("#liveBadge");

        if (liveBadge) {

            liveBadge.hidden =
                !primeiroCanal.isLive;

        }

        updateFavButton(primeiroCanal);

        renderEpg(primeiroCanal);

        renderGrid();

        renderShelves();

        showPlayerState("noUrl");

    }

    console.log(
        "NovaTV inicializada com sucesso."
    );

}


/* ============================================================
   21. INICIALIZAÇÃO SEGURA DO DOCUMENTO
   ============================================================ */

if (document.readyState === "loading") {

    document.addEventListener(
        "DOMContentLoaded",
        init,
        { once: true }
    );

} else {

    init();

}
