import { Drawer, Menu } from 'antd';
import {
  FileTextOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  CalculatorOutlined,
  OrderedListOutlined,
  FolderOutlined,
  BookOutlined,
  RobotOutlined,
  DatabaseOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { MenuProps } from 'antd';

interface HamburgerMenuProps {
  open: boolean;
  onClose: () => void;
  docId?: string;
  latestEstimateId?: string;
}

export default function HamburgerMenu({ open, onClose, docId, latestEstimateId }: HamburgerMenuProps) {
  const navigate = useNavigate();

  const handleClick: MenuProps['onClick'] = ({ key }) => {
    onClose();
    navigate(key);
  };

  const docItems = docId
    ? [
        {
          key: 'doc-group',
          label: 'Документ',
          type: 'group' as const,
          children: [
            {
              key: `/doc/${docId}?tab=blocks`,
              icon: <FileTextOutlined />,
              label: 'Блоки документа',
            },
            {
              key: `/doc/${docId}?tab=products`,
              icon: <AppstoreOutlined />,
              label: 'Изделия',
            },
            {
              key: `/doc/${docId}?tab=bom`,
              icon: <UnorderedListOutlined />,
              label: 'Сводная ведомость',
            },
            ...(latestEstimateId
              ? [{
                  key: `/doc/${docId}/estimate/${latestEstimateId}`,
                  icon: <CalculatorOutlined />,
                  label: 'Расширенная смета',
                }]
              : []),
          ],
        },
      ]
    : [];

  const pricesItem = {
    key: '/prices',
    icon: <TagsOutlined />,
    label: 'Расценки',
  };

  const serviceItems = [
    {
      key: 'service-group',
      label: 'Служебное',
      type: 'group' as const,
      children: [
        {
          key: '/statements',
          icon: <OrderedListOutlined />,
          label: 'Ведомости',
        },
        {
          key: '/admin?tab=projects',
          icon: <FolderOutlined />,
          label: 'Объекты',
        },
        {
          key: '/admin?tab=sections',
          icon: <BookOutlined />,
          label: 'Разделы',
        },
        {
          key: '/admin?tab=prompts',
          icon: <RobotOutlined />,
          label: 'Промпты LLM',
        },
        {
          key: '/admin?tab=fsnb',
          icon: <DatabaseOutlined />,
          label: 'Справочники ФСНБ',
        },
      ],
    },
  ];

  return (
    <Drawer
      title="Навигация"
      placement="left"
      width={280}
      open={open}
      onClose={onClose}
      styles={{ body: { padding: 0 } }}
    >
      <Menu
        mode="inline"
        items={[...docItems, pricesItem, ...serviceItems]}
        onClick={handleClick}
        style={{ border: 'none' }}
      />
    </Drawer>
  );
}
