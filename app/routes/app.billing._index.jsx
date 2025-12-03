/* eslint-disable react-hooks/exhaustive-deps, no-unused-vars, no-console */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFetcher, useLoaderData, useRevalidator, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  ProgressBar,
  Spinner,
  Banner,
  EmptyState,
  Modal,
  List,
  DataTable,
  Box,
  Badge
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";

import { authenticate } from "../shopify.server";
import prisma from "../db.server.js";
import { subscriptionManager } from "../services/subscription-manager.server.js";
import { creditManager } from "../services/credit-manager.server.js";
import { CreditBar } from "../components/billing/CreditBar.jsx";
import { PlanCard } from "../components/PlanCard.jsx";
import { PricingTable } from "../components/PricingTable.jsx";
import { TopUpModal } from "../components/billing/TopUpModal.jsx";
import { useSafeAppBridge } from "../hooks/useSafeAppBridge";
import { PRICING_CONFIG, formatCompactNumber, ULTRA_PLANS, getEffectivePlan } from "../utils/pricing-config.js";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);

  let subscription = null;
  let shop = null;

  try {
    [subscription, shop] = await Promise.all([
      subscriptionManager.getSubscription(session.shop),
      prisma.shop.findUnique({
        where: { id: session.shop },
        select: {
          pendingPlanId: true,
          planChangeRequestedAt: true,
          gracePeriodEndsAt: true,
          overridePlanId: true,
          overrideExpiresAt: true,
          topUpCredits: true,
          topUpExpiresAt: true
        }
      })
    ]);
  } catch (error) {
    // 兼容旧版 Prisma Client（字段未知时报错时降级查询）
    console.warn('[Billing] Falling back to legacy shop select', { error: error?.message });
    [subscription, shop] = await Promise.all([
      subscriptionManager.getSubscription(session.shop),
      prisma.shop.findUnique({
        where: { id: session.shop },
        select: {
          pendingPlanId: true,
          planChangeRequestedAt: true,
          gracePeriodEndsAt: true
        }
      })
    ]);
  }

  let credits = null;
  let creditsError = null;
  try {
    credits = await creditManager.getAvailableCredits(session.shop);
  } catch (error) {
    creditsError = {
      message: error.message || 'Failed to load credits',
      code: error.code || 'UNKNOWN_ERROR'
    };
  }

  // Use ULTRA_PLANS as the source of truth for V2
  const plans = ULTRA_PLANS;

  // Determine effective plan (handling override)
  const effectivePlan = getEffectivePlan({ ...shop, activeSubscription: subscription }, plans);

  return {
    plans,
    subscription: subscription
      ? {
        status: subscription.status,
        planId: subscription.planId,
        planName: subscription.plan?.name,
        planDisplayName: subscription.plan?.displayName,
        shopifyChargeId: subscription.shopifyChargeId,
        billingCycle: subscription.billingCycle,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        cancelledAt: subscription.cancelledAt
      }
      : null,
    credits,
    creditsError,
    shopId: session.shop,
    shop,
    effectivePlanId: effectivePlan?.id
  };
}

