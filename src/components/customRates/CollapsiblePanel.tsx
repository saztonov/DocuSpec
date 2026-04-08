import { useState, type ReactNode, type CSSProperties } from 'react';
import { Typography } from 'antd';
import { DownOutlined, RightOutlined } from '@ant-design/icons';

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Высота контейнера в раскрытом состоянии (px или CSS-значение) */
  expandedHeight: number | string;
  /** Начальное состояние (по умолчанию раскрыто) */
  defaultCollapsed?: boolean;
  /** Слот в правой части хедера (например счётчик, доп. кнопка) */
  extra?: ReactNode;
  children: ReactNode;
}

/**
 * Сворачиваемая панель с фиксированной высотой в раскрытом состоянии.
 *
 * Гарантирует корректный flex-layout для внутреннего скроллируемого контента:
 * body использует `display: flex, flexDirection: column, minHeight: 0`,
 * а дочерние элементы получают `flex: 1` через обёртку — так внутренние
 * компоненты с `height: 100%` + `overflowY: auto` работают стабильно.
 */
export default function CollapsiblePanel({
  title,
  subtitle,
  expandedHeight,
  defaultCollapsed = false,
  extra,
  children,
}: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const containerStyle: CSSProperties = {
    background: '#fff',
    border: '1px solid #f0f0f0',
    borderRadius: 8,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    ...(collapsed ? { height: 'auto' } : { height: expandedHeight }),
  };

  return (
    <div style={containerStyle}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setCollapsed((c) => !c)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setCollapsed((c) => !c);
          }
        }}
        style={{
          flexShrink: 0,
          padding: '10px 24px',
          borderBottom: collapsed ? 'none' : '1px solid #f0f0f0',
          background: '#fafafa',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'background 150ms ease',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.background = '#f5f5f5';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.background = '#fafafa';
        }}
      >
        <span style={{ fontSize: 12, color: '#8c8c8c', display: 'flex', alignItems: 'center' }}>
          {collapsed ? <RightOutlined /> : <DownOutlined />}
        </span>
        <Typography.Text strong>{title}</Typography.Text>
        {subtitle && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {subtitle}
          </Typography.Text>
        )}
        {extra && (
          <div
            style={{ marginLeft: 'auto' }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {extra}
          </div>
        )}
      </div>

      {!collapsed && (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
