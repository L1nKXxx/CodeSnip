import type { CollectionEntry } from "astro:content";

export type SidebarGroup = {
  title: string;
  items: { title: string; href: string }[];
};

export function buildSidebar(entries: CollectionEntry<"docs">[]): SidebarGroup[] {
  const groups = new Map<string, { order: number; items: { order: number; title: string; href: string }[] }>();

  for (const e of entries) {
    const groupTitle = e.data.sidebar.group;
    const order = e.data.sidebar.order;
    const href = `/docs/${e.slug}`;

    const g = groups.get(groupTitle) ?? { order: 999, items: [] };
    g.items.push({ order, title: e.data.title, href });
    groups.set(groupTitle, g);
  }

  return [...groups.entries()]
    .map(([title, g]) => ({
      title,
      items: g.items.sort((a, b) => a.order - b.order).map(({ title, href }) => ({ title, href })),
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
}

