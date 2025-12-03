import { useState } from "react";
import { Popover, ActionList, Button } from "@shopify/polaris";
import { useFetcher } from "@remix-run/react";
import { LanguageIcon } from "@shopify/polaris-icons";
import { useTranslation } from "react-i18next";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const [active, setActive] = useState(false);
  const fetcher = useFetcher();
  const localeOptions = [
    { code: "en", label: t("languageSwitcher.en") },
    { code: "zh-CN", label: t("languageSwitcher.zh-CN") },
  ];

  const current =
    localeOptions.find((item) => item.code === i18n.resolvedLanguage)?.label ||
    localeOptions[0].label;

  const handleChange = async (locale: string) => {
    try {
      await i18n.changeLanguage(locale);
    } catch (e) {
      console.warn("[i18n] changeLanguage failed", e?.message || e);
    }
    fetcher.submit({ locale }, { method: "post", action: "/api/set-locale" });
    setActive(false);
  };

  return (
    <Popover
      active={active}
      activator={
        <Button icon={LanguageIcon} onClick={() => setActive(!active)} disclosure>
          {current}
        </Button>
      }
      onClose={() => setActive(false)}
    >
      <ActionList
        items={[
          { content: localeOptions[0].label, onAction: () => handleChange("en") },
          { content: localeOptions[1].label, onAction: () => handleChange("zh-CN") },
        ]}
      />
    </Popover>
  );
}
