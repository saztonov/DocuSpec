import { useState } from 'react';
import { Typography, Spin, Modal, Image } from 'antd';
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

  const isImage = block?.block_type === 'IMAGE';
  const hasImageUrl = isImage && !!block?.image_url;

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

      {showModal && block && hasImageUrl && (
        <Modal
          open
          onCancel={() => setShowModal(false)}
          footer={null}
          width="90vw"
          title={block.block_uid}
          style={{ top: 20 }}
        >
          <div style={{ textAlign: 'center' }}>
            <Image
              src={block.image_url!}
              alt={block.block_uid}
              style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }}
            />
          </div>
        </Modal>
      )}

      {showModal && block && !hasImageUrl && (
        <BlockTableModal block={block} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}
