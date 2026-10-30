// Ordinary words that hold a trigger or a command: `spin` holds `pi`, `band` holds `and`. While the letters typed still
// start one of these the trigger holds back, and a word that completes stays as typed; any other key releases it, so
// `kpi` is still k\\pi and `spi+` still s\\pi. Taken from real notes in English and Spanish, by how often each word
// appears in lower case. A vault adds its own with `words([...])`.
export const WORDS: string[] = (
  "achieve achieved actors actually agree aligned all allow allowed allsec analogous anderson angle another app " +
  "appear appears applications apply applying approach approaches appropriate approximation archive around assets " +
  "assume atom atomic atoms auto automatically axis band bands bandwidth bare basically bastante become becomes been " +
  "begins between bigger bipartite bottom bound boundary box branch branches brothers call called callout capture " +
  "captures catalog cell challenges change changes changing closing coexistence coincide color colorblind comes " +
  "command commands comment comments commit common commutation commute commutes compilation constant constants " +
  "continuation continued contributors controlled copies copy copyright correct correction correlated correlation " +
  "correlations corresponding corresponds cosas cost coveralls crossing cuando cumul cumulant cuprates custom cutoff " +
  "damping decreasing dee deep degeneracy degenerate degrees design designed details determined detuned developing " +
  "differ difference differences different difficult diffraction director directory distance eigenvectors either " +
  "eliminate ellos enable entanglement equivalent escape essentially esto estoy exchange exist existing expand " +
  "expanded expansion expect expected experimental experimentally experiments explain explicitly exponential " +
  "exponentially exponents export expressed expression expressions factor factorized fall falls fill filled filling " +
  "finally follow following follows formally formula formulas found fraction free freedom freely full fund " +
  "fundamental funds further generators geometry grand ground hamiltonian hand handle happen happens historia " +
  "history hopping hoppings important inbox include included includes including incomplete incompressible increase " +
  "increases increasing infinite infinity info information install installation installed insulator insulators " +
  "integer integral integrate integrated intensity inter interact interacting interaction interactions interesting " +
  "interface interference intermediate internship into intro introduce introduction invariant inverse inversion " +
  "irreps island jupytext karakeep keep keeps lands language languages letterboxd library limit machine macroscopic " +
  "mapped matching maximum maxiter meeting menu meta metal metallic microscopic minimum missing mixing mode model " +
  "models modern modes modificados modification modified modify modulation module moment momenta momentum mother " +
  "much muchas mucho multiple multitext mundo music must muy need needed needs negative normal normalization " +
  "normalized nublado nuestro null number numbers numerical numerically numpy occupancy occupation occupied onto " +
  "operator operators opposite other otherwise parameter parameters parte particle particles particular partie " +
  "partner partners parts phenomena photon pick pinned pip point points power preset principal principle produced " +
  "produces product products propagating propagation properties property proportional proposed quadratic " +
  "quasiparticle range rather readthedocs really repository reproduce restart retain second secret secrets section " +
  "sector sectors see seed seems sees separate separated sets settings setup sign similar simple simulation " +
  "simulations since single singlet singular small smaller smallest some something speed spin spins stand standard " +
  "stands start started starting steps still stop stopped stops strange subbath subbaths subject submit subspace " +
  "subtopic summer superconductor superconductors support suppressed sweep sweeps tanto that their them theme themes " +
  "themselves then theory there therefore thermal these thesis they three toda today todo todos together tokens tol " +
  "tolerance too tool tools top topic topics topology tot total touches toward tpi typical unchanged under " +
  "understand understanding upper using usually valley vector vectors wavevector weather week well what whether will " +
  "www "
).trim().split(" ");
