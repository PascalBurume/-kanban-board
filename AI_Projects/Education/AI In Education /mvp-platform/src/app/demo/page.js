import "../hub.css";
import Icon from "@/components/ui/Icon";
import { BrandMark, OfflinePill } from "@/components/ui/chrome";

// Internal navigation hub (formerly the site home). Lists every screen for
// quick access during development/review. Not linked from the product itself —
// the real home (/) redirects to login.
const HEAT = [2, 3, 1, 4, 2, 3, 4, 2, 4, 3, 1, 2, 4, 3, 4];
const MTX_ON = [0, 3, 5, 6, 9, 10, 12, 15];
const MTX_LEAD = [0, 5, 10, 12];

function ScreenCard({ href, thumb, num, title, children }) {
  return (
    <a className="card card-hover screen-card" href={href}>
      <div className={`sc-thumb ${thumb.cls}`}>{thumb.inner}</div>
      <div className="sc-body">
        <span className="sc-num">{num}</span>
        <h3>{title}</h3>
        <p>{children}</p>
        <span className="sc-open">
          Ouvrir l’écran <Icon name="arrowR" />
        </span>
      </div>
    </a>
  );
}

export default function Hub() {
  return (
    <div className="hub-page">
      <div className="hub">
        <div className="hub-head">
          <div className="hub-logo">
            <BrandMark />
            <div>
              <div className="nm">Mwalimu</div>
              <div className="tg">Plateforme d’apprentissage hors ligne · Écoles secondaires de la RDC</div>
            </div>
          </div>
          <OfflinePill />
        </div>

        <h1>Index des écrans</h1>
        <p className="lede">
          Accès rapide à chaque écran pour le développement et la revue. Le point d’entrée du produit en ligne est{" "}
          <a href="/login/">la page de connexion</a> ; cet index est réservé à un usage interne.
        </p>

        <div className="sec-title">
          <h2>Parcours élève</h2>
          <span className="badge badge-success">En ligne</span>
          <span className="ln" />
        </div>
        <div className="cards">
          <ScreenCard
            href="/login/"
            num="ÉCRAN 1"
            title="Connexion"
            thumb={{
              cls: "th-login",
              inner: (
                <div className="mini">
                  <i /><i /><i />
                </div>
              ),
            }}
          >
            Connexion en 3 étapes — classe → nom → code PIN à 4 chiffres, plus connexion du personnel, inscription et réinitialisation.
          </ScreenCard>

          <ScreenCard
            href="/student/"
            num="ÉCRAN 2"
            title="Tableau de bord de l’élève"
            thumb={{
              cls: "th-dash",
              inner: (
                <div className="rail">
                  <span className="nd" style={{ background: "var(--success)" }}>
                    <Icon name="check" />
                  </span>
                  <span className="nd" style={{ background: "var(--primary)" }}>
                    <Icon name="play" />
                  </span>
                  <span className="nd" style={{ background: "var(--slate-300)" }}>
                    <Icon name="lock" />
                  </span>
                </div>
              ),
            }}
          >
            Série, XP &amp; le parcours d’apprentissage. Trois styles de parcours (chronologie / sinueux / liste) et
            états du Copilote.
          </ScreenCard>

          <ScreenCard
            href="/lesson/"
            num="ÉCRAN 3"
            title="Vue de la leçon"
            thumb={{
              cls: "th-lesson",
              inner: (
                <div className="mock">
                  <div className="pg">
                    <b /><s /><s style={{ width: "90%" }} /><s style={{ width: "60%" }} />
                  </div>
                  <div className="chatp">
                    <s /><s style={{ width: "70%" }} /><s style={{ width: "85%" }} />
                  </div>
                </div>
              ),
            }}
          >
            Contenu riche avec formules &amp; médias, discussion ciblée avec le Copilote, et un quiz de fin de leçon
            avec retour.
          </ScreenCard>
        </div>

        <div className="sec-title">
          <h2>Parcours enseignant</h2>
          <span className="badge badge-success">En ligne</span>
          <span className="ln" />
        </div>
        <div className="cards">
          <ScreenCard
            href="/teacher/"
            num="ÉCRAN 4"
            title="Tableau de bord de l’enseignant"
            thumb={{ cls: "th-teach", inner: <div className="kpis"><i /><i /><i /><i /></div> }}
          >
            Indicateurs clés, fiches de classe avec alertes, liste de suivi, principaux thèmes du Copilote &amp; activité hebdomadaire.
          </ScreenCard>

          <ScreenCard
            href="/teacher/class/"
            num="ÉCRAN 5"
            title="Détail de la classe"
            thumb={{ cls: "th-table", inner: <div className="rows"><i /><i /><i /><i /></div> }}
          >
            Liste triable avec contrôles du Copilote par ligne, en masse &amp; généraux, et un panneau
            par élève.
          </ScreenCard>

          <ScreenCard
            href="/teacher/insights/"
            num="ÉCRAN 6"
            title="Analyses du Copilote"
            thumb={{
              cls: "th-insight",
              inner: (
                <div className="heatmini">
                  {HEAT.map((v, i) => (
                    <i key={i} style={{ background: `hsl(244 75% ${92 - (v / 4) * 52}%)` }} />
                  ))}
                </div>
              ),
            }}
          >
            Idées fausses regroupées automatiquement, questions principales, carte thermique de confusion &amp; usage par heure.
          </ScreenCard>

          <ScreenCard
            href="/teacher/studio/"
            num="ÉCRAN 7"
            title="Studio de contenu"
            thumb={{
              cls: "th-studio",
              inner: (
                <div className="mock">
                  <div className="treep">
                    <s /><s style={{ width: "60%" }} /><s style={{ width: "80%" }} />
                  </div>
                  <div className="edp">
                    <b /><s /><s style={{ width: "90%" }} />
                  </div>
                </div>
              ),
            }}
          >
            Arborescence du cours, éditeur markdown avec aperçu LaTeX en direct, créateur de quiz, versions &amp;
            affectation.
          </ScreenCard>
        </div>

        <div className="sec-title">
          <h2>Super administrateur</h2>
          <span className="badge badge-success">En ligne</span>
          <span className="ln" />
        </div>
        <div className="cards">
          <ScreenCard
            href="/admin/"
            num="ÉCRAN 8"
            title="Super administrateur"
            thumb={{
              cls: "th-admin",
              inner: (
                <div className="mtx">
                  {Array.from({ length: 16 }, (_, i) => (
                    <i
                      key={i}
                      className={MTX_LEAD.includes(i) ? "lead" : MTX_ON.includes(i) ? "on" : ""}
                    />
                  ))}
                </div>
              ),
            }}
          >
            Matrice d’affectation, gestion des classes &amp; élèves, approbations, import CSV, état du serveur/Ollama
            &amp; journal d’audit.
          </ScreenCard>

          <ScreenCard
            href="/components/"
            num="ÉCRAN 9"
            title="Fiche des composants"
            thumb={{
              cls: "th-comp",
              inner: (
                <div className="comp">
                  <span className="cb cb1" />
                  <span className="cb cb2" />
                  <span className="cb cb3" />
                  <span className="cn" />
                </div>
              ),
            }}
          >
            Boutons, champs, badges, anneaux de progression, nœuds de parcours, bulles de discussion, notifications &amp;
            jetons clair/sombre.
          </ScreenCard>
        </div>

        <div className="tip">
          <span className="ic">
            <Icon name="info" />
          </span>
          <div>
            Le <a href="/manuels/">lecteur de programme</a> numérisé (contenu en ligne) est également disponible.
          </div>
        </div>
      </div>
    </div>
  );
}
