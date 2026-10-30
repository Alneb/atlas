// highlight.js with the languages the notes use most, fetched on first use (lib/highlight.ts).
import hljs from "highlight.js/lib/common";
import latex from "highlight.js/lib/languages/latex";
import julia from "highlight.js/lib/languages/julia";
import fortran from "highlight.js/lib/languages/fortran";
import nix from "highlight.js/lib/languages/nix";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import haskell from "highlight.js/lib/languages/haskell";
import matlab from "highlight.js/lib/languages/matlab";
import cmake from "highlight.js/lib/languages/cmake";

hljs.registerLanguage("latex", latex);
hljs.registerLanguage("julia", julia);
hljs.registerLanguage("fortran", fortran);
hljs.registerLanguage("nix", nix);
hljs.registerLanguage("dockerfile", dockerfile);
hljs.registerLanguage("haskell", haskell);
hljs.registerLanguage("matlab", matlab);
hljs.registerLanguage("cmake", cmake);
hljs.registerAliases(["tex"], { languageName: "latex" });
hljs.registerAliases(["toml"], { languageName: "ini" });
hljs.registerAliases(["zsh", "sh"], { languageName: "bash" });

export { hljs };
