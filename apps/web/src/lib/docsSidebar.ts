import type { CollectionEntry } from "astro:content";
import type { Lang } from "../i18n/strings";

export type SidebarGroup = {
  title: string;
  items: { title: string; href: string }[];
};

const sortLocale: Record<Lang, string> = {
  zh: "zh-CN",
  en: "en",
};

export function buildSidebar(
  entries: CollectionEntry<"docs">[],
  options: { lang: Lang; localePrefix: string; basePath: string },
): SidebarGroup[] {
  const { lang, localePrefix, basePath } = options;
  const prefix = localePrefix.endsWith("/") ? localePrefix : `${localePrefix}/`;

  const filtered = entries.filter((e) => e.slug.startsWith(prefix));
  const groups = new Map<string, { order: number; items: { order: number; title: string; href: string }[] }>();

  for (const e of filtered) {
    const slugRest = e.slug.slice(prefix.length);
    const groupTitle = e.data.sidebar.group;
    const order = e.data.sidebar.order;
    const href = `${basePath.replace(/\/$/, "")}/${slugRest}`;

    const g = groups.get(groupTitle) ?? { order: 999, items: [] };
    g.items.push({ order, title: e.data.title, href });
    groups.set(groupTitle, g);
  }

  const loc = sortLocale[lang];

  return [...groups.entries()]
    .map(([title, g]) => ({
      title,
      items: g.items.sort((a, b) => a.order - b.order).map(({ title: t, href }) => ({ title: t, href })),
    }))
    .sort((a, b) => a.title.localeCompare(b.title, loc));
}
