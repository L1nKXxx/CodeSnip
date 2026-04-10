import type { Lang } from "./strings";

/** Logical path without locale prefix, e.g. `/`, `/features`, `/docs/quick-start` */
export function getLogicalPath(pathname: string): string {
  if (pathname === "/en" || pathname.startsWith("/en/")) {
    const rest = pathname.slice(3) || "/";
    return rest.startsWith("/") ? rest : `/${rest}`;
  }
  return pathname || "/";
}

export function pathForLang(logical: string, lang: Lang): string {
  if (lang === "zh") {
    return logical === "/" ? "/" : logical;
  }
  if (logical === "/") return "/en/";
  return `/en${logical.startsWith("/") ? logical : `/${logical}`}`;
}
