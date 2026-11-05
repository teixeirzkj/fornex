import {
  Baby, Car, Cpu, Dumbbell, Gem, Hammer, Home, Leaf, Package, PawPrint, PenTool, Shirt, ShoppingBag, Smartphone,
  Sofa, Sparkles, Utensils, Watch, Wrench, type LucideIcon,
} from 'lucide-react'

/** Ícones disponíveis para categorias (nome salvo em supplier_categories.icon) */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  package: Package, cpu: Cpu, sofa: Sofa, shirt: Shirt, sparkles: Sparkles, dumbbell: Dumbbell, baby: Baby,
  'paw-print': PawPrint, car: Car, wrench: Wrench, 'pen-tool': PenTool, smartphone: Smartphone, home: Home,
  gem: Gem, watch: Watch, utensils: Utensils, leaf: Leaf, hammer: Hammer, 'shopping-bag': ShoppingBag,
}

export function CategoryIcon({ name, className }: { name?: string | null; className?: string }) {
  const Icon = CATEGORY_ICONS[name ?? ''] ?? Package
  return <Icon className={className} aria-hidden />
}
