import { useState } from "react";
import { useT } from "../i18n";
import { claimPlayback, usePlaybackDevices } from "../lib/playbackSync";
import { Modal } from "./Modal";

export function PlaybackDevices() {
  const f = useT().features; const { enabled, connected, view, error } = usePlaybackDevices(); const [open, setOpen] = useState(false);
  if (!enabled) return null;
  return <>
    <button type="button" className="button-secondary text-xs" onClick={() => setOpen(true)} aria-label={f.playbackDevices}>{f.devices}</button>
    {open && <Modal open={open} title={f.playbackDevices} onClose={() => setOpen(false)}>
      <div className="flex flex-col gap-3 p-4">
        <p className="text-sm text-fg-2">{connected ? f.syncConnected : f.syncConnecting}</p>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {view?.transfer && <p role="status" className="text-sm text-fg-2">{f.transferWaiting}</p>}
        <ul className="flex flex-col gap-2">{view?.devices.map((device) => <li key={device.id} className="flex justify-between gap-3 rounded-[20px] bg-surface-2 p-3 text-sm">
          <span>{device.name}{device.id === view.deviceId ? ` · ${f.thisDevice}` : ""}</span>
          <span className="text-fg-2">{device.id === view.active ? f.activeDevice : device.online ? f.deviceOnline : f.deviceOffline}</span>
        </li>)}</ul>
        <button type="button" className="button-secondary" disabled={!connected || !!view?.transfer || view?.active === view?.deviceId} onClick={() => void claimPlayback()}>{f.playHere}</button>
      </div>
    </Modal>}
  </>;
}
