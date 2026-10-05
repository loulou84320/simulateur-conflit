// Partagé par vote.html et rapport.html : connexion Firebase, questions, analyse.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, onValue, set, get, remove, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const app = initializeApp({
  apiKey: "AIzaSyAwKL34_ZB74nuGKXSC1LluIOaG51-8fqg",
  authDomain: "conflit-votes.firebaseapp.com",
  databaseURL: "https://conflit-votes-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "conflit-votes",
  appId: "1:946771283422:web:d31353d1cd01d2a7cc614f"
});
export const db = getDatabase(app);
export const auth = getAuth(app);
export { ref, onValue, set, get, remove, serverTimestamp, signInAnonymously, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut };

export const ADMIN_EMAIL = "lebacq.louis@gmail.com";

export const ISSUES = [
  { id: "vocal", l: "Un vocal privé de médiation entre les concernés" },
  { id: "close", l: "On considère l'affaire close, on passe à autre chose" },
  { id: "excuses", l: "Des excuses des deux côtés, puis on clôt" },
  { id: "reintegre", l: "Nzo revient au staff à terme, avec des conditions claires" },
  { id: "horsstaff", l: "Nzo reste hors du staff, mais reste un membre normal" },
  { id: "sanction", l: "Une sanction (mute / exclusion temporaire)" }
];

export const REGLES = [
  { id: "r1", l: "Pas de couper la parole en vocal, priorité à la 3D" },
  { id: "r2", l: "Les conflits se règlent en MP ou en vocal privé, jamais dans un salon public" },
  { id: "r3", l: "Un retrait du staff est toujours annoncé à l'intéressé, avec les raisons" },
  { id: "r4", l: "Pas d'insultes, y compris de la part du staff" },
  { id: "r5", l: "Un médiateur neutre quand un conflit implique le staff" },
  { id: "r6", l: "Les témoins peuvent donner leur version, sans prendre parti" },
  { id: "r7", l: "Les membres du staff doivent assurer une présence minimale" }
];

export const ETAT = [
  { id: "oui", l: "Oui, c'est réglé" },
  { id: "partiel", l: "En partie" },
  { id: "non", l: "Non, pas du tout" }
];

export const GRIEFS = [
  { id: "g1", t: "Nzo a crié sur Spock en vocal puis rage-quit", c: "Nzo" },
  { id: "g2", t: "Nzo coupe régulièrement les discussions en cours", c: "Nzo" },
  { id: "g3", t: "Présence/aide faible de Nzo malgré sa promesse", c: "Nzo" },
  { id: "g4", t: "Nzo s'accroche aux détails au lieu du fond", c: "Nzo" },
  { id: "g11", t: "Nzo menace et insulte Salahaddin (« méchant », « suçage »)", c: "Nzo" },
  { id: "g14", t: "Nzo a pris pour lui une remarque adressée à tous", c: "Nzo" },
  { id: "g5", t: "Retrait du staff sans prévenir l'intéressé", c: "Staff" },
  { id: "g6", t: "Insulte publique « con et aigri »", c: "ZePunisher" },
  { id: "g7", t: "Déballage public après avoir dit « t'es sûr de t'afficher ? »", c: "ZePunisher" },
  { id: "g13", t: "ZePunisher ne répond pas à la question sur la date du vocal", c: "ZePunisher" },
  { id: "g8", t: "Spock : « tu te ridiculises » après avoir déclaré l'affaire close", c: "Spock" },
  { id: "g9", t: "Spock coupe aussi la parole (selon Nzo)", c: "Spock" },
  { id: "g12", t: "Salahaddin : « tu te ridiculises un peu beaucoup »", c: "Salahaddin" },
  { id: "g10", t: "Rendez-vous vocal manqué (versions contradictoires)", c: "Tous" }
];

export const PERSONNES = [
  { id: "nzo", n: "Nzo" },
  { id: "zepunisher", n: "ZePunisher" },
  { id: "spock", n: "Spock" },
  { id: "salahaddin", n: "Salahaddin" }
];

export const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const pct = x => Math.round(x * 100) + "%";

// Un vote par pseudo (insensible à la casse) : on garde le plus récent.
export function dedupe(raw) {
  const all = Object.entries(raw || {}).map(([uid, v]) => ({ uid, ...v })).filter(v => v.pseudo);
  const byPseudo = new Map();
  for (const v of all) {
    const k = v.pseudo.trim().toLowerCase();
    const prev = byPseudo.get(k);
    if (!prev || (v.ts || 0) > (prev.ts || 0)) byPseudo.set(k, v);
  }
  return { votes: [...byPseudo.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0)), doublons: all.length - byPseudo.size };
}

