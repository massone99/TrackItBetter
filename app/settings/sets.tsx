import { useTranslation } from "react-i18next";
import { PageHeading, Screen } from "../../src/shared/components/ui";
import { SetLayoutSettings } from "../../src/shared/settings/SetLayoutSettings";

export default function SetLayoutScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <PageHeading title={t("simple.setsLayout")} />
      <SetLayoutSettings />
    </Screen>
  );
}
