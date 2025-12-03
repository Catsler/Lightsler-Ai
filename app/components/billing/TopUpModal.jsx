import { useState, useCallback } from "react";
import { Modal, BlockStack, Text, TextField, InlineStack, Button, Banner, Box } from "@shopify/polaris";
import { useTranslation } from "react-i18next";
import { PRICING_CONFIG, formatCompactNumber } from "../../utils/pricing-config.js";

export function TopUpModal({ open, onClose, onPurchase, loading }) {
    const { t } = useTranslation('billing');

    // Guard against undefined / NaN configuration values to avoid runtime crashes
    const rawMinPurchase = Number(PRICING_CONFIG?.CREDIT_MIN_PURCHASE ?? 0);
    const minPurchase = Number.isFinite(rawMinPurchase) && rawMinPurchase > 0 ? rawMinPurchase : 0;
    const pricePerCredit = Number.isFinite(PRICING_CONFIG?.CREDIT_PRICE_USD)
        ? Number(PRICING_CONFIG.CREDIT_PRICE_USD)
        : 0;

    const [amount, setAmount] = useState(minPurchase > 0 ? `${minPurchase}` : '0');
    const [error, setError] = useState(null);

    const handleAmountChange = useCallback((value) => {
        setAmount(value);
        setError(null);
    }, []);

    const handlePurchase = useCallback(() => {
        const credits = parseInt(amount, 10);
        if (!Number.isFinite(credits) || credits < minPurchase) {
            setError(
                t('topUp.minPurchaseError', {
                    min: formatCompactNumber(minPurchase),
                    defaultValue: `Minimum purchase is ${formatCompactNumber(minPurchase)} credits`
                })
            );
            return;
        }
        onPurchase(credits);
    }, [amount, minPurchase, onPurchase, t]);

    const numericAmount = parseInt(amount, 10) || 0;
    const totalPrice = (Number.isFinite(pricePerCredit) && pricePerCredit > 0)
        ? (numericAmount * pricePerCredit).toFixed(2)
        : '0.00';
    const totalChars = formatCompactNumber(
        numericAmount * (PRICING_CONFIG?.CREDIT_TO_CHARS ?? 0)
    );

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={t('topUp.title', { defaultValue: 'Buy Extra Credits' })}
            primaryAction={{
                content: loading ? t('processing', { defaultValue: 'Processing...' }) : t('topUp.buy', { price: totalPrice, defaultValue: `Buy for $${totalPrice}` }),
                onAction: handlePurchase,
                disabled: loading || numericAmount < minPurchase
            }}
            secondaryActions={[
                {
                    content: t('cancel', { defaultValue: 'Cancel' }),
                    onAction: onClose,
                    disabled: loading
                }
            ]}
        >
            <Modal.Section>
                <BlockStack gap="400">
                    <Banner tone="info">
                        <p>
                            {t('topUp.description', {
                                defaultValue: 'Top-up credits never expire and are used after your monthly subscription credits are exhausted.'
                            })}
                        </p>
                    </Banner>

                    <BlockStack gap="200">
                        <TextField
                            label={t('topUp.amountLabel', { defaultValue: 'Credits to purchase' })}
                            type="number"
                            value={amount}
                            onChange={handleAmountChange}
                            autoComplete="off"
                            helpText={t('topUp.helpText', {
                                min: formatCompactNumber(minPurchase),
                                chars: totalChars,
                                defaultValue: `Minimum ${formatCompactNumber(minPurchase)} credits. Approx. ${totalChars} characters.`
                            })}
                            error={error}
                            disabled={loading}
                        />

                        <Box paddingBlockStart="200">
                            <InlineStack align="space-between">
                                <Text variant="bodyMd" fontWeight="bold">
                                    {t('topUp.totalPrice', { defaultValue: 'Total Price' })}
                                </Text>
                                <Text variant="headingMd">
                                    ${totalPrice}
                                </Text>
                            </InlineStack>
                        </Box>
                    </BlockStack>
                </BlockStack>
            </Modal.Section>
        </Modal>
    );
}
