const HERO_VIDEO = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260418_080021_d598092b-c4c2-4e53-8e46-94cf9064cd50.mp4";
const CAPABILITIES_VIDEO = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260418_094631_d30ab262-45ee-4b7d-99f3-5d5848c8ef13.mp4";

const { motion } = window.Motion;
const {
  ArrowUpRight,
  PlayIcon,
  ClockIcon,
  GlobeIcon,
  MaterialIcon,
  FadingVideo,
  BlurText
} = window;

const entrance = {
  initial: { filter: "blur(10px)", opacity: 0, y: 20 },
  whileInView: { filter: "blur(0px)", opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.35 },
  transition: { duration: 0.75, ease: "easeOut" }
};

const iconPaths = {
  image: "M5 21q-.825 0-1.412-.587T3 19V5q0-.825.588-1.412T5 3h14q.825 0 1.413.588T21 5v14q0 .825-.587 1.413T19 21H5Zm1-4h12l-3.75-5-3 4L9 13l-3 4Z",
  movie: "M4 6.47 5.76 10H20v8H4V6.47M22 4h-4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.89-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4Z",
  bulb: "M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1Zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7Z"
};

const cards = [
  {
    title: "AI Scenery",
    body: "AI analyzes your product to create indistinguishable natural environments — from Icelandic cliffs to misty forests.",
    icon: iconPaths.image,
    tags: ["Natural Context", "Photo Realism", "Infinite Settings", "Eco-Vibe"]
  },
  {
    title: "Batch Production",
    body: "Style your entire product line in minutes. Create a unified visual identity for catalogues and social media without weeks of retouching.",
    icon: iconPaths.movie,
    tags: ["Scale Fast", "Visual Consistency", "Time Saver", "Ready to Post"]
  },
  {
    title: "Smart Lighting",
    body: "Automatic lighting and material adjustment. Achieve flawless integration with realistic shadows and sunlight.",
    icon: iconPaths.bulb,
    tags: ["Ray Tracing", "Physical Shadows", "Studio Quality", "Sunlight Sync"]
  }
];

function Navbar() {
  const links = ["Home", "Voyages", "Worlds", "Innovation", "Plan Launch"];

  return (
    <nav className="fixed left-0 right-0 top-4 z-50 px-8 lg:px-16">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <a href="#" className="liquid-glass flex h-12 w-12 items-center justify-center rounded-full text-3xl italic leading-none text-white font-heading" aria-label="Astra home">
          a
        </a>

        <div className="liquid-glass hidden items-center rounded-full px-1.5 py-1.5 md:flex">
          {links.map((link) => (
            <a key={link} href="#" className="px-3 py-2 font-body text-sm font-medium text-white/90">
              {link}
            </a>
          ))}
          <a href="#" className="ml-1 flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-4 py-2 font-body text-sm font-semibold text-black">
            Claim a Spot
            <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>

        <div className="h-12 w-12" aria-hidden="true" />
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="relative flex min-h-screen overflow-hidden bg-black">
      <FadingVideo
        src={HERO_VIDEO}
        className="absolute left-1/2 top-0 z-0 -translate-x-1/2 object-cover object-top"
        style={{ width: "120%", height: "120%" }}
        ariaLabel="Spacecraft traveling through deep space"
      />

      <div className="relative z-10 flex min-h-screen w-full flex-col">
        <Navbar />

        <main className="flex flex-1 flex-col items-center justify-center px-4 pt-24 text-center">
          <motion.div
            {...entrance}
            transition={{ ...entrance.transition, delay: 0.4 }}
            className="liquid-glass mb-5 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full px-1.5 py-1.5"
          >
            <span className="rounded-full bg-white px-3 py-1 font-body text-xs font-semibold text-black">New</span>
            <span className="pr-3 font-body text-sm text-white/90">Maiden Crewed Voyage to Mars Arrives 2026</span>
          </motion.div>

          <BlurText
            text="Venture Past Our Sky Across the Universe"
            className="hero-title max-w-2xl font-heading text-6xl italic leading-[0.8] tracking-[-4px] text-white md:text-7xl lg:text-[5.5rem]"
          />

          <motion.p
            {...entrance}
            transition={{ ...entrance.transition, delay: 0.8 }}
            className="mt-4 max-w-2xl font-body text-sm font-light leading-tight text-white md:text-base"
          >
            Discover the universe in ways once unimaginable. Our pioneering vessels and breakthrough engineering bring deep-space exploration within reach—secure and extraordinary.
          </motion.p>

          <motion.div
            {...entrance}
            transition={{ ...entrance.transition, delay: 1.1 }}
            className="mt-6 flex flex-wrap items-center justify-center gap-6"
          >
            <a href="#" className="liquid-glass-strong flex items-center gap-2 rounded-full px-5 py-2.5 font-body text-sm font-medium text-white">
              Start Your Voyage
              <ArrowUpRight className="h-5 w-5" />
            </a>
            <a href="#" className="flex items-center gap-2 font-body text-sm font-medium text-white">
              View Liftoff
              <PlayIcon className="h-4 w-4" />
            </a>
          </motion.div>

          <motion.div
            {...entrance}
            transition={{ ...entrance.transition, delay: 1.3 }}
            className="mt-8 flex flex-wrap items-stretch justify-center gap-4"
          >
            <StatCard icon={<ClockIcon />} value="34.5 Min" label="Average Videos Watch Time" />
            <StatCard icon={<GlobeIcon />} value="2.8B+" label="Users Across the Globe" />
          </motion.div>
        </main>

        <Partners />
      </div>
    </section>
  );
}

