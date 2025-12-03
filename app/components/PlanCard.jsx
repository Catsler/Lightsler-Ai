import { BlockStack, Box, Text, InlineStack, List, Button, Badge, Tooltip, Icon } from "@shopify/polaris";
import { InfoIcon } from "@shopify/polaris-icons";
import { PRICING_CONFIG, formatCompactNumber } from "../utils/pricing-config.js";
import { useTranslation } from 'react-i18next';

const FEATURE_LABELS = (t) => ({
  autoTranslation: t('plans.features.autoTranslation'),
  editTranslation: t('plans.features.editTranslation'),
  templateTranslation: t('plans.features.templateTranslation'),
  languageSwitcher: t('plans.features.languageSwitcher'),
  prioritySupport: t('plans.features.prioritySupport'),
  dedicatedSuccess: t('plans.features.dedicatedSuccess')
});

/**
 * PlanCard - 订阅套餐展示卡片。
 *
 * KISS 原则：组件仅负责展示套餐信息与触发单个动作（升级 / 降级），业务逻辑在上层处理。
 *
 * @param {Object} props
 * @param {{
 *   id: string,
 *   name: string,
 *   displayName: string,
 *   monthlyCredits: number,
 *   maxLanguages?: number,
 *   price: number,
 *   features?: Record<string, boolean>
 * }} props.plan 套餐信息
 * @param {boolean} props.isCurrent 是否为当前激活套餐
 * @param {boolean} props.canUpgrade 是否允许升级到该套餐（向后兼容旧接口）
 * @param {boolean} [props.isSubmitting=false] 是否处于提交中（禁用按钮）
 * @param {(plan: any) => void} [props.onUpgrade] 升级回调（旧属性，优先级低于 onAction）
 * @param {(plan: any) => void} [props.onAction] 自定义回调
 * @param {string} [props.actionLabel] 按钮文案（默认根据可用状态生成）
 * @param {'primary' | 'secondary' | 'critical'} [props.actionTone='primary'] 按钮色调
 * @param {boolean} [props.disabled=false] 显式禁用按钮
 */
export function PlanCard({
  plan,
  isCurrent,
  canUpgrade,
  isSubmitting = false,
  onUpgrade,
  onAction,
  actionLabel,
  actionTone = 'primary',
  disabled = false
}) {
  const { t } = useTranslation('billing');
  const features = Object.entries(plan.features || {})
    .filter(([, enabled]) => enabled)
    .map(([key]) => FEATURE_LABELS(t)[key] || key);

  const languagesLabel =
    plan.maxLanguages == null
      ? t('plans.languages.unlimited')
      : plan.maxLanguages === 0
        ? t('plans.languages.none')
        : t('plans.languages.specific', { count: plan.maxLanguages });
  features.unshift(languagesLabel);

  // Unit Price Calculation: Price / (Credits / 1000)
  const unitPrice = plan.price > 0 && plan.monthlyCredits > 0
    ? (plan.price / (plan.monthlyCredits / 1000)).toFixed(2)
    : null;

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      border: plan.highlight ? '2px solid var(--p-color-border-interactive-active)' : '1px solid var(--p-color-border)',
      borderRadius: 'var(--p-border-radius-200)',
      boxShadow: plan.highlight ? 'var(--p-shadow-md)' : 'none',
      backgroundColor: 'var(--p-color-bg-surface)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <Box padding="400" style={{ flex: '1 0 auto' }}>
        <BlockStack gap="400">
          <BlockStack gap="200">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="050">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h3" variant="headingSm">
                    {t(`plans.names.${plan.id}`, { defaultValue: plan.displayName })}
                  </Text>
                  {plan.legacyNote && (
                    <Tooltip content={plan.legacyNote}>
                      <div style={{ cursor: 'help', display: 'flex', alignItems: 'center' }}>
                        <Icon source={InfoIcon} tone="subdued" />
                      </div>
                    </Tooltip>
                  )}
                </InlineStack>
              </BlockStack>
              {isCurrent ? (
                <Badge tone="success">{t('plans.current')}</Badge>
              ) : plan.badge ? (
                <Badge tone={plan.badge.tone}>{plan.badge.text}</Badge>
              ) : null}
            </InlineStack>

            <BlockStack gap="050">
              <InlineStack gap="200" blockAlign="baseline">
                <Text variant="headingLg">${plan.price.toFixed(2)}</Text>
                {plan.originalPrice > plan.price && (
                  <>
                    <Text variant="bodySm" tone="subdued" textDecorationLine="line-through">
                      ${plan.originalPrice.toFixed(2)}
                    </Text>
                    <Badge tone="success">
                      {t('plans.save', { percent: Math.round(((plan.originalPrice - plan.price) / plan.originalPrice) * 100) })}
                    </Badge>
                  </>
                )}
              </InlineStack>
              <Text variant="bodySm" tone="subdued">
                {plan.price > 0 ? t('plans.perMonth') : ''}
              </Text>
            </BlockStack>

            <BlockStack gap="050">
              <Text variant="headingMd" tone="subdued" fontWeight="regular">
                {t('plans.monthlyIncluded')}
              </Text>
              <Text variant="headingLg" as="h4">
                {plan.monthlyCredits.toLocaleString()} {t('plans.creditsLabel')}
              </Text>
              {unitPrice && (
                <Text variant="bodySm" tone="success">
                  {t('plans.unitPrice', { price: unitPrice })}
                </Text>
              )}
            </BlockStack>

            {plan.description && (
              <Badge tone="info">
                {t(`plans.descriptions.${plan.id}`, { defaultValue: plan.description })}
              </Badge>
            )}

            {features.length > 0 && (
              <List type="bullet">
                {features.map((feature, index) => (
                  <List.Item key={index}>{feature}</List.Item>
                ))}
              </List>
            )}
          </BlockStack>
        </BlockStack>
      </Box>

      <Box padding="400" style={{ marginTop: 'auto', borderTop: '1px solid var(--p-color-border-subdued)' }}>
        <Button
          fullWidth
          variant={actionTone === 'primary' ? 'primary' : undefined}
          tone={actionTone === 'critical' ? 'critical' : undefined}
          onClick={() => (onAction ? onAction(plan) : onUpgrade?.(plan))}
          loading={isSubmitting}
          disabled={
            isCurrent ||
            disabled ||
            (!canUpgrade && !onAction && !onUpgrade)
          }
        >
          {isCurrent
            ? t('plans.current')
            : actionLabel || t('actions.subscribe')}
        </Button>
      </Box>
    </div>
  );
}
