import { BlockStack, Box, Text, Icon } from "@shopify/polaris";
import { CheckIcon, MinusIcon } from "@shopify/polaris-icons";
import { FEATURE_MATRIX } from "../utils/pricing-config";
import { useTranslation } from "react-i18next";

export function PricingTable({ plans, currentPlanId, stickyHeaderOffset = "0px" }) {
    const { t } = useTranslation('billing');

    // Helper to render cell content
    const renderValue = (value) => {
        if (value === true) return <Icon source={CheckIcon} tone="success" />;
        if (value === false) return <Icon source={MinusIcon} tone="subdued" />;
        if (value === null) return null;
        if (typeof value === 'string') {
            return (
                <Text variant="bodyMd" alignment="center">
                    {t(`featureValues.${value}`, { defaultValue: value })}
                </Text>
            );
        }
        return <Text variant="bodyMd" alignment="center">{value}</Text>;
    };

    // Helper to get plan value for a feature
    const getPlanValue = (item, planName) => {
        return item[planName] ?? null;
    };

    return (
        <Box paddingBlockStart="800">
            <BlockStack gap="800">
                <Text variant="headingLg" alignment="center">
                    {t('pricingFeatureComparison', { defaultValue: 'Feature comparison' })}
                </Text>

                <div className="pricing-table-container" style={{ overflowX: 'auto', paddingBottom: '1rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                        <thead>
                            <tr style={{ position: 'sticky', top: stickyHeaderOffset, zIndex: 10, backgroundColor: 'var(--p-color-bg-surface)' }}>
                                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid var(--p-color-border)' }}>
                                    {/* Empty top-left cell */}
                                </th>
                                {plans.map(plan => (
                                    <th
                                        key={plan.id}
                                        scope="col"
                                        style={{
                                            padding: '1rem',
                                            textAlign: 'center',
                                            borderBottom: '1px solid var(--p-color-border)',
                                            backgroundColor: plan.highlight ? 'var(--p-color-bg-surface-secondary)' : 'inherit',
                                            minWidth: '120px'
                                        }}
                                    >
                                        <Text variant="headingSm" as="span">{plan.displayName}</Text>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {FEATURE_MATRIX.map((section, sectionIndex) => (
                                <>
                                    {/* Section Header */}
                                    <tr key={`section-${sectionIndex}`}>
                                        <td
                                            colSpan={plans.length + 1}
                                            style={{
                                                padding: '1rem',
                                                backgroundColor: 'var(--p-color-bg-surface-tertiary)',
                                                fontWeight: 'bold',
                                                textAlign: 'left'
                                            }}
                                        >
                                            <Text variant="headingSm">
                                                {section.categoryKey ? t(section.categoryKey) : section.category}
                                            </Text>
                                        </td>
                                    </tr>

                                    {/* Feature Rows */}
                                    {section.items.map((item, itemIndex) => (
                                        <tr key={`item-${sectionIndex}-${itemIndex}`} style={{ borderBottom: '1px solid var(--p-color-border-subdued)' }}>
                                            <td scope="row" style={{ padding: '1rem', textAlign: 'left' }}>
                                                <Text variant="bodyMd">
                                                    {item.labelKey ? t(item.labelKey) : item.label}
                                                </Text>
                                            </td>
                                            {plans.map(plan => (
                                                <td
                                                    key={`${plan.id}-${item.label}`}
                                                    style={{
                                                        padding: '1rem',
                                                        textAlign: 'center',
                                                        backgroundColor: plan.highlight ? 'var(--p-color-bg-surface-secondary)' : 'inherit'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                                                        {renderValue(getPlanValue(item, plan.name))}
                                                    </div>
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </>
                            ))}
                        </tbody>
                    </table>
                </div>
            </BlockStack>
        </Box>
    );
}
