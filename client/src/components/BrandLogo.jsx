/**
 * BrandLogo — affiche le logo d'un bookmaker ou d'un opérateur Mobile Money.
 *
 * Les noms viennent de la base (`bookmakers.name`, `providers.name`) : la
 * correspondance se fait sur le texte, insensible à la casse et aux accents,
 * pour ne pas dépendre d'un identifiant technique précis.
 *
 * Les images sont chargées via `import.meta.glob` et non par des `import`
 * nominatifs : un logo absent du dossier n'empêche donc pas le build. C'est le
 * cas de Flooz : aucune image officielle fournie, et la règle du plan
 * ressources interdit d'approximer une marque. Pour ces marques le composant
 * renvoie `null` et l'interface garde son affichage texte.
 */
const LOGOS = import.meta.glob('../assets/images/logos/**/*.png', {
  eager: true,
  import: 'default',
});

const find = (path) => LOGOS[`../assets/images/logos/${path}`] || null;

const BRANDS = [
  // `plate` : couleur de la pastille de fond. Elle dépend de la couleur du
  // logo officiel — un logo bleu marine disparaît sur le fond noir, un logo
  // blanc disparaît sur une pastille blanche. Les logos ne sont pas retouchés.
  { match: ['1xbet', '1x bet'], path: 'bookmakers/1xbet/1xbet.png', alt: '1xBet', plate: 'light' },
  { match: ['melbet', 'mel bet'], path: 'bookmakers/melbet/melbet.png', alt: 'Melbet', plate: 'dark' },
  { match: ['1win', '1 win'], path: 'bookmakers/1win/1win.png', alt: '1win', plate: 'dark' },
  { match: ['mixx', 'yas'], path: 'providers/mixx-by-yas/mixx-by-yas.png', alt: 'Mixx by Yas', plate: 'dark' },
  { match: ['moov'], path: 'providers/moov-money/moov-money.png', alt: 'Moov Money', plate: 'light' },
  // Flooz reste sans logo : aucune image officielle n'a été fournie.
  { match: ['flooz'], path: 'providers/flooz/flooz.png', alt: 'Flooz', plate: 'light' },
];

const normalize = (s) =>
  (s || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

export function findBrand(name) {
  const n = normalize(name);
  if (!n) return null;
  const brand = BRANDS.find((b) => b.match.some((m) => n.includes(m)));
  if (!brand) return null;
  return { ...brand, src: find(brand.path) };
}

export default function BrandLogo({
  name,
  className = 'h-6 w-auto',
  fallback = null,
  plate = true,
}) {
  const brand = findBrand(name);
  if (!brand || !brand.src) return fallback;

  const img = (
    <img
      src={brand.src}
      alt={brand.alt}
      className={`object-contain ${className}`}
      loading="lazy"
      decoding="async"
    />
  );

  if (!plate) return <span className="shrink-0">{img}</span>;

  // Les logos officiels ont des couleurs très variables : le 1xBet est bleu
  // marine (invisible sur le fond spatial noir), le 1win est blanc, le Mixx est
  // jaune. Une plaque claire commune garantit que chaque marque reste lisible,
  // sans retoucher les logos eux-mêmes.
  const plateClass =
    brand.plate === 'dark'
      ? 'bg-space-900/90 border border-white/15'
      : 'bg-white/95';

  return (
    <span
      className={`shrink-0 inline-flex items-center justify-center rounded-lg px-2 py-1.5 ${plateClass}`}
    >
      {img}
    </span>
  );
}
