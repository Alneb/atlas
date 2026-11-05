// The LaTeX set, Snippets' own: the plugin keeps .atlas/snippets/latex.js equal to this file, and a new version of
// the plugin replaces it (the copy it replaces goes to .atlas/trash). Switch any snippet or option on or off in
// Settings → Snippets; snippets of your own go in another .js file in that folder. `{ on: false }` starts an option
// off. README.md (Snippets) has the format.
export default ({ math, text, visual, commands, vars, options }) => [
  vars({"${GREEK}":"alpha|beta|gamma|Gamma|delta|Delta|epsilon|varepsilon|zeta|eta|theta|vartheta|Theta|iota|kappa|lambda|Lambda|mu|nu|xi|omicron|pi|Pi|rho|varrho|sigma|varsigma|Sigma|tau|upsilon|Upsilon|phi|varphi|Phi|chi|psi|Psi|omega|Omega","${SYMBOL}":"parallel|perp|partial|nabla|hbar|ell|infty|oplus|ominus|otimes|oslash|square|star|dagger|vee|wedge|subseteq|subset|supseteq|supset|emptyset|exists|nexists|forall|implies|impliedby|iff|setminus|neg|lor|land|bigcup|bigcap|cdot|times|simeq|approx","${MORE_SYMBOLS}":"qquad|quad|leq|geq|neq|gg|ll|equiv|neq|sim|propto|rightarrow|leftarrow|Rightarrow|Leftarrow|leftrightarrow|to|mapsto|cap|cup|sum|prod|exp|ln|log|det|dots|vdots|ddots|int|iint|iiint|oint|tiny|langle|rangle"}),
  // Text shortcuts
  text(" bc ", " because ", { auto: true }),
  text(" dont ", " don't ", { auto: true }),
  text(" doesnt ", " doesn't ", { auto: true }),
  text(" Im ", " I'm ", { auto: true }),
  text(" im ", " I'm ", { auto: true }),
  text(" i ", " I ", { auto: true }),
  text(" pq ", " porque ", { auto: true }),
  // Math mode
  text("minl", "$$1$", { auto: true }),
  text("menv", "$$\n$1\n$$", { word: true, auto: true }),
  text("mmln", "$$\\begin{gather}\n$1\n\\end{gather}$$", { word: true, auto: true }),
  math("begin", "\\begin{$1}\n$2\n\\end{$1}"),
  math("mbb", "\\mathbb{$1}$0"),
  math("mcal", "\\mathcal{$1}$0"),
  math("mbf", "\\mathbf{$1}$0"),
  math("mrm", "\\mathrm{$1}$0"),
  math(["mfr", "mfrk", "mfrak"], "\\mathfrak{$1}$0"),
  // Units
  // Voltage
  // Watts
  // Current
  // Resistance
  // Misc
  math("Hz", "\\space\\text{Hz}"),
  math("ang", "Å"),
  math("deg", "º"),
  math("ST", "\\space\\text{$1} $0"),
  // Greek letters
  math("@a", "\\alpha"),
  math("@b", "\\beta"),
  math("@g", "\\gamma"),
  math("@G", "\\Gamma"),
  math("@d", "\\delta"),
  math("@D", "\\Delta"),
  math("@e", "\\epsilon"),
  math(":e", "\\varepsilon"),
  math("@z", "\\zeta"),
  math("@t", "\\theta"),
  math("@T", "\\Theta"),
  math(":t", "\\vartheta"),
  math("@i", "\\iota"),
  math("@k", "\\kappa"),
  math("@l", "\\lambda"),
  math("@L", "\\Lambda"),
  math("@s", "\\sigma"),
  math("@S", "\\Sigma"),
  math("@u", "\\upsilon"),
  math("@U", "\\Upsilon"),
  math("@o", "\\omega"),
  math("@O", "\\Omega"),
  math("ome", "\\omega"),
  math("Ome", "\\Omega"),
  // Text environment
  math("text", "\\text{$1}$0"),
  math("\"", "\\text{$1}$0"),
  math("mbox", "\\mbox{$1}$0"),
  math("tmbox", "\\mbox{\\tiny $1}$0"),
  // Basic operations
  math("e2", "^{2}$0"),
  math("e3", "^{3}$0"),
  math("e4", "^{4}$0"),
  math("e5", "^{5}$0"),
  math("e6", "^{6}$0"),
  math("e7", "^{7}$0"),
  math("e8", "^{8}$0"),
  math("eplus", "^{\\text{\\small (+)}}$0"),
  math("eminus", "^{\\text{\\small (-)}}$0"),
  math("ee", "e^{$1}$0"),
  math("inv", "^{-1}"),
  math("e-1", "^{-1}"),
  math("pow", "^{$1}$0"),
  math("pp", "^{$1}$0"),
  math("tpow", "^{\\text{\\small $1}}$0"),
  math("tpp", "^{\\text{\\small $1}}$0"),
  math("tsub", "_\\text{\\small $1}$0"),
  math("sub", "_{$1}$0"),
  math("--", "_{$1}$0", { priority: -1 }),
  math("_", "_{$1}$0"),
  math(/\^([a-zA-Z0-9]{2,})/, (match) => {
      return `\^{${match[1]}\$0}$1`;
    }, { legacyStops: true }),
  math("sqr", "\\sqrt{$1}$0"),
  math("([0-9|n|m|k]{1,})rt", (match) => {
      return `\\sqrt[${match[1]}]{$0} $1`;
    }, { regex: true, legacyStops: true, priority: -1 }),
  math("nrt", (match) => {
      return `\\sqrt[\${0:n}]{$1} $2`;
    }, { regex: true, legacyStops: true }),
  math("//", "\\frac{$1}{$2}$0"),
  math("frac", "\\frac{$1}{$2}$0"),
  math("onehalf", "\\frac{1}{2}"),
  math(/(?<![\\A-Za-z])([A-Za-z])(\d)/, "[[0]]_{[[1]]}", { priority: -1, name: "Auto letter subscript" }),
  options.spacing(),
  math(/\\exp ([a-zA-Z0-9]{1,})/, (match) => {
      return `\\exp\\left(${match[1]}$0\\right)$1`;
    }, { legacyStops: true }),
  math("conj", "^{*}"),
  math("Re", "\\mathfrak{Re}"),
  math("Im", "\\mathfrak{Im}"),
  math(/\\mathfrak{Re}([a-zA-Z0-9]{2,})/, (match) => {
      return `\\mathfrak{Re}\\left\\{${match[1]}$0\\right\\}$1`;
    }, { legacyStops: true }),
  math(/\\mathfrak{Im}([a-zA-Z0-9]{2,})/, (match) => {
      return `\\mathfrak{Im}\\left\\{${match[1]}$0\\right\\}$1`;
    }, { legacyStops: true }),
  // Linear algebra
  math("Tr", "\\mathrm{Tr}"),
  math(/\\det ([a-zA-Z0-9]{2,})/, (match) => {
      return `\\det\\left(${match[1]}$0\\right)$1`;
    }, { legacyStops: true }),
  math(/\\mathrm{Tr}([a-zA-Z0-9]{2,})/, (match) => {
      return `\\mathrm{Tr}\\left(${match[1]}$0\\right)$1`;
    }, { legacyStops: true }),
  math("\\\\(${GREEK}),\\.", "\\boldsymbol{\\[[0]]}", { regex: true }),
  math("\\\\(${GREEK})\\.,", "\\boldsymbol{\\[[0]]}", { regex: true }),
  math("hat", "\\hat{$1}$0"),
  math("bar", "\\bar{$1}$0"),
  math("dot", "\\dot{$1}$0", { priority: -1 }),
  math("ddot", "\\ddot{$1}$0"),
  math("cdot", "\\cdot"),
  math("tilde", "\\tilde{$1}$0"),
  math("und", "\\underline{$1}$0"),
  math("vec", "\\vec{$1}$0"),
  // More auto letter subscript
  math(/\\hat{([A-Za-z])}(\d)/, "\\hat{[[0]]}_{[[1]]}"),
  math(/\\vec{([A-Za-z])}(\d)/, "\\vec{[[0]]}_{[[1]]}"),
  math(/\\mathbf{([A-Za-z])}(\d)/, "\\mathbf{[[0]]}_{[[1]]}"),
  math("xnn", "x_{n}"),
  math("xii", "x_{i}", { priority: 1 }),
  math("xjj", "x_{j}"),
  math("xp1", "x_{n+1}"),
  math("ynn", "y_{n}"),
  math("yii", "y_{i}"),
  math("yjj", "y_{j}"),
  // Symbols
  math("inf", "\\infty"),
  math("sum", "\\sum"),
  math("prod", "\\prod"),
  math("\\sum", "\\sum_{${1:i}=${2:1}}^{${3:N}} $0", { auto: false }),
  math("\\prod", "\\prod_{${1:i}=${2:1}}^{${3:N}} $0", { auto: false }),
  math("lim", "\\lim_{${1:n} \\to ${2:\\infty}} $0"),
  math("+-", "\\pm"),
  math("-+", "\\mp"),
  math("...", "\\dots"),
  math("nab", "\\nabla"),
  math("part", "\\partial"),
  math("xx", "\\times"),
  math("**", "\\cdot"),
  math("para", "\\parallel"),
  math("===", "\\equiv"),
  math("!=", "\\neq"),
  math("=!", "\\neq"),
  math(">=", "\\geq"),
  // { trigger: "=>", replacement: "\\geq", options: "mA" }, // off: it hid the arrow below (=> is \Rightarrow; >= is \geq)
  math("<=", "\\leq"),
  // { trigger: "=<", replacement: "\\leq", options: "mA" }, // off: it hid the arrow below (=< is \Leftarrow; <= is \leq)
  math(">>", "\\gg"),
  math("<<", "\\ll"),
  //{ trigger: "sim", replacement: "\\sim", options: "mA" },
  math("sim=", "\\simeq"),
  math("prop", "\\propto"),
  math("->", "\\rightarrow"),
  math("<-", "\\leftarrow"),
  math("<->", "\\leftrightarrow "),
  math("-u", "\\uparrow", { when: (at) => !/[A-Za-z0-9})]$/.test(at.before) }),
  math("-d", "\\downarrow", { when: (at) => !/[A-Za-z0-9})]$/.test(at.before) }),
  math("u-d", "\\updownarrow"),
  math("d-u", "\\updownarrow"),
  math("=>", "\\Rightarrow"),
  math("=<", "\\Leftarrow"),
  math("<=>", "\\Leftrightarrow"),
  math("|->", "\\mapsto"),
  math("|-->", "\\longmapsto"),
  // { trigger: "<->", replacement: "\\leftrightarrow ", options: "mA" }, // off: defined above already
  //{trigger: "->", replacement: "\\to", options: "mA"},
  //{trigger: "!>", replacement: "\\mapsto", options: "mA"},
  //{trigger: "=>", replacement: "\\implies", options: "mA"},
  //{trigger: "=<", replacement: "\\impliedby", options: "mA"},
  math("orr", "\\cup"),
  math("inc", "\\in"),
  math("notin", "\\not\\in"),
  math("\\\\\\", "\\setminus"),
  math("sub=", "\\subseteq"),
  math("sup=", "\\supseteq"),
  math("0set", "\\emptyset"),
  math("set", "\\{$1\\}$0"),
  math("exists", "\\exists", { priority: 1 }),
  math("LL", "\\mathcal{L}"),
  math("HH", "\\mathcal{H}"),
  math("CC", "\\mathbb{C}"),
  math("RR", "\\mathbb{R}"),
  math("ZZ", "\\mathbb{Z}"),
  math("NN", "\\mathbb{N}"),
  // Handle spaces and backslashes
  // Snippet variables can be used as shortcuts when writing snippets.
  // For example, ${GREEK} below is shorthand for "alpha|beta|gamma|Gamma|delta|..."
  // You can edit snippet variables under the Advanced snippet settings section.
  math("eps", "\\epsilon"),
  math("veps", "\\varepsilon"),
  math("vphi", "\\varphi", { priority: 1 }),
  math("vpi", "\\varpi", { priority: 1 }),
  math("the", "\\theta"),
  math("vthe", "\\vartheta", { priority: 1 }),
  math("vrho", "\\varrho", { priority: 1 }),
  math("sig", "\\sigma"),
  math("vsig", "\\varsigma", { priority: 1 }),
  math("ww", "\\omega"),
  // Insert space after Greek letters and symbols
  math("\\\\(${GREEK}|${SYMBOL}) e2", "\\[[0]]^{2}", { regex: true }),
  math("\\\\(${GREEK}|${SYMBOL}) e4", "\\[[0]]^{4}", { regex: true }),
  math("\\\\(${GREEK}|${SYMBOL}) pow", "\\[[0]]^{$1}$0", { regex: true }),
  math("\\\\(${GREEK}|${SYMBOL}) pp", "\\[[0]]^{$1}$0", { regex: true }),
  // Derivatives and integrals
  math("par", "\\frac{\\partial $1}{\\partial $2} $0", { auto: false }),
  math(/pa([A-Za-z])([A-Za-z])/, "\\frac{ \\partial [[0]] }{ \\partial [[1]] } ", { auto: false }),
  math(/de([A-Za-z])([A-Za-z])/, "\\frac{ d [[0]] }{ d [[1]] } ", { priority: -1, auto: false }),
  math("ddt", "\\frac{d}{d${1:t}} $0"),
  math("derv", "\\frac{d${1:x}}{d${2:y}} $0", { regex: true, auto: false }),
  math(/([^\\])int/, "[[0]]\\int $0", { priority: -1 }),
  math("\\int", "\\int_{${2:a}}^{${3:b}} d${4:x} $0", { auto: false }),
  math("oint", "\\oint"),
  math("iint", "\\iint"),
  math("iiint", "\\iiint"),
  math("oinf", "_{0}^{\\infty} d${1:x} $0"),
  math("iinf", "_{-\\infty}^{\\infty} d${1:x} $0", { priority: 1 }),
  // Trigonometry
  // Visual operations
  visual("U", "\\underbrace{${VISUAL}}_{$1}"),
  visual("O", "\\overbrace{${VISUAL}}^{$1}"),
  visual("B", "\\underset{$1}{${VISUAL}}"),
  visual("C", "\\cancel{${VISUAL}}"),
  visual("K", "\\cancelto{$1}{${VISUAL}}"),
  visual("S", "\\sqrt{${VISUAL}}"),
  // Physics
  math("qham", "\\hat{H}"),
  math("cham", "\\mathcal{H}"),
  math("kb", "k_{\\mbox{\\tiny B}} "),
  math("kbt", "k_{\\mbox{\\tiny B}}T "),
  //{trigger: "msun", replacement: "M_{\\odot}", options: "mA"},
  // Quantum mechanics
  math("dag", "^{\\dagger}"),
  math("cop", "\\hat{$1}^\\dagger_{$2} $0"),
  math("aop", "\\hat{$1}_{$2} $0"),
  math("o+", "\\oplus "),
  math("ox", "\\otimes "),
  math("bra", "\\bra{$1} $0"),
  math("ket", "\\ket{$1} $0"),
  math("braket", "\\braket{${1:\\psi} | ${2:\\psi}} $0"),
  math("brk", "\\braket{${1:\\psi} | ${2:\\psi}} $0"),
  math("<|>", "\\braket{${1:\\psi} | ${2:\\psi}} $0"),
  math("><", "\\ket{${1:\\psi}} \\bra{${2:\\psi}} $0"),
  math("kbr", "\\ket{${1:\\psi}} \\bra{${2:\\psi}} $0"),
  math("<||>", "\\braket{${1:\\psi} | ${2:\\hat{O}} | ${3:\\psi}} $0"),
  math("exv", "\\braket{${1:\\psi} | ${2:\\hat{O}} | ${3:\\psi}} $0"),
  // Commutator
  math("comm", "\\left[ ${1:A} , ${2:B} \\right] $0"),
  // Anticommutator
  math("acomm", "\\left\\{ ${1:A} , ${2:B} \\right\\} $0"),
  math("fourier", "\\int_{${1:-\\infty}}^{${2:\\infty}} $3 e^{${4}i ${5:\\omega} ${6:t}} d${6:t} $0"),
  math("ewav", "e^{i\\left(${1:\\mathbf{k}}\\cdot\\mathbf{r}-${2:\\omega_\\mathbf{k}}t\\right)}"),
  // Double commutator
  math("dcomm", "\\left[ ${1:A} , \\left[ ${2:B} , ${3:C} \\right] \\right] $0"),
  // Scalar field operator (QFT mode expansion)
  math("scalar", "\\phi(${1:\\mathbf{x}},${2:t}) = \\int \\frac{d${3:\\mathbf{p}}}{(2\\pi)^3 2E_{${3:\\mathbf{p}}}} \\left( \\hat{a}_{${3:\\mathbf{p}}} e^{-i\\left(${3:\\mathbf{p}}\\cdot ${1:\\mathbf{x}}-E_{${3:\\mathbf{p}}}${2:t}\\right)} + \\hat{a}_{${3:\\mathbf{p}}}^\\dagger e^{+i\\left(${3:\\mathbf{p}}\\cdot ${1:\\mathbf{x}}-E_{${3:\\mathbf{p}}}${2:t}\\right)} \\right) $0"),
  // Heisenberg equation of motion
  math("heis", "\\frac{d}{dt} \\hat{${1:O}}_{\\mbox{\\tiny H}}(t) = \\frac{i}{\\hbar} \\left[ \\hat{${2:H}} , \\hat{${1:O}}_{\\mbox{\\tiny H}}(t) \\right] + \\left( \\frac{\\partial \\hat{${1:O}}_{\\mbox{\\tiny S}}}{\\partial t} \\right)_{\\mbox{\\tiny H}} $0"),
  // Schrödinger equation
  math("scheq", "i \\hbar \\frac{\\partial}{\\partial t} \\ket{${1:\\psi}(${2:t})} = \\hat{H} \\ket{${1:\\psi}(${2:t})} $0"),
  // Dirac equation
  math("diraceq", "\\left( i \\gamma^\\mu \\partial_\\mu - m \\right) ${1:\\psi}(${2:x}) = 0 $0"),
  // Pauli matrices (symbolic)
  math("pauli", "\\sigma_{${1:i}} $0"),
  // Pauli matrices (symbolic)
  math("vpauli", "\\boldsymbol{\\sigma} $0"),
  // Dirac matrices (symbolic)
  math("diracm", "\\gamma^{${1:\\mu}} $0"),
  // Explicit Pauli matrices
  math("pauli1", "\\begin{pmatrix} 0 & 1 \\\\ 1 & 0 \\end{pmatrix}"),
  math("pauli2", "\\begin{pmatrix} 0 & -i \\\\ i & 0 \\end{pmatrix}"),
  math("pauli3", "\\begin{pmatrix} 1 & 0 \\\\ 0 & -1 \\end{pmatrix}"),
  // Explicit Dirac gamma matrices (Dirac representation, placeholders for flexibility)
  math("dirac0", "\\begin{pmatrix} I & 0 \\\\ 0 & -I \\end{pmatrix}"),
  math("diraci", "\\begin{pmatrix} 0 & \\sigma^i \\\\ -\\sigma^i & 0 \\end{pmatrix}"),
  math("weyl0", "\\begin{pmatrix} 0 & I \\\\ I & 0 \\end{pmatrix}"),
  math("weyli", "\\begin{pmatrix} 0 & \\sigma^i \\\\ -\\sigma^i & 0 \\end{pmatrix}"),
  math("weyl5", "\\begin{pmatrix} -I & 0 \\\\ 0 & I \\end{pmatrix}"),
  math("Aquan", "\\mathbf{A}(${1:\\mathbf{r}},${2:t}) = \\sum_{\\lambda=1}^2 \\int \\frac{d\\mathbf{k}}{(2\\pi)^3 \\sqrt{2\\omega_{\\mathbf{k}}}} \\left( \\hat{a}_{\\mathbf{k},\\lambda} \\boldsymbol{\\epsilon}_{\\mathbf{k},\\lambda} e^{-i(\\omega_{\\mathbf{k}} ${2:t} - \\mathbf{k}\\cdot ${1:\\mathbf{r}})} + a_{\\mathbf{k},\\lambda}^\\dagger \\boldsymbol{\\epsilon}_{\\mathbf{k},\\lambda}^* e^{i(\\omega_{\\mathbf{k}} ${2:t} - \\mathbf{k}\\cdot ${1:\\mathbf{r}})} \\right) $0"),
  math("compauli", "\\left[ \\sigma_i , \\sigma_j \\right] = 2 i \\, \\epsilon_{ijk} \\, \\sigma_k"),
  math("comdirac", "\\left\\{ \\gamma^\\mu , \\gamma^\\nu \\right\\} = 2 g^{\\mu\\nu}"),
  // Normal ordering
  math("normord", ": ${1:\\mathcal{O}} : $0"),
  math("comcreah", "\\left[ a, a^\\dagger \\right]_{\\pm} = 1"),
  // Chemistry
  //{trigger: "pu", replacement: "\\pu{$0}", options: "mA"},
  //{trigger: "cee", replacement: "\\ce{$0}", options: "mA"},
  //{trigger: "he4", replacement: "{}^{4}_{2}He ", options: "mA"},
  //{trigger: "he3", replacement: "{}^{3}_{2}He ", options: "mA"},
  //{trigger: "iso", replacement: "{}^{${0:4}}_{${1:2}}${2:He}", options: "mA"},
  // Environments
  math("pmat", "\\begin{pmatrix}\n$1\n\\end{pmatrix}", { form: "display" }),
  math("bmat", "\\begin{bmatrix}\n$1\n\\end{bmatrix}", { form: "display" }),
  math("Bmat", "\\begin{Bmatrix}\n$1\n\\end{Bmatrix}", { form: "display" }),
  math("vmat", "\\begin{vmatrix}\n$1\n\\end{vmatrix}", { form: "display" }),
  math("Vmat", "\\begin{Vmatrix}\n$1\n\\end{Vmatrix}", { form: "display" }),
  math("matrix", "\\begin{matrix}\n$1\n\\end{matrix}", { form: "display" }),
  math("pmat", "\\begin{pmatrix}$1\\end{pmatrix}", { form: "inline" }),
  math("bmat", "\\begin{bmatrix}$1\\end{bmatrix}", { form: "inline" }),
  math("Bmat", "\\begin{Bmatrix}$1\\end{Bmatrix}", { form: "inline" }),
  math("vmat", "\\begin{vmatrix}$1\\end{vmatrix}", { form: "inline" }),
  math("Vmat", "\\begin{Vmatrix}$1\\end{Vmatrix}", { form: "inline" }),
  math("matrix", "\\begin{matrix}$1\\end{matrix}", { form: "inline" }),
  math("cases", "\\begin{cases}\n$1\n\\end{cases}"),
  math("align", "\\begin{align}\n$1\n\\end{align}"),
  math("gather", "\\begin{gather}\n$1\n\\end{gather}"),
  math("array", "\\begin{array}\n$1\n\\end{array}"),
  // Brackets
  math("avg", "\\langle $1 \\rangle $0"),
  math("<>", "\\langle $1 \\rangle $0"),
  math("norm", "\\lvert $1 \\rvert $0", { priority: 1 }),
  math("Norm", "\\lVert $1 \\rVert $0", { priority: 1 }),
  math("ceil", "\\lceil $1 \\rceil $0"),
  math("floor", "\\lfloor $1 \\rfloor $0"),
  math("mod", "|$1|$0"),
  visual("(", "\\left(${VISUAL}\\right)"),
  visual("[", "\\left[${VISUAL}\\right]"),
  visual("{", "{${VISUAL}}"),
  visual("|", "\\lvert ${VISUAL} \\rvert "),
  visual("<", "\\langle ${VISUAL} \\rangle "),
  visual("}", "\\left\\{${VISUAL}\\right\\}"),
  math("(", "($1)$0"),
  math("\\{", "\\{$1\\}$0", { priority: 1 }),
  math("{", "{$1}$0"),
  math("[", "[$1]$0"),
  math("lr(", "\\left( $1 \\right) $0"),
  math("lr{", "\\left\\{ $1 \\right\\} $0"),
  math("lr[", "\\left[ $1 \\right] $0"),
  math("lr|", "\\left| $1 \\right| $0"),
  math("r|_", "\\right|_{$1}"),
  math("lra", "\\left< $1 \\right> $0"),
  // Misc
  // Automatically convert Greek letters in text to math.
  text("(${GREEK})([\\n\\s.,?!:'])", "$\\[[0]]$[[1]]", { regex: true, word: true, auto: true }),
  // Automatically convert text of the form "x=2" and "x=n+1" to math.
  text(/([A-Za-z]=\d+)([\n\s.,?!:'])/, "$[[0]]$[[1]]", { word: true, auto: true }),
  text(/([A-Za-z]=[A-Za-z][+-]\d+)([\n\s.,?!:'])/, "$[[0]]$[[1]]", { word: true, auto: true }),
  // Snippet replacements can also be JavaScript functions.
  // See the documentation for more information.
  math(/iden(\d)/, (match) => {
      const n = Number(match[1]);

      let arr = [];
      for (let j = 0; j < n; j++) {
        arr[j] = [];
        for (let i = 0; i < n; i++) {
          arr[j][i] = i === j ? 1 : 0;
        }
      }

      let output = arr.map((el) => el.join(" & ")).join(" \\\\\n");
      output = `\\begin{pmatrix}\n${output}\n\\end{pmatrix}`;
      return output;
    }, { legacyStops: true, name: "N x N identity matrix" }),

  // Options: sets of snippets switched as one
  options.autoAlign(),
  options.matrices({ on: false }),
  options.sequences({ on: false }),
  options.minmax({ on: false }),
  options.derivatives({ on: false }),
  options.align({ on: false }),
  options.colors({ on: false }),
  options.units({ on: false }),
  options.textHelpers({ on: false }),
];
