// Normalize: ignore case, accents, spaces, punctuation/symbols
const normalize = (s: string) =>
    s.toLowerCase()
      .normalize('NFD')                 // split accents
      .replace(/[\u0300-\u036f]/g, '')  // remove accents
      .replace(/[^a-z0-9]/g, '');       // remove everything except letters/digits

  // Levenshtein distance (edit distance)
  const levenshtein = (a: string, b: string) => {
    if (a === b) {return 0;}
    const al = a.length, bl = b.length;
    if (al === 0) {return bl;}
    if (bl === 0) {return al;}

    // Use two rows to save memory
    let prev = new Array(bl + 1);
    let curr = new Array(bl + 1);

    for (let j = 0; j <= bl; j++) {prev[j] = j;}

    for (let i = 1; i <= al; i++) {
      curr[0] = i;
      const ca = a.charCodeAt(i - 1);
      for (let j = 1; j <= bl; j++) {
        const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
        curr[j] = Math.min(
          prev[j] + 1,        // delete
          curr[j - 1] + 1,    // insert
          prev[j - 1] + cost  // replace
        );
      }
      [prev, curr] = [curr, prev];
    }
    return prev[bl];
  };

  // Similarity score in [0..1] (1 = perfect)
  // Also boosts good UX cases (contains/prefix)
  export const fuzzyScore = (queryRaw: string, targetRaw: string) => {
    const q = normalize(queryRaw);
    const t = normalize(targetRaw);
    if (!q) {return 1;}

    // Very strong matches first
    if (t === q) {return 1;}
    if (t.startsWith(q)) {return 0.95;}
    if (t.includes(q)) {return 0.9;}

    // Typo tolerance: compare against best substring window in target
    // so "premier" can match "englishpremierleague"
    const qLen = q.length;
    if (qLen <= 2) {return 0;} // avoid noisy fuzzy matches for tiny queries

    let best = Infinity;
    const minWindow = Math.max(3, qLen - 2);
    const maxWindow = Math.min(t.length, qLen + 2);

    for (let w = minWindow; w <= maxWindow; w++) {
      for (let i = 0; i + w <= t.length; i++) {
        const sub = t.slice(i, i + w);
        const d = levenshtein(q, sub);
        if (d < best) {best = d;}
        if (best === 0) {break;}
      }
      if (best === 0) {break;}
    }

    // Convert distance to similarity
    const denom = Math.max(qLen, 1);
    const sim = 1 - best / denom;

    return Math.max(0, Math.min(0.89, sim)); // keep below contains/prefix boosts
  };