function StatCard({ icon, value, label }) {
  return (
    <div className="liquid-glass flex w-[220px] flex-col rounded-[1.25rem] p-5 text-left">
      <div className="flex h-7 w-7 items-center justify-center text-white">{icon}</div>
      <div className="mt-8 font-heading text-4xl italic leading-none tracking-[-1px] text-white">{value}</div>
      <div className="mt-2 font-body text-xs font-light text-white">{label}</div>
    </div>
  );
}

function Partners() {
  return (
    <motion.div
      {...entrance}
      transition={{ ...entrance.transition, delay: 1.4 }}
      className="flex flex-col items-center gap-4 px-4 pb-8"
    >
      <div className="liquid-glass rounded-full px-3.5 py-1 font-body text-xs font-medium text-white">
        Collaborating with top aerospace pioneers globally
      </div>
      <div className="flex flex-wrap justify-center gap-x-12 gap-y-2 font-heading text-2xl italic tracking-tight text-white md:gap-x-16 md:text-3xl">
        {["Aeon", "Vela", "Apex", "Orbit", "Zeno"].map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
    </motion.div>
  );
}

function Capabilities() {
  return (
    <section className="relative min-h-screen overflow-hidden bg-black">
      <FadingVideo
        src={CAPABILITIES_VIDEO}
        className="absolute inset-0 z-0 h-full w-full object-cover"
        ariaLabel="Cinematic spacecraft production environment"
      />

      <div className="relative z-10 flex min-h-screen flex-col px-8 pb-10 pt-24 md:px-16 lg:px-20">
        <motion.header
          {...entrance}
          transition={{ ...entrance.transition, delay: 0.15 }}
          className="mb-auto"
        >
          <div className="mb-6 font-body text-sm text-white/80">// Capabilities</div>
          <h2 className="font-heading text-6xl italic leading-[0.9] tracking-[-3px] text-white md:text-7xl lg:text-[6rem]">
            Production
            <br />
            evolved
          </h2>
        </motion.header>

        <motion.div
          {...entrance}
          transition={{ ...entrance.transition, delay: 0.35 }}
          className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3"
        >
          {cards.map((card) => (
            <CapabilityCard key={card.title} {...card} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function CapabilityCard({ title, body, icon, tags }) {
  return (
    <article className="liquid-glass flex min-h-[360px] flex-col rounded-[1.25rem] p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="liquid-glass flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.75rem]">
          <MaterialIcon path={icon} />
        </div>
        <div className="flex max-w-[70%] flex-wrap justify-end gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="liquid-glass whitespace-nowrap rounded-full px-3 py-1 font-body text-[11px] text-white/90">
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="flex-1" />

      <div className="mt-6">
        <h3 className="font-heading text-3xl italic leading-none tracking-[-1px] text-white md:text-4xl">{title}</h3>
        <p className="mt-3 max-w-[32ch] font-body text-sm font-light leading-snug text-white/90">{body}</p>
      </div>
    </article>
  );
}

function App() {
  React.useEffect(() => {
    const originalError = console.error;
    console.error = (...args) => {
      const first = String(args[0] || "");
      if (first.includes("Each child in a list should have a unique") || first.includes("Encountered two children with the same key")) {
        return;
      }
      originalError(...args);
    };

    return () => {
      console.error = originalError;
    };
  }, []);

  return (
    <div className="bg-black">
      <Hero />
      <Capabilities />
    </div>
  );
}

window.App = App;

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
