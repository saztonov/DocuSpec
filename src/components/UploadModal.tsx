import { useState } from 'react';
import { Modal, Form, Select, Upload, Button, Space, Typography, App } from 'antd';
import { InboxOutlined, FileOutlined, UploadOutlined, CloseCircleOutlined, FileTextOutlined } from '@ant-design/icons';
import { useDocument } from '../hooks/useDocument.ts';
import { useProjects } from '../hooks/useProjects.ts';
import { useSections } from '../hooks/useSections.ts';

const { Dragger } = Upload;
const { Text } = Typography;

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (docId: string) => void;
}

export default function UploadModal({ open, onClose, onSuccess }: UploadModalProps) {
  const { uploadDocument, loading: uploading } = useDocument();
  const { message } = App.useApp();
  const { projects, loading: loadingProjects } = useProjects();
  const { sections, loading: loadingSections } = useSections();
  const [projectId, setProjectId] = useState<string>();
  const [sectionId, setSectionId] = useState<string>();
  const [mdFile, setMdFile] = useState<File | null>(null);
  const [jsonFile, setJsonFile] = useState<File | null>(null);

  const canUpload = !!projectId && !!sectionId;
  const canSubmit = canUpload && !!mdFile;

  function resetForm() {
    setProjectId(undefined);
    setSectionId(undefined);
    setMdFile(null);
    setJsonFile(null);
  }

  async function handleSubmit() {
    if (!mdFile) return;
    try {
      const docId = await uploadDocument(mdFile, {
        projectId,
        sectionId,
        jsonFile: jsonFile ?? undefined,
      });
      message.success(`Документ "${mdFile.name}" загружен`);
      resetForm();
      onClose();
      onSuccess(docId);
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Ошибка загрузки');
    }
  }

  return (
    <Modal
      title="Загрузка документа"
      open={open}
      onCancel={() => { resetForm(); onClose(); }}
      width={520}
      okText={jsonFile ? 'Загрузить (MD + JSON)' : 'Загрузить MD'}
      okButtonProps={{ disabled: !canSubmit, loading: uploading }}
      onOk={() => void handleSubmit()}
      destroyOnClose
    >
      <Form layout="vertical" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <Form.Item label="Проект" required style={{ flex: 1 }}>
            <Select
              placeholder="Выберите проект"
              value={projectId}
              onChange={setProjectId}
              loading={loadingProjects}
              options={projects.map(p => ({ value: p.id, label: p.code ? `${p.code} — ${p.name}` : p.name }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item label="Раздел" required style={{ flex: 1 }}>
            <Select
              placeholder="Выберите раздел"
              value={sectionId}
              onChange={setSectionId}
              loading={loadingSections}
              options={sections.map(s => ({ value: s.id, label: `${s.code} — ${s.name}` }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
        </div>

        <Form.Item label="MD-файл документации" required>
          <Dragger
            accept=".md"
            multiple={false}
            showUploadList={false}
            beforeUpload={(file) => { setMdFile(file); return false; }}
            disabled={!canUpload}
            style={{ padding: '12px 0' }}
          >
            {mdFile ? (
              <Space>
                <FileTextOutlined style={{ fontSize: 24, color: '#1677ff' }} />
                <Text strong>{mdFile.name}</Text>
              </Space>
            ) : (
              <>
                <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                <p className="ant-upload-text">
                  {canUpload ? 'Нажмите или перетащите .md файл' : 'Сначала выберите проект и раздел'}
                </p>
              </>
            )}
          </Dragger>
        </Form.Item>

        <Form.Item label="JSON с изображениями (опционально)">
          <div style={{ border: '1px dashed #d9d9d9', borderRadius: 8, padding: '10px 14px', background: '#fafafa' }}>
            <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
              <Space>
                <FileOutlined style={{ color: '#8c8c8c', fontSize: 18 }} />
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {jsonFile ? jsonFile.name : '_result.json с ссылками на изображения'}
                </Text>
              </Space>
              <Space size={4}>
                {jsonFile && (
                  <Button size="small" icon={<CloseCircleOutlined />} onClick={() => setJsonFile(null)} />
                )}
                <Upload
                  accept=".json"
                  multiple={false}
                  showUploadList={false}
                  beforeUpload={(file) => { setJsonFile(file); return false; }}
                >
                  <Button icon={<UploadOutlined />} size="small">
                    {jsonFile ? 'Заменить' : 'Выбрать'}
                  </Button>
                </Upload>
              </Space>
            </Space>
          </div>
        </Form.Item>
      </Form>
    </Modal>
  );
}
