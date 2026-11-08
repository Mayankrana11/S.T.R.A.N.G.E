import { spawn } from "node:child_process";

export const APPLICATION_REGISTRY = [
    {
        id: "vscode",
        name: "Visual Studio Code",
        executable: "code",
        aliases: [
            "vscode",
            "vs code",
            "visual studio code",
            "code",
            "vsc",
            "vs-code",
            "code editor",
            "my code editor",
            "microsoft visual studio code",
            "ms vs code",
            "ms vscode"
        ]
    },
    {
        id: "visual_studio",
        name: "Visual Studio",
        executable: "devenv",
        aliases: [
            "visual studio",
            "visual studio ide",
            "vs ide",
            "microsoft visual studio",
            "ms visual studio",
            "devenv",
            "visual studio 2022"
        ]
    },
    {
        id: "chrome",
        name: "Google Chrome",
        executable: "chrome",
        aliases: [
            "chrome",
            "google chrome",
            "chrome browser",
            "google chrome browser"
        ]
    },
    {
        id: "notepad",
        name: "Notepad",
        executable: "notepad",
        aliases: [
            "notepad",
            "note pad",
            "windows notepad",
            "text editor"
        ]
    },
    {
        id: "calculator",
        name: "Calculator",
        executable: "calc",
        aliases: [
            "calculator",
            "calc",
            "windows calculator"
        ]
    },
    {
        id: "paint",
        name: "Paint",
        executable: "mspaint",
        aliases: [
            "paint",
            "mspaint",
            "ms paint",
            "microsoft paint"
        ]
    }
];

export const HIGH_CONFIDENCE_THRESHOLD = 0.78;
export const LOW_CONFIDENCE_FLOOR = 0.5;
export const AMBIGUITY_MARGIN = 0.12;

const SPOKEN_TOKEN_MAP = {
    vee: "v",
    ess: "s",
    em: "m"
};

