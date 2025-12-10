import { useMemo, useState } from 'react';

// 计费状态与跳转逻辑聚合，保持行为一致（包括无额度时跳转 /app/billing）
export default function useBillingStatus({
  billingFetcher,
  credits,
  onOpenBilling
}) {
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  const insufficientCredits = useMemo(() => {
    if (!credits) return false;
    return credits.available <= 0;
  }, [credits]);

  const handleOpenUpgrade = () => {
    // 保持原行为：若没有可升级选项也应跳转计费页面
    if (typeof onOpenBilling === 'function') {
      onOpenBilling();
      return;
    }
    setUpgradeModalOpen(true);
  };

  return {
    state: {
      upgradeModalOpen,
      selectedPlanId,
      cancelModalOpen,
      insufficientCredits
    },
    setters: {
      setUpgradeModalOpen,
      setSelectedPlanId,
      setCancelModalOpen
    },
    handlers: {
      handleOpenUpgrade
    }
  };
}

