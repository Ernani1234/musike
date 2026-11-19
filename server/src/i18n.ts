/**
 * Messages the server sends to people (errors, update progress), in every language the app speaks.
 * They are kept as keys and translated when sent, so each device gets its own language.
 */

export type Lang = "en" | "pt-BR";
type Params = Record<string, string | number>;

const en = {
  radioTimeout: "Radio took too long to answer. Try again.",
  playbackTimeout: "Audio preparation timed out. Try again.",
  serverBusy: "The server is busy. Try again in a moment.",
  ytdlpOutputLimit: "The media tool returned too much data.",
  invalidVideoId: "Invalid video ID.",
  emptyQuery: "Type something to search.",
  searchFailed: "Search is unavailable right now ({detail}). Try again in a moment.",
  missingTitle: "Give the song's title.",
  notBackup: "This file isn't a Musike backup.",
  newerBackup: "This backup was made by a newer Musike. Update the app to import it.",
  idMismatch: "The ID doesn't match.",
  tracksRequired: "Send a list of tracks.",
  invalidGenre: "Invalid genre.",
  invalidOffset: "Invalid position.",
  invalidArtist: "Invalid artist.",
  routeNotFound: "Route not found.",
  noFreePort: "No free port between {from} and {to}.",
  invalidTrack: "Invalid track.",
  playlistNotFound: "Playlist not found.",
  playlistNameRequired: "Give the playlist a name.",
  genresUnavailable: "Couldn't load the genres right now. Try again.",
  genreUnavailable: "Couldn't open this genre right now. Try again.",
  genreEmpty: "Nothing found for this genre.",
  artistUnavailable: "Couldn't open this artist right now. Try again.",
  artistNotFound: "Artist not found.",
  albumUnavailable: "Couldn't open this album right now. Try again.",
  albumNotFound: "Album not found.",
  invalidAlbum: "Invalid album.",
  ytdlpMissing: "yt-dlp wasn't found on this computer. Open Settings in Musike to install it.",
  ytdlpTimeout: "yt-dlp took too long to answer.",
  ytdlpCantRun: "Couldn't run yt-dlp ({error}). Open Settings in Musike.",
  botCheck: "YouTube is asking this connection to prove it's not a bot. If you're on a VPN, turn it off and try again.",
  videoUnavailable: "This video isn't available on YouTube.",
  ageRestricted: "Age-restricted video. It needs cookies from a signed-in account.",
  ytdlpFailed: "yt-dlp failed.",
  ytdlpOutdated: "{detail} YouTube may have changed: update yt-dlp in Settings.",
  noAudio: "No audio format available for this video.",
  noSdVideo: "This video has no combined SD version. Use HD.",
  streamRefused: "YouTube refused the stream (HTTP {status}). Try updating yt-dlp in Settings.",
  noWinget: "yt-dlp wasn't found and winget isn't available. Install it manually: https://github.com/yt-dlp/yt-dlp",
  installingYtdlp: "Installing yt-dlp",
  updatingYtdlp: "Updating yt-dlp",
  directUpdateFailed: "Direct update failed, trying winget",
  downloadingTools: "Downloading yt-dlp and Deno from GitHub",
  alreadyLatest: "Already on the latest version ({version})",
  ytdlpReady: "yt-dlp {version} is ready to use",
  updateFailed: "Couldn't update yt-dlp.",
  toolMissing: "{tool} wasn't found on this computer.",
  downloadFailed: "Downloading {tool} failed (HTTP {status}).",
  ffmpegPackage: "Unexpected FFmpeg package.",
};

export type MsgKey = keyof typeof en;