export function normalizeAppName(input) {
    if (typeof input !== "string") {
        return "";
    }

    const cleaned = input
        .toLowerCase()
        .trim()
        .replace(/(\.exe|\bdot\s+exe)\b/gi, "")
        .replace(/[.'’`]+/g, "")
        .replace(/[^a-z0-9\s]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (!cleaned) {
        return "";
    }

    const tokens = cleaned
        .split(" ")
        .map(token => SPOKEN_TOKEN_MAP[token] ?? token);

    return tokens.join(" ");
}

function toCompact(normalized) {
    return normalized.replace(/\s+/g, "");
}

function toPhoneticKey(normalized) {
    return normalized
        .toLowerCase()
        .replace(/ph/g, "f")
        .replace(/ck/g, "k")
        .replace(/qu/g, "kw")
        .replace(/c(?=[eiy])/g, "s")
        .replace(/c/g, "k")
        .replace(/ai|ay/g, "a")
        .replace(/ee|ea/g, "e")
        .replace(/oo|ou/g, "u")
        .replace(/([a-z])\1+/g, "$1")
        .replace(/([a-z]{2,})e\b/g, "$1");
}

export function damerauLevenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    const lenA = a.length;
    const lenB = b.length;
    const matrix = Array.from({ length: lenA + 1 }, () =>
        new Array(lenB + 1).fill(0)
    );

    for (let i = 0; i <= lenA; i++) matrix[i][0] = i;
    for (let j = 0; j <= lenB; j++) matrix[0][j] = j;

    for (let i = 1; i <= lenA; i++) {
        for (let j = 1; j <= lenB; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;

            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );

            if (
                i > 1 &&
                j > 1 &&
                a[i - 1] === b[j - 2] &&
                a[i - 2] === b[j - 1]
            ) {
                matrix[i][j] = Math.min(
                    matrix[i][j],
                    matrix[i - 2][j - 2] + 1
                );
            }
        }
    }

    return matrix[lenA][lenB];
}

export function stringSimilarity(a, b) {
    if (a === b) return 1;
    if (!a || !b) return 0;

    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;

    const distance = damerauLevenshtein(a, b);
    return Math.max(0, 1 - distance / maxLen);
}

function isStrictTokenPrefix(prefixTokens, fullTokens) {
    if (
        prefixTokens.length === 0 ||
        prefixTokens.length >= fullTokens.length
    ) {
        return false;
    }

    for (let i = 0; i < prefixTokens.length; i++) {
        if (prefixTokens[i] !== fullTokens[i]) {
            return false;
        }
    }

    return true;
}

function getAppTerms(app) {
    const rawTerms = [
        app.id,
        app.name,
        app.executable,
        ...(app.aliases ?? [])
    ].filter(Boolean);

    const seen = new Set();
    const terms = [];

    for (const raw of rawTerms) {
        const normalized = normalizeAppName(raw);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        terms.push({
            raw,
            normalized,
            compact: toCompact(normalized),
            tokens: normalized.split(" "),
            phonetic: toCompact(toPhoneticKey(normalized))
        });
    }

    return terms;
}

function findPrefixSiblingApps(matchedTermNormalized, matchedAppId, preparedRegistry) {
    const prefixTokens = matchedTermNormalized.split(" ");
    const siblings = [];

    for (const entry of preparedRegistry) {
        if (entry.app.id === matchedAppId) continue;

        const hasPrefixExtension = entry.terms.some(term =>
            isStrictTokenPrefix(prefixTokens, term.tokens)
        );

        if (hasPrefixExtension) {
            siblings.push(entry.app);
        }
    }

    return siblings;
}

function isSubsequence(sub, full) {
    if (!sub || !full || sub.length > full.length) return false;
    let i = 0;
    for (let j = 0; j < full.length && i < sub.length; j++) {
        if (sub[i] === full[j]) i++;
    }
    return i === sub.length;
}

function computeFuzzyTermScore(queryInfo, termInfo) {
    const directSim = stringSimilarity(queryInfo.normalized, termInfo.normalized);
    const compactSim = stringSimilarity(queryInfo.compact, termInfo.compact);
    const phoneticSim = stringSimilarity(queryInfo.phonetic, termInfo.phonetic);

    let score = Math.max(directSim, compactSim * 0.98);

    // Boost when phonetic representation is strongly aligned and strings are already reasonably close
    if (directSim >= 0.6 || compactSim >= 0.6) {
        const blendedPhonetic = Math.max(directSim, compactSim) * 0.4 + phoneticSim * 0.6;
        score = Math.max(score, blendedPhonetic);
    }

    // If all typed characters appear in order (omission typo like "vs cde" -> "vs code")
    if (
        queryInfo.compact.length >= 4 &&
        isSubsequence(queryInfo.compact, termInfo.compact)
    ) {
        score = Math.min(0.99, score + 0.06);
    }

    // Penalize when multi-token query has mismatched token-initial characters
    if (
        queryInfo.tokens.length > 1 &&
        queryInfo.tokens.length === termInfo.tokens.length
    ) {
        const allInitialsMatch = queryInfo.tokens.every(
            (token, idx) => token[0] === termInfo.tokens[idx][0]
        );
        if (!allInitialsMatch) {
            score = Math.max(0, score - 0.1);
        }
    }

    // Prevent very short 2-3 character fragments from getting high confidence on 4-character aliases
    if (queryInfo.compact.length <= 3 && queryInfo.compact !== termInfo.compact) {
        score = Math.min(score, 0.72);
    }

    // Check token-level containment / prefix plausibility (e.g. "vs", "studio", "microsoft")
    if (
        isStrictTokenPrefix(queryInfo.tokens, termInfo.tokens) ||
        (queryInfo.tokens.length === 1 &&
            queryInfo.tokens[0].length >= 2 &&
            termInfo.tokens.includes(queryInfo.tokens[0]))
    ) {
        score = Math.max(score, 0.7);
    }

    return Number(score.toFixed(4));
}

function buildClarificationMessage(rawInput, status, candidates, registry) {
    const cleanInput = String(rawInput ?? "").trim();

    if (status === "ambiguous" && candidates.length > 1) {
        const names = candidates.map(c => c.name);
        const formattedList =
            names.length === 2
                ? `${names[0]} or ${names[1]}`
                : `${names.slice(0, -1).join(", ")}, or ${names[names.length - 1]}`;

        return `Multiple applications match "${cleanInput}". Please clarify which application you want to open: ${formattedList}?`;
    }

    if (candidates.length === 1) {
        return `Low confidence match for "${cleanInput}". Did you mean ${candidates[0].name}? Please clarify which application you want to open.`;
    }

    if (candidates.length > 1) {
        const names = candidates.map(c => c.name).join(", ");
        return `Could not unambiguously resolve "${cleanInput}". Did you mean one of: ${names}? Please clarify.`;
    }

    const available = registry.map(app => app.name).join(", ");
    return `Could not confidently identify an application matching "${cleanInput}". Please clarify which application you want to open (available: ${available}).`;
}

export function resolveApplication(input, registry = APPLICATION_REGISTRY) {
    if (typeof input !== "string" || !input.trim()) {
        const message = buildClarificationMessage(input, "unresolved", [], registry);
        return {
            status: "unresolved",
            matched: false,
            ambiguous: false,
            requires_clarification: true,
            confidence: 0,
            match_type: "none",
            input,
            normalized_input: "",
            canonical_id: null,
            application: null,
            candidates: [],
            message
        };
    }

    const rawTrimmed = input.trim().toLowerCase();

    // Direct canonical ID check when the canonical ID uses an explicit identifier separator (e.g. "visual_studio")
    const directCanonicalApp = registry.find(
        app => app.id.toLowerCase() === rawTrimmed && rawTrimmed.includes("_")
    );
    if (directCanonicalApp) {
        return {
            status: "resolved",
            matched: true,
            ambiguous: false,
            requires_clarification: false,
            confidence: 1,
            match_type: "canonical_id",
            input,
            normalized_input: normalizeAppName(input),
            canonical_id: directCanonicalApp.id,
            application: directCanonicalApp,
            candidates: [
                {
                    id: directCanonicalApp.id,
                    name: directCanonicalApp.name,
                    confidence: 1
                }
            ],
            message: null
        };
    }

    const normalized = normalizeAppName(input);
    if (!normalized) {
        const message = buildClarificationMessage(input, "unresolved", [], registry);
        return {
            status: "unresolved",
            matched: false,
            ambiguous: false,
            requires_clarification: true,
            confidence: 0,
            match_type: "none",
            input,
            normalized_input: "",
            canonical_id: null,
            application: null,
            candidates: [],
            message
        };
    }

    const queryInfo = {
        normalized,
        compact: toCompact(normalized),
        tokens: normalized.split(" "),
        phonetic: toCompact(toPhoneticKey(normalized))
    };

    const preparedRegistry = registry.map(app => ({
        app,
        terms: getAppTerms(app)
    }));

    // Step 1: Exact normalized / compact alias resolution
    const exactMatches = [];
    for (const entry of preparedRegistry) {
        const matchedTerm = entry.terms.find(
            term =>
                term.normalized === queryInfo.normalized ||
                term.compact === queryInfo.compact
        );

        if (matchedTerm) {
            exactMatches.push({
                app: entry.app,
                matchedTerm
            });
        }
    }

    if (exactMatches.length > 0) {
        const candidateMap = new Map();

        for (const match of exactMatches) {
            candidateMap.set(match.app.id, {
                id: match.app.id,
                name: match.app.name,
                confidence: 1
            });

            // Check if the matched term is a strict token prefix of another available application
            // e.g., "visual studio" is an exact match for Visual Studio but a strict token prefix of "visual studio code"
            const prefixSiblings = findPrefixSiblingApps(
                match.matchedTerm.normalized,
                match.app.id,
                preparedRegistry
            );

            for (const sibling of prefixSiblings) {
                if (!candidateMap.has(sibling.id)) {
                    candidateMap.set(sibling.id, {
                        id: sibling.id,
                        name: sibling.name,
                        confidence: 0.9
                    });
                }
            }
        }

        const candidates = Array.from(candidateMap.values());

        if (candidates.length === 1) {
            const winningApp = exactMatches[0].app;
            return {
                status: "resolved",
                matched: true,
                ambiguous: false,
                requires_clarification: false,
                confidence: 1,
                match_type: "exact",
                input,
                normalized_input: normalized,
                canonical_id: winningApp.id,
                application: winningApp,
                candidates,
                message: null
            };
        }

        const message = buildClarificationMessage(
            input,
            "ambiguous",
            candidates,
            registry
        );
        return {
            status: "ambiguous",
            matched: false,
            ambiguous: true,
            requires_clarification: true,
            confidence: candidates[0].confidence,
            match_type: "ambiguous_prefix",
            input,
            normalized_input: normalized,
            canonical_id: null,
            application: null,
            candidates,
            message
        };
    }

    // Step 2: Fuzzy string matching across all applications and aliases
    const scoredApps = preparedRegistry.map(entry => {
        let bestScore = 0;
        let bestTerm = null;

        for (const term of entry.terms) {
            const score = computeFuzzyTermScore(queryInfo, term);
            if (score > bestScore) {
                bestScore = score;
                bestTerm = term;
            }
        }

        return {
            app: entry.app,
            score: bestScore,
            bestTerm
        };
    });

    // If an app scored high via a term that is itself a strict token prefix of another app
    // (e.g., "visul studio" matching "visual studio"), propagate plausibility to the prefix sibling.
    for (const item of scoredApps) {
        if (item.score >= LOW_CONFIDENCE_FLOOR && item.bestTerm) {
            const siblings = findPrefixSiblingApps(
                item.bestTerm.normalized,
                item.app.id,
                preparedRegistry
            );
            for (const sibling of siblings) {
                const siblingEntry = scoredApps.find(s => s.app.id === sibling.id);
                if (siblingEntry && siblingEntry.score < item.score) {
                    siblingEntry.score = Number((item.score * 0.95).toFixed(4));
                }
            }
        }
    }

    scoredApps.sort((a, b) => b.score - a.score);

    const best = scoredApps[0];
    const secondBest = scoredApps[1] ?? { score: 0 };

    if (!best || best.score < LOW_CONFIDENCE_FLOOR) {
        const message = buildClarificationMessage(input, "unresolved", [], registry);
        return {
            status: "unresolved",
            matched: false,
            ambiguous: false,
            requires_clarification: true,
            confidence: best ? best.score : 0,
            match_type: "none",
            input,
            normalized_input: normalized,
            canonical_id: null,
            application: null,
            candidates: [],
            message
        };
    }

    const plausibleCandidates = scoredApps
        .filter(
            item =>
                item.score >= LOW_CONFIDENCE_FLOOR &&
                best.score - item.score < AMBIGUITY_MARGIN
        )
        .map(item => ({
            id: item.app.id,
            name: item.app.name,
            confidence: item.score
        }));

    // Multiple plausible applications within the ambiguity margin
    if (plausibleCandidates.length > 1) {
        const message = buildClarificationMessage(
            input,
            "ambiguous",
            plausibleCandidates,
            registry
        );
        return {
            status: "ambiguous",
            matched: false,
            ambiguous: true,
            requires_clarification: true,
            confidence: best.score,
            match_type: "fuzzy_ambiguous",
            input,
            normalized_input: normalized,
            canonical_id: null,
            application: null,
            candidates: plausibleCandidates,
            message
        };
    }

    // Single best candidate, but below the high-confidence threshold
    if (best.score < HIGH_CONFIDENCE_THRESHOLD) {
        const candidates = [
            {
                id: best.app.id,
                name: best.app.name,
                confidence: best.score
            }
        ];
        const message = buildClarificationMessage(
            input,
            "low_confidence",
            candidates,
            registry
        );
        return {
            status: "low_confidence",
            matched: false,
            ambiguous: false,
            requires_clarification: true,
            confidence: best.score,
            match_type: "fuzzy_low_confidence",
            input,
            normalized_input: normalized,
            canonical_id: null,
            application: null,
            candidates,
            message
        };
    }

    // High-confidence, unambiguous fuzzy match
    const margin = Number((best.score - secondBest.score).toFixed(4));
    return {
        status: "resolved",
        matched: true,
        ambiguous: false,
        requires_clarification: false,
        confidence: best.score,
        margin,
        match_type: "fuzzy",
        input,
        normalized_input: normalized,
        canonical_id: best.app.id,
        application: best.app,
        candidates: [
            {
                id: best.app.id,
                name: best.app.name,
                confidence: best.score
            }
        ],
        message: null
    };
}

export function areEquivalentApplications(
    appNameA,
    appNameB,
    registry = APPLICATION_REGISTRY
) {
    if (typeof appNameA !== "string" || typeof appNameB !== "string") {
        return false;
    }

    const resA = resolveApplication(appNameA, registry);
    const resB = resolveApplication(appNameB, registry);

    if (resA.status === "resolved" && resB.status === "resolved") {
        return resA.canonical_id === resB.canonical_id;
    }

    return false;
}


export async function openApplication(args) {
    const resolution = resolveApplication(args?.app_name);

    if (resolution.status !== "resolved") {
        return {
            success: false,
            action: "open_application",
            status: resolution.status,
            requires_clarification: true,
            error: resolution.message,
            message: resolution.message,
            candidates: resolution.candidates,
            confidence: resolution.confidence,
            simulated: false
        };
    }

    const app = resolution.application;

    return new Promise((resolve) => {
        const child = spawn(app.executable, [], {
            detached: true,
            stdio: "ignore",
            windowsHide: false
        });

        child.once("spawn", () => {
            child.unref();

            resolve({
                success: true,
                action: "open_application",
                application: app.id,
                canonical_id: app.id,
                application_name: app.name,
                executable: app.executable,
                confidence: resolution.confidence,
                match_type: resolution.match_type,
                simulated: false
            });
        });

        child.once("error", (error) => {
            resolve({
                success: false,
                action: "open_application",
                application: app.id,
                canonical_id: app.id,
                application_name: app.name,
                executable: app.executable,
                confidence: resolution.confidence,
                match_type: resolution.match_type,
                simulated: false,
                error: error.message
            });
        });
    });
}


export async function closeApplication(args) {
    const resolution = resolveApplication(args?.app_name);
    const canonicalId =
        resolution.status === "resolved"
            ? resolution.canonical_id
            : args?.app_name;

    return {
        success: true,
        action: "close_application",
        application: canonicalId,
        simulated: true
    };
}

export async function listApplications() {
    return {
        applications: APPLICATION_REGISTRY.map(app => app.name),
        registry: APPLICATION_REGISTRY.map(({ id, name, aliases }) => ({
            id,
            name,
            aliases
        }))
    };
}
