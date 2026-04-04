import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");

function patchFile(relativePath, replacements, { allowPartial = false } = {}) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    if (allowPartial) {
      return false;
    }

    throw new Error(`Missing file to patch: ${relativePath}`);
  }

  let source = readFileSync(absolutePath, "utf8");
  let matchedReplacement = false;
  let changed = false;

  for (const replacement of replacements) {
    if (source.includes(replacement.patched)) {
      matchedReplacement = true;
      continue;
    }

    if (!source.includes(replacement.original)) {
      if (allowPartial) {
        continue;
      }

      throw new Error(
        `Unable to patch ${relativePath}; expected snippet not found:\n${replacement.original}`
      );
    }

    source = source.replace(replacement.original, replacement.patched);
    matchedReplacement = true;
    changed = true;
  }

  if (changed) {
    writeFileSync(absolutePath, source, "utf8");
  }

  return matchedReplacement;
}

function patchDirectory(relativeDirectory, patcher, fileMatcher = () => true) {
  const absoluteDirectory = path.join(repoRoot, relativeDirectory);
  if (!existsSync(absoluteDirectory)) {
    return [];
  }

  const patchedPaths = [];
  for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".js") || !fileMatcher(entry.name)) {
      continue;
    }

    const relativePath = path.join(relativeDirectory, entry.name);
    if (patcher(relativePath)) {
      patchedPaths.push(relativePath);
    }
  }

  return patchedPaths;
}

function buildDiceJsHelperBlock(vectorAlias) {
  return `  static getVector3() {
    return ${vectorAlias}.vector3;
  }
  static getFaceNormal(e, t) {
    const i = e.getVerticesData("position"), s = e.getIndices();
    if (!i || !s) {
      return null;
    }
    const r = t * 3, n = s[r], a = s[r + 1], o = s[r + 2];
    if (n === void 0 || a === void 0 || o === void 0) {
      return null;
    }
    const h = new p(i[n * 3], i[n * 3 + 1], i[n * 3 + 2]), c = new p(i[a * 3], i[a * 3 + 1], i[a * 3 + 2]), u = new p(i[o * 3], i[o * 3 + 1], i[o * 3 + 2]), d = c.subtract(h), g = u.subtract(h), f = p.Cross(d, g);
    return f.lengthSquared() === 0 ? null : f.normalize();
  }
  static getPickDirection(e, t) {
    var i;
    const s = e.config.parentMesh || e.config.meshName;
    let r = ${vectorAlias}.setVector3(0, 1, 0);
    return e.dieType === "d4" && ((i = t.themeData[s]) == null ? void 0 : i.d4FaceDown) && (r = ${vectorAlias}.setVector3(0, -1, 0)), r;
  }
  static probeRollResult(e, t, i) {
    const s = e.config.parentMesh || e.config.meshName, r = t.themeData[s].colliderFaceMap;
    if (!r[e.dieType]) {
      return null;
    }
    const n = t.getMeshByName(\`\${s}_\${e.dieType}_collider\`);
    if (!n) {
      return null;
    }
    const a = n.createInstance(\`\${s}_\${e.dieType}-probe-\${e.id}\`);
    a.isPickable = !0, a.isVisible = !0, a.setEnabled(!0), a.position = e.mesh.position, a.rotationQuaternion = i.clone(), a.computeWorldMatrix(!0);
    const o = ${vectorAlias}.getPickDirection(e, t);
    ${vectorAlias}.ray.direction = o, ${vectorAlias}.ray.origin = e.mesh.position;
    const h = t.pickWithRay(${vectorAlias}.ray);
    return a.dispose(), h ? {
      faceId: h.faceId,
      value: r[e.dieType][h.faceId]
    } : null;
  }
  static forceRollResult(e, t, i) {
    var s, r;
    if (!e.mesh || !Number.isFinite(i)) {
      typeof window < "u" && window.__emerlausDicePatchLog && window.__emerlausDicePatchLog(\`[Dice.forceRollResult] skip dieId=\${e == null ? void 0 : e.id} requested=\${i} mesh=\${!!(e != null && e.mesh)}\`);
      return;
    }
    const n = e.config.parentMesh || e.config.meshName, a = (r = (s = t.themeData[n]) == null ? void 0 : s.colliderFaceMap) == null ? void 0 : r[e.dieType];
    if (!a) {
      typeof window < "u" && window.__emerlausDicePatchLog && window.__emerlausDicePatchLog(\`[Dice.forceRollResult] no colliderFaceMap dieType=\${e.dieType} mesh=\${n}\`);
      return;
    }
    const o = e.config.sides === 10 && i === 10 ? 0 : i, h = t.getMeshByName(\`\${n}_\${e.dieType}_collider\`);
    if (!h) {
      typeof window < "u" && window.__emerlausDicePatchLog && window.__emerlausDicePatchLog(\`[Dice.forceRollResult] collider mesh missing dieId=\${e.id} collider=\${n}_\${e.dieType}_collider\`);
      return;
    }
    const c = Object.keys(a).map((V) => Number(V)).filter((V) => Number.isInteger(V)), u = c.filter((V) => a[V] === o), d = u.length > 0 ? u : c, g = ${vectorAlias}.getPickDirection(e, t);
    let f = null;
    const m = (V, G) => {
      const J = ${vectorAlias}.getFaceNormal(h, V);
      if (!J) {
        return null;
      }
      const R = G === -1 ? J.scale(-1) : J, N = new X();
      X.FromUnitVectorsToRef(R, g, N);
      const L = ${vectorAlias}.probeRollResult(e, t, N);
      return L != null && L.value === o ? {
        quaternion: N,
        matchedFace: V,
        resolvedFace: L.faceId,
        normal: J,
        flip: G
      } : null;
    };
    for (const V of d) {
      f = m(V, 1) || m(V, -1);
      if (f) {
        break;
      }
    }
    if (!f && u.length > 0 && u.length !== c.length) {
      for (const V of c) {
        f = m(V, 1) || m(V, -1);
        if (f) {
          break;
        }
      }
    }
    if (!f) {
      typeof window < "u" && window.__emerlausDicePatchLog && window.__emerlausDicePatchLog(\`[Dice.forceRollResult] no probe match dieId=\${e.id} dieType=\${e.dieType} requested=\${o} candidateFaces=\${d.join(",")}\`);
      return;
    }
    e.mesh.rotationQuaternion || (e.mesh.rotationQuaternion = X.Identity()), e.mesh.rotationQuaternion.copyFrom(f.quaternion), e.mesh.computeWorldMatrix(!0), e.value = o, typeof window < "u" && window.__emerlausDicePatchLog && window.__emerlausDicePatchLog(\`[Dice.forceRollResult] dieId=\${e.id} dieType=\${e.dieType} requested=\${o} matchedFace=\${f.matchedFace} resolvedFace=\${f.resolvedFace} flip=\${f.flip} normal=(\${f.normal.x.toFixed(3)},\${f.normal.y.toFixed(3)},\${f.normal.z.toFixed(3)})\`);
  }
`;
}

