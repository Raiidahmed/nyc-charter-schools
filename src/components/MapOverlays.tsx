import { useExplorer } from '../state/Explorer.tsx';
import { CloseIcon, FitIcon, HomeIcon } from '../ui/icons.tsx';

/** The two buttons above + and −: zoom out to every match, and back to home. */
export function MapButtons() {
  const { matching, home, camera } = useExplorer();
  return (
    <div className="map-buttons">
      <button
        type="button"
        className="map-button"
        onClick={() => camera.fit(matching, 14)}
        disabled={!matching.length}
        aria-label="Zoom to every matching school"
        title="Zoom to every matching school"
      >
        <FitIcon />
      </button>
      {home && (
        <button type="button" className="map-button" onClick={() => camera.zoomTo(home.lat, home.lon, 14)} aria-label="Zoom to your home" title="Zoom to your home">
          <HomeIcon />
        </button>
      )}
    </div>
  );
}

export function SubwayToggle() {
  const { subwayOn, setSubwayOn } = useExplorer();
  return (
    <button type="button" className="button subway-toggle" aria-pressed={subwayOn} onClick={() => setSubwayOn(!subwayOn)}>
      Show subway lines
    </button>
  );
}

/** The pin-dropping banner and any short notice, such as a spot outside the city. */
export function Banners() {
  const { pinMode, setPinMode, notice, setNotice } = useExplorer();
  return (
    <div className="banners" aria-live="polite">
      {pinMode && (
        <div className="banner">
          <span>Click the map where you live. You can drag the house afterwards. Press Esc to cancel.</span>
          <button type="button" className="link-button" onClick={() => setPinMode(false)}>
            Cancel
          </button>
        </div>
      )}
      {notice && (
        <div className="banner warn" role="status">
          <span>{notice}</span>
          <button type="button" className="icon-button small" onClick={() => setNotice(null)} aria-label="Dismiss" title="Dismiss">
            <CloseIcon />
          </button>
        </div>
      )}
    </div>
  );
}
