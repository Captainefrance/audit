/**
 * Scénario 1 — Session volée, virement détourné.
 * Inspiré des kits d'hameçonnage « adversary-in-the-middle » (Tycoon 2FA, EvilProxy) : la fausse
 * page relaie la vraie connexion Microsoft 365, MFA compris, et vole le cookie de session.
 * L'attaquant rejoue la session, cache les réponses par une règle de boîte, puis tente une
 * fraude au virement depuis le compte compromis (BEC).
 * Leçon centrale : réinitialiser le mot de passe ne suffit pas, il faut révoquer les sessions.
 *
 * Fictif : société Nordis, domaines en .example, IP des plages de documentation (RFC 5737).
 */
import { at, type Game, type Mail, type ScenarioDef, type SimEvent } from "../../lib/labo/types";

const pick = <T,>(rng: () => number, list: readonly T[]): T => list[Math.floor(rng() * list.length)];
const jitter = (rng: () => number, base: number, spread = 60) => base + Math.round((rng() * 2 - 1) * spread);

const def: ScenarioDef = {
  id: "aitm-bec",
  title: { fr: "Session volée, virement détourné", en: "Stolen session, diverted payment" },
  summary: {
    fr: "Une fausse page Microsoft 365 contourne le MFA et vole une session. L'attaquant s'installe dans une boîte mail et prépare une fraude au virement.",
    en: "A fake Microsoft 365 page bypasses MFA and steals a session. The attacker settles into a mailbox and prepares a payment fraud.",
  },
  basedOn: {
    fr: "Kits d'hameçonnage AiTM (Tycoon 2FA, EvilProxy) et fraude au virement (BEC).",
    en: "AiTM phishing kits (Tycoon 2FA, EvilProxy) and business email compromise (BEC).",
  },
  skills: [
    { fr: "Analyse d'e-mail", en: "Email analysis" },
    { fr: "Corrélation des connexions", en: "Sign-in correlation" },
    { fr: "Révocation de session", en: "Session revocation" },
  ],

  create({ lang, level, rng }) {
    const T = (fr: string, en: string) => (lang === "fr" ? fr : en);

    /* ------------------------------------------------------------------ variante */
    type Person = { user: string; name: string; service: string; host: string };
    const VICTIMS: Person[] = [
      { user: "j.martin", name: "Julien Martin", service: T("Comptabilité", "Accounting"), host: "PC-COMPTA-02" },
      { user: "c.renaud", name: "Claire Renaud", service: T("Achats", "Purchasing"), host: "PC-ACH-05" },
      { user: "l.besson", name: "Louis Besson", service: T("Direction financière", "Finance department"), host: "PC-DAF-01" },
    ];
    const victim = pick(rng, VICTIMS);
    const victim2 = pick(rng, VICTIMS.filter((v) => v !== victim));
    const lure = pick(rng, ["share", "qr", "voicemail"] as const);
    const herring = pick(rng, ["travel", "upload"] as const);
    const ipPool = ["203.0.113.47", "203.0.113.88", "198.51.100.140", "198.51.100.201"];
    const phishIp = pick(rng, ipPool);
    const replayIp = pick(rng, ipPool.filter((i) => i !== phishIp));
    const RELAY = "198.51.100.77";
    const CORP_IP = "192.0.2.10";

    const LURES = {
      share: {
        domain: "arvel-partage.example",
        from: "Julie Perrin via Arvel Partage",
        addr: "no-reply@arvel-partage.example",
        subject: T("Julie Perrin vous a partagé « Avenant_contrat_2026.pdf »", "Julie Perrin shared “Contract_amendment_2026.pdf” with you"),
        body: [
          T("Julie Perrin (Cabinet Arvel) a partagé un fichier avec vous.", "Julie Perrin (Arvel Law Firm) shared a file with you."),
          T("« Avenant_contrat_2026.pdf » — merci de le consulter avant notre réunion de jeudi.", "“Contract_amendment_2026.pdf” — please review it before our Thursday meeting."),
          { link: T("Ouvrir le document", "Open the document"), url: "https://arvel-partage.example/s/8f2KQ", cta: true, phish: true },
          T("Ce lien expire dans 24 heures.", "This link expires in 24 hours."),
        ],
        lookalike: T("service de partage de fichiers", "file-sharing service"),
      },
      qr: {
        domain: "m365-conformite.example",
        from: "Microsoft 365 Sécurité",
        addr: "securite@m365-conformite.example",
        subject: T("Action requise : réenregistrez votre authentification multifacteur", "Action required: re-register your multi-factor authentication"),
        body: [
          T("Dans le cadre de la mise en conformité de votre organisation, votre méthode d'authentification doit être réenregistrée avant ce soir.", "As part of your organisation's compliance update, your authentication method must be re-registered by tonight."),
          T("Scannez le QR code ci-dessous avec votre téléphone pour lancer la procédure.", "Scan the QR code below with your phone to start the procedure."),
          { qr: "https://m365-conformite.example/mfa?tid=nordis" },
          T("Sans action de votre part, l'accès à votre messagerie sera suspendu.", "Without action on your part, access to your mailbox will be suspended."),
        ],
        lookalike: "Microsoft 365",
      },
      voicemail: {
        domain: "teams-messagerie.example",
        from: "Messagerie vocale Teams",
        addr: "voicemail@teams-messagerie.example",
        subject: T("Message vocal manqué (0:42) de +33 4 •• •• 12 87", "Missed voicemail (0:42) from +33 4 •• •• 12 87"),
        body: [
          T("Vous avez reçu un nouveau message vocal.", "You have a new voicemail."),
          T("Durée : 0:42 · Reçu : aujourd'hui 07:58", "Length: 0:42 · Received: today 07:58"),
          { link: T("Écouter le message", "Play the message"), url: "https://teams-messagerie.example/vm/play?id=58113", cta: true, phish: true },
        ],
        lookalike: "Microsoft Teams",
      },
    } as const;
    const L = LURES[lure];
    const DOMAIN = L.domain;
    const WAVE2_DOMAIN = "docs-arvel-partage.example";

    const variantLabel = T(
      `leurre : ${{ share: "document partagé", qr: "QR code", voicemail: "message vocal" }[lure]} · cible : ${victim.service} · fausse piste : ${herring === "travel" ? "voyage impossible" : "transfert massif"}`,
      `lure: ${{ share: "shared document", qr: "QR code", voicemail: "voicemail" }[lure]} · target: ${victim.service} · decoy: ${herring === "travel" ? "impossible travel" : "mass upload"}`,
    );

    /* ------------------------------------------------------------------ entités */
    const entities = {
      user: {
        [victim.user]: { [T("Nom", "Name")]: victim.name, [T("Service", "Department")]: victim.service, [T("Poste", "Device")]: victim.host, MFA: T("SMS", "SMS") },
        [victim2.user]: { [T("Nom", "Name")]: victim2.name, [T("Service", "Department")]: victim2.service, [T("Poste", "Device")]: victim2.host, MFA: T("application", "app") },
        "m.lefevre": { [T("Nom", "Name")]: "Marie Lefèvre", [T("Service", "Department")]: T("Comptabilité", "Accounting"), [T("Poste", "Device")]: "PC-COMPTA-07", MFA: T("application", "app") },
        "s.gauthier": { [T("Nom", "Name")]: "Sophie Gauthier", [T("Service", "Department")]: T("Commercial", "Sales"), [T("Poste", "Device")]: "PC-COM-04", [T("Note", "Note")]: T("en déplacement au Canada cette semaine", "travelling in Canada this week") },
        "a.morel": { [T("Nom", "Name")]: "Antoine Morel", [T("Service", "Department")]: T("Comptabilité fournisseurs", "Accounts payable"), [T("Rôle", "Role")]: T("valide les virements", "approves payments") },
        "svc-backup": { [T("Type", "Type")]: T("compte de service", "service account"), [T("Rôle", "Role")]: T("sauvegarde nocturne vers le cloud", "nightly cloud backup") },
        vous: { [T("Service", "Department")]: "SOC", [T("Poste", "Device")]: "PC-SOC-01", MFA: T("application", "app") },
      },
      host: {
        [victim.host]: { [T("Utilisateur", "User")]: victim.user, [T("Système", "OS")]: "Windows 11" },
        [victim2.host]: { [T("Utilisateur", "User")]: victim2.user, [T("Système", "OS")]: "Windows 11" },
        "PC-COMPTA-07": { [T("Utilisateur", "User")]: "m.lefevre", [T("Système", "OS")]: "Windows 11" },
        "PC-COM-04": { [T("Utilisateur", "User")]: "s.gauthier", [T("Système", "OS")]: "Windows 11" },
        "SRV-BACKUP-02": { [T("Rôle", "Role")]: T("serveur de sauvegarde", "backup server"), [T("Criticité", "Criticality")]: T("haute", "high") },
        "SRV-MAIL-GW": { [T("Rôle", "Role")]: T("passerelle de messagerie", "mail gateway") },
        "PC-SOC-01": { [T("Utilisateur", "User")]: "vous", [T("Système", "OS")]: "Windows 11" },
      },
      ip: {
        [phishIp]: { [T("Pays", "Country")]: T("Pays-Bas", "Netherlands"), ASN: T("AS64511 hébergeur VPS", "AS64511 VPS hosting"), [T("Réputation", "Reputation")]: T("inconnue, IP récente", "unknown, recent IP") },
        [replayIp]: { [T("Pays", "Country")]: T("Lituanie", "Lithuania"), ASN: T("AS64513 hébergeur VPS", "AS64513 VPS hosting"), [T("Réputation", "Reputation")]: T("signalée (accès frauduleux)", "reported (fraudulent access)") },
        [RELAY]: { [T("Pays", "Country")]: T("Pays-Bas", "Netherlands"), ASN: "AS64511", [T("Réputation", "Reputation")]: T("envoi de masse", "bulk mailer") },
        [CORP_IP]: { [T("Pays", "Country")]: "France", ASN: "AS64500 Nordis", [T("Réputation", "Reputation")]: T("interne (sortie VPN)", "internal (VPN egress)") },
        "198.51.100.80": { [T("Pays", "Country")]: "Canada", ASN: T("AS64500 Nordis", "AS64500 Nordis"), [T("Réputation", "Reputation")]: T("interne (VPN entreprise, sortie Montréal)", "internal (company VPN, Montreal egress)") },
      },
      domain: {
        [DOMAIN]: { [T("Créé", "Created")]: T("il y a 4 jours", "4 days ago"), [T("Hébergement", "Hosting")]: phishIp, [T("Imite", "Imitates")]: L.lookalike },
        [WAVE2_DOMAIN]: { [T("Créé", "Created")]: T("il y a 2 heures", "2 hours ago"), [T("Hébergement", "Hosting")]: phishIp, [T("Imite", "Imitates")]: T("service de partage de fichiers", "file-sharing service") },
        "intranet.nordis.example": { [T("Réputation", "Reputation")]: T("interne", "internal") },
        "client-boreal.example": { [T("Créé", "Created")]: T("il y a 12 ans", "12 years ago"), [T("Réputation", "Reputation")]: T("client connu", "known customer") },
        "contoso.sharepoint.com": { [T("Réputation", "Reputation")]: T("espace SharePoint de Nordis", "Nordis SharePoint tenant") },
      },
    };
    const MALICIOUS = new Set([DOMAIN, WAVE2_DOMAIN, phishIp, replayIp, RELAY]);

    /* ------------------------------------------------------------------ messages */
    const lureMail: Mail = {
      id: "lure", at: at("08:04"), from: L.from, addr: L.addr, subject: L.subject, color: "#0F6CBD", internal: false, phish: "lure",
      headers: { spf: "pass", dkim: "pass", dmarc: "none", relay: RELAY, returnPath: "bounce@" + DOMAIN, note: T(`Domaine ${DOMAIN} enregistré il y a 4 jours. SPF et DKIM valides : ils prouvent seulement que l'expéditeur contrôle ce domaine.`, `Domain ${DOMAIN} registered 4 days ago. Valid SPF and DKIM only prove the sender controls that domain.`) },
      body: [...L.body],
      ioc: [{ type: "domain", value: DOMAIN }, { type: "ip", value: RELAY }],
    };
    const mails: Mail[] = [
      {
        id: "rh", at: at("08:02"), from: T("RH Nordis", "Nordis HR"), addr: "rh@nordis.example", subject: T("Entretiens annuels : ouverture de la campagne", "Annual reviews: campaign now open"), color: "#2F6FB2", internal: true, phish: false,
        headers: { spf: "pass", dkim: "pass", dmarc: "pass", relay: "SRV-MAIL-GW" },
        body: [T("Bonjour à tous,", "Hello everyone,"), T("La campagne d'entretiens annuels est ouverte. Les formulaires sont disponibles sur l'intranet.", "The annual review campaign is open. Forms are available on the intranet."), { link: T("Accéder aux formulaires", "Open the forms"), url: "https://intranet.nordis.example/rh/entretiens" }, T("L'équipe RH", "The HR team")],
      },
      lureMail,
      {
        id: "it", at: at("08:06"), from: T("Service informatique", "IT department"), addr: "it@nordis.example", subject: T("Rappel : jamais de code MFA par téléphone", "Reminder: never share an MFA code by phone"), color: "#0E7490", internal: true, phish: false,
        headers: { spf: "pass", dkim: "pass", dmarc: "pass", relay: "SRV-MAIL-GW" },
        body: [T("Bonjour,", "Hello,"), T("Le service informatique ne vous demandera jamais un code de validation par téléphone ou par e-mail.", "IT will never ask you for a verification code by phone or email."), { link: T("Bonnes pratiques sur l'intranet", "Best practices on the intranet"), url: "https://intranet.nordis.example/it/securite" }],
      },
      {
        id: "client", at: at("08:12"), from: "Lucie Caron", addr: "l.caron@client-boreal.example", subject: T("Re: devis maintenance T3", "Re: Q3 maintenance quote"), color: "#15803D", internal: false, phish: false,
        headers: { spf: "pass", dkim: "pass", dmarc: "pass", relay: "mx.client-boreal.example" },
        body: [T("Bonjour,", "Hello,"), T("Voici le devis signé pour la maintenance du troisième trimestre.", "Please find the signed quote for the third-quarter maintenance."), T("Bonne journée,\nLucie Caron — Boréal", "Best regards,\nLucie Caron — Boréal")],
        attachment: { name: T("Devis_T3_signe.pdf", "Q3_quote_signed.pdf"), type: "pdf", size: "212 Ko", preview: T("Devis signé : 3 lignes de maintenance, rien d'anormal.", "Signed quote: 3 maintenance lines, nothing unusual.") },
      },
      {
        id: "colleague", at: at("08:19"), from: "Marie Lefèvre", addr: "m.lefevre@nordis.example", subject: T("C'est normal ce message ?", "Is this message legit?"), color: "#9A3412", internal: true, phish: false,
        headers: { spf: "pass", dkim: "pass", dmarc: "pass", relay: "SRV-MAIL-GW" },
        body: [T("Bonjour,", "Hi,"), T(`J'ai reçu « ${L.subject} ». J'ai ouvert la page, elle m'a demandé mon mot de passe Microsoft. J'ai trouvé ça bizarre et j'ai fermé sans rien taper. Plusieurs collègues l'ont reçu aussi.`, `I received “${L.subject}”. I opened the page and it asked for my Microsoft password. It looked odd so I closed it without typing anything. Several colleagues got it too.`), "Marie"],
      },
    ];
    const becMail = (sender: Person): Omit<Mail, "at"> => ({
      id: "bec", from: sender.name, addr: `${sender.user}@nordis.example`, to: "compta-fournisseurs@nordis.example", subject: T("Urgent : nouveau RIB fournisseur Atelis", "Urgent: new bank details for supplier Atelis"), color: "#B42318", internal: true, phish: "bec",
      headers: { spf: "pass", dkim: "pass", dmarc: "pass", relay: "SRV-MAIL-GW", note: T(`Envoyé depuis une session ouverte par ${replayIp} (Lituanie), pas depuis le poste de ${sender.user}.`, `Sent from a session opened by ${replayIp} (Lithuania), not from ${sender.user}'s device.`) },
      body: [T("Bonjour,", "Hello,"), T("Atelis vient de changer de banque. Merci de mettre à jour leur RIB et de régler la facture F-2309 (48 600 €) aujourd'hui, ils menacent de suspendre les livraisons.", "Atelis has just changed banks. Please update their bank details and pay invoice F-2309 (€48,600) today; they are threatening to suspend deliveries."), "IBAN : LT00 0000 0000 0000 0000", T(`Je suis en réunion toute la matinée, réponds-moi uniquement par mail.\n${sender.name}`, `I'm in meetings all morning, reply by email only.\n${sender.name}`)],
      ioc: [{ type: "ip", value: replayIp }, { type: "user", value: sender.user }],
    });

    /* ------------------------------------------------------------------ état */
    type Acc = { phishedAt?: number; compromisedAt?: number; ruleAt?: number; mfaAt?: number; nudgeAt?: number };
    const acc: Record<string, Acc> = {};
    const A = (u: string) => (acc[u] ??= {});
    const F = (g: Game) => g.flags as {
      bec?: boolean; fraud?: boolean; wave2?: number; colleagueClick?: boolean; youCompromisedAt?: number;
    };
    const after = (g: Game, action: "reset" | "revoke" | "mfa" | "rule" | "disable", user: string, since: number | undefined) => {
      const tAct = g.appliedAt(action, user);
      return tAct !== undefined && since !== undefined && tAct >= since;
    };
    const campaignStopped = (g: Game, domain: string = DOMAIN) =>
      g.applied("purge", domain) || (lure !== "qr" && g.applied("block", domain));
    const accountContained = (g: Game, user: string) => {
      const a = A(user);
      if (a.compromisedAt === undefined) return true;
      if (after(g, "disable", user, a.compromisedAt)) return true;
      return after(g, "revoke", user, a.compromisedAt) && after(g, "reset", user, a.compromisedAt) &&
        (a.mfaAt === undefined || after(g, "mfa", user, a.mfaAt)) && (a.ruleAt === undefined || after(g, "rule", user, a.ruleAt));
    };
    const sessionLive = (g: Game, user: string) => {
      const a = A(user);
      return a.compromisedAt !== undefined && !after(g, "revoke", user, a.compromisedAt) && !after(g, "disable", user, a.compromisedAt);
    };

    /* ------------------------------------------------------------------ attaque */
    const tracked: Person[] = [victim, victim2];
    const signInViaProxy = (g: Game, v: Person) => {
      if (lure !== "qr") g.event({ src: "proxy", host: v.host, user: v.user, ev: T("Navigation HTTPS", "HTTPS request"), detail: `${DOMAIN}${lure === "share" ? "/s/8f2KQ" : "/vm/play"}`, domain: DOMAIN, stage: "click" });
      g.event({
        src: "identity", user: v.user, ev: T("Connexion réussie", "Successful sign-in"),
        detail: T(`Office 365 · depuis ${phishIp} (Pays-Bas, hébergeur) · MFA satisfait par SMS${lure === "qr" ? " · navigateur mobile" : ""}`, `Office 365 · from ${phishIp} (Netherlands, hosting) · MFA satisfied by SMS${lure === "qr" ? " · mobile browser" : ""}`),
        ip: phishIp, stage: "click",
        ...(level === "discovery" ? { sev: "moyenne" as const, alert: T(`Connexion depuis un hébergeur : ${v.user}`, `Sign-in from a hosting provider: ${v.user}`), alertEntity: { type: "user" as const, value: v.user } } : {}),
      });
      A(v.user).phishedAt = g.t;
      g.attack(T(`${v.name} saisit son mot de passe et son code SMS sur la fausse page : le proxy de l'attaquant récupère le cookie de session`, `${v.name} enters password and SMS code on the fake page: the attacker's proxy captures the session cookie`));
    };
    const replay = (g: Game, v: Person) => {
      g.event({
        src: "identity", user: v.user, ev: T("Connexion réussie", "Successful sign-in"),
        detail: T(`depuis ${replayIp} (Lituanie) · jeton de session réutilisé · aucun défi MFA · nouvel appareil Linux / Firefox`, `from ${replayIp} (Lithuania) · session token replayed · no MFA challenge · new Linux / Firefox device`),
        ip: replayIp, sev: "haute", stage: "compromise",
        alert: T(`Connexion à risque : session réutilisée pour ${v.user}`, `Risky sign-in: session replayed for ${v.user}`), alertEntity: { type: "user", value: v.user },
      });
      A(v.user).compromisedAt = g.t;
      g.attack(T(`Rejeu du cookie volé depuis la Lituanie : accès à la boîte de ${v.user} sans MFA`, `Stolen cookie replayed from Lithuania: access to ${v.user}'s mailbox without MFA`));
    };

    const steps = [
      { at: at("08:04"), run: (g: Game) => {
        g.event({ src: "mail", host: "SRV-MAIL-GW", ev: T("18 messages remis", "18 messages delivered"), detail: `${L.addr} · « ${L.subject} »`, domain: DOMAIN, ip: RELAY, stage: "delivery" });
        g.attack(T(`Envoi de la campagne « ${L.subject} » à 18 salariés`, `Campaign “${L.subject}” sent to 18 employees`));
      } },
      { at: jitter(rng, at("08:05"), 25), when: (g: Game) => !campaignStopped(g), run: (g: Game) => signInViaProxy(g, victim) },
      { at: at("08:13"), run: (g: Game) => {
        if (herring === "travel") g.event({ src: "identity", user: "s.gauthier", ev: T("Voyage impossible", "Impossible travel"), detail: T("Paris 07:52 puis Montréal 08:13 · 198.51.100.80 (VPN entreprise, sortie Montréal)", "Paris 07:52 then Montreal 08:13 · 198.51.100.80 (company VPN, Montreal egress)"), ip: "198.51.100.80", sev: "moyenne", alert: T("Voyage impossible : s.gauthier", "Impossible travel: s.gauthier"), alertEntity: { type: "user", value: "s.gauthier" } });
        else g.event({ src: "proxy", host: "SRV-BACKUP-02", user: "svc-backup", ev: T("Transfert volumineux", "Large upload"), detail: T("2,3 Go vers contoso.sharepoint.com · tâche planifiée NightlyOffsite", "2.3 GB to contoso.sharepoint.com · scheduled task NightlyOffsite"), domain: "contoso.sharepoint.com", sev: "moyenne", alert: T("Exfiltration possible : 2,3 Go depuis SRV-BACKUP-02", "Possible exfiltration: 2.3 GB from SRV-BACKUP-02"), alertEntity: { type: "host", value: "SRV-BACKUP-02" } });
      } },
      { at: at("08:17"), when: (g: Game) => !campaignStopped(g) && lure !== "qr", run: (g: Game) => {
        g.event({ src: "proxy", host: "PC-COMPTA-07", user: "m.lefevre", ev: T("Navigation HTTPS", "HTTPS request"), detail: `${DOMAIN}${lure === "share" ? "/s/8f2KQ" : "/vm/play"}`, domain: DOMAIN, stage: "click" });
        F(g).colleagueClick = true;
      } },
      { at: jitter(rng, at("08:16"), 40), when: (g: Game) => !campaignStopped(g), run: (g: Game) => signInViaProxy(g, victim2) },
      { at: at("08:21"), when: (g: Game) => sessionLive(g, victim.user), run: (g: Game) => {
        g.event({ src: "cloud", user: victim.user, ev: T("Lecture massive de messages", "Bulk mailbox access"), detail: T(`MailItemsAccessed · 214 éléments · recherches « virement », « RIB », « facture » · session ${replayIp}`, `MailItemsAccessed · 214 items · searches “wire”, “bank details”, “invoice” · session ${replayIp}`), ip: replayIp, stage: "collection" });
        g.attack(T(`Lecture des échanges de ${victim.user} pour repérer les paiements en cours`, `Reading ${victim.user}'s emails to find pending payments`));
      } },
      { at: at("08:24"), when: (g: Game) => sessionLive(g, victim.user), run: (g: Game) => {
        g.event({ src: "mail", user: victim.user, ev: T("Message envoyé", "Message sent"), detail: T(`« Urgent : nouveau RIB fournisseur Atelis » → compta-fournisseurs@nordis.example · session ${replayIp}`, `“Urgent: new bank details for supplier Atelis” → compta-fournisseurs@nordis.example · session ${replayIp}`), ip: replayIp, sev: "haute", stage: "impact", alert: T(`Fraude au virement envoyée depuis ${victim.user}`, `Payment fraud sent from ${victim.user}`), alertEntity: { type: "user", value: victim.user } });
        g.mail(becMail(victim));
        F(g).bec = true;
        g.attack(T(`Demande de changement de RIB envoyée à la comptabilité depuis le compte de ${victim.user}`, `Bank-detail change request sent to accounts payable from ${victim.user}'s account`));
      } },
      { at: at("08:30"), when: (g: Game) => sessionLive(g, victim.user), run: (g: Game) => {
        g.event({ src: "identity", user: victim.user, ev: T("Méthode MFA ajoutée", "MFA method added"), detail: T(`application d'authentification sur un appareil inconnu · session ${replayIp}`, `authenticator app on an unknown device · session ${replayIp}`), ip: replayIp, sev: "haute", stage: "persistence", alert: T(`Nouvelle méthode MFA pour ${victim.user}`, `New MFA method for ${victim.user}`), alertEntity: { type: "user", value: victim.user } });
        A(victim.user).mfaAt = g.t;
        g.attack(T(`Ajout d'une méthode MFA contrôlée par l'attaquant sur ${victim.user}`, `Attacker-controlled MFA method added to ${victim.user}`));
      } },
      { at: at("08:36"), when: (g: Game) => Boolean(F(g).bec) && !g.reported("bec"), run: (g: Game) => {
        g.event({ src: "mail", user: "a.morel", ev: T("Réponse envoyée", "Reply sent"), detail: T("« Virement effectué : 48 600 € vers le nouveau RIB » → réponse masquée par la règle de boîte", "“Payment done: €48,600 to the new account” → reply hidden by the mailbox rule"), sev: "haute", stage: "impact", alert: T("Virement frauduleux exécuté", "Fraudulent payment executed"), alertEntity: { type: "user", value: "a.morel" } });
        F(g).fraud = true;
        g.attack(T("La comptabilité exécute le virement de 48 600 € vers le compte de l'attaquant", "Accounts payable sends €48,600 to the attacker's account"));
      } },
    ];
    // Rejeux, règles et reprises : déclenchés selon l'état (dépendent de l'heure de compromission).
    const repeat = (g: Game) => {
      for (const v of tracked) {
        const a = A(v.user);
        if (a.phishedAt !== undefined && a.compromisedAt === undefined && g.t >= a.phishedAt + 120) replay(g, v);
        if (a.compromisedAt !== undefined && a.ruleAt === undefined && g.t >= a.compromisedAt + 300 && sessionLive(g, v.user)) {
          g.event({ src: "cloud", user: v.user, ev: T("Règle de boîte créée", "Inbox rule created"), detail: T(`New-InboxRule « . » : contient « facture », « virement », « RIB » → dossier RSS, marqué comme lu · session ${replayIp}`, `New-InboxRule “.”: contains “invoice”, “payment”, “bank” → RSS folder, mark as read · session ${replayIp}`), ip: replayIp, sev: "haute", stage: "persistence", alert: T(`Règle de boîte suspecte sur ${v.user}`, `Suspicious inbox rule on ${v.user}`), alertEntity: { type: "user", value: v.user } });
          a.ruleAt = g.t;
          g.attack(T(`Règle cachée sur la boîte de ${v.user} : les réponses sur les paiements disparaissent`, `Hidden rule on ${v.user}'s mailbox: replies about payments disappear`));
        }
        // Mesures partielles : la leçon arrive par les journaux.
        if (a.compromisedAt !== undefined && !accountContained(g, v.user) && (a.nudgeAt === undefined || g.t - a.nudgeAt >= 240)) {
          const resetOnly = after(g, "reset", v.user, a.compromisedAt) && sessionLive(g, v.user);
          const revokedOnly = !sessionLive(g, v.user) && !after(g, "reset", v.user, a.compromisedAt);
          if (resetOnly && g.t - (g.appliedAt("reset", v.user) ?? 0) >= 90) {
            g.event({ src: "cloud", user: v.user, ev: T("Activité de session", "Session activity"), detail: T(`la session volée reste active après le changement de mot de passe · ${replayIp}`, `the stolen session is still active after the password change · ${replayIp}`), ip: replayIp, sev: "moyenne", stage: "compromise" });
            a.nudgeAt = g.t;
          } else if (revokedOnly && g.t - (g.appliedAt("revoke", v.user) ?? 0) >= 90) {
            const mfaOwned = a.mfaAt !== undefined && !after(g, "mfa", v.user, a.mfaAt);
            g.event({ src: "identity", user: v.user, ev: mfaOwned ? T("Connexion réussie", "Successful sign-in") : T("Connexion refusée", "Sign-in denied"), detail: mfaOwned ? T(`depuis ${replayIp} · mot de passe volé + méthode MFA de l'attaquant`, `from ${replayIp} · stolen password + attacker's MFA method`) : T(`depuis ${replayIp} · mot de passe correct · MFA refusé`, `from ${replayIp} · correct password · MFA denied`), ip: replayIp, sev: "haute", stage: "compromise", alert: mfaOwned ? T(`L'attaquant est revenu dans le compte de ${v.user}`, `The attacker is back in ${v.user}'s account`) : T(`Mot de passe de ${v.user} toujours connu de l'attaquant`, `${v.user}'s password still known to the attacker`), alertEntity: { type: "user", value: v.user } });
            if (mfaOwned) a.compromisedAt = g.t;
            a.nudgeAt = g.t;
          }
        }
      }
      // Expert : l'attaquant relance une vague avec un nouveau domaine si la première est stoppée tôt.
      if (level === "expert" && F(g).wave2 === undefined && campaignStopped(g) && g.t >= at("08:14") && g.t < at("08:30")) {
        F(g).wave2 = g.t;
        g.event({ src: "mail", host: "SRV-MAIL-GW", ev: T("11 messages remis", "11 messages delivered"), detail: T(`no-reply@${WAVE2_DOMAIN} · « Document partagé : Relevé_fournisseurs.xlsx »`, `no-reply@${WAVE2_DOMAIN} · “Shared document: Supplier_statement.xlsx”`), domain: WAVE2_DOMAIN, ip: RELAY, stage: "delivery" });
        g.mail({
          id: "lure2", from: "Arvel Partage", addr: "no-reply@" + WAVE2_DOMAIN, subject: T("Document partagé : Relevé_fournisseurs.xlsx", "Shared document: Supplier_statement.xlsx"), color: "#0F6CBD", internal: false, phish: "lure",
          headers: { spf: "pass", dkim: "pass", dmarc: "none", relay: RELAY, note: T(`Domaine créé il y a 2 heures, même hébergeur (${phishIp}) que la première vague.`, `Domain created 2 hours ago, same host (${phishIp}) as the first wave.`) },
          body: [T("Un document a été partagé avec vous.", "A document was shared with you."), { link: T("Ouvrir", "Open"), url: `https://${WAVE2_DOMAIN}/s/x91`, cta: true, phish: true }],
          ioc: [{ type: "domain", value: WAVE2_DOMAIN }],
        });
        g.attack(T("Première vague bloquée : l'attaquant relance avec un nouveau domaine", "First wave blocked: the attacker relaunches with a new domain"));
      }
      if (level === "expert" && F(g).wave2 !== undefined && !acc["wave2click"] && g.t >= (F(g).wave2 as number) + 420 && !campaignStopped(g, WAVE2_DOMAIN) && A(victim2.user).phishedAt === undefined) {
        acc["wave2click"] = {};
        signInViaProxy(g, victim2);
      }
    };

    /* ------------------------------------------------------------------ bruit */
    const noise = (g: Game): SimEvent => {
      const r = g.rng();
      const user = pick(g.rng, ["a.morel", "m.lefevre", "s.gauthier", victim2.user, "vous"]);
      if (r < 0.3) return { src: "identity", user, ev: T("Connexion réussie", "Successful sign-in"), detail: T(`depuis ${CORP_IP} · France · appareil connu · MFA`, `from ${CORP_IP} · France · known device · MFA`), ip: CORP_IP };
      if (r < 0.55) { const d = pick(g.rng, ["intranet.nordis.example", "client-boreal.example", "contoso.sharepoint.com"]); return { src: "proxy", host: pick(g.rng, ["PC-COMPTA-07", "PC-COM-04", "PC-SOC-01", victim2.host]), ev: T("Navigation HTTPS", "HTTPS request"), detail: d + "/", domain: d }; }
      if (r < 0.7) return { src: "edr", host: pick(g.rng, ["PC-COMPTA-07", "PC-COM-04", "SRV-BACKUP-02"]), ev: T("Analyse planifiée", "Scheduled scan"), detail: T("aucune menace détectée", "no threat detected") };
      if (r < 0.85) return { src: "mail", host: "SRV-MAIL-GW", ev: T("Message remis", "Message delivered"), detail: pick(g.rng, ["rh@nordis.example", "it@nordis.example", "l.caron@client-boreal.example", "newsletter@fournisseurs.example"]) };
      return { src: "cloud", user, ev: T("Fichier consulté", "File accessed"), detail: T("SharePoint · Procédures/Qualité.docx", "SharePoint · Procedures/Quality.docx"), domain: "contoso.sharepoint.com" };
    };

    /* ------------------------------------------------------------------ menaces */
    const threats = [
      { id: "campaign", name: T(`Campagne d'hameçonnage (${DOMAIN})`, `Phishing campaign (${DOMAIN})`), active: (g: Game) => g.t >= at("08:04"), contained: (g: Game) => campaignStopped(g), deadline: at("08:15") },
      { id: "acc1", name: T(`Compte de ${victim.user} compromis`, `${victim.user}'s account compromised`), active: () => A(victim.user).compromisedAt !== undefined, contained: (g: Game) => accountContained(g, victim.user), deadline: at("08:24") },
      { id: "acc2", name: T(`Compte de ${victim2.user} compromis`, `${victim2.user}'s account compromised`), active: () => A(victim2.user).compromisedAt !== undefined, contained: (g: Game) => accountContained(g, victim2.user), deadline: at("08:34") },
      { id: "fraud", name: T("Fraude au virement en circulation", "Payment fraud in circulation"), active: (g: Game) => Boolean(F(g).bec), contained: (g: Game) => g.reported("bec"), deadline: at("08:36") },
      { id: "wave2", name: T(`Deuxième vague (${WAVE2_DOMAIN})`, `Second wave (${WAVE2_DOMAIN})`), active: (g: Game) => F(g).wave2 !== undefined, contained: (g: Game) => campaignStopped(g, WAVE2_DOMAIN), deadline: at("08:32") },
      { id: "you", name: T("Votre propre compte", "Your own account"), active: () => A("vous").compromisedAt !== undefined, contained: (g: Game) => accountContained(g, "vous"), deadline: Infinity },
    ];

    /* ------------------------------------------------------------------ jugement */
    const actionsFor = (type: string, value: string) => {
      if (type === "user") return value === "svc-backup" ? ["reset", "disable"] as const : ["revoke", "reset", "mfa", "rule", "disable"] as const;
      if (type === "host") return ["isolate"] as const;
      if (type === "ip") return ["block"] as const;
      if (type === "domain") return ["block", "purge"] as const;
      return [] as const;
    };
    const judge = (g: Game, type: string, action: string, value: string): ["utile" | "inutile" | "impact", string] => {
      if (type === "domain") {
        if (!MALICIOUS.has(value)) return ["impact", T("Service légitime bloqué pour toute l'entreprise.", "Legitimate service blocked for the whole company.")];
        if (action === "purge") return ["utile", T("Les messages encore non lus disparaissent des boîtes.", "Unread messages are removed from mailboxes.")];
        return lure === "qr" && value === DOMAIN
          ? ["utile", T("Utile pour les postes de l'entreprise, mais un QR code s'ouvre sur un téléphone hors du réseau : seul le retrait des e-mails protège vraiment.", "Useful for company devices, but a QR code opens on a phone outside the network: only removing the emails really protects users.")]
          : ["utile", T("Plus aucun poste ne peut joindre ce domaine.", "No device can reach this domain any more.")];
      }
      if (type === "ip") {
        if (value === CORP_IP || value === "198.51.100.80") return ["impact", T("Sortie VPN de l'entreprise bloquée : les salariés en télétravail sont coupés.", "Company VPN egress blocked: remote employees are cut off.")];
        return ["inutile", T("Le pare-feu de l'entreprise ne voit pas ce trafic : l'attaquant se connecte à Microsoft 365 directement depuis Internet. Il faut couper la session.", "The company firewall does not see this traffic: the attacker connects to Microsoft 365 directly from the Internet. The session must be cut.")];
      }
      if (type === "host") return ["impact", T("Aucun malware ici : l'attaque se joue dans le cloud. Isoler le poste coupe l'utilisateur sans arrêter l'attaquant.", "No malware here: the attack happens in the cloud. Isolating the device cuts off the user without stopping the attacker.")];
      // Utilisateurs
      const a = A(value);
      const compromised = a.compromisedAt !== undefined;
      if (compromised) {
        if (action === "revoke") return ["utile", T("Le cookie volé ne fonctionne plus : l'attaquant est déconnecté.", "The stolen cookie no longer works: the attacker is signed out.")];
        if (action === "reset") return ["utile", T("Le mot de passe capturé par la fausse page ne sert plus.", "The password captured by the fake page is now useless.")];
        if (action === "mfa") return a.mfaAt !== undefined ? ["utile", T("La méthode MFA de l'attaquant est supprimée.", "The attacker's MFA method is removed.")] : ["inutile", T("Aucune méthode MFA ajoutée pour l'instant.", "No MFA method added so far.")];
        if (action === "rule") return a.ruleAt !== undefined ? ["utile", T("La règle qui cachait les réponses sur les paiements est supprimée.", "The rule hiding payment replies is removed.")] : ["inutile", T("Aucune règle suspecte sur cette boîte pour l'instant.", "No suspicious rule on this mailbox yet.")];
        if (action === "disable") return ["utile", T("Accès coupé, au prix d'un salarié bloqué : à réserver si révoquer et réinitialiser ne suffisent pas.", "Access cut, at the cost of a blocked employee: keep it for when revoke and reset are not enough.")];
      }
      if (a.phishedAt !== undefined && (action === "reset" || action === "revoke")) return ["utile", T("Précaution justifiée : identifiants saisis sur la fausse page.", "Justified precaution: credentials entered on the fake page.")];
      if (value === "m.lefevre" && F(g).colleagueClick && action === "reset") return ["inutile", T("Elle a ouvert la page sans rien saisir : aucune connexion suspecte à son nom.", "She opened the page without typing anything: no suspicious sign-in in her name.")];
      if (action === "disable") return ["impact", T("Un salarié non compromis ne peut plus travailler.", "An uncompromised employee can no longer work.")];
      return ["inutile", T("Aucun indice de compromission pour ce compte.", "No sign of compromise for this account.")];
    };

    /* ------------------------------------------------------------------ conseils (niveau Découverte) */
    const hint = (g: Game) => {
      const reportedLure = g.reported("lure");
      if (!reportedLure && g.t >= at("08:04")) return T("Un message externe vient d'arriver. Affichez l'adresse réelle et les en-têtes, survolez le lien sans cliquer, puis signalez-le s'il est piégé.", "An external message has just arrived. Show the real address and headers, hover the link without clicking, then report it if it is malicious.");
      if (!campaignStopped(g)) return T("Dans le SIEM, cliquez le domaine du message piégé (Indicateurs) : retirez les e-mails des boîtes et bloquez le domaine.", "In the SIEM, click the malicious message's domain (Indicators): remove the emails from mailboxes and block the domain.");
      for (const v of tracked) {
        const a = A(v.user);
        if (a.phishedAt !== undefined && a.compromisedAt === undefined) return T(`${v.user} s'est connecté depuis l'hébergeur de la fausse page : sa session va être volée. Révoquez ses sessions et réinitialisez son mot de passe.`, `${v.user} signed in from the fake page's hosting provider: the session is about to be stolen. Revoke their sessions and reset their password.`);
        if (a.compromisedAt === undefined || accountContained(g, v.user)) continue;
        if (sessionLive(g, v.user) && after(g, "reset", v.user, a.compromisedAt)) return T("Le mot de passe a changé, mais la session volée reste valide : révoquez les sessions.", "The password changed, but the stolen session is still valid: revoke the sessions.");
        if (sessionLive(g, v.user)) return T(`Alerte « session réutilisée » sur ${v.user} : ouvrez l'utilisateur, révoquez ses sessions puis réinitialisez son mot de passe.`, `“Session replayed” alert on ${v.user}: open the user, revoke the sessions, then reset the password.`);
        if (!after(g, "reset", v.user, a.compromisedAt)) return T("L'attaquant connaît encore le mot de passe : réinitialisez-le.", "The attacker still knows the password: reset it.");
        if (a.mfaAt !== undefined && !after(g, "mfa", v.user, a.mfaAt)) return T("L'attaquant a ajouté sa propre méthode MFA : réinitialisez les méthodes MFA.", "The attacker added their own MFA method: reset the MFA methods.");
        if (a.ruleAt !== undefined && !after(g, "rule", v.user, a.ruleAt)) return T("Une règle de boîte cache les réponses sur les paiements : supprimez-la.", "An inbox rule hides payment replies: delete it.");
      }
      if (F(g).bec && !g.reported("bec")) return T("Une fraude au virement circule depuis le compte compromis : signalez le message pour prévenir la comptabilité.", "A payment fraud is circulating from the compromised account: report the message to warn accounts payable.");
      return T("Épinglez les événements clés ◆ pour reconstituer la chaîne d'attaque, puis closez l'incident.", "Pin the key events ◆ to rebuild the attack chain, then close the incident.");
    };

    const outcome = (g: Game) => {
      if (F(g).fraud) return { title: T("Fraude réussie : 48 600 € virés à l'attaquant", "Fraud succeeded: €48,600 paid to the attacker"), tone: "ko" as const, cap: 35 };
      const open = tracked.filter((v) => A(v.user).compromisedAt !== undefined && !accountContained(g, v.user));
      if (open.length) return { title: T("Un compte reste aux mains de l'attaquant", "An account is still in the attacker's hands"), tone: "ko" as const, cap: 50 };
      if (!campaignStopped(g)) return { title: T("Comptes repris, mais la campagne continue", "Accounts recovered, but the campaign goes on"), tone: "warn" as const, cap: 75 };
      return { title: T("Incident maîtrisé", "Incident under control"), tone: "ok" as const, cap: 100 };
    };

    return {
      briefing: {
        context: T(
          "Lundi, 08:00. Vous êtes analyste de niveau 1 au SOC de Nordis (450 salariés, Lyon). Une campagne d'hameçonnage cible ce matin les services financiers. Votre messagerie reçoit ce que reçoivent les salariés ; le SIEM rassemble messagerie, proxy, identité, EDR et Microsoft 365.",
          "Monday, 08:00. You are a tier-1 analyst at the Nordis SOC (450 employees, Lyon). A phishing campaign is targeting the finance teams this morning. Your mailbox gets what employees get; the SIEM gathers mail, proxy, identity, EDR and Microsoft 365 logs.",
        ),
        objectives: [
          T("Repérer et signaler le message piégé.", "Spot and report the malicious message."),
          T("Stopper la campagne avant d'autres victimes.", "Stop the campaign before more victims fall."),
          T("Reprendre chaque compte compromis entièrement.", "Fully recover every compromised account."),
          T("Empêcher la fraude au virement.", "Prevent the payment fraud."),
          T("Ne pas couper ce qui est sain.", "Don't cut off what is healthy."),
        ],
      },
      endAt: at("08:45"),
      entities,
      mails,
      steps,
      repeat,
      noise,
      // Le joueur se fait piéger : son compte suit le même mécanisme (rejeu, règle, reprise).
      onPlayerCreds: (g: Game) => {
        if (A("vous").phishedAt !== undefined) return;
        g.event({ src: "identity", user: "vous", ev: T("Connexion réussie", "Successful sign-in"), detail: T(`depuis ${phishIp} (Pays-Bas, hébergeur) · MFA satisfait`, `from ${phishIp} (Netherlands, hosting) · MFA satisfied`), ip: phishIp, stage: "click" });
        A("vous").phishedAt = g.t;
        tracked.push({ user: "vous", name: T("Vous", "You"), service: "SOC", host: "PC-SOC-01" });
        g.attack(T("Vous saisissez vos identifiants sur la fausse page : votre session est capturée", "You enter your credentials on the fake page: your session is captured"));
      },
      threats,
      actionsFor: (type, value) => [...actionsFor(type, value)],
      judge: (g, type, action, value) => judge(g, type, action, value),
      hint,
      outcome,
      phishTotal: (g: Game) => 1 + (F(g).wave2 !== undefined ? 1 : 0) + (F(g).bec ? 1 : 0),
      variantLabel,
    };
  },
};

export default def;
