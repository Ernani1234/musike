import {
  ArrowRightIcon,
  ArrowUpLeftIcon,
  FunnelSimpleIcon,
  LinkIcon,
  ListBulletsIcon,
  MagnifyingGlassIcon,
  PlayIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AlbumGrid } from "../components/AlbumTiles";
import { Artwork } from "../components/Artwork";
import { GenrePanel } from "../components/GenrePanel";
import { EmptyState, PageHeader } from "../components/Page";
import { TrackList, TrackListSkeleton } from "../components/TrackList";
import { MD, useMediaQuery } from "../hooks/useMediaQuery";
import { api } from "../lib/api";
import { useT } from "../i18n";
import { cn } from "../lib/format";
import { paths } from "../lib/routes";
import type { AlbumCard, Track } from "../lib/types";
import { usePlayer } from "../player/player";
import { parseList } from "./BatchSearch";

const RECENT_KEY = "musike:recent-searches";

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function saveRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* private mode */
  }
}

/** Accepts youtube.com/watch?v=, youtu.be/, music.youtube.com and /shorts/ links. */
function videoIdFromUrl(text: string): string | null {
  try {
    const url = new URL(text.trim());
    if (!/(^|\.)youtube\.com$|^youtu\.be$/.test(url.hostname)) return null;
    const id = url.hostname === "youtu.be" ? url.pathname.slice(1) : url.searchParams.get("v") ?? url.pathname.split("/shorts/")[1];
    return id && /^[A-Za-z0-9_-]{11}$/.test(id.slice(0, 11)) ? id.slice(0, 11) : null;
  } catch {
    return null;
  }
}

type Kind = "song" | "video" | "album";
const KIND_PARAM: Record<Kind, string | null> = { song: null, video: "videos", album: "albums" };

// The genre panel stays open when coming back from a genre page.
let genresOpenMemo = false;

