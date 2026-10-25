import { useT } from "../i18n";
import { DockBody, DockTabs } from "./TvDockParts";

/** The docked player on the right of a TV screen: artwork, transport and the queue, always in the same place. */
export function TvDockColumn() {
  const t = useT();
  return (
    <aside className="island flex w-[min(27rem,34vw)] shrink-0" aria-label={t.nowPlaying.panel}>
      <div className="island-core flex w-full flex-col overflow-hidden">
        <DockTabs />
        <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-4 pt-2">
          <DockBody />
        </div>
      </div>
    </aside>
  );
}