export function analyze(raw) {
  const { votes, doublons } = dedupe(raw);
  const n = votes.length;
  const r = { n, doublons, votes, last: votes[0]?.ts || null };

  // Issue souhaitée
  const ic = Object.fromEntries(ISSUES.map(i => [i.id, 0]));
  let iTot = 0;
  votes.forEach(v => { if (v.issue in ic) { ic[v.issue]++; iTot++; } });
  r.issues = ISSUES.map(i => ({ ...i, c: ic[i.id], p: iTot ? ic[i.id] / iTot : 0 })).sort((a, b) => b.c - a.c);
  r.iTot = iTot;
  const top = r.issues[0];
  r.issueVerdict = !iTot ? null : top.p >= 0.6 ? "large majorité" : top.p >= 0.4 ? "majorité relative" : "pas de consensus";

  // Conflit réglé ?
  const ec = { oui: 0, partiel: 0, non: 0 };
  votes.forEach(v => { if (v.regle in ec) ec[v.regle]++; });
  const eTot = ec.oui + ec.partiel + ec.non;
  r.etat = ETAT.map(e => ({ ...e, c: ec[e.id], p: eTot ? ec[e.id] / eTot : 0 }));
  r.eTot = eTot;
  r.etatScore = eTot ? (ec.oui + ec.partiel * 0.5) / eTot : null;

  // Règles
  r.regles = REGLES.map(g => {
    const c = { pour: 0, neutre: 0, contre: 0 };
    votes.forEach(v => { const a = v.regles?.[g.id]; if (a in c) c[a]++; });
    const tot = c.pour + c.neutre + c.contre;
    const exprimes = c.pour + c.contre;
    const support = exprimes ? c.pour / exprimes : null;
    const label = support === null ? "—" : support >= 0.75 ? "consensus" : support <= 0.25 ? "rejet" : support >= 0.4 && support <= 0.6 ? "divise" : support > 0.6 ? "plutôt pour" : "plutôt contre";
    return { ...g, ...c, tot, support, label };
  });

  // Reproches (section personnes)
  r.griefs = GRIEFS.map(g => {
    const c = { oui: 0, partiel: 0, non: 0, nsp: 0 };
    votes.forEach(v => { const a = v.griefs?.[g.id]; if (a in c) c[a]++; });
    const rep = c.oui + c.partiel + c.non;
    const score = rep ? (c.oui + c.partiel * 0.5) / rep : null;
    const label = score === null ? "—" : score >= 0.7 ? "largement reconnu" : score <= 0.3 ? "largement rejeté" : "avis partagés";
    return { ...g, ...c, rep, score, label };
  });
  r.griefsVotants = votes.filter(v => v.griefs && Object.keys(v.griefs).length).length;

  // Répartition des torts : chaque votant est ramené à 100 %
  const sums = Object.fromEntries(PERSONNES.map(p => [p.id, 0]));
  let tv = 0;
  votes.forEach(v => {
    if (!v.torts) return;
    const tot = PERSONNES.reduce((s, p) => s + (+v.torts[p.id] || 0), 0);
    if (!tot) return;
    tv++;
    PERSONNES.forEach(p => sums[p.id] += (+v.torts[p.id] || 0) / tot);
  });
  r.tortsVotants = tv;
  r.torts = PERSONNES.map(p => ({ ...p, p: tv ? sums[p.id] / tv : 0 })).sort((a, b) => b.p - a.p);

  r.comments = votes.filter(v => v.comment && v.comment.trim()).map(v => ({ pseudo: v.pseudo, t: v.comment.trim(), ts: v.ts, uid: v.uid }));
  r.summary = summarize(r);
  return r;
}

function summarize(r) {
  if (!r.n) return ["Aucun vote pour l'instant."];
  const L = [];
  L.push(`${r.n} personne${r.n > 1 ? "s ont" : " a"} voté${r.doublons ? ` (${r.doublons} vote${r.doublons > 1 ? "s" : ""} en double ignoré${r.doublons > 1 ? "s" : ""})` : ""}.`);
  if (r.iTot) {
    const t = r.issues[0], s = r.issues[1];
    if (r.issueVerdict === "pas de consensus" && s?.c)
      L.push(`Pas de consensus sur la suite : « ${t.l} » (${pct(t.p)}) et « ${s.l} » (${pct(s.p)}) se partagent les votes.`);
    else L.push(`Suite souhaitée (${r.issueVerdict}) : « ${t.l} » avec ${pct(t.p)} des votes.`);
  }
  if (r.etatScore !== null) {
    const e = r.etatScore;
    L.push(e >= 0.7 ? "La majorité considère le conflit comme réglé." : e >= 0.4 ? "Le conflit est vu comme en partie réglé seulement." : "La majorité considère que le conflit n'est pas réglé.");
  }
  const cons = r.regles.filter(x => x.label === "consensus");
  const div = r.regles.filter(x => x.label === "divise");
  const rej = r.regles.filter(x => x.label === "rejet");
  if (cons.length) L.push(`Règles qui font consensus : ${cons.map(x => `« ${x.l} » (${pct(x.support)})`).join(", ")}.`);
  if (div.length) L.push(`Règles qui divisent : ${div.map(x => `« ${x.l} »`).join(", ")}.`);
  if (rej.length) L.push(`Règles rejetées : ${rej.map(x => `« ${x.l} »`).join(", ")}.`);
  if (r.griefsVotants) {
    const rec = r.griefs.filter(g => g.label === "largement reconnu");
    const rjt = r.griefs.filter(g => g.label === "largement rejeté");
    const camps = new Set(rec.map(g => g.c));
    if (rec.length) L.push(`Reproches jugés fondés par la majorité : ${rec.map(g => `« ${g.t} »`).join(", ")}.`);
    if (rjt.length) L.push(`Reproches jugés infondés : ${rjt.map(g => `« ${g.t} »`).join(", ")}.`);
    if (camps.size > 1) L.push(`Les votants reconnaissent des torts de plusieurs côtés (${[...camps].join(", ")}) : ce n'est pas vu comme un conflit à sens unique.`);
  }
  if (r.tortsVotants) {
    const [a, b] = r.torts;
    const spread = r.torts[0].p - r.torts[r.torts.length - 1].p;
    if (spread < 0.15) L.push("Les torts sont perçus comme assez également répartis.");
    else L.push(`Répartition des torts perçue : ${r.torts.map(t => `${t.n} ${pct(t.p)}`).join(", ")}. ${a.n} porte la plus grande part${a.p - b.p < 0.1 ? `, de peu devant ${b.n}` : ""}.`);
  }
  return L;
}

export function timeAgo(ts) {
  if (!ts) return "—";
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return new Date(ts).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
