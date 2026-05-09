const FADE_MS = 500;
const FADE_OUT_LEAD = 0.55;

function FadingVideo({ src, className = "", style = {}, ariaLabel }) {
  const videoRef = React.useRef(null);
  const rafRef = React.useRef(0);
  const timeoutRef = React.useRef(0);
  const fadingOutRef = React.useRef(false);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    const fadeTo = (target, duration) => {
      cancelAnimationFrame(rafRef.current);
      const startOpacity = Number.parseFloat(video.style.opacity || "0") || 0;
      const startTime = performance.now();

      const tick = (now) => {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const next = startOpacity + (target - startOpacity) * eased;
        video.style.opacity = String(next);

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          video.style.opacity = String(target);
        }
      };

      rafRef.current = requestAnimationFrame(tick);
    };

    const handleLoadedData = () => {
      video.style.opacity = "0";
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
      fadeTo(1, FADE_MS);
    };

    const handleTimeUpdate = () => {
      const remaining = video.duration - video.currentTime;
      if (!fadingOutRef.current && remaining <= FADE_OUT_LEAD && remaining > 0) {
        fadingOutRef.current = true;
        fadeTo(0, FADE_MS);
      }
    };

    const handleEnded = () => {
      video.style.opacity = "0";
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        video.currentTime = 0;
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {});
        }
        fadingOutRef.current = false;
        fadeTo(1, FADE_MS);
      }, 100);
    };

    video.addEventListener("loadeddata", handleLoadedData);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handleEnded);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.clearTimeout(timeoutRef.current);
      video.removeEventListener("loadeddata", handleLoadedData);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handleEnded);
    };
  }, []);

  return (
    <video
      ref={videoRef}
      src={src}
      className={className}
      style={{ ...style, opacity: 0 }}
      autoPlay
      muted
      playsInline
      preload="auto"
      aria-label={ariaLabel}
    />
  );
}

window.FadingVideo = FadingVideo;