export default function Search() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const kind: Kind = params.get("type") === "videos" ? "video" : params.get("type") === "albums" ? "album" : "song";
  const t = useT();
  const [text, setText] = useState(q);
  const [results, setResults] = useState<Track[] | null>(null);
  const [albums, setAlbums] = useState<AlbumCard[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [recent, setRecent] = useState(readRecent);
  const [linkTrack, setLinkTrack] = useState<Track | "loading" | "error" | null>(null);
  const [retry, setRetry] = useState(0);
  const [genresOpen, setGenresOpenState] = useState(() => genresOpenMemo);
  const input = useRef<HTMLInputElement>(null);
  const isMd = useMediaQuery(MD);
  const playTrack = usePlayer((s) => s.playTrack);

  const linkId = videoIdFromUrl(text);
  // "a, b, c" probably means three songs; offer to search each one (titles can have commas, so only offer).
  const listTerms = linkId || !text.includes(",") ? [] : parseList(text);

  const setGenresOpen = (open: boolean) => {
    genresOpenMemo = open;
    setGenresOpenState(open);
  };

  const setQuery = (next: string, nextKind = kind) => {
    const p = new URLSearchParams();
    if (next.trim()) p.set("q", next.trim());
    const type = KIND_PARAM[nextKind];
    if (type) p.set("type", type);
    setParams(p, { replace: true });
  };

  // Keep the box in sync when navigating back to an earlier query (without eating a trailing space while typing).
  useEffect(() => setText((current) => (current.trim() === q ? current : q)), [q]);

  // Search as you type, debounced.
  useEffect(() => {
    if (linkId || text.trim() === q) return;
    const timer = setTimeout(() => setQuery(text), 380);
    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    if (!q) {
      setResults(null);
      setAlbums(null);
      setState("idle");
      return;
    }
    const ctrl = new AbortController();
    setState("loading");
    const found: Promise<number> =
      kind === "album"
        ? api.searchAlbums(q, ctrl.signal).then((list) => (setAlbums(list), setResults(null), list.length))
        : api.search(q, kind, ctrl.signal).then((list) => (setResults(list), setAlbums(null), list.length));
    found
      .then(() => {
        setState("ok");
        const next = [q, ...readRecent().filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, 8);
        saveRecent(next);
        setRecent(next);
      })
      .catch((e: Error) => {
        if (e.name === "AbortError") return;
        setError(e.message);
        setState("error");
      });
    return () => ctrl.abort();
  }, [q, kind, retry]);

  useEffect(() => {
    const term = text.trim();
    if (!term || linkId) return setSuggestions([]);
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      api
        .suggest(term, ctrl.signal)
        .then((s) => setSuggestions(s.filter((x) => x.toLowerCase() !== term.toLowerCase()).slice(0, 6)))
        .catch(() => {});
    }, 140);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [text, linkId]);

  useEffect(() => {
    if (!linkId) return setLinkTrack(null);
    const ctrl = new AbortController();
    setLinkTrack("loading");
    api
      .prepare(linkId, ctrl.signal)
      .then((r) =>
        setLinkTrack({
          id: r.id,
          title: r.title,
          artist: t.search.youtubeLink,
          duration: r.duration,
          thumb: `https://i.ytimg.com/vi/${r.id}/mqdefault.jpg`,
          art: `https://i.ytimg.com/vi/${r.id}/hq720.jpg`,
          kind: "video",
        }),
      )
      .catch((e: Error) => e.name !== "AbortError" && setLinkTrack("error"));
    return () => ctrl.abort();
  }, [linkId]);

  useEffect(() => {
    if (isMd && !q) input.current?.focus();
  }, []);

  const tab = (k: Kind, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={kind === k}
      onClick={() => setQuery(text || q, k)}
      className={cn(
        "h-9 rounded-full px-4 text-sm font-medium transition-colors duration-200",
        kind === k ? "bg-fg text-bg" : "bg-surface-3 text-fg-2 hover:text-fg",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="pb-8">
      <PageHeader title={t.search.title} />

      <div className="flex flex-col gap-3 px-4 pt-1 md:px-6">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            input.current?.blur();
            if (!linkId) setQuery(text);
          }}
          className="relative"
        >
          <label htmlFor="search-input" className="sr-only">
            {t.search.inputLabel}
          </label>
          <MagnifyingGlassIcon size={20} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-fg-2" />
          <input
            id="search-input"
            ref={input}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t.search.placeholder}
            className="h-12 w-full rounded-full border border-line-strong bg-surface-2 pr-24 pl-12 text-[1rem] placeholder:text-fg-3 focus:border-accent focus:bg-surface-1 focus:outline-none md:h-13 [&::-webkit-search-cancel-button]:hidden"
          />
          <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-2">
            {!text && <kbd className="kbd hidden md:inline">/</kbd>}
            {text && (
              <button
                type="button"
                onClick={() => {
                  setText("");
                  setQuery("");
                  input.current?.focus();
                }}
                aria-label={t.search.clear}
                className="grid size-9 place-items-center rounded-full text-fg-2 hover:bg-surface-3 hover:text-fg"
              >
                <XIcon size={18} />
              </button>
            )}
          </div>
        </form>

        {listTerms.length > 1 && (
          <Link
            to={paths.searchList}
            state={{ text }}
            className="flex items-center gap-3 rounded-[1rem] bg-accent-soft px-4 py-3 text-sm ring-1 ring-line transition-colors hover:bg-surface-3"
          >
            <ListBulletsIcon size={20} className="shrink-0 text-accent-text" />
            <span className="min-w-0 flex-1">
              <span className="font-medium">{t.search.searchSeparately(listTerms.length)}</span>
              <span className="block truncate text-fg-2">{listTerms.join(" · ")}</span>
            </span>
            <ArrowRightIcon size={18} className="shrink-0 text-fg-2" />
          </Link>
        )}

        {suggestions.length > 0 && (
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setText(s);
                  setQuery(s);
                }}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-[0.8125rem] text-fg-2 ring-1 ring-line transition-colors hover:text-fg"
              >
                <ArrowUpLeftIcon size={13} className="text-fg-3" /> {s}
              </button>
            ))}
          </div>
        )}

        {!linkId && (
          <div className="flex flex-wrap items-center gap-2">
            <div role="tablist" aria-label={t.search.resultType} className="flex gap-2">
              {tab("song", t.search.songs)}
              {tab("video", t.search.videos)}
              {tab("album", t.search.albums)}
            </div>
            <span className="flex-1" />
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-expanded={genresOpen}
                aria-controls="genre-panel"
                onClick={() => setGenresOpen(!genresOpen)}
                className={cn(
                  "flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors",
                  genresOpen ? "bg-accent-soft text-accent-text" : "text-fg-2 hover:bg-surface-3 hover:text-fg",
                )}
              >
                <FunnelSimpleIcon size={16} /> {t.search.genres}
              </button>
              <Link
                to={paths.searchList}
                aria-label={t.search.list}
                title={t.search.list}
                className="flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-fg-2 hover:bg-surface-3 hover:text-fg"
              >
                <ListBulletsIcon size={16} /> <span className="hidden sm:inline">{t.search.list}</span>
              </Link>
            </div>
          </div>
        )}

        {!linkId && genresOpen && <GenrePanel id="genre-panel" />}
      </div>

      <div className="mt-4 px-2 md:px-3">
        {linkId && (
          <div className="px-2 md:px-3">
            {linkTrack === "loading" && <TrackListSkeleton rows={1} />}
            {linkTrack && linkTrack !== "loading" && linkTrack !== "error" && (
              <button
                type="button"
                onClick={() => playTrack(linkTrack)}
                className="flex w-full items-center gap-4 rounded-[1rem] bg-surface-2 p-3 text-left ring-1 ring-line transition-colors hover:bg-surface-3"
              >
                <Artwork src={linkTrack.thumb} className="aspect-video w-28 rounded-[0.625rem] md:w-36" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-accent-text">
                    <LinkIcon size={14} /> {t.search.youtubeLink}
                  </span>
                  <span className="mt-1 line-clamp-2 font-medium">{linkTrack.title}</span>
                </span>
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
                  <PlayIcon size={22} weight="fill" />
                </span>
              </button>
            )}
            {linkTrack === "error" && (
              <p className="px-1 py-6 text-sm text-fg-2">{t.search.linkError}</p>
            )}
          </div>
        )}

        {!linkId && state === "loading" && <TrackListSkeleton />}

        {!linkId && state === "error" && (
          <EmptyState
            icon={<WarningCircleIcon size={28} />}
            title={t.search.failed}
            body={error}
            action={
              <button
                type="button"
                onClick={() => setRetry((n) => n + 1)}
                className="mt-2 h-11 rounded-full bg-surface-3 px-6 text-sm font-medium hover:bg-surface-4"
              >
                {t.common.retry}
              </button>
            }
          />
        )}

        {!linkId && state === "ok" && albums && (albums.length ? (
          <AlbumGrid albums={albums} />
        ) : (
          <EmptyState icon={<MagnifyingGlassIcon size={28} />} title={t.search.nothingFound} body={t.search.nothingFoundBody(q, t.search.songs)} />
        ))}

        {!linkId && state === "ok" && results && results.length === 0 && (
          <EmptyState
            icon={<MagnifyingGlassIcon size={28} />}
            title={t.search.nothingFound}
            body={t.search.nothingFoundBody(q, kind === "song" ? t.search.videos : t.search.songs)}
          />
        )}

        {!linkId && state === "ok" && results && results.length > 0 && <TrackList tracks={results} showAlbum={kind === "song"} />}

        {!linkId && state === "idle" && (
          <div className="px-2 md:px-3">
            {recent.length > 0 ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold tracking-tight">{t.search.recent}</h2>
                  <button
                    type="button"
                    onClick={() => {
                      saveRecent([]);
                      setRecent([]);
                    }}
                    className="text-sm font-medium text-fg-2 hover:text-fg"
                  >
                    {t.search.clearRecent}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recent.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        setText(r);
                        setQuery(r);
                      }}
                      className="h-10 rounded-full bg-surface-2 px-4 text-sm ring-1 ring-line transition-colors hover:bg-surface-3"
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState
                icon={<MagnifyingGlassIcon size={28} />}
                title={t.search.idleTitle}
                body={t.search.idleBody}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
