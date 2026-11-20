import { useTranslation } from "react-i18next";
import { PageHeading, Screen } from "../../src/shared/components/ui";
import { FontSettings } from "../../src/shared/settings/FontSettings";

export default function FontSettingsScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <PageHeading title={t("profile.fontTitle")} />
      <FontSettings />
    </Screen>
  );
}
