import { getTranslations } from "next-intl/server";
import { MainScrollPageShell } from "@/components/layout/MainScrollPageShell";
import { AccountPageTitle } from "./AccountPageTitle";
import { AccountInner } from "./component/AccountInner";
import { AccountDeploymentSettings } from "@deployment/managed-ui";
import { AutoUpdateSettings } from "./component/AutoUpdateSettings";
import { ReviewAutomationSettings } from "./component/ReviewAutomationSettings";
import { AccountPrivacyDataLinks } from "./component/AccountPrivacyDataLinks";
import { UserProfileComponent } from "./component/UserProfile";
import {
  DeferredAccountDeleteSection,
  DeferredThirdPartyConnections,
  DeferredZoneSettings,
} from "./component/DeferredAccountSections";

export default async function AccountPage() {
  const t = await getTranslations("AccountPage");
  return (
    <MainScrollPageShell maxWidthClass="max-w-4xl">
      <AccountPageTitle title={t("title")} />
      <div className="flex min-w-0 flex-col gap-4 pc:gap-5 [&_input]:bg-background [&_[data-slot='select-trigger']]:bg-background [&_.bg-secondary]:bg-background">
        <AccountInner />

        <AccountDeploymentSettings />

        <section id="profile" className="scroll-mt-16">
          <UserProfileComponent />
        </section>

        <AutoUpdateSettings />
        <ReviewAutomationSettings />

        <section id="zones" className="scroll-mt-16">
          <DeferredZoneSettings />
        </section>

        <section id="connections" className="scroll-mt-16">
          <DeferredThirdPartyConnections />
        </section>

        <AccountPrivacyDataLinks />

        {/* 危险操作始终放在账户页最底部，避免与日常设置混淆。 */}
        <DeferredAccountDeleteSection />
      </div>
    </MainScrollPageShell>
  );
}
