# NovaTV — Plataforma de TV/Streaming ao Vivo (demonstração)

Interface de Smart TV feita **somente com HTML5, CSS3 e JavaScript puro** — sem React, Vue, Angular ou TypeScript. O visual é inspirado na organização de interfaces de televisores inteligentes, com identidade original.

> **Importante:** todos os canais incluídos são **exemplos fictícios**. Nenhuma transmissão real está configurada, e nenhum conteúdo protegido por direitos autorais é distribuído neste projeto.

## Estrutura de pastas

```
/
├── index.html        → estrutura da página
├── css/
│   └── style.css     → estilos (tema escuro premium, responsivo)
├── js/
│   └── app.js        → lógica: player, canais, EPG, favoritos, teclado
└── README.md
```

## 1. Como abrir o projeto localmente

**Opção simples:** dê dois cliques em `index.html`. A página abre direto no navegador.

**Opção recomendada (servidor local):** alguns navegadores restringem recursos quando a página é aberta via `file://`. Se preferir, sirva a pasta com qualquer servidor estático, por exemplo:

```bash
# Python (já instalado na maioria dos sistemas)
python3 -m http.server 8080

# ou Node.js
npx serve .
```

Depois acesse `http://localhost:8080`.

## 2. Como adicionar, remover e editar canais

Abra o arquivo `js/app.js`. No topo há uma lista chamada `CHANNELS`, com um objeto por canal:

```js
{
  id: "meu-canal-1",          // identificador único (não repita)
  name: "Meu Canal",          // nome exibido na grade
  category: "aovivo",         // "aovivo" | "filmes" | "series"
  isLive: true,               // mostra o selo "AO VIVO"
  url: "",                    // ← URL do stream (ver item 3)
  desc: "Descrição do canal", // texto exibido abaixo do player
  epg: [                      // programação fictícia [hora, programa]
    ["08:00", "Programa da Manhã"],
    ["12:00", "Jornal do Meio-dia"],
  ],
}
```

- **Adicionar:** copie um bloco existente, cole no final da lista e altere os campos.
- **Remover:** apague o bloco do canal correspondente.
- **Editar:** altere `name`, `desc`, `epg`, `category` ou `url` diretamente.

Os favoritos do usuário ficam salvos no navegador (localStorage), separados da lista de canais.

## 3. Onde inserir a URL HLS (.m3u8) ou MP4 de cada canal

No campo `url` de cada canal dentro de `CHANNELS` (`js/app.js`):

- **Stream HLS:** substitua o valor pelo endereço do seu arquivo/playlist, por exemplo:

  ```js
  url: "COLE_A_URL_DO_SEU_STREAM_AQUI"   // exemplo placeholder
  ```

  Troque pelo seu endereço real, algo como `https://SEU-SERVIDOR/canal/index.m3u8`.

- **Arquivo MP4:** informe o endereço completo do vídeo, por exemplo:

  ```js
  url: "https://SEU-SERVIDOR/videos/filme.mp4"
  ```

Regras do player:

- Se `url` estiver **vazio** ou com o texto `COLE_A_URL_DO_SEU_STREAM_AQUI`, o player mostra a mensagem "Nenhuma transmissão configurada".
- Para `.m3u8`: no Safari/iOS a reprodução é **nativa**; nos demais navegadores o carrega automaticamente pela CDN.
- Para MP4 e outros formatos: usa a reprodução nativa do navegador.
- O áudio **não inicia automaticamente**: o app respeita as políticas de autoplay — a reprodução começa sem som e, se o navegador bloquear, aguarda o clique do usuário.

## 4. Como testar uma transmissão própria autorizada

1. Garanta que você tem **direito de transmitir** o conteúdo (canal próprio, licença ou conteúdo livre de direitos).
2. Hospede o stream em um servidor compatível (HLS: nginx + HLS, Wowza, Ant Media, AWS MediaLive, Cloudflare Stream, etc.).
3. Copie a URL da playlist (`.m3u8`) ou do vídeo (`.mp4`).
4. Cole no campo `url` do canal desejado em `js/app.js` e recarregue a página.
5. Se a imagem não aparecer, verifique:
   - A URL está acessível publicamente (teste abrindo-a direto no navegador).
   - O servidor de streaming **permite CORS** (cabeçalho `Access-Control-Allow-Origin`), caso a página e o stream estejam em domínios diferentes.
   - O stream está realmente no ar no momento do teste.

Exemplo público de teste (usado para validar o player; troque pelo seu):

```js
url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"
```

## 5. Como publicar o frontend no GitHub Pages

1. Crie uma conta em [github.com](https://github.com) (gratuita).
2. Crie um repositório novo (público), por exemplo `novatv`.
3. Envie os arquivos (`index.html`, pasta `css/`, pasta `js/` e este README) para o repositório — pela interface web do GitHub basta arrastar os arquivos.
4. No repositório, abra **Settings → Pages**.
5. Em "Source", escolha o branch principal (`main`) e a pasta `/ (root)`, e clique em **Save**.
6. Em alguns minutos o site estará disponível em `https://SEU-USUARIO.github.io/novatv/`.

Nenhuma configuração de backend é necessária para publicar — o projeto é 100% estático.

## 6. Sobre transmissões ao vivo em produção

Transmitir ao vivo em produção geralmente exige mais que o frontend:

- **Backend / ingestão:** um serviço de streaming (ou servidor próprio) que receba o sinal do encoder (RTMP/SRT) e gere as playlists HLS/DASH.
- **CORS:** o servidor de streaming precisa autorizar o domínio do site, senão o navegador bloqueia a reprodução.
- **HTTPS:** obrigatório em hospedagens como GitHub Pages; o stream também deve estar em HTTPS para não ser bloqueado como conteúdo misto.
- **Capacidade/CDN:** para muitos espectadores simultâneos, use uma CDN de vídeo.
- **Direitos autorais:** transmitir conteúdo de terceiros sem autorização é ilegal.

Este projeto não inclui nenhum desses serviços — ele apenas reproduz a URL que você configurar.

## Recursos incluídos

- Cabeçalho com logotipo fictício, busca, perfil e relógio ao vivo.
- Player com controles, volume, velocidade e tela cheia; suporte a MP4 e HLS (hls.js quando necessário, HLS nativo no Safari).
- Menu de categorias: Início, Ao vivo, Filmes, Séries e Favoritos.
- Grade de canais com selo "AO VIVO", indicador de favorito e programa atual.
- Seções "Assistindo agora" e "Canais recomendados".
- EPG simples com programa atual e próximo programa.
- Estados visuais: canal selecionado, carregando, erro e sem sinal.
- Navegação por mouse, teclado (setas, Enter, Espaço, F, M, Escape) e controle remoto de TV.
- Layout responsivo para celular, tablet, desktop e telas grandes de TV.
