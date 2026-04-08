import { Empty, Typography } from 'antd';
import CandidateCard from './CandidateCard';
import type { Candidate } from '../../types/customRates';

interface Props {
  candidates: Candidate[];
  inDraftKeys: Set<string>;
  existingKeys: Set<string>;
  onAdd: (candidate: Candidate) => void;
  emptyHint?: string;
}

export default function CandidateList({
  candidates,
  inDraftKeys,
  existingKeys,
  onAdd,
  emptyHint = 'Ничего не найдено. Попробуйте снизить чувствительность или изменить запрос',
}: Props) {
  if (candidates.length === 0) {
    return (
      <div style={{ padding: 32 }}>
        <Empty description={emptyHint} />
      </div>
    );
  }

  return (
    <div>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        Найдено: {candidates.length}
      </Typography.Text>
      {candidates.map((c) => {
        const sourceKey = c.sourceId ? `${c.source}:${c.sourceId}` : null;
        let status: 'idle' | 'in_draft' | 'already_in_db' = 'idle';
        if (inDraftKeys.has(c.key)) {
          status = 'in_draft';
        } else if (sourceKey && existingKeys.has(sourceKey)) {
          status = 'already_in_db';
        }
        return <CandidateCard key={c.key} candidate={c} status={status} onAdd={onAdd} />;
      })}
    </div>
  );
}