function UsageSection({ loading, usage }) {
  const { t } = useTranslation('billing');
  const navigate = useNavigate();
  if (loading || !usage) {
    return (
      <Card sectioned>
        <InlineStack align="center" blockAlign="center">
          <Spinner accessibilityLabel={t('usageLoading')} size="small" />
        </InlineStack>
      </Card>
    );
  }

  if (!usage.hasAnyHistory) {
    return (
      <Card>
        <EmptyState
          heading={t('usageEmptyHeading')}
          action={{ content: t('usageEmptyAction'), onAction: () => navigate('/app') }}
          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
          <p>{t('usageEmptyDesc')}</p>
        </EmptyState>
      </Card>
    );
  }

  if (usage.totalTranslations === 0) {
    return (
      <Card>
        <BlockStack gap="300">
          <Text variant="headingSm">{t('usageTitle', { days: usage.rangeDays })}</Text>
          <Banner tone="info">{t('usageBannerNoTranslations', { days: usage.rangeDays })}</Banner>
        </BlockStack>
      </Card>
    );
  }

  return (
    <BlockStack gap="300">
      <Card sectioned>
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="headingSm">{t('usageTitle', { days: usage.rangeDays })}</Text>
          <Text variant="bodySm" tone="subdued">
            {t('usageTranslationsTotal', { count: usage.totalTranslations.toLocaleString() })}
          </Text>
        </InlineStack>
      </Card>

      <Layout>
        <Layout.Section>
          <Card title={t('usageByLanguageTitle')} sectioned>
            <BlockStack gap="200">
              {usage.byLanguage.length === 0 && <Text variant="bodySm">{t('usageNoData')}</Text>}
              {usage.byLanguage.map((item) => (
                <BlockStack gap="050" key={item.language}>
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="bodySm">{item.language}</Text>
                    <Text variant="bodySm" tone="subdued">
                      {t('creditsLabel', { credits: formatCompactNumber(item.credits), chars: formatCompactNumber(item.credits * PRICING_CONFIG.CREDIT_TO_CHARS) })}
                    </Text>
                  </InlineStack>
                  <ProgressBar progress={item.percentage} />
                </BlockStack>
              ))}
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <Card title={t('usageByResourceTitle')} sectioned>
            <BlockStack gap="200">
              {usage.byResourceType.length === 0 && <Text variant="bodySm">{t('usageNoData')}</Text>}
              {usage.byResourceType.map((item) => (
                <BlockStack gap="050" key={item.resourceType}>
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="bodySm">{item.resourceType}</Text>
                    <Text variant="bodySm" tone="subdued">
                      {t('creditsLabel', { credits: formatCompactNumber(item.credits), chars: formatCompactNumber(item.credits * PRICING_CONFIG.CREDIT_TO_CHARS) })}
                    </Text>
                  </InlineStack>
                  <ProgressBar progress={item.percentage} />
                </BlockStack>
              ))}
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <Card title={t('usageTopTitle')} sectioned>
            <BlockStack gap="200">
              {usage.topResources.length === 0 && <Text variant="bodySm">{t('usageNoData')}</Text>}
              {usage.topResources.map((item) => (
                <BlockStack gap="050" key={`${item.resourceType}-${item.resourceId}`}>
                  <Text variant="bodySm">
                    {item.resourceType} · {item.resourceId}
                  </Text>
                  <Text variant="bodySm" tone="subdued">
                    {t('creditsLabel', { credits: formatCompactNumber(item.credits), chars: formatCompactNumber(item.credits * PRICING_CONFIG.CREDIT_TO_CHARS) })}
                  </Text>
                </BlockStack>
              ))}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </BlockStack>
  );
}

