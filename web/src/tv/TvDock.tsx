import { useMediaQuery } from "../hooks/useMediaQuery";
import { TvCompactPlayer } from "./TvCompactPlayer";
import { TvDockColumn } from "./TvDockColumn";

/**
 * Room for a docked column beside the page. Media queries resolve rem against 16px, so this is 800 CSS pixels:
 * a 1080p set at density 320 has 960, a 720p set at 160 has 1280 — both keep the column. Only a narrow window
 * (a phone-sized screen, a small windowed session) falls below it and gets the bottom sheet instead.
 */
const ROOM_FOR_A_COLUMN = "(min-width: 50rem)";

/**
 * The TV player. On a TV set there is room for a docked column; in a narrow window (a phone-sized screen, a
 * windowed session) the player becomes a bar along the bottom that opens as a sheet, so nothing sits beside
 * the page. The pieces both presentations show live in TvDockParts.tsx.
 */
export function TvDock() {
  const wide = useMediaQuery(ROOM_FOR_A_COLUMN);
  return wide ? <TvDockColumn /> : <TvCompactPlayer />;
}
