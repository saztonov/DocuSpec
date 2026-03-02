import { useState } from 'react';
import { Typography, Spin } from 'antd';
import { supabase } from '../lib/supabase.ts';
import BlockTableModal from './BlockTableModal.tsx';
import type { DbDocBlock } from '../types/database.ts';

const { Text } = Typography;

export default function BlockLink({ blockId }: { blockId: string }) {
  const [block, setBlock] = useState<DbDocBlock | null>(null);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  async function handleClick() {
    if (block) {
      setShowModal(true);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('doc_blocks')
      .select('*')
      .eq('id', blockId)
      .single();

    if (data) {
      setBlock(data as DbDocBlock);
      setShowModal(true);
    }
    setLoading(false);
  }

  if (loading) return <Spin size="small" />;

  return (
    <>
      <Text
        code
        style={{ cursor: 'pointer', fontSize: 12 }}
        onClick={() => void handleClick()}
        title="Нажмите для просмотра блока"
      >
        {block?.block_uid ?? blockId.slice(0, 8) + '...'}
      </Text>
      {showModal && block && (
        <BlockTableModal block={block} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}