export default function BillingPage() {
  const { plans, subscription, credits, creditsError, shop, effectivePlanId } = useLoaderData();
  const { t } = useTranslation('billing');
  const usageFetcher = useFetcher();
  const planChangeFetcher = useFetcher();
  const cancelFetcher = useFetcher();
  const topUpFetcher = useFetcher();
  const revalidator = useRevalidator();
  const appBridge = useSafeAppBridge();
  const navigate = useNavigate();
  const [activeFetchId, setActiveFetchId] = useState(null);
  const [activeCancelFetchId, setActiveCancelFetchId] = useState(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [topUpModalOpen, setTopUpModalOpen] = useState(false);
  const [limitError, setLimitError] = useState(null);
  const [validationWarnings, setValidationWarnings] = useState({});

  useEffect(() => {
    if (usageFetcher.state === 'idle' && !usageFetcher.data) {
      usageFetcher.load('/api/billing/usage');
    }
  }, [usageFetcher]);

  const usageData = usageFetcher.data?.data || null;
  const usageLoading = usageFetcher.state !== 'idle' && !usageFetcher.data;
  const creditToChars = PRICING_CONFIG.CREDIT_TO_CHARS;
  const [planToConfirm, setPlanToConfirm] = useState(null);
  const isTrialing = subscription?.status === 'trialing';

  const currentPlan = useMemo(() => {
    return plans.find((plan) => plan.id === effectivePlanId) || plans[0];
  }, [plans, effectivePlanId]);

  const isDowngradeSelection = Boolean(
    planToConfirm && currentPlan && (planToConfirm.price ?? 0) < (currentPlan.price ?? 0)
  );

  const serverGracePeriodEndsAt = shop?.gracePeriodEndsAt ? new Date(shop.gracePeriodEndsAt) : null;
  const serverPendingPlan = useMemo(() => {
    if (!shop?.pendingPlanId) {
      return null;
    }
    return plans.find((plan) => plan.id === shop.pendingPlanId) || null;
  }, [shop?.pendingPlanId, plans]);

  const higherTierPlans = useMemo(() => {
    if (!currentPlan) return plans.filter((plan) => plan.price > 0);
    return plans.filter((plan) => plan.price > (currentPlan.price ?? 0));
  }, [plans, currentPlan]);

  const visiblePlans = useMemo(() => {
    // show paid plans in grid; free will be handled via cancel/downgrade button
    return plans.filter((p) => !p.hidden && (p.price ?? 0) > 0).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [plans]);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const controller = new AbortController();

    visiblePlans.forEach(async (plan) => {
      try {
        const res = await fetch(`/api/billing/validate-plan?planId=${plan.id}`, { signal: controller.signal });
        const data = await res.json();
        const validation = data?.validation;
        if (validation && validation.canProceed === false) {
          setValidationWarnings((prev) => ({ ...prev, [plan.id]: validation }));
        }
      } catch (error) {
        // ignore fetch errors here
      }
    });

    return () => controller.abort();
  }, [visiblePlans]);

  const canCancelSubscription = useMemo(() => {
    if (!subscription) return false;
    if (subscription.status !== 'active') return false;
    if (!currentPlan) return false;
    return (currentPlan.price ?? 0) > 0;
  }, [subscription, currentPlan]);

  const isSwitchingPlan = planChangeFetcher.state !== 'idle';
  const isCancelling = cancelFetcher.state !== 'idle';
  const isToppingUp = topUpFetcher.state !== 'idle';

  const submitPlanChange = useCallback((plan) => {
    if (!plan) return;
    const fetchId = crypto.randomUUID();
    setActiveFetchId(fetchId);

    const buildReturnUrl = () => {
      try {
        if (typeof window === 'undefined') {
          return '/app/billing';
        }
        const url = new URL(window.location.href);
        url.pathname = '/app/billing';
        url.search = '';
        url.hash = '';
        return url.toString();
      } catch (error) {
        return '/app/billing';
      }
    };

    planChangeFetcher.submit(
      { planId: plan.id, returnUrl: buildReturnUrl(), _fetchId: fetchId },
      { method: 'post', action: '/api/billing/switch-plan' }
    );
  }, [planChangeFetcher]);

  const handlePlanSelection = useCallback((plan) => {
    if (!plan) return;
    if (!currentPlan) {
      submitPlanChange(plan);
      return;
    }

    const currentPrice = currentPlan.price ?? 0;
    const targetPrice = plan.price ?? 0;

    if (targetPrice >= currentPrice) {
      submitPlanChange(plan);
      return;
    }

    setPlanToConfirm(plan);
  }, [currentPlan, submitPlanChange]);

  const handleOpenCancel = useCallback(() => {
    setCancelModalOpen(true);
  }, []);

  const handleConfirmCancel = useCallback(() => {
    const fetchId = crypto.randomUUID();
    setActiveCancelFetchId(fetchId);
    cancelFetcher.submit(
      { reason: 'CUSTOMER_REQUEST', prorate: 'false', _fetchId: fetchId },
      { method: 'post', action: '/api/billing/cancel' }
    );
  }, [cancelFetcher]);

  const handleTopUpPurchase = useCallback((amount) => {
    topUpFetcher.submit(
      { credits: amount },
      { method: 'post', action: '/api/billing/top-up' }
    );
  }, [topUpFetcher]);

  useEffect(() => {
    if (planChangeFetcher.state !== 'idle') return;
    const result = planChangeFetcher.data;
    if (!result) return;

    // 如果后端未回传 _fetchId，也不再直接返回，避免“无反馈”
    if (activeFetchId && result._fetchId && result._fetchId !== activeFetchId) {
      setActiveFetchId(null);
      return;
    }

    const toast = appBridge?.toast;

    if (result.success) {
      const confirmationUrl = result.data?.confirmationUrl;
      const graceEndsAt = result.data?.gracePeriodEndsAt ? new Date(result.data.gracePeriodEndsAt) : null;
      if (confirmationUrl) {
        window.open(confirmationUrl, '_blank', 'noopener');
        toast?.show(t('toastBillingOpened'));
      } else {
        if (graceEndsAt && Number.isFinite(graceEndsAt.getTime())) {
          toast?.show(t('toastDowngradeSubmitted', { date: graceEndsAt.toLocaleDateString() }));
        } else {
          toast?.show(t('toastPlanSwitched'));
        }
        revalidator.revalidate();
      }
      setPlanToConfirm(null);
    } else {
      if (result.code === 'LANGUAGE_LIMIT_EXCEEDED') {
        setLimitError(result);
        setPlanToConfirm(null);
      } else if (result.code === 'SUBSCRIPTION_PENDING') {
        toast?.show(t('toastPlanPending', { defaultValue: 'A plan change is already in progress. Please wait.' }), { isError: true });
      } else {
        toast?.show(result.message || t('toastPlanSwitchFail'), { isError: true });
      }
    }

    setActiveFetchId(null);
  }, [planChangeFetcher.state, planChangeFetcher.data, activeFetchId, appBridge, revalidator]);

  useEffect(() => {
    if (cancelFetcher.state !== 'idle') return;
    const result = cancelFetcher.data;
    if (!result) return;

    if (activeCancelFetchId && result._fetchId && result._fetchId !== activeCancelFetchId) {
      setActiveCancelFetchId(null);
      return;
    }

    const toast = appBridge?.toast;
    if (result.success) {
      toast?.show(t('toastCancelSuccess'));
      setCancelModalOpen(false);
      revalidator.revalidate();
    } else {
      toast?.show(result.message || t('toastCancelFail'), { isError: true });
    }

    setActiveCancelFetchId(null);
  }, [cancelFetcher.state, cancelFetcher.data, activeCancelFetchId, appBridge, revalidator]);

  useEffect(() => {
    if (topUpFetcher.state !== 'idle') return;
    const result = topUpFetcher.data;
    if (!result) return;

    const toast = appBridge?.toast;
    if (result.success) {
      toast?.show(t('topUp.success', { defaultValue: 'Top-up successful!' }));
      setTopUpModalOpen(false);
      revalidator.revalidate();
    } else {
      toast?.show(result.message || t('topUp.fail', { defaultValue: 'Top-up failed' }), { isError: true });
    }
  }, [topUpFetcher.state, topUpFetcher.data, appBridge, revalidator]);

  const content = (
    <Page
      title={t('pageTitle')}
      primaryAction={{
        content: t('topUp.button', { defaultValue: 'Buy Credits' }),
        onAction: () => setTopUpModalOpen(true)
      }}
    >
      <BlockStack gap="400">
        {creditsError && (
          <Layout>
            <Layout.Section>
              <Banner
                tone="critical"
                title={t('loadErrorTitle')}
                action={{
                  content: t('retry'),
                  onAction: () => revalidator.revalidate()
                }}
              >
                <p>{creditsError.message}</p>
              </Banner>
            </Layout.Section>
          </Layout>
        )}

        {/* Current Plan Status Bar (Visible if Free) */}
        {currentPlan?.id === 'free' && (
          <Layout>
            <Layout.Section>
              <Banner tone="info" onDismiss={() => { }}>
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingSm">
                    {t('currentPlanStatus', { defaultValue: 'Current Plan: Free' })}
                  </Text>
                  <Text variant="bodyMd">
                    {t('upgradePrompt', { defaultValue: 'Upgrade to unlock more features and credits.' })}
                  </Text>
                </InlineStack>
              </Banner>
            </Layout.Section>
          </Layout>
        )}

        <Layout>
          <Layout.Section>
            {!creditsError && serverGracePeriodEndsAt && (
              <Banner tone="info" title={t('downgradeBannerTitle')}>
                <BlockStack gap="100">
                  <Text variant="bodySm">
                    {t('downgradeBannerDesc', {
                      date: serverGracePeriodEndsAt.toLocaleDateString(),
                      plan: serverPendingPlan?.displayName ?? t('targetPlanFallback')
                    })}
                  </Text>
                </BlockStack>
              </Banner>
            )}

            {!creditsError && isTrialing && (
              <Banner tone="info" title={t('trial.bannerTitle', { defaultValue: 'Trial active' })}>
                <BlockStack gap="100">
                  <Text variant="bodySm">
                    {t('trial.bannerDesc', {
                      defaultValue: 'During trial you have Free tier credits (2,000). Full plan credits unlock after successful payment.'
                    })}
                  </Text>
                </BlockStack>
              </Banner>
            )}

            {!creditsError && (
              <CreditBar
                credits={credits}
                subscription={subscription}
                plans={plans}
                onUpgrade={higherTierPlans.length > 0 ? () => submitPlanChange(higherTierPlans[0]) : undefined}
                upgradeDisabled={isSwitchingPlan}
                canCancel={canCancelSubscription}
                onCancel={canCancelSubscription ? handleOpenCancel : undefined}
              />
            )}
            {!creditsError && (
              <Text variant="bodySm" tone="subdued">
                {t('unitNote', { chars: PRICING_CONFIG.CREDIT_TO_CHARS.toLocaleString() })}
              </Text>
            )}
          </Layout.Section>
        </Layout>

        <Layout>
          <Layout.Section>
            <Card title={t('plansTitle')} sectioned>
              <BlockStack gap="400">
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)', // 4 Columns for Paid Plans
                    gap: '1rem',
                    paddingBottom: '1rem',
                    overflowX: 'auto',
                    scrollSnapType: 'x mandatory',
                    paddingInline: '1rem',
                    scrollbarGutter: 'stable'
                  }}
                  className="pricing-grid"
                >
                  <style>{`
                    .pricing-grid {
                      display: grid;
                      grid-template-columns: repeat(4, 1fr);
                      gap: 20px;
                    }
                    @media (max-width: 1024px) {
                      .pricing-grid {
                        display: flex;
                        overflow-x: auto;
                        scroll-snap-type: x mandatory;
                        padding-bottom: 20px;
                      }
                      .pricing-grid > div {
                        flex: 0 0 280px;
                        scroll-snap-align: start;
                      }
                    }
                  `}</style>
                  {visiblePlans.map((plan) => {
                    const currentPrice = currentPlan?.price ?? 0;
                    const targetPrice = plan.price ?? 0;
                    const isUpgrade = !currentPlan || targetPrice > currentPrice;
                    const isDowngrade = currentPlan && targetPrice < currentPrice;
                    const isCurrent = currentPlan?.id === plan.id;
                    const isAvailable = !isCurrent;
                    const validation = validationWarnings[plan.id];

                    const actionLabel = isCurrent
                      ? t('actions.current')
                      : isUpgrade
                        ? t('actions.upgrade')
                        : t('actions.downgrade');

                    const actionTone = isCurrent ? undefined : isUpgrade ? 'primary' : 'critical';

                    return (
                      <div key={plan.id} style={{ height: '100%' }}>
                        {validation && validation.reason === 'LANGUAGE_LIMIT_EXCEEDED' && (
                          <BlockStack gap="050">
                            <Badge tone="warning">
                              {t('languageLimitBadge', {
                                defaultValue: '⚠️ Need to disable {{count}} languages before switching',
                                count: validation.details?.mustDisable || 0
                              })}
                            </Badge>
                          </BlockStack>
                        )}
                        <PlanCard
                          plan={plan}
                          isCurrent={isCurrent}
                          canUpgrade={isAvailable}
                          isSubmitting={isSwitchingPlan}
                          disabled={isSwitchingPlan || isCurrent}
                          actionLabel={actionLabel}
                          actionTone={actionTone}
                          onAction={() => handlePlanSelection(plan)}
                        />
                      </div>
                    );
                  })}
                </div>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <PricingTable
                plans={visiblePlans}
                currentPlanId={currentPlan?.id}
                stickyHeaderOffset="56px"
              />
            </Card>
          </Layout.Section>
        </Layout>

        <UsageSection loading={usageLoading} usage={usageData} />

        <Layout>
          <Layout.Section>
                <Card title={t('faqTitle')} sectioned>
                  <BlockStack gap="200">
                <List spacing="loose">
                  <List.Item>{t('faqLine1')}</List.Item>
                  <List.Item>{t('faqLine2')}</List.Item>
                  <List.Item>{t('faqLine3')}</List.Item>
                  <List.Item>
                    {t('faqTrial', {
                      defaultValue: 'How does the trial work? Trial uses Free tier credits (2,000). Full plan credits unlock after your first payment.'
                    })}
                  </List.Item>
                  <List.Item>
                    {t('faqDowngrade', {
                      defaultValue: 'What happens when downgrading? Downgrades take effect at the end of the billing cycle. If languages exceed the new plan limit, you must disable extra languages before the change completes.'
                    })}
                  </List.Item>
                  <List.Item>
                    {t('faqRollover', {
                      defaultValue: 'Do credits roll over? Monthly credits reset each billing cycle and do not roll over. Top-up credits remain available.'
                    })}
                  </List.Item>
                </List>
                  </BlockStack>
                </Card>
              </Layout.Section>
            </Layout>

        <Modal
          open={Boolean(planToConfirm)}
          onClose={() => setPlanToConfirm(null)}
          title={planToConfirm ? t('modalSwitchTitleWithPlan', { plan: planToConfirm.displayName }) : t('modalSwitchTitle')}
          primaryAction={{
            content: isSwitchingPlan
              ? t('modalPrimaryProcessing')
              : isDowngradeSelection
                ? t('modalPrimaryDowngrade')
                : t('modalPrimarySwitch'),
            onAction: () => planToConfirm && submitPlanChange(planToConfirm),
            destructive: true,
            disabled: isSwitchingPlan
          }}
          secondaryActions={[{
            content: t('modalSecondaryKeep'),
            onAction: () => setPlanToConfirm(null),
            disabled: isSwitchingPlan
          }]}
        >
          <Modal.Section>
            <BlockStack gap="200">
              <Text variant="bodyMd">
                {t('modalSwitchCurrent', { current: currentPlan?.displayName ?? '—', target: planToConfirm?.displayName ?? '—' })}
              </Text>
              <Text variant="bodySm" tone="subdued">
                {isDowngradeSelection
                  ? t('modalSwitchDescDowngrade')
                  : t('modalSwitchDescUpgrade')}
              </Text>
            </BlockStack>
          </Modal.Section>
        </Modal>

        <Modal
          open={cancelModalOpen}
          onClose={() => setCancelModalOpen(false)}
          title={t('cancelModalTitle')}
          primaryAction={{
            content: isCancelling ? t('modalPrimaryProcessing') : t('cancelModalPrimary'),
            onAction: handleConfirmCancel,
            destructive: true,
            disabled: isCancelling
          }}
          secondaryActions={[
            {
              content: t('cancelModalSecondary'),
              onAction: () => setCancelModalOpen(false),
              disabled: isCancelling
            }
          ]}
        >
          <Modal.Section>
            <Text variant="bodyMd">{t('cancelModalDesc')}</Text>
          </Modal.Section>
        </Modal>

        <TopUpModal
          open={topUpModalOpen}
          onClose={() => setTopUpModalOpen(false)}
          onPurchase={handleTopUpPurchase}
          loading={isToppingUp}
        />

        <Modal
          open={Boolean(limitError)}
          onClose={() => setLimitError(null)}
          title={t('languageLimitExceededTitle', { defaultValue: 'Language Limit Exceeded' })}
          primaryAction={{
            content: t('goToLanguageManagement', { defaultValue: 'Go to Language Management' }),
            onAction: () => {
              setLimitError(null);
              const params = new URLSearchParams();
              if (limitError?.details?.mustDisable) {
                params.set('mustDisable', String(limitError.details.mustDisable));
              }
              params.set('limit', 'exceeded');
              navigate(`/app/language-domains?${params.toString()}`);
            }
          }}
          secondaryActions={[{
            content: t('modalSecondaryKeep'),
            onAction: () => setLimitError(null)
          }]}
        >
          <Modal.Section>
            <BlockStack gap="200">
              <Text variant="bodyMd">
                {t('languageLimitExceededDesc', {
                  defaultValue: 'You need to disable some languages before switching plans.',
                  count: limitError?.details?.mustDisable || 0
                })}
              </Text>
              <List>
                <List.Item>
                  {t('languageLimitCurrent', {
                    defaultValue: 'Current active/draft languages: {{count}}',
                    count: limitError?.details?.activeLanguagesCount || 0
                  })}
                </List.Item>
                <List.Item>
                  {t('languageLimitAllowed', {
                    defaultValue: 'Allowed languages on target plan: {{count}}',
                    count: limitError?.details?.allowedLanguages ?? '—'
                  })}
                </List.Item>
                <List.Item>
                  {t('languageLimitMustDisable', {
                    defaultValue: 'Languages to disable: {{count}}',
                    count: limitError?.details?.mustDisable || 0
                  })}
                </List.Item>
              </List>
              <Banner tone="warning">
                <Text variant="bodySm">
                  {t('languageLimitActionHint', {
                    defaultValue: 'Open Language Management to disable or unpublish languages, then retry the plan change.'
                  })}
                </Text>
              </Banner>
            </BlockStack>
          </Modal.Section>
        </Modal>
      </BlockStack>
    </Page>
  );

  return content;
}
