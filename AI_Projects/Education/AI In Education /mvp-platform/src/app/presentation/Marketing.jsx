import "./presentation.css";

// Public marketing UI for Mwalimu, served at "/presentation".
// French, like the rest of the platform — this is the page a Congolese school
// sees first. Built on the mwalimu.css design system.
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
  { src: "/marketing/app-student.png", route: "élève · /student", title: "L’élève", desc: "Modules, progression, quiz et tuteur IA — à son rythme." },
  { src: "/marketing/app-teacher.png", route: "enseignant · /teacher", title: "L’enseignant", desc: "Progression de la classe, retours des élèves, travaux à corriger." },
  { src: "/marketing/app-admin.png", route: "admin · /admin", title: "L’administrateur", desc: "Comptes, classes, tuteur IA local et santé du serveur." },
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
          <a href="#features">Fonctionnalités</a>
          <a href="#schools">Pour les écoles</a>
        </nav>
        <div className="mkt-nav-actions">
          <a className="mkt-signin" href="/login/">Se connecter</a>
          <a className="mkt-btn mkt-btn-primary" href="#demo">Demander une démo</a>
        </div>
      </header>

      {/* Hero */}
      <section className="mkt-hero">
        <span className="mkt-badge"><span className="dot" />Fonctionne sans connexion internet</span>
        <h1>Tout le programme du secondaire, avec un tuteur IA <span className="accent">qui marche hors ligne.</span></h1>
        <p className="mkt-hero-sub">
          Mwalimu installe le programme complet du secondaire congolais — et une IA qui explique,
          interroge et corrige — sur le serveur de l&apos;école. Sans forfait, sans abonnement mensuel.
        </p>
        <div className="mkt-hero-cta">
          <a className="mkt-btn mkt-btn-primary mkt-btn-lg" href="#demo">Demander une démo <Arrow /></a>
          <a className="mkt-btn mkt-btn-secondary mkt-btn-lg" href="#schools">Voir l&apos;application</a>
        </div>
        <span className="mkt-hero-note">Installé sur un seul serveur d&apos;école · jusqu&apos;à 600 élèves en Wi-Fi local</span>

        {/* Stats */}
        <div className="mkt-wrap" style={{ width: "100%", marginTop: 24 }}>
          <div className="mkt-stats">
            <div className="mkt-stat"><b className="hl">1</b><span>serveur pour toute l&apos;école</span></div>
            <div className="mkt-stat"><b>9</b><span>manuels au programme</span></div>
            <div className="mkt-stat"><b>0 Mo</b><span>de données par mois</span></div>
            <div className="mkt-stat"><b>600</b><span>élèves en Wi-Fi local</span></div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mkt-band" id="features">
        <div className="mkt-head">
          <span className="mkt-eyebrow primary">Pensé pour les écoles hors ligne</span>
          <h2>Un serveur. Toute une école qui apprend.</h2>
          <p>Là où internet coûte cher ou n&apos;arrive pas, Mwalimu met le programme, les exercices et un tuteur intelligent à portée de chaque élève.</p>
        </div>
        <div className="mkt-features">
          <div className="mkt-feature">
            <div className="mkt-feature-ic">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 7v5l3 2" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="9" stroke="var(--indigo-200)" strokeWidth="1.5" strokeDasharray="2 3" /></svg>
            </div>
            <h3>100 % hors ligne</h3>
            <p>Le programme, les leçons et l&apos;IA tournent sur un serveur local. Pas de forfait, pas de coupure — l&apos;école reste autonome même sans réseau.</p>
            <span className="mkt-tag">0 Mo consommé</span>
          </div>
          <div className="mkt-feature hero">
            <div className="mkt-feature-ic">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><rect x="4" y="7" width="16" height="12" rx="3" stroke="#fff" strokeWidth="2" /><path d="M12 7V4M9 12h.01M15 12h.01" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>
            </div>
            <h3>Un tuteur dans chaque leçon</h3>
            <p>L&apos;IA embarquée explique un passage difficile, pose des questions, corrige un exercice et s&apos;adapte au niveau de l&apos;élève — directement dans la page, en mots simples.</p>
            <span className="mkt-tag ghost">Modèle embarqué</span>
          </div>
          <div className="mkt-feature">
            <div className="mkt-feature-ic">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M3 7l9-4 9 4-9 4-9-4Z" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" /><path d="M7 9.5V14c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V9.5" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <h3>L&apos;enseignant garde la main</h3>
            <p>Chaque enseignant suit la progression de sa classe, repère qui décroche, et publie exercices et corrigés — depuis un tableau de bord clair.</p>
            <span className="mkt-tag indigo">Suivi par classe</span>
          </div>
        </div>
      </section>

      {/* Product showcase — real screens */}
      <section className="mkt-band" id="schools" style={{ borderTop: 0 }}>
        <div className="mkt-head">
          <span className="mkt-eyebrow primary">Une expérience par profil</span>
          <h2>Trois espaces, une seule plateforme</h2>
          <p>Les élèves apprennent, les enseignants pilotent leur classe, les administrateurs gardent la vue d&apos;ensemble — le tout depuis le serveur local de l&apos;école.</p>
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
        <span className="mkt-eyebrow">Opérationnel en une matinée</span>
        <h2>Amenez Mwalimu dans votre école</h2>
        <p>Une entrée simple pour chaque profil. L&apos;élève choisit sa classe, l&apos;enseignant suit la sienne, l&apos;administrateur gère l&apos;école.</p>
        <div className="mkt-roles">
          <div className="mkt-role">
            <span className="r-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 6h9v13H6a2 2 0 0 1-2-2V6Z" stroke="#fff" strokeWidth="2" strokeLinejoin="round" /><path d="M13 6h7v11a2 2 0 0 1-2 2h-5V6Z" stroke="#c7d2fe" strokeWidth="2" strokeLinejoin="round" /></svg></span>
            <b>Élève</b><span>Choisit sa classe et apprend</span>
          </div>
          <div className="mkt-role">
            <span className="r-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3" stroke="#fff" strokeWidth="2" /><path d="M4 19a5 5 0 0 1 10 0" stroke="#fff" strokeWidth="2" strokeLinecap="round" /><path d="M16 6a3 3 0 0 1 0 6" stroke="#c7d2fe" strokeWidth="2" strokeLinecap="round" /></svg></span>
            <b>Enseignant</b><span>Suit et guide la classe</span>
          </div>
          <div className="mkt-role">
            <span className="r-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.2-2.8 7.5-7 9-4.2-1.5-7-4.8-7-9V6l7-3Z" stroke="#fff" strokeWidth="2" strokeLinejoin="round" /><path d="M9 12l2 2 4-4" stroke="#c7d2fe" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
            <b>Administrateur</b><span>Gère l&apos;école</span>
          </div>
        </div>
        <a className="mkt-btn mkt-btn-white" href="/login/">Demander une démo <Arrow c="var(--primary)" /></a>
      </section>

      {/* Footer */}
      <footer className="mkt-footer">
        <div className="mkt-footer-brand">
          <span className="mkt-logo" style={{ width: 32, height: 32, borderRadius: 10, boxShadow: "none" }}><LogoGlyph /></span>
          <span className="m">Mwalimu</span>
          <span className="tag">Plateforme d&apos;apprentissage hors ligne · RD Congo</span>
        </div>
        <nav className="mkt-footer-links">
          <a href="#features">Fonctionnalités</a>
          <a href="#schools">Pour les écoles</a>
          <a href="/login/">Se connecter</a>
        </nav>
      </footer>
    </div>
  );
}
