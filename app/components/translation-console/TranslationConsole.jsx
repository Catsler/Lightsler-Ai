import CreditBar from "~/components/billing/CreditBar";

// 容器组件：负责组合 hooks 与子组件（列表、筛选等），保持布局简单
export default function TranslationConsole({
  billingProps,
  children
}) {
  return (
    <div>
      <CreditBar {...billingProps} />
      {children}
    </div>
  );
}