function patchDiceJsHelpers(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    return false;
  }

  let source = readFileSync(absolutePath, "utf8");
  const aliasMatch = source.match(/static getVector3\(\)\s*\{\s*return (\w+)\.vector3;\s*\}/);
  if (!aliasMatch) {
    return false;
  }

  const startMarker = "  static getVector3() {";
  const endMarker = "  static async getRollResult(e, t) {";
  const startIndex = source.indexOf(startMarker);
  const endIndex = source.indexOf(endMarker, startIndex);
  if (startIndex === -1 || endIndex === -1) {
    return false;
  }

  const replacement = buildDiceJsHelperBlock(aliasMatch[1]);
  if (source.slice(startIndex, endIndex) === replacement) {
    return true;
  }

  source = `${source.slice(0, startIndex)}${replacement}${source.slice(endIndex)}`;
  writeFileSync(absolutePath, source, "utf8");
  return true;
}

const diceBoxEsReplacements = [
  {
    original: `        themeColor: V,
        meshName: L
      };`,
    patched: `        themeColor: V,
        meshName: L,
        value: Z.value
      };`
  },
  {
    original: `        a.value = Zl.range(n, z), W(this, u).addNonDie(a);`,
    patched: `        a.value = typeof Z.value == "number" ? Z.value : Zl.range(n, z), W(this, u).addNonDie(a);`
  },
  {
    original: `        a.value = Zl.range(1, z), W(this, u).addNonDie(a);`,
    patched: `        a.value = typeof Z.value == "number" ? Z.value : Zl.range(1, z), W(this, u).addNonDie(a);`
  },
  {
    original: `      } else {
        let n;
        if (t.includes(H)) {
          const z = h[H];
          n = this.themesLoadedData[z];
        }
        W(this, u).add({`,
    patched: `      } else {
        let n;
        if (t.includes(H)) {
          const z = h[H];
          n = this.themesLoadedData[z];
        }
        typeof Z.value == "number" && typeof window < "u" && window.__emerlausDicePatchLog && window.__emerlausDicePatchLog(\`[dice-box.es] forcing \${H} rollId=\${e} dieId=\${Rl} value=\${Z.value} groupId=\${R}\`);
        W(this, u).add({`
  }
];

const diceJsReplacements = [
  {
    original: `      const d = t.pickWithRay(Ze.ray);
      return c.dispose(), s.value = o[s.dieType][d.faceId], s.value === void 0 && (console.error(\`colliderFaceMap Error: No value found for \${s.dieType} mesh face \${d.faceId}\`), s.value = 0), r(s.value);`,
    patched: `      const d = t.pickWithRay(Ze.ray);
      return c.dispose(), s.value = o[s.dieType][d.faceId], typeof window < "u" && window.__emerlausDicePatchLog && window.__emerlausDicePatchLog(\`[Dice.getRollResult] dieId=\${s.id} dieType=\${s.dieType} faceId=\${d.faceId} resolved=\${s.value} forced=\${s.config.value}\`), s.value === void 0 && (console.error(\`colliderFaceMap Error: No value found for \${s.dieType} mesh face \${d.faceId}\`), s.value = 0), r(s.value);`
  }
];

