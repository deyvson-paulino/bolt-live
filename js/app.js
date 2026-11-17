
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

// ==================================================
// CONFIGURAÇÕES GERAIS
// ==================================================

const PORT = Number(process.env.PORT) || 3000;

// IMPORTANTE:
// A origem CORS NÃO deve conter /bolt-live.
const FRONTEND_ORIGIN =
    "https://deyvson-paulino.github.io";

const PLAYLIST_FILE = path.join(
    __dirname,
    "playlists",
    "canais.m3u"
);

const DATA_FILE = path.join(
    __dirname,
    "data",
    "channels.json"
);

const PUBLIC_DIR = path.join(
    __dirname,
    "public"
);

// ==================================================
// CORS
// ==================================================

const allowedOrigins = [
    FRONTEND_ORIGIN,
    "http://localhost:3000",
    "http://127.0.0.1:5500",
    "http://localhost:5500"
];

app.use(cors({
    origin: function (origin, callback) {

        // Permite ferramentas e chamadas sem Origin.
        if (!origin) {
            return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        console.warn(
            "Origem bloqueada pelo CORS:",
            origin
        );

        return callback(
            new Error("Origem não autorizada pelo CORS")
        );
    },

    methods: [
        "GET",
        "POST",
        "PUT",
        "DELETE",
        "OPTIONS"
    ],

    allowedHeaders: [
        "Content-Type",
        "Authorization"
    ],

    credentials: false,
    optionsSuccessStatus: 204
}));

// ==================================================
// MIDDLEWARES
// ==================================================

app.use(express.json({
    limit: "1mb"
}));

app.use(express.urlencoded({
    extended: true
}));

// ==================================================
// ARQUIVOS ESTÁTICOS
// ==================================================

// Imagens:
// /media/images/logo.png
//
// Vídeos:
// /media/videos/filme.mp4
//
// Arquivos:
// /media/arquivo.ext

app.use(
    "/media",
    express.static(PUBLIC_DIR, {
        fallthrough: true,
        index: false
    })
);

// ==================================================
// FUNÇÃO: GERAR ID
// ==================================================

function gerarId(nome) {

    return nome
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

// ==================================================
// FUNÇÃO: LER PLAYLIST M3U
// ==================================================

function carregarPlaylist() {

    if (!fs.existsSync(PLAYLIST_FILE)) {

        throw new Error(
            "Playlist não encontrada: " + PLAYLIST_FILE
        );
    }

    const conteudo = fs.readFileSync(
        PLAYLIST_FILE,
        "utf8"
    );

    const linhas = conteudo.split(/\r?\n/);

    const canais = [];

    let dadosCanal = null;

    for (const linhaOriginal of linhas) {

        const linha = linhaOriginal.trim();

        if (!linha || linha.startsWith("##")) {
            continue;
        }

        // Informações do canal.
        if (linha.startsWith("#EXTINF:")) {

            const separador = linha.indexOf(",");

            if (separador === -1) {
                dadosCanal = null;
                continue;
            }

            const atributos = linha.substring(
                0,
                separador
            );

            const nome = linha.substring(
                separador + 1
            ).trim();

            function extrair(atributo) {

                const regex = new RegExp(
                    `${atributo}="([^"]*)"`
                );

                return atributos.match(regex)?.[1] || "";
            }

            const tvgId = extrair("tvg-id").trim();

            const tvgName = extrair("tvg-name").trim();

            const nomeCanal =
                nome || tvgName || "Canal sem nome";

            dadosCanal = {

                id: tvgId || gerarId(nomeCanal),

                name: nomeCanal,

                logo: extrair("tvg-logo"),

                group:
                    extrair("group-title") || "Geral",

                url: ""
            };

            continue;
        }

        // Ignora outras diretivas M3U.
        if (linha.startsWith("#")) {
            continue;
        }

        // Captura URL do canal.
        if (dadosCanal) {

            dadosCanal.url = linha;

            canais.push(dadosCanal);

            dadosCanal = null;
        }
    }

    // Garante IDs únicos.
    const idsUtilizados = new Set();

    for (const canal of canais) {

        const idBase =
            canal.id || gerarId(canal.name);

        let idFinal = idBase;

        let contador = 2;

        while (idsUtilizados.has(idFinal)) {

            idFinal = `${idBase}-${contador}`;

            contador++;
        }

        canal.id = idFinal;

        idsUtilizados.add(idFinal);
    }

    return canais;
}

// ==================================================
// FUNÇÃO: LER JSON ALTERNATIVO
// ==================================================

function readChannels() {

    if (!fs.existsSync(DATA_FILE)) {
        return [];
    }

    const conteudo = fs.readFileSync(
        DATA_FILE,
        "utf8"
    );

    const canais = JSON.parse(conteudo);

    if (!Array.isArray(canais)) {

        throw new Error(
            "channels.json precisa conter um array."
        );
    }

    return canais;
}

// ==================================================
// ROTA PRINCIPAL
// ==================================================

app.get("/", (req, res) => {

    res.json({

        name: "NovaTV API",

        status: "online",

        version: "1.0.0",

        endpoints: [
            "/",
            "/health",
            "/api/channels",
            "/api/channels-json",
            "/api/channels/:id"
        ]
    });
});

// ==================================================
// STATUS DO BACKEND
// ==================================================

app.get("/health", (req, res) => {

    res.setHeader("Cache-Control", "no-store");

    res.json({

        status: "ok",

        service: "NovaTV API",

        timestamp: new Date().toISOString()

    });
});

// ==================================================
// API: LISTAR CANAIS M3U
// ==================================================

app.get("/api/channels", (req, res) => {

    try {

        const canais = carregarPlaylist();

        res.setHeader(
            "Cache-Control",
            "no-store"
        );

        res.json(canais);

    } catch (error) {

        console.error(
            "ERRO AO CARREGAR PLAYLIST:",
            error
        );

        res.status(500).json({

            error: "Não foi possível carregar a playlist M3U.",

            detalhe: error.message

        });
    }
});

// ==================================================
// API: LISTAR CANAIS JSON
// ==================================================

app.get("/api/channels-json", (req, res) => {

    try {

        const canais = readChannels();

        res.setHeader(
            "Cache-Control",
            "no-store"
        );

        res.json(canais);

    } catch (error) {

        console.error(
            "ERRO AO LER CHANNELS.JSON:",
            error
        );

        res.status(500).json({

            error: "Não foi possível carregar os canais JSON.",

            detalhe: error.message

        });
    }
});

// ==================================================
// API: BUSCAR CANAL PELO ID
// ==================================================

app.get("/api/channels/:id", (req, res) => {

    try {

        const canais = carregarPlaylist();

        const canal = canais.find(
            item => item.id === req.params.id
        );

        if (!canal) {

            return res.status(404).json({

                error: "Canal não encontrado."

            });
        }

        res.json(canal);

    } catch (error) {

        console.error(
            "ERRO AO CONSULTAR CANAL:",
            error
        );

        res.status(500).json({

            error: "Erro ao consultar canal.",

            detalhe: error.message

        });
    }
});

// ==================================================
// ROTA: ARQUIVOS DE MÍDIA
// ==================================================

// A rota /media já disponibiliza:
// imagens, vídeos e demais arquivos da pasta public.

// ==================================================
// ROTAS NÃO ENCONTRADAS
// ==================================================

app.use((req, res) => {

    res.status(404).json({

        error: "Rota não encontrada.",

        path: req.originalUrl

    });
});

// ==================================================
// TRATAMENTO GLOBAL DE ERROS
// ==================================================

app.use((error, req, res, next) => {

    console.error(
        "ERRO NO SERVIDOR:",
        error.message
    );

    if (res.headersSent) {
        return next(error);
    }

    // Erros de CORS.
    if (
        error.message ===
        "Origem não autorizada pelo CORS"
    ) {

        return res.status(403).json({

            error: "Origem não autorizada pelo CORS.",

            origin: req.headers.origin || null

        });
    }

    res.status(500).json({

        error: "Erro interno do servidor."

    });
});

// ==================================================
// INICIALIZAÇÃO
// ==================================================

app.listen(PORT, "0.0.0.0", () => {

    console.log("");
    console.log("====================================");
    console.log("           NOVATV API");
    console.log("====================================");

    console.log("Status: ONLINE");

    console.log("Porta:", PORT);

    console.log(
        "Frontend autorizado:",
        FRONTEND_ORIGIN
    );

    console.log(
        "Playlist:",
        PLAYLIST_FILE
    );

    console.log(
        "Diretório de mídia:",
        PUBLIC_DIR
    );

    console.log("------------------------------------");

    console.log(
        `Servidor local: http://localhost:${PORT}`
    );

    console.log(
        `API de canais: http://localhost:${PORT}/api/channels`
    );

    console.log(
        `Status: http://localhost:${PORT}/health`
    );

    console.log("====================================");
    console.log("");
});
