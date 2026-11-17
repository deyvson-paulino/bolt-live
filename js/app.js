
/* ============================================================
   NOVATV — APLICAÇÃO PRINCIPAL
   Backend Node.js + API REST + Player HLS/MP4

   Recursos:
   - Carregamento automático da playlist M3U pelo backend
   - Player HLS com hls.js
   - Reprodução MP4
   - Busca de canais
   - Categorias
   - Favoritos
   - Histórico da sessão
   - EPG simples
   - Navegação por teclado e controle remoto
   - Tela de erro e reconexão
   ============================================================ */

   "use strict";

   /* ============================================================
      1. CONFIGURAÇÃO DO BACKEND
      ============================================================ */
   
   // COLOQUE AQUI O ENDEREÇO ATUAL DO SEU CLOUDFLARE TUNNEL.
   // Não coloque /api/channels no final.
   
   const API_BASE_URL = "https://singles-secretariat-annual-consent.trycloudflare.com";
   
   const API_CHANNELS = `${API_BASE_URL}/api/channels`;
   
   /* ============================================================
      2. LISTA DE CANAIS
      Os canais serão carregados automaticamente pela API.
      ============================================================ */
   
   let CHANNELS = [];
   
   /*
   Formato esperado do backend:
   
   [
     {
       "id": "tv-rabisco",
       "name": "TV RABISCO",
       "logo": "",
       "group": "Geral",
       "url": "https://servidor.com/stream.m3u8"
     }
   ]
   */
   
   function prepararCanais(canais) {
     return canais.map((canal, index) => {
   
       const grupo = String(canal.group || "Geral").toLowerCase();
   
       let categoria = "aovivo";
   
       if (grupo.includes("filme")) {
         categoria = "filmes";
       } else if (
         grupo.includes("serie") ||
         grupo.includes("série")
       ) {
         categoria = "series";
       }
   
       return {
         id: canal.id || `canal-${index + 1}`,
   
         name: canal.name || `Canal ${index + 1}`,
   
         category: categoria,
   
         isLive: categoria === "aovivo",
   
         url: canal.url || "",
   
         logo: canal.logo || "",
   
         desc: `Transmissão do canal ${canal.name || ""}.`,
   
         epg: []
       };
     });
   }
   
   /* ============================================================
      3. ESTADO DA APLICAÇÃO
      ============================================================ */
   
   const state = {
     category: "inicio",
   
     search: "",
   
     selectedId: null,
   
     hls: null,
   
     favorites: new Set(loadFavorites()),
   
     watching: []
   };
   
   const CATEGORY_LABELS = {
     inicio: "Canais disponíveis",
     aovivo: "Canais ao vivo",
     filmes: "Canais de filmes",
     series: "Canais de séries",
     favoritos: "Seus favoritos"
   };
   
   /* ============================================================
      4. UTILITÁRIOS
      ============================================================ */
   
   const $ = (selector) => document.querySelector(selector);
   
   function el(tag, className, text) {
   
     const node = document.createElement(tag);
   
     if (className) {
       node.className = className;
     }
   
     if (text != null) {
       node.textContent = text;
     }
   
     return node;
   }
   
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
   
     try {
   
       localStorage.setItem(
         "novatv.favorites",
         JSON.stringify([...state.favorites])
       );
   
     } catch (error) {
   
       console.warn("Não foi possível salvar favoritos:", error);
   
     }
   }
   
   function getChannel(id) {
   
     return CHANNELS.find(
       (channel) => channel.id === id
     ) || null;
   
   }
   
   /* ============================================================
      5. CONEXÃO COM BACKEND NODE.JS
      ============================================================ */
   
   async function carregarCanaisAPI() {
   
     try {
   
       console.log("Conectando ao backend NovaTV...");
   
       const resposta = await fetch(API_CHANNELS, {
         method: "GET",
         headers: {
           "Accept": "application/json"
         },
         cache: "no-store"
       });
   
       if (!resposta.ok) {
   
         throw new Error(
           `Erro HTTP ${resposta.status}`
         );
   
       }
   
       const dados = await resposta.json();
   
       if (!Array.isArray(dados)) {
   
         throw new Error(
           "A API não retornou uma lista válida de canais."
         );
   
       }
   
       CHANNELS = prepararCanais(dados);
   
       console.log(
         `${CHANNELS.length} canais carregados com sucesso.`
       );
   
       return true;
   
     } catch (erro) {
   
       console.error(
         "Erro ao conectar com o backend:",
         erro
       );
   
       CHANNELS = [];
   
       const titulo = $("#heroTitle");
   
       const descricao = $("#heroDesc");
   
       if (titulo) {
         titulo.textContent = "Backend indisponível";
       }
   
       if (descricao) {
   
         descricao.textContent =
           "Não foi possível carregar os canais. Verifique se o servidor Node.js e o Cloudflare Tunnel estão funcionando.";
   
       }
   
       return false;
   
     }
   
   }
   
   /* ============================================================
      6. RELÓGIO DO CABEÇALHO
      ============================================================ */
   
   function startClock() {
   
     const time = $("#clockTime");
   
     const date = $("#clockDate");
   
     if (!time || !date) return;
   
     const fmtDate = new Intl.DateTimeFormat(
       "pt-BR",
       {
         weekday: "long",
         day: "numeric",
         month: "short"
       }
     );
   
     const tick = () => {
   
       const now = new Date();
   
       time.textContent = now.toLocaleTimeString(
         "pt-BR",
         {
           hour: "2-digit",
           minute: "2-digit"
         }
       );
   
       date.textContent = fmtDate.format(now);
   
     };
   
     tick();
   
     setInterval(tick, 30000);
   
   }
   
   /* ============================================================
      7. RENDERIZAÇÃO DOS CANAIS
      ============================================================ */
   
   function matchesFilters(channel) {
   
     const cat = state.category;
   
     const okCat =
       cat === "inicio" ||
   
       (
         cat === "favoritos"
           ? state.favorites.has(channel.id)
           : channel.category === cat
       );
   
     const q = state.search.trim().toLowerCase();
   
     const okSearch =
       !q ||
       channel.name.toLowerCase().includes(q) ||
       channel.desc.toLowerCase().includes(q);
   
     return okCat && okSearch;
   
   }
   
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
   
       logo.onerror = () => {
         logo.remove();
       };
   
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
   
     const catLabel = {
       aovivo: "Ao vivo",
       filmes: "Filmes",
       series: "Séries"
     }[channel.category] || "Canal";
   
     const meta = el("p", "card__meta");
   
     meta.appendChild(
       el("span", null, catLabel)
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
   
   function renderGrid() {
   
     const grid = $("#channelGrid");
   
     const empty = $("#gridEmpty");
   
     if (!grid || !empty) return;
   
     grid.replaceChildren();
   
     const list = CHANNELS.filter(matchesFilters);
   
     for (const channel of list) {
   
       grid.appendChild(
         channelCard(channel)
       );
   
     }
   
     empty.hidden = list.length > 0;
   
     const title = $("#gridTitle");
   
     if (title) {
   
       title.textContent =
         CATEGORY_LABELS[state.category] || "Canais";
   
     }
   
   }
   
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
   
       const recs = CHANNELS
         .filter(
           (channel) =>
             channel.isLive &&
             channel.id !== state.selectedId
         )
         .slice(0, 6);
   
       recommendedRow.replaceChildren(
         ...recs.map(channelCard)
       );
   
     }
   
   }
   
   /* ============================================================
      8. EPG — PROGRAMAÇÃO
      ============================================================ */
   
   function currentProgram(channel) {
   
     if (!channel.epg || channel.epg.length === 0) {
       return null;
     }
   
     const now = new Date();
   
     const minutesNow =
       now.getHours() * 60 + now.getMinutes();
   
     for (let i = 0; i < channel.epg.length; i++) {
   
       const [startStr, name] = channel.epg[i];
   
       const [h, m] = startStr.split(":").map(Number);
   
       const start = h * 60 + m;
   
       const end =
         i + 1 < channel.epg.length
           ? parseStart(channel.epg[i + 1][0])
           : 24 * 60;
   
       if (minutesNow >= start && minutesNow < end) {
   
         return name;
   
       }
   
     }
   
     return channel.epg[0][1];
   
   }
   
   function parseStart(str) {
   
     const [h, m] = str.split(":").map(Number);
   
     return h * 60 + m;
   
   }
   
   function renderEpg(channel) {
   
     const section = $("#epgSection");
   
     const timeline = $("#epgTimeline");
   
     if (!section || !timeline) return;
   
     if (!channel.epg || channel.epg.length === 0) {
   
       section.hidden = true;
   
       return;
   
     }
   
     $("#epgChannelName").textContent = channel.name;
   
     timeline.replaceChildren();
   
     const now = new Date();
   
     const minutesNow =
       now.getHours() * 60 + now.getMinutes();
   
     const currentName = currentProgram(channel);
   
     const currentIndex = channel.epg.findIndex(
       ([, name]) => name === currentName
     );
   
     channel.epg.forEach(([time, name], i) => {
   
       const item = el("div", "epg__item");
   
       const start = parseStart(time);
   
       if (
         i === currentIndex &&
         minutesNow >= start
       ) {
   
         item.classList.add("epg__item--current");
   
       } else if (i === currentIndex + 1) {
   
         item.classList.add("epg__item--next");
   
       }
   
       item.appendChild(
         el("span", "epg__time", time)
       );
   
       item.appendChild(
         el("p", "epg__name", name)
       );
   
       if (
         i === currentIndex &&
         minutesNow >= start
       ) {
   
         item.appendChild(
           el("span", "epg__badge", "NO AR AGORA")
         );
   
       }
   
       timeline.appendChild(item);
   
     });
   
     section.hidden = false;
   
   }
   
   /* ============================================================
      9. PLAYER HLS / MP4
      ============================================================ */
   
   const video = $("#video");
   
   function showPlayerState(which) {
   
     const states = {
       none: null,
       noUrl: $("#stateNoUrl"),
       loading: $("#stateLoading"),
       noSignal: $("#stateNoSignal"),
       error: $("#stateError")
     };
   
     for (const [key, node] of Object.entries(states)) {
   
       if (node) {
   
         node.hidden = key !== which;
   
       }
   
     }
   
   }
   
   function destroyHls() {
   
     if (state.hls) {
   
       state.hls.destroy();
   
       state.hls = null;
   
     }
   
   }
   
   function updatePlayPauseIcon() {
   
     if (!video) return;
   
     const playing = video.paused;
   
     const playIcon = $(".pbtn__icon--play");
   
     const pauseIcon = $(".pbtn__icon--pause");
   
     if (playIcon) {
       playIcon.style.display = playing ? "" : "none";
     }
   
     if (pauseIcon) {
       pauseIcon.style.display = playing ? "none" : "";
     }
   
   }
   
   function isHlsSource(url) {
   
     return url.toLowerCase().includes(".m3u8");
   
   }
   
   function attachSource(channel) {
   
     destroyHls();
   
     video.pause();
   
     video.removeAttribute("src");
   
     video.load();
   
     const url = channel.url;
   
     if (!url) {
   
       showPlayerState("noUrl");
   
       return false;
   
     }
   
     showPlayerState("loading");
   
     if (isHlsSource(url)) {
   
       // HLS nativo — Safari e dispositivos compatíveis
   
       if (
         video.canPlayType(
           "application/vnd.apple.mpegurl"
         )
       ) {
   
         video.src = url;
   
         video.load();
   
         return true;
   
       }
   
       // HLS através de hls.js
   
       if (
         window.Hls &&
         window.Hls.isSupported()
       ) {
   
         const hls = new window.Hls({
           autoStartLoad: true
         });
   
         state.hls = hls;
   
         hls.loadSource(url);
   
         hls.attachMedia(video);
   
         hls.on(
           window.Hls.Events.ERROR,
           (_evt, data) => {
   
             if (!data.fatal) return;
   
             if (
               data.type ===
               window.Hls.ErrorTypes.NETWORK_ERROR
             ) {
   
               showError(
                 "Falha de rede ao acessar a transmissão. Verifique a URL e o CORS."
               );
   
             } else if (
               data.type ===
               window.Hls.ErrorTypes.MEDIA_ERROR
             ) {
   
               showError(
                 "Erro de mídia. O servidor pode estar indisponível ou o formato ser incompatível."
               );
   
             } else {
   
               showError(
                 "Não foi possível iniciar a transmissão HLS."
               );
   
             }
   
           }
         );
   
         return true;
   
       }
   
       showError(
         "Este navegador não suporta reprodução HLS."
       );
   
       return false;
   
     }
   
     // Reprodução MP4 e formatos nativos
   
     video.src = url;
   
     video.load();
   
     return true;
   
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
      10. SELEÇÃO DE CANAIS
      ============================================================ */
   
   function selectChannel(id) {
   
     const channel = getChannel(id);
   
     if (!channel) return;
   
     state.selectedId = id;
   
     if (!state.watching.includes(id)) {
   
       state.watching.unshift(id);
   
     }
   
     state.watching = state.watching.slice(0, 6);
   
     // Atualiza o título e descrição
   
     $("#heroTitle").textContent = channel.name;
   
     $("#heroDesc").textContent = channel.desc;
   
     $("#heroLiveTag").hidden = !channel.isLive;
   
     updateFavButton(channel);
   
     renderEpg(channel);
   
     renderGrid();
   
     renderShelves();
   
     // Inicia a reprodução
   
     const ok = attachSource(channel);
   
     if (ok) {
   
       video.muted = true;
   
       const promise = video.play();
   
       if (promise && typeof promise.then === "function") {
   
         promise.then(() => {
   
           video.muted = false;
   
         }).catch(() => {
   
           video.muted = false;
   
           video.pause();
   
           updatePlayPauseIcon();
   
         });
   
       }
   
       $("#liveBadge").hidden = !channel.isLive;
   
     } else {
   
       video.removeAttribute("src");
   
       video.load();
   
       $("#liveBadge").hidden = true;
   
     }
   
   }
   
   /* ============================================================
      11. CONTROLES DO PLAYER
      ============================================================ */
   
   function setupPlayerControls() {
   
     const playPause = $("#playPauseBtn");
   
     const mute = $("#muteBtn");
   
     const volume = $("#volumeSlider");
   
     const fullscreen = $("#fullscreenBtn");
   
     const speed = $("#speedSelect");
   
     if (!video) return;
   
     const togglePlay = () => {
   
       if (!video.currentSrc && !video.src) return;
   
       if (video.paused) {
   
         video.play().catch(() => {});
   
       } else {
   
         video.pause();
   
       }
   
     };
   
     playPause?.addEventListener("click", togglePlay);
   
     video.addEventListener("click", togglePlay);
   
     video.addEventListener("play", updatePlayPauseIcon);
   
     video.addEventListener("pause", updatePlayPauseIcon);
   
     video.addEventListener("playing", () => {
   
       showPlayerState("none");
   
     });
   
     video.addEventListener("waiting", () => {
   
       if (video.currentSrc || video.src) {
   
         showPlayerState("loading");
   
       }
   
     });
   
     video.addEventListener("error", () => {
   
       if (!video.currentSrc && !video.src) return;
   
       showError(
         "O stream não pôde ser carregado. Verifique a URL, o servidor e as permissões CORS."
       );
   
     });
   
     video.addEventListener("timeupdate", () => {
   
       const timeLabel = $("#timeLabel");
   
       if (!timeLabel) return;
   
       if (
         video.duration &&
         Number.isFinite(video.duration)
       ) {
   
         const total = video.duration;
   
         const cur = video.currentTime;
   
         const fmt = (seconds) => {
   
           const minutes = Math.floor(seconds / 60);
   
           const sec = Math.floor(seconds % 60);
   
           return (
             String(minutes).padStart(2, "0") +
             ":" +
             String(sec).padStart(2, "0")
           );
   
         };
   
         timeLabel.textContent =
           `${fmt(cur)} / ${fmt(total)}`;
   
       } else {
   
         timeLabel.textContent = "AO VIVO";
   
       }
   
     });
   
     video.addEventListener("stalled", () => {
   
       if (
         state.selectedId &&
         (video.currentSrc || video.src)
       ) {
   
         showPlayerState("loading");
   
       }
   
     });
   
     mute?.addEventListener("click", () => {
   
       video.muted = !video.muted;
   
       mute.style.opacity =
         video.muted ? "0.5" : "1";
   
     });
   
     volume?.addEventListener("input", () => {
   
       video.volume = Number(volume.value) / 100;
   
       video.muted = volume.value === "0";
   
     });
   
     fullscreen?.addEventListener("click", () => {
   
       const shell = $("#playerShell");
   
       if (!shell) return;
   
       if (document.fullscreenElement) {
   
         document.exitFullscreen();
   
       } else {
   
         shell.requestFullscreen?.();
   
       }
   
     });
   
     speed?.addEventListener("change", () => {
   
       video.playbackRate =
         Number(speed.value) || 1;
   
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
      12. FAVORITOS
      ============================================================ */
   
   function updateFavButton(channel) {
   
     const button = $("#heroFavBtn");
   
     const label = $("#heroFavLabel");
   
     if (!button || !label) return;
   
     const isFav = state.favorites.has(channel.id);
   
     button.setAttribute(
       "aria-pressed",
       String(isFav)
     );
   
     label.textContent =
       isFav ? "Nos favoritos" : "Favoritar";
   
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
   
       if (channel) {
   
         updateFavButton(channel);
   
       }
   
       renderGrid();
   
       renderShelves();
   
     });
   
   }
   
   /* ============================================================
      13. NAVEGAÇÃO E BUSCA
      ============================================================ */
   
   function setupNav() {
   
     const mainNav = $("#mainNav");
   
     const searchInput = $("#searchInput");
   
     const profileBtn = $("#profileBtn");
   
     mainNav?.addEventListener("click", (event) => {
   
       const btn = event.target.closest(".topnav__item");
   
       if (!btn) return;
   
       state.category = btn.dataset.category;
   
       document.querySelectorAll(
         ".topnav__item"
       ).forEach((item) => {
   
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
   
     });
   
     searchInput?.addEventListener("input", (event) => {
   
       state.search = event.target.value;
   
       renderGrid();
   
     });
   
     profileBtn?.addEventListener("click", () => {
   
       const total = state.favorites.size;
   
       alert(
         `Perfil "N" — ${total} canal(is) favorito(s).`
       );
   
     });
   
   }
   
   /* ============================================================
      14. NAVEGAÇÃO POR TECLADO / CONTROLE REMOTO
      ============================================================ */
   
   function setupKeyboard() {
   
     document.addEventListener("keydown", (event) => {
   
       const typing = [
         "INPUT",
         "SELECT",
         "TEXTAREA"
       ].includes(
         document.activeElement?.tagName
       );
   
       if (
         !typing &&
         (event.key === " " || event.key === "Enter") &&
         document.activeElement?.id !== "searchInput"
       ) {
   
         if (
           document.activeElement?.classList.contains("card")
         ) {
   
           return;
   
         }
   
         if (event.key === " ") {
   
           event.preventDefault();
   
           $("#playPauseBtn")?.click();
   
           return;
   
         }
   
       }
   
       if (typing) return;
   
       switch (event.key) {
   
         case "ArrowRight":
         case "ArrowLeft":
         case "ArrowUp":
         case "ArrowDown": {
   
           const cards = [
             ...document.querySelectorAll(
               "#channelGrid .card"
             )
           ];
   
           if (cards.length === 0) return;
   
           event.preventDefault();
   
           const index = cards.indexOf(
             document.activeElement
           );
   
           const cols = Math.max(
             1,
             Math.round(gridColumns())
           );
   
           let next = index;
   
           if (index === -1) {
   
             next = 0;
   
           } else if (event.key === "ArrowRight") {
   
             next = Math.min(
               index + 1,
               cards.length - 1
             );
   
           } else if (event.key === "ArrowLeft") {
   
             next = Math.max(index - 1, 0);
   
           } else if (event.key === "ArrowDown") {
   
             next = Math.min(
               index + cols,
               cards.length - 1
             );
   
           } else if (event.key === "ArrowUp") {
   
             next = Math.max(
               index - cols,
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
   
             document.exitFullscreen();
   
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
   
   function gridColumns() {
   
     const grid = $("#channelGrid");
   
     if (!grid || !grid.children.length) {
       return 4;
     }
   
     const first =
       grid.children[0].getBoundingClientRect();
   
     const second =
       grid.children[1]?.getBoundingClientRect();
   
     if (!second || !first.width) {
       return 1;
     }
   
     return Math.max(
       1,
       Math.round(
         (second.left - first.left) / first.width
       )
     );
   
   }
   
   /* ============================================================
      15. INICIALIZAÇÃO
      ============================================================ */
   
   async function init() {
   
     console.log("Inicializando NovaTV...");
   
     // Relógio
   
     startClock();
   
     // Configuração dos controles
   
     setupPlayerControls();
   
     setupFavorites();
   
     setupNav();
   
     setupKeyboard();
   
     // Busca os canais no backend
   
     const conectado = await carregarCanaisAPI();
   
     // Verifica a conexão
   
     if (!conectado || CHANNELS.length === 0) {
   
       renderGrid();
   
       renderShelves();
   
       showPlayerState("noUrl");
   
       console.warn(
         "NovaTV iniciada sem canais. Verifique o backend."
       );
   
       return;
   
     }
   
     // Atualiza a interface
   
     renderGrid();
   
     renderShelves();
   
     // Seleciona o primeiro canal
   
     const primeiroCanal = CHANNELS[0];
   
     if (primeiroCanal) {
   
       state.selectedId = primeiroCanal.id;
   
       $("#heroTitle").textContent =
         primeiroCanal.name;
   
       $("#heroDesc").textContent =
         primeiroCanal.desc;
   
       $("#heroLiveTag").hidden =
         !primeiroCanal.isLive;
   
       updateFavButton(primeiroCanal);
   
       renderEpg(primeiroCanal);
   
       renderGrid();
   
       renderShelves();
   
       // Não inicia automaticamente a transmissão
   
       showPlayerState("noUrl");
   
     }
   
     console.log("NovaTV inicializada com sucesso.");
   
   }
   
   // Executa quando o HTML estiver carregado
   
   document.addEventListener(
     "DOMContentLoaded",
     init
   );
   