const optimizedDiceJsReplacements = diceJsReplacements.map((replacement) => ({
  original: replacement.original.replaceAll("Ze", "Ze2"),
  patched: replacement.patched.replaceAll("Ze", "Ze2")
}));

const worldOnscreenReplacements = [
  {
    original: `  async handleAsleep(e) {
    var t, i;
    if (e.asleep = !0, await Oe.getRollResult(e, C(this, K)), e.d10Instance || e.dieParent) {`,
    patched: `  async handleAsleep(e) {
    var t, i;
    if (e.asleep = !0, typeof e.config.value == "number" && typeof window < "u" && window.__emerlausDicePatchLog && window.__emerlausDicePatchLog(\`[world.handleAsleep] start dieId=\${e.id} rollId=\${e.config.rollId} forced=\${e.config.value}\`), typeof e.config.value == "number" && Oe.forceRollResult(e, C(this, K), e.config.value), typeof e.config.value == "number" && C(this, K).render(), await Oe.getRollResult(e, C(this, K)), typeof e.config.value == "number" && (e.value = e.config.sides === 10 && e.config.value === 10 ? 0 : e.config.value), typeof e.config.value == "number" && C(this, K).render(), typeof window < "u" && window.__emerlausDicePatchLog && window.__emerlausDicePatchLog(\`[world.handleAsleep] postGetRollResult dieId=\${e.id} rollId=\${e.config.rollId} value=\${e.value}\`), e.d10Instance || e.dieParent) {`
  },
  {
    original: `        this.onRollResult({
          rollId: r.config.rollId,
          value: r.value
        });`,
    patched: `        r.rawValue && (r.value = r.rawValue), r.rawValue = r.value, r.value = r.value + s.value, this.onRollResult({
          rollId: r.config.rollId,
          value: r.value
        }), typeof window < "u" && window.__emerlausDicePatchLog && window.__emerlausDicePatchLog(\`[world.handleAsleep] emit composite rollId=\${r.config.rollId} value=\${r.value}\`);`
  },
  {
    original: `      e.config.sides === 10 && e.value === 0 && (e.value = 10), this.onRollResult({
        rollId: e.config.rollId,
        value: e.value
      });`,
    patched: `      e.config.sides === 10 && e.value === 0 && (e.value = 10), this.onRollResult({
        rollId: e.config.rollId,
        value: e.value
      }), typeof window < "u" && window.__emerlausDicePatchLog && window.__emerlausDicePatchLog(\`[world.handleAsleep] emit rollId=\${e.config.rollId} value=\${e.value}\`);`
  }
];

const optimizedWorldOnscreenReplacements = worldOnscreenReplacements.map((replacement) => ({
  original: replacement.original
    .replaceAll("Oe", "is")
    .replaceAll("C(this, K)", "C2(this, K2)")
    .replaceAll("!0", "true"),
  patched: replacement.patched
    .replaceAll("Oe", "is")
    .replaceAll("C(this, K)", "C2(this, K2)")
    .replaceAll("!0", "true")
}));

patchFile("node_modules/@3d-dice/dice-box/dist/dice-box.es.js", diceBoxEsReplacements);
patchDiceJsHelpers("node_modules/@3d-dice/dice-box/dist/Dice.js");
patchFile("node_modules/@3d-dice/dice-box/dist/Dice.js", diceJsReplacements);
patchFile("node_modules/@3d-dice/dice-box/dist/world.onscreen.js", worldOnscreenReplacements);

const optimizedPaths = [
  ...patchDirectory(
    "node_modules/.vite/deps",
    (relativePath) => patchFile(relativePath, diceBoxEsReplacements, { allowPartial: true }),
    (name) => name === "@3d-dice_dice-box.js" || name.startsWith("chunk-")
  ),
  ...patchDirectory(
    "node_modules/.vite/deps",
    patchDiceJsHelpers,
    (name) => name.startsWith("chunk-")
  ),
  ...patchDirectory(
    "node_modules/.vite/deps",
    (relativePath) => patchFile(relativePath, optimizedDiceJsReplacements, { allowPartial: true }),
    (name) => name.startsWith("chunk-")
  ),
  ...patchDirectory(
    "node_modules/.vite/deps",
    (relativePath) => patchFile(relativePath, optimizedWorldOnscreenReplacements, { allowPartial: true }),
    (name) => name.startsWith("world.onscreen")
  )
];

console.log(
  `[dice-box patch] Applied persistent local patch.${optimizedPaths.length > 0 ? ` Optimized chunks: ${optimizedPaths.join(", ")}` : ""}`
);
