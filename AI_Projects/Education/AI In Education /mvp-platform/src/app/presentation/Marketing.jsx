import "./presentation.css";

// Public marketing UI for Mwalimu, shared by the home route ("/") and
// "/presentation". Condensed, English. Built on the mwalimu.css design system.
// Static server component — no auth.

const LogoGlyph = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5V5.5Z" fill="#fff" />
    <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5A1.5 1.5 0 0 1 20 20.5V5.5Z" fill="#c7d2fe" />
  </svg>
);
const Arrow = ({ c = "#fff" }) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

const SCREENS = [
  { src: "/marketing/app-student.png", route: "student · /student", title: "The student", desc: "Modules, progress, quizzes and the AI tutor — at their own pace." },
  { src: "/marketing/app-teacher.png", route: "teacher · /teacher", title: "The teacher", desc: "Class progress, student feedback, work to grade." },
  { src: "/marketing/app-admin.png", route: "admin · /admin", title: "The administrator", desc: "Accounts, classes, local AI tutor and server health." },
];

export default function Marketing() {
  return (
    <div className="mkt">
      {/* Nav */}
      <header className="mkt-nav">
        <div className="mkt-brand">
          <span className="mkt-logo"><LogoGlyph /></span>
          <span className="mkt-wordmark">Mwalimu</span>
        </div>
        <nav className="mkt-links">
          <a href="#features">Features</a>
          <a href="#schools">For schools</a>
        </nav>
        <div className="mkt-nav-actions">
          <a className="mkt-signin" href="/login/">Log in</a>
          <a className="mkt-btn mkt-btn-primary" href="#demo">Request a demo</a>
        </div>
      </header>

      {/* Hero */}
      <section className="mkt-hero">
        <span className="mkt-badge"><span className="dot" />Works with no internet connection</span>
        <h1>Every secondary-school lesson, with an AI tutor <span className="accent">that works offline.</span></h1>
        <p className="mkt-hero-sub">
          Mwalimu brings the full Congolese secondary curriculum — and an AI that explains, quizzes and
          corrects — to the school&apos;s own server. No data, no monthly subscription.
        </p>
        <div className="mkt-hero-cta">
          <a className="mkt-btn mkt-btn-primary mkt-btn-lg" href="#demo">Request a demo <Arrow /></a>
          <a className="mkt-btn mkt-btn-secondary mkt-btn-lg" href="#schools">See the app</a>
        </div>
        <span className="mkt-hero-note">Installed on a single school server · up to 600 students over local Wi-Fi</span>

        {/* Stats */}
        <div className="mkt-wrap" style={{ width: "100%", marginTop: 24 }}>
          <div className="mkt-stats">
            <div className="mkt-stat"><b className="hl">1</b><span>server for the whole school</span></div>
            <div className="mkt-stat"><b>9</b><span>curriculum books</span></div>
            <div className="mkt-stat"><b>0 MB</b><span>data used per month</span></div>
            <div className="mkt-stat"><b>600</b><span>students on local Wi-Fi</span></div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mkt-band" id="features">
        <div className="mkt-head">
          <span className="mkt-eyebrow primary">Built for offline schools</span>
          <h2>One server. A whole school learning.</h2>
          <p>Where the internet is costly or absent, Mwalimu puts the curriculum, exercises and a smart tutor within reach of every student.</p>
        </div>
        <div className="mkt-features">
          <div className="mkt-feature">
            <div className="mkt-feature-ic">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 7v5l3 2" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="9" stroke="var(--indigo-200)" strokeWidth="1.5" strokeDasharray="2 3" /></svg>
            </div>
            <h3>100% offline</h3>
            <p>The curriculum, lessons and AI all run on a local server. No data plan, no outages — the school stays autonomous even without a network.</p>
            <span className="mkt-tag">0 MB used</span>
          </div>
          <div className="mkt-feature hero">
            <div className="mkt-feature-ic">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><rect x="4" y="7" width="16" height="12" rx="3" stroke="#fff" strokeWidth="2" /><path d="M12 7V4M9 12h.01M15 12h.01" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>
            </div>
            <h3>A tutor in every lesson</h3>
            <p>The on-device AI explains a tricky passage, asks questions, corrects an exercise and adapts to the student&apos;s level — right in the page, in plain language.</p>
            <span className="mkt-tag ghost">On-device model</span>
          </div>
          <div className="mkt-feature">
            <div className="mkt-feature-ic">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M3 7l9-4 9 4-9 4-9-4Z" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" /><path d="M7 9.5V14c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V9.5" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <h3>Teachers stay in control</h3>
            <p>Every teacher follows their class&apos;s progress, spots who is falling behind, and publishes exercises and answer keys — from one clear dashboard.</p>
            <span className="mkt-tag indigo">Per-class tracking</span>
          </div>
        </div>
      </section>

      {/* Product showcase — real screens */}
      <section className="mkt-band" id="schools" style={{ borderTop: 0 }}>
        <div className="mkt-head">
          <span className="mkt-eyebrow primary">One experience per role</span>
          <h2>Three spaces, one platform</h2>
          <p>Students learn, teachers run their class, administrators keep the overview — all from the school&apos;s local server.</p>
        </div>
        <div className="mkt-screens">
          {SCREENS.map((s) => (
            <div className="mkt-screen" key={s.route}>
              <div className="mkt-screen-bar"><i /><i /><i /><span>{s.route}</span></div>
              <div className="mkt-screen-shot"><img src={s.src} alt={s.title} /></div>
              <div className="mkt-screen-cap"><b>{s.title}</b><span>{s.desc}</span></div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mkt-cta" id="demo">
        <span className="mkt-eyebrow">Ready in a morning</span>
        <h2>Bring Mwalimu to your school</h2>
        <p>A simple entry for each role. Students pick their class, teachers follow theirs, administrators manage the school.</p>
        <div className="mkt-roles">
          <div className="mkt-role">
            <span className="r-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 6h9v13H6a2 2 0 0 1-2-2V6Z" stroke="#fff" strokeWidth="2" strokeLinejoin="round" /><path d="M13 6h7v11a2 2 0 0 1-2 2h-5V6Z" stroke="#c7d2fe" strokeWidth="2" strokeLinejoin="round" /></svg></span>
            <b>Student</b><span>Picks a class and learns</span>
          </div>
          <div className="mkt-role">
            <span className="r-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3" stroke="#fff" strokeWidth="2" /><path d="M4 19a5 5 0 0 1 10 0" stroke="#fff" strokeWidth="2" strokeLinecap="round" /><path d="M16 6a3 3 0 0 1 0 6" stroke="#c7d2fe" strokeWidth="2" strokeLinecap="round" /></svg></span>
            <b>Teacher</b><span>Follows and guides the class</span>
          </div>
          <div className="mkt-role">
            <span className="r-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.2-2.8 7.5-7 9-4.2-1.5-7-4.8-7-9V6l7-3Z" stroke="#fff" strokeWidth="2" strokeLinejoin="round" /><path d="M9 12l2 2 4-4" stroke="#c7d2fe" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
            <b>Administrator</b><span>Manages the school</span>
          </div>
        </div>
        <a className="mkt-btn mkt-btn-white" href="/login/">Request a demo <Arrow c="var(--primary)" /></a>
      </section>

      {/* Footer */}
      <footer className="mkt-footer">
        <div className="mkt-footer-brand">
          <span className="mkt-logo" style={{ width: 32, height: 32, borderRadius: 10, boxShadow: "none" }}><LogoGlyph /></span>
          <span className="m">Mwalimu</span>
          <span className="tag">Offline learning platform · DR Congo</span>
        </div>
        <nav className="mkt-footer-links">
          <a href="#features">Features</a>
          <a href="#schools">For schools</a>
          <a href="/login/">Log in</a>
        </nav>
      </footer>
    </div>
  );
}
