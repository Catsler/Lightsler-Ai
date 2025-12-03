const upperFirst = (str = "") => str.charAt(0).toUpperCase() + str.slice(1);

/**
 * Compute display title with language fallback and theme-specific parsing.
 */
export function getResourceDisplayTitle(resource = {}, locale = "en", t) {
  if (resource.titleTranslations?.[locale]) {
    return resource.titleTranslations[locale];
  }

  const type = resource.resourceType || "";
  const typeName = t ? t(`resourceTypes.${type}`, { defaultValue: upperFirst(type || "resource") }) : (type || "resource");

  if (type.startsWith("ONLINE_STORE_THEME")) {
    const parts = (resource.title || "").split(" - ");
    if (parts.length > 1) {
      const identifier = parts.slice(1).join(" - ");
      return identifier ? `${typeName} - ${identifier}` : typeName;
    }
    return typeName;
  }

  return resource.title || typeName;
}

/**
 * Compute display description with language fallback and basic pattern handling.
 */
export function getResourceDisplayDescription(resource = {}, locale = "en") {
  if (resource.descriptionTranslations?.[locale]) {
    return resource.descriptionTranslations[locale];
  }

  const desc = resource.description || "";
  const match = desc.match(/^(\d+)\s*个可翻译字段$/);
  if (match) {
    const count = match[1];
    return locale === "en" ? `${count} translatable fields` : `${count} 个可翻译字段`;
  }

  return desc;
}