const pt: Record<MsgKey, string> = {
  radioTimeout: "O rádio demorou demais para responder. Tente novamente.",
  playbackTimeout: "A preparação do áudio demorou demais. Tente novamente.",
  serverBusy: "O servidor está ocupado. Tente de novo em instantes.",
  ytdlpOutputLimit: "A ferramenta de mídia retornou dados demais.",
  invalidVideoId: "ID de vídeo inválido.",
  emptyQuery: "Digite algo para buscar.",
  searchFailed: "A busca está indisponível agora ({detail}). Tente de novo em instantes.",
  missingTitle: "Informe o título da música.",
  notBackup: "Este arquivo não é um backup do Musike.",
  newerBackup: "Backup de uma versão mais nova do Musike. Atualize o app para importar.",
  idMismatch: "ID não confere.",
  tracksRequired: "Envie uma lista de faixas.",
  invalidGenre: "Gênero inválido.",
  invalidOffset: "Posição inválida.",
  invalidArtist: "Artista inválido.",
  routeNotFound: "Rota não encontrada.",
  noFreePort: "Nenhuma porta livre entre {from} e {to}.",
  invalidTrack: "Faixa inválida.",
  playlistNotFound: "Playlist não encontrada.",
  playlistNameRequired: "Dê um nome à playlist.",
  genresUnavailable: "Não foi possível carregar os gêneros agora. Tente de novo.",
  genreUnavailable: "Não foi possível abrir este gênero agora. Tente de novo.",
  genreEmpty: "Nada encontrado para este gênero.",
  artistUnavailable: "Não foi possível abrir este artista agora. Tente de novo.",
  artistNotFound: "Artista não encontrado.",
  albumUnavailable: "Não foi possível abrir este álbum agora. Tente de novo.",
  albumNotFound: "Álbum não encontrado.",
  invalidAlbum: "Álbum inválido.",
  ytdlpMissing: "O yt-dlp não foi encontrado neste computador. Abra Ajustes no Musike para instalar.",
  ytdlpTimeout: "O yt-dlp demorou demais para responder.",
  ytdlpCantRun: "Não foi possível executar o yt-dlp ({error}). Abra Ajustes no Musike.",
  botCheck: "O YouTube está pedindo para esta conexão provar que não é um robô. Se estiver usando VPN, desligue e tente de novo.",
  videoUnavailable: "Vídeo indisponível no YouTube.",
  ageRestricted: "Vídeo com restrição de idade. Requer cookies de uma conta logada.",
  ytdlpFailed: "Falha no yt-dlp.",
  ytdlpOutdated: "{detail} O YouTube pode ter mudado: atualize o yt-dlp em Ajustes.",
  noAudio: "Nenhum formato de áudio disponível para este vídeo.",
  noSdVideo: "Este vídeo não tem versão SD combinada. Use HD.",
  streamRefused: "O YouTube recusou o stream (HTTP {status}). Tente atualizar o yt-dlp em Ajustes.",
  noWinget: "yt-dlp não encontrado e o winget não está disponível. Instale manualmente: https://github.com/yt-dlp/yt-dlp",
  installingYtdlp: "Instalando yt-dlp",
  updatingYtdlp: "Atualizando yt-dlp",
  directUpdateFailed: "Atualização direta falhou, tentando pelo winget",
  downloadingTools: "Baixando yt-dlp e Deno do GitHub",
  alreadyLatest: "Já está na versão mais recente ({version})",
  ytdlpReady: "yt-dlp {version} pronto para uso",
  updateFailed: "Não foi possível atualizar o yt-dlp.",
  toolMissing: "{tool} não encontrado neste computador.",
  downloadFailed: "Download de {tool} falhou (HTTP {status}).",
  ffmpegPackage: "Pacote do FFmpeg inesperado.",
};

const CATALOG: Record<Lang, Record<MsgKey, string>> = { en, "pt-BR": pt };

/** A message translated when it is sent: a key plus the values for its {placeholders}. */
export interface Msg {
  key: MsgKey;
  params?: Params;
}

/** Something to show a person: a message to translate, or text that needs none (tool output). */
export type Text = Msg | string;

export const msg = (key: MsgKey, params?: Params): Msg => ({ key, params });

export function tr(lang: Lang, text: Text): string {
  if (typeof text === "string") return text;
  return CATALOG[lang][text.key].replace(/\{(\w+)\}/g, (all, name: string) => String(text.params?.[name] ?? all));
}

export const isLang = (v: unknown): v is Lang => v === "en" || v === "pt-BR";

/** The language a request asked for. The app always says; anything else (media elements, curl) gets English. */
export function langOf(req: { headers: Record<string, string | string[] | undefined> }): Lang {
  const asked = req.headers["x-musike-lang"];
  return isLang(asked) ? asked : "en";
}

/** The code YouTube Music uses for its own words (genre names, artist bios). */
export const youtubeLang = (lang: Lang) => (lang === "pt-BR" ? "pt" : "en");
